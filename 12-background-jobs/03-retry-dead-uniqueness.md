# 12.3 Retry, dead set, uniqueness

> **TL;DR**
> Sidekiq entrega *at-least-once*: o job pode rodar de novo. Retry com backoff trata 5xx, timeout e 429. 4xx e bug seu não merecem 25 tentativas. Depois do limite, o job cai no dead set — não some. Uniqueness (sidekiq-unique-jobs ou Sidekiq Enterprise) evita duplicata na fila; não substitui job idempotente. A garantia de verdade mora no banco: unique index, status, chave de idempotência.

## Conteúdo

- [At-least-once e idempotência](#at-least-once-e-idempotência)
- [Retry com backoff](#retry-com-backoff)
- [Quando não retentar](#quando-não-retentar)
- [Dead set e morgue](#dead-set-e-morgue)
- [Uniqueness — sem marketing](#uniqueness--sem-marketing)
- [Active Job vs Sidekiq](#active-job-vs-sidekiq)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## At-least-once e idempotência

**O que é:**
O worker pega o job, executa, confirma. Se o processo morre no meio — OOM, deploy, `kill -9` — a confirmação não sai. O job volta para a fila. Timeout depois do sucesso, antes do ack: a mesma coisa. Você prometeu *pelo menos uma vez*, não *exatamente uma vez*.

**Como funciona:**
```ruby
class ChargeOrderJob
  include Sidekiq::Job

  def perform(order_id)
    order = Order.find(order_id)
    return if order.charged?

    PaymentGateway.charge!(
      amount_centavos: order.total_centavos,
      idempotency_key: "order:#{order.id}:charge"
    )
    order.update!(status: :charged)
  end
end
```

Dois `ChargeOrderJob` para o mesmo pedido não podem gerar duas cobranças. A chave no gateway e o `return if order.charged?` são o contrato. Sem isso, retry vira double charge.

**Quando usar:**
Todo job com efeito colateral: e-mail, SMS, webhook, pagamento, crédito de saldo. Job de leitura pura (relatório descartável) sofre menos, mas o hábito de idempotência ainda vale.

**Na entrevista:**
> "Sidekiq é at-least-once. Eu não discuto uniqueness antes de dizer como o job sobrevive à segunda execução. Unique index, máquina de status ou chave de idempotência no provedor."

---

## Retry com backoff

**O que é:**
O job falhou. Em vez de insistir agora e afundar o Redis, você espera. Backoff exponencial: 15s, depois minutos, depois horas. Jitter (aleatório) evita que mil jobs acordem no mesmo segundo — *thundering herd*.

Sidekiq, por padrão, tenta **25 vezes**. A fórmula cresce rápido: `(count ** 4) + 15 + rand(...)`. A última tentativa pode ser daqui a ~20 dias. Isso não é detalhe: um bug de validação fica 20 dias “quase morto” antes de ir para o dead set.

**Como funciona:**
```ruby
class NotifyCarrierJob
  include Sidekiq::Job

  sidekiq_options retry: 8, queue: :mailers

  sidekiq_retry_in do |count, exception, _jobhash|
    case exception
    when Carrier::RateLimited
      # 429 — respeita o servidor, não o default cego
      60 * (count + 1) + rand(15)
    when Carrier::Timeout, Faraday::ConnectionFailed
      (count**4) + 15 + rand(10 * (count + 1))
    else
      :kill # vai para o dead set agora
    end
  end

  def perform(shipment_id)
    shipment = Shipment.find(shipment_id)
    Carrier.notify!(shipment)
  end
end
```

`:kill` aborta a sequência e manda para o dead set. `:discard` joga fora — use só quando o job não tem mais sentido (pedido cancelado, usuário apagado).

**Quando usar:**
Erro transitório: 5xx do parceiro, timeout, conexão recusada, deadlock, 429 com `Retry-After`. Ajuste `retry:` para o domínio. E-mail de boas-vindas não precisa de 25 tentativas. Cobrança talvez precise de mais, com backoff longo.

**Exemplo prático:**
```ruby
# config/initializers/sidekiq.rb — teto global, não política de negócio
Sidekiq.default_job_options = { "retry" => 10 }

class RefundJob
  include Sidekiq::Job
  sidekiq_options retry: 12

  sidekiq_retries_exhausted do |job, ex|
    order = Order.find(job["args"].first)
    order.update!(refund_status: :needs_manual_review)
    Slack.alert("RefundJob morto: order=#{order.id} #{ex.class}")
  end

  def perform(order_id)
    # ...
  end
end
```

`sidekiq_retries_exhausted` roda quando as tentativas acabaram, **antes** de o job ir para o dead set. É o gancho de alerta, não o lugar de “tentar de novo na mão”.

**Na entrevista:**
> "Retry default do Sidekiq é 25 com backoff exponencial e jitter. Eu baixo esse número por job e trato 429 com espera própria. Retry infinito esconde bug e enche Redis."

---

## Quando não retentar

**O que é:**
Retry assume que o mundo muda. 4xx diz o contrário: o request está errado. Mandar de novo o mesmo payload não vira 200.

**Como funciona:**
| Situação | Retry? |
|---|---|
| 408, 429, 500, 502, 503, 504 | Sim, com backoff |
| Timeout, connection reset | Sim |
| `ActiveRecord::Deadlocked` | Sim, poucas vezes |
| 400, 401, 403, 404, 422 | Não |
| `ActiveRecord::RecordNotFound` de registro apagado | Não |
| `ArgumentError`, `NoMethodError`, schema errado | Não — é bug |
| 401 por token expirado que você consegue renovar | Sim, **depois** de renovar |

```ruby
class PushInvoiceJob
  include Sidekiq::Job
  sidekiq_options retry: 5

  def perform(invoice_id)
    invoice = Invoice.find(invoice_id)
    response = FiscalApi.submit(invoice.payload)

    case response.status
    when 200..299
      invoice.update!(submitted_at: Time.current)
    when 429, 500..599
      raise FiscalApi::TransientError, response.body
    when 400..499
      invoice.update!(submit_error: response.body)
      # não levanta — Sidekiq marca sucesso, sem retry
    end
  end
end
```

Não resgate `StandardError` e engula. Classifique. Transiente levanta. Permanente grava o erro e sai.

Cuidado com 404. Recurso que ainda vai nascer (eventual consistency) merece retry curto. Recurso que você mesmo apagou não.

**Na entrevista:**
> "Eu não retento 4xx. Retry é para falha transitória. Bug e validação no dead set rápido, com alerta — não 25 vezes ao longo de três semanas."

---

## Dead set e morgue

**O que é:**
Fila dos jobs que esgotaram o retry (ou foram mortos com `:kill`). No Sidekiq o nome é **dead set**. Em conversa de entrevista, *morgue* aparece — jargão de Resque / alguns times. É o mesmo conceito: cadáver para autópsia, não lixeira automática.

**Como funciona:**
Sidekiq guarda da ordem de 10 mil jobs no dead set, por uns 6 meses (números de versão — confirme no `sidekiq.yml` da casa). A Web UI lista, mostra backtrace, deixa retry manual ou delete.

```ruby
# console de produção, com cuidado
ds = Sidekiq::DeadSet.new
ds.each do |job|
  next unless job.klass == "ChargeOrderJob"
  job.retry # volta para a fila — só depois do fix
end
```

Replay cego reprocessa o bug. Ordem: 1) lê o erro, 2) corrige código ou dado, 3) sobe, 4) reprocessa um, 5) reprocessa o lote.

Dead set sem alerta é buraco negro. `sidekiq_retries_exhausted`, métrica de tamanho, pager se crescer. Job de pagamento morto é incidente, não log.

**Quando usar:**
Sempre que o retry existe. Sem dead set você ou descarta (perde dinheiro) ou retenta para sempre (enfia Redis). Os dois são piores.

**Na entrevista:**
> "Dead set é a morgue. Eu não deixo encher em silêncio. Corrijo a causa, reprocesso um, depois o resto. Retry da UI não é estratégia de produto."

---

## Uniqueness — sem marketing

**O que é:**
Trava para não enfileirar (ou não executar) o mesmo job duas vezes. Sidekiq **open source não tem uniqueness**. Duas opções que caem em entrevista:

1. **sidekiq-unique-jobs** — gem da comunidade. Lock no Redis, TTL, estratégias `until_executed`, `until_and_while_executing`, `while_executing`. Funciona. Também quebra entre majors do Sidekiq, vaza lock se o TTL for curto demais, e o time precisa entender *until* vs *while*.
2. **Sidekiq Enterprise** — unique jobs oficiais, pagos, alinhados com a versão do Sidekiq. Se a empresa já paga, use. Não invente gem no meio.

Nenhuma das duas te dá exactly-once. Lock de fila ≠ efeito único no banco.

**Como funciona:**
```ruby
# sidekiq-unique-jobs — ilustrativo; API muda entre versões
class GenerateReportJob
  include Sidekiq::Job

  sidekiq_options(
    retry: 3,
    unique_for: 10.minutes,
    unique_until: :start
  )

  def perform(account_id)
    Report.generate!(account_id)
  end
end
```

`until_executed` / unique até começar: não empilha dez “gera relatório da conta 42” na fila. `while_executing`: não roda dois ao mesmo tempo; o segundo pode entrar na fila e esperar. São problemas diferentes. Entrevistador que fala “unique jobs” sem dizer qual, não fechou o requisito.

Lock com TTL curto: o job ainda roda, o lock some, o clone entra. TTL eterno: worker morreu, lock ficou, relatório nunca mais sai. Por isso a gem precisa de TTL *e* unlock no `ensure`. Em incidente, alguém vai limpar chave na mão.

**Quando usar:**
- Clique duplo no “exportar”.
- Cron que não pode sobrepor a execução anterior.
- Fan-out que reenfileira o mesmo ID.

**Quando não usar:**
Como substituto de idempotência. Pagamento, crédito, “envie este e-mail uma vez” se resolvem com unique constraint / `INSERT ... ON CONFLICT` / coluna `processed_at`. Uniqueness na fila é otimização operacional. A verdade fica no Postgres.

**Exemplo prático:**
```ruby
class CreditWalletJob
  include Sidekiq::Job
  sidekiq_options retry: 8

  def perform(wallet_id, amount_centavos, event_id)
    Wallet.transaction do
      WalletCredit.create!(
        wallet_id:,
        amount_centavos:,
        event_id: # unique index
      )
      Wallet.where(id: wallet_id).update_all(
        ["balance_centavos = balance_centavos + ?", amount_centavos]
      )
    end
  rescue ActiveRecord::RecordNotUnique
    # já creditou — segunda entrega, sucesso
  end
end
```

O unique index em `event_id` sobrevive a retry, a dois workers e à gem de uniqueness sumir do `Gemfile`.

**Na entrevista:**
> "OSS não tem unique job. sidekiq-unique-jobs é lock no Redis — útil, frágil, precisa de TTL. Enterprise tem o oficial. Eu ainda deixo o job idempotente. Uniqueness não é exactly-once."

---

## Active Job vs Sidekiq

**O que é:**
Active Job tem `retry_on` e `discard_on`. É a API do adapter. Se o adapter é Sidekiq, duas camadas de retry se atropelam. Time maduro escolhe uma.

**Como funciona:**
```ruby
class DigestJob < ApplicationJob
  queue_as :low

  retry_on Faraday::TimeoutError, wait: :polynomially_longer, attempts: 5
  discard_on ActiveJob::DeserializationError

  def perform(user)
    DigestMailer.weekly(user).deliver_now
  end
end
```

`DeserializationError`: o `User` foi apagado, o GlobalID não resolve. Retry não ressuscita. `discard_on` é o 4xx do Active Job.

Se você usa `include Sidekiq::Job`, fale a língua do Sidekiq (`sidekiq_options`, `sidekiq_retry_in`). Se fica em Active Job “para trocar de backend um dia”, aceite a API mais pobre e **desligue** o retry nativo do Sidekiq para não dobrar tentativa.

**Na entrevista:**
> "Eu não empilho retry do Active Job em cima do retry do Sidekiq. Um mecanismo. Sidekiq direto quando a casa já é Sidekiq."

---

## Recapitulando

- Entrega é at-least-once. Job com efeito colateral é idempotente. Sem discussão.
- Retry com backoff e jitter para 5xx, timeout, 429. Default 25 é alto demais para a maioria dos jobs.
- 4xx, validação e `NoMethodError` não retentam. Classifique o erro.
- Dead set (morgue) é destino visível. Alerta + fix + replay. Não é `/dev/null`.
- Uniqueness no Redis é trava de fila. sidekiq-unique-jobs existe e é honesto sobre os trade-offs. Enterprise tem o oficial. A garantia de negócio é unique index.
- Uma política de retry. Active Job **ou** Sidekiq, não os dois.

---

## Exercícios práticos

### Exercício 1: Double charge

**Enunciado:** `ChargeOrderJob` chama o gateway e depois faz `order.update!(status: :charged)`. O worker morre entre o charge e o `update`. O retry cobra de novo. Como você fecha o buraco? O gateway aceita `idempotency_key`.

<details>
<summary>Solução</summary>

A ordem “cobra → marca” sem chave é a falha clássica. Você manda a mesma chave nas duas tentativas. O gateway devolve a cobrança original, não cria outra.

```ruby
def perform(order_id)
  order = Order.find(order_id)
  return if order.charged?

  PaymentGateway.charge!(
    amount_centavos: order.total_centavos,
    idempotency_key: "order:#{order.id}:charge"
  )
  order.update!(status: :charged)
end
```

Se o `update` falhar de novo, o retry reenvia a chave. Sem chave, nem uniqueness na fila salva: o primeiro job já saiu, o lock abriu, o segundo cobra.

**Pontos-chave:**
- At-least-once exige idempotência no efeito, não na fila
- Unique job não cobre “morri depois do HTTP”
- Status `charged?` evita trabalho inútil; a chave evita dinheiro duplicado
</details>

### Exercício 2: 422 no Fisco

**Enunciado:** `PushInvoiceJob` recebe 422 (`XML inválido`). O job está com `retry: 25`. O que acontece nas próximas três semanas e o que você muda no código?

<details>
<summary>Solução</summary>

25 retries com backoff exponencial: o XML errado vai ser reenviado durante dias. O dead set só vê o cadáver no fim. O Fisco ainda recusa. Você queimou cota, encheu log e atrasou o alerta.

```ruby
case response.status
when 422, 400
  invoice.update!(submit_error: response.body)
  # return — sem raise
when 429, 500..599
  raise FiscalApi::TransientError
end
```

Opcional: `:kill` no `sidekiq_retry_in` se alguém no meio da stack ainda levantar 4xx. Alerta no `sidekiq_retries_exhausted` ou no próprio branch permanente.

**Pontos-chave:**
- 4xx não retenta
- Default 25 esconde bug
- Erro permanente grava estado e sai
</details>

### Exercício 3: Clique duplo no export

**Enunciado:** O botão “Gerar relatório” enfileira `GenerateReportJob.perform_async(account_id)`. Dois cliques, dois jobs, dois PDFs, dois e-mails. Unique job resolve? O que você responde na entrevista?

<details>
<summary>Solução</summary>

Resolve **parte**: uniqueness `until_executed` (ou equivalente Enterprise) impede o segundo enqueue enquanto o primeiro está na fila ou rodando. Clique duplo some.

Não resolve: retry no meio da geração, worker morto depois de enviar o e-mail, dois processos que passaram do lock. Aí você precisa de uma linha `Report.create!(account_id:, period:, status: :pending)` com unique index `(account_id, period)` e o job só processa se ainda estiver `pending`.

```ruby
def perform(report_id)
  report = Report.lock.find(report_id)
  return unless report.pending?

  report.update!(status: :processing)
  pdf = ReportRenderer.render(report)
  report.update!(status: :done, file: pdf)
  ReportMailer.ready(report).deliver_now
end
```

**Pontos-chave:**
- Uniqueness = trava de fila, boa para clique duplo
- sidekiq-unique-jobs / Enterprise não são exactly-once
- Unique index + status é o que segura o domínio
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
