# 12.2 Sidekiq

> **TL;DR**
> Sidekiq é o adapter de job que a galera realmente roda. Redis guarda a queue. Um processo Sidekiq puxa o JSON e executa em threads. Worker nativo (`Sidekiq::Job`) ou wrapper Active Job: a API muda, o Redis é o mesmo. `concurrency` casa com o pool do Active Record. Queue com peso. Web UI atrás de auth. Job pode rodar duas vezes — escreva idempotente. Não compartilhe conexão de banco entre threads.

## Conteúdo

- [Redis e threads](#redis-e-threads)
- [Worker nativo vs Active Job](#worker-nativo-vs-active-job)
- [Queues](#queues)
- [Concurrency](#concurrency)
- [sidekiq.yml](#sidekiqyml)
- [Web UI](#web-ui)
- [Idempotência](#idempotência)
- [Não compartilhe a conexão do Active Record](#não-compartilhe-a-conexão-do-active-record)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Redis e threads

**O que é:**
Sidekiq não é um broker. É um processo Ruby que usa Redis como store da queue. A app web faz `LPUSH` de um JSON. O processo Sidekiq faz `BRPOP`, deserializa e chama `perform`.

**Como funciona:**
Um processo. Vários threads. MRI tem GVL: um bytecode Ruby por vez. Job de verdade espera IO — Postgres, HTTP, SMTP, S3. Enquanto um thread espera, outro roda. Por isso thread serve. Relatório CPU-bound no mesmo processo: os threads se atropelam.

```text
request Rails  →  Redis (queue)  →  processo Sidekiq (N threads)  →  perform
```

Dois processos diferentes. O Puma não executa o job. Se o worker Sidekiq está down, a queue cresce no Redis e o request já respondeu 200.

Argumento vai JSON. Integer, String, Hash, Array. Não manda objeto Active Record no worker nativo — manda ID e busca de novo.

```ruby
class ReceiptJob
  include Sidekiq::Job

  def perform(order_id)
    order = Order.find(order_id)
    ReceiptMailer.with(order: order).deliver_now
  end
end

ReceiptJob.perform_async(order.id)
```

**Quando usar:**
Tudo que o request HTTP não precisa esperar: e-mail, PDF, webhook de saída, recálculo. Não use para “ficar mais rápido o `save`” se o usuário precisa do resultado na mesma tela.

**Na entrevista:**
> "Sidekiq é Redis + threads. A web enfileira JSON. O processo Sidekiq consome. Thread ajuda porque job é IO. CPU pesado eu isolo em queue própria ou em outro processo, não aumento concurrency no chute."

---

## Worker nativo vs Active Job

**O que é:**
Duas portas para a mesma fila. Nativo: `include Sidekiq::Job`, `perform_async`. Wrapper: `class FooJob < ApplicationJob` com `config.active_job.queue_adapter = :sidekiq`, `perform_later`.

**Como funciona:**
```ruby
# config/application.rb ou production.rb
config.active_job.queue_adapter = :sidekiq

# nativo — Sidekiq 7
class ChargeJob
  include Sidekiq::Job
  sidekiq_options queue: "critical"

  def perform(payment_id)
    Payment.find(payment_id).capture!
  end
end

ChargeJob.perform_async(payment.id)
ChargeJob.perform_in(30, payment.id)

# Active Job — a API do Rails
class ChargeJob < ApplicationJob
  queue_as :critical

  def perform(payment)
    payment.capture!
  end
end

ChargeJob.perform_later(payment) # GlobalID serializa o record
```

Active Job empacota: serializa argumento, escolhe queue, entrega no adapter. Sidekiq nativo fala Redis direto. Menos camada, mais opção da gem (`sidekiq_options`, unique jobs, batch). Active Job brilha no teste (`:test` adapter, `have_been_enqueued`) e se um dia você trocar o backend.

Na prática ninguém troca Delayed Job no sábado. O adapter que a entrevista espera é Sidekiq. Solid Queue existe no Rails 8; não apaga essa resposta.

**Quando usar:**
Time já em Sidekiq, job quente, opção da gem → nativo. App Rails padrão, mailer, `perform_later` depois do commit → Active Job no adapter `:sidekiq`. Os dois podem coexistir. Não misture o mesmo job nas duas APIs.

**Na entrevista:**
> "Active Job é a interface do Rails. Sidekiq é o adapter que a galera realmente roda. Worker nativo é mais perto do Redis. Active Job eu uso quando quero a API do Rails e o teste com adapter `:test`. Não vendo Delayed Job como plano B atual."

---

## Queues

**O que é:**
Nome da lista no Redis. `default` se você não falar nada. Queue não é prioridade mágica: é o worker que decide o que puxa.

**Como funciona:**
```ruby
class FraudCheckJob
  include Sidekiq::Job
  sidekiq_options queue: "critical"

  def perform(order_id)
    Order.find(order_id).check_fraud!
  end
end
```

PDF e newsletter vão para `low`. Um processo escuta várias queues. Com peso, `critical` é sorteada mais vezes que `low`. Com `:strict: true`, esgota `critical` antes de olhar `default`. Strict deixa a queue baixa faminta se a crítica nunca esvazia.

**Quando usar:**
Separe o que não pode esperar (pagamento, senha) do que pode (PDF, newsletter). Mailer costuma ir para `mailers`. Não crie dez queues “por domínio” — você só fragmenta o worker.

**Na entrevista:**
> "Queue é lista no Redis. Peso define chance de puxar. Strict é prioridade dura. Eu separo critical / default / low. Dez queues sem worker escutando é job parado e ninguém vê."

---

## Concurrency

**O que é:**
Quantos threads o processo Sidekiq usa para `perform` ao mesmo tempo. Default moderno: 10. Não é “quantos jobs por segundo”. É quantos estão em voo naquele processo.

**Como funciona:**
Concurrency 10 = até 10 `perform` ao mesmo tempo nesse processo. IO: 10 threads esperando SMTP ajudam. CPU: 10 threads zipando vídeo no MRI se empurram e ainda seguram 10 conexões de banco. Aí você baixa concurrency nessa queue ou manda para um processo só dela.

Escala horizontal: mais processos Sidekiq. Não é só subir o número no yml.

`timeout` no yml é o tempo que o Sidekiq espera o job no shutdown (SIGTERM). Job acima disso é matado e volta para a queue — mais um motivo para idempotência. Detalhe de retry e dead set: capítulo 12.3.

**Quando usar:**
Comece no default. Suba se a queue cresce e o job é IO. Desça se o banco grita, se a memória sobe, se o job é CPU. Meça fila, latency, saturação de Postgres — não chute 50.

**Na entrevista:**
> "Concurrency é thread no processo Sidekiq, default 10. Casa com o pool do Active Record. IO aguenta mais thread. CPU e memória, não. Escala de verdade: mais processo, não um yml com 64."

---

## sidekiq.yml

**O que é:**
O arquivo que o processo lê no boot: `bundle exec sidekiq -C config/sidekiq.yml`. Concurrency, queues, timeout. Não é o `database.yml`. Redis URL mora no initializer.

**Como funciona:**
```yaml
# config/sidekiq.yml
:concurrency: 10
:timeout: 25
:queues:
  - [critical, 8]
  - [default, 4]
  - [mailers, 2]
  - [low, 1]
```

```ruby
# config/initializers/sidekiq.rb
redis = { url: ENV.fetch("REDIS_URL") }

Sidekiq.configure_client do |config|
  config.redis = redis
end

Sidekiq.configure_server do |config|
  config.redis = redis
end
```

Client é a web enfileirando. Server é o processo que executa. Os dois no mesmo Redis. Cache no mesmo Redis: dá. Eviction apagando a queue: não — capítulo 7.8.

**Quando usar:**
Sempre em produção. Sem yml, você herda default e uma queue `default`. Job em `critical` some da vista.

**Na entrevista:**
> "sidekiq.yml define concurrency e queues. Redis URL no initializer, client e server. Eu não misturo eviction de cache com a queue. Deploy sem o processo `sidekiq` é enfileirar para ninguém."

---

## Web UI

**O que é:**
Painel Rack: queues, busy, retries, dead, latency. Você monta na app Rails. Não é métrica de APM. É olho no Redis agora.

**Como funciona:**
```ruby
# config/routes.rb
require "sidekiq/web"

authenticate :user, ->(user) { user.admin? } do
  mount Sidekiq::Web, at: "/sidekiq"
end
```

Sem auth o painel é incidente: retry, delete, enqueue. Constraint de IP não é autorização. Basic auth com `secure_compare` serve se não tem Devise. Não público.

No plantão: fila, latency, busy, retry, dead. Busy = 10 e fila andando é saturado. Busy = 0 e fila andando é worker morto ou queue com nome errado.

**Quando usar:**
Debug e plantão. Produção só atrás de login admin. Métrica contínua: Prometheus / APM, não F5 no `/sidekiq`.

**Na entrevista:**
> "Web UI eu monto em `/sidekiq` com auth de admin. Aberto na internet é incidente. Fila subindo com busy zerado: processo down ou queue que ninguém escuta."

---

## Idempotência

**O que é:**
Rodar `perform` duas vezes não duplica efeito visível. Sidekiq pode entregar de novo: retry, SIGTERM no meio, rede depois do trabalho e antes do ack. A queue não é transação com o Postgres.

**Como funciona:**
```ruby
class CapturePaymentJob
  include Sidekiq::Job
  sidekiq_options queue: "critical"

  def perform(payment_id)
    payment = Payment.find(payment_id)
    return if payment.captured?

    payment.capture!
  end
end
```

`return if captured?` não basta se dois threads passam no check juntos. Aí unique no banco (`captured_at` + constraint) ou lock. E-mail: chave de idempotência no provedor ou registro `MailDelivery` único por `order_id`. Cobrança duplicada é o exemplo que o entrevistador quer ouvir.

Passe ID. Busque o estado atual. Não confie no objeto que existia no request de 30 segundos atrás.

**Quando usar:**
Sempre que o efeito sai da app: pagamento, e-mail, webhook, estoque. Job que só recalcula um cache tolera replay. Job que cobra cartão não.

**Na entrevista:**
> "Job pode rodar duas vezes. Eu não prometo exactly-once. Eu desenho at-least-once + idempotência: checo estado, unique no banco, ID no argumento. Uniqueness da gem é extra — capítulo 12.3."

---

## Não compartilhe a conexão do Active Record

**O que é:**
Cada thread do Sidekiq precisa da própria conexão. O pool do `database.yml` tem que ser ≥ concurrency daquele processo. Conexão não é objeto para passar no `Thread.new`.

**Como funciona:**
```yaml
# config/database.yml — processo Sidekiq
pool: <%= ENV.fetch("DATABASE_POOL") { 10 } %>
```

```text
Sidekiq concurrency 10 + pool 5  →  ActiveRecord::ConnectionTimeoutError
```

O job em si já roda numa thread do Sidekiq. O Rails/Sidekiq empresta a conexão, executa, devolve. O bug clássico é você abrir thread extra dentro do `perform` e o filho reusar a conexão do pai.

```ruby
# RUIM — conexão da thread do job vaza
def perform(ids)
  ids.map { |id| Thread.new { User.find(id) } }.map(&:value)
end

# BOM — uma query, uma thread: a do Sidekiq
def perform(ids)
  User.where(id: ids).find_each(&:notify!)
end

# Fan-out inevitável: with_connection no thread filho, nunca a conexão do pai.
```

`RAILS_MAX_THREADS` do Puma não é a concurrency do Sidekiq. São processos diferentes. Cada um com seu pool. Se o initializer seta `reaping_frequency` e checkout, ok. Se você guarda `ActiveRecord::Base.connection` em variável de classe: corrida, query no socket errado, erro fantasma.

**Quando usar:**
Ajuste de pool sempre que mudar concurrency. Thread extra no job: quase nunca. Prefira query em lote ou outro job.

**Na entrevista:**
> "Eu não compartilho conexão do Active Record entre threads. Pool ≥ concurrency do Sidekiq. Thread.new dentro do job é o jeito clássico de estourar o pool. Puma e Sidekiq não compartilham o número."

---

## Recapitulando

- Sidekiq = Redis + processo com threads. A web só enfileira.
- Active Job é a interface. Sidekiq é o adapter que a galera realmente roda.
- Worker nativo: `Sidekiq::Job`, `perform_async`, argumento JSON.
- Queue é lista. Peso ou strict. Worker tem que escutar o nome.
- `concurrency` é thread em voo. Default 10. Casa com o pool do banco.
- `sidekiq.yml` + initializer de Redis. Client e server no mesmo Redis.
- Web UI com auth. Fila + busy zerado = worker morto.
- At-least-once. Idempotência no `perform`. Passa ID.
- Conexão de AR é por thread. Não compartilhe. Não faça `Thread.new` no job.

---

## Exercícios práticos

### Exercício 1: Qual API você escolhe?

**Enunciado:** O entrevistador pergunta: "Você usa `ApplicationJob` ou `include Sidekiq::Job`?" Responda em poucas frases. Quando nativo, quando Active Job, e qual adapter você cita.

<details>
<summary>Solução</summary>

Active Job é a API do Rails. Sidekiq é o adapter que você realmente roda em produção. Nativo quando o time já é Sidekiq e o job precisa de `sidekiq_options` / menos camada. Active Job quando quer `perform_later`, GlobalID e teste com adapter `:test`. Os dois falam com o mesmo Redis se o adapter é `:sidekiq`. Não responder “Delayed Job” como default atual.

**Pontos-chave:**
- Interface vs adapter
- Sidekiq é a resposta de produção
- Não misturar o mesmo job nas duas APIs
</details>

### Exercício 2: Timeout de conexão no worker

**Enunciado:** Produção: `ActiveRecord::ConnectionTimeoutError` só no processo Sidekiq. Puma está fino. `database.yml` tem `pool: 5`. `config/sidekiq.yml` tem `:concurrency: 15`. O job faz `User.find` e um HTTP. O que está errado e o que você muda?

<details>
<summary>Solução</summary>

15 threads, 5 conexões. Cada `perform` quer uma conexão. As 5 primeiras passam; o resto espera o checkout e estoura. Puma não sente porque é outro processo, outro pool.

```yaml
# database.yml no processo Sidekiq
pool: <%= ENV.fetch("DATABASE_POOL") { 15 } %>
```

Ou baixe concurrency para 5. Casa os dois números. Se o job ainda abre `Thread.new` com AR, o pool precisa de folga — melhor tirar o thread.

**Pontos-chave:**
- pool ≥ concurrency
- Puma e Sidekiq não compartilham pool
- Thread extra dentro do job piora
</details>

### Exercício 3: O e-mail foi duas vezes

**Enunciado:** `ReceiptJob` manda o comprovante. De vez em quando o usuário recebe dois. O job é:

```ruby
def perform(order_id)
  order = Order.find(order_id)
  ReceiptMailer.with(order: order).deliver_now
end
```

Por que isso acontece e como você deixa idempotente?

<details>
<summary>Solução</summary>

Sidekiq é at-least-once. Retry, kill no deploy, timeout no shutdown: o `perform` roda de novo. O mailer não sabe que já enviou.

```ruby
def perform(order_id)
  order = Order.find(order_id)
  return if order.receipt_sent_at.present?

  ReceiptMailer.with(order: order).deliver_now
  order.update!(receipt_sent_at: Time.current)
end
```

Ainda há corrida se dois threads passam no `return`. Unique index em `order_id` numa tabela de entregas, ou lock no `order`. Cobrança: a mesma ideia, com constraint no gateway.

**Pontos-chave:**
- Não existe exactly-once de graça
- Checar estado + gravar efeito
- Argumento é ID, estado se busca agora
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
