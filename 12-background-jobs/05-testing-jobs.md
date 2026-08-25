# 12.5 Testar jobs

> **TL;DR**
> Job tem duas perguntas: o código de produção enfileirou o job certo, e o `perform` faz o efeito certo. `have_enqueued_job` responde a primeira; `perform_now` no job spec responde a segunda. `ActiveJob::TestHelper` e o adapter `:test` guardam a fila em memória — a suíte não precisa de Redis. `perform_enqueued_jobs` drena essa fila; não substitui o unitário do `perform`. Sidekiq: `fake` acumula, `inline` roda na hora. Estrutura de spec, request spec, factory e double ficam na [seção 8](../08-testing/01-rspec-model.md).

## Conteúdo

- [Duas perguntas, dois testes](#duas-perguntas-dois-testes)
- [ActiveJob::TestHelper](#activejobtesthelper)
- [`have_enqueued_job`](#have_enqueued_job)
- [`perform_enqueued_jobs`](#perform_enqueued_jobs)
- [Teste o `perform` no unitário](#teste-o-perform-no-unitário)
- [Não bata no Redis](#não-bata-no-redis)
- [fake e inline no Sidekiq](#fake-e-inline-no-sidekiq)
- [Onde cada spec mora](#onde-cada-spec-mora)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Duas perguntas, dois testes

**O que é:**
Um job quebra de dois jeitos. O checkout pode esquecer de enfileirar. O worker pode enfileirar e cobrar o valor errado. Um spec só não cobre os dois.

| Pergunta | Onde | O que você observa |
|---|---|---|
| Enfileirou? | request spec, service spec | classe, args, queue, horário |
| Executou certo? | job spec | efeito no banco, e-mail, gateway |

```ruby
# app/jobs/charge_order_job.rb
class ChargeOrderJob < ApplicationJob
  queue_as :payments

  def perform(order)
    PaymentGateway.charge(order_id: order.id, amount_cents: order.total_cents)
    order.update!(status: :paid)
  end
end
```

O request spec não precisa saber como o gateway cobra. O job spec não precisa saber qual route chamou `perform_later`.

**Na entrevista:**
> "Eu testo enqueue e perform em specs diferentes. Misturar esconde o bug: o job pode estar certo e ninguém enfileirar."

---

## ActiveJob::TestHelper

**O que é:**
Helper do Rails para a fila de teste. No Minitest você inclui na classe. No RSpec, `rspec-rails` já inclui em `type: :job`. Os matchers `have_enqueued_job` e `have_been_performed` leem a mesma fila em memória.

```ruby
# config/environments/test.rb
config.active_job.queue_adapter = :test
```

Padrão no Rails 7.1+. Job enfileirado vira item de array no processo. Sem Redis, sem thread, sem worker de verdade.

| API | Papel |
|---|---|
| `assert_enqueued_with` / `have_enqueued_job` | o job entrou na fila |
| `perform_enqueued_jobs` | drena a fila e executa |
| `assert_performed_jobs` / `have_been_performed` | o job já rodou |

`perform_now` não passa por essa fila. Chama `perform` no processo atual. Serve para o unitário. Não prova enqueue. Spec que não é `type: :job` inclui o helper na mão.

**Na entrevista:**
> "No teste o adapter `:test` guarda o job em memória. ActiveJob::TestHelper lê essa fila. Eu não preciso do Sidekiq ligado para a suíte verde."

---

## `have_enqueued_job`

**O que é:**
Matcher do `rspec-rails` sobre a fila do adapter `:test`. A forma com bloco compara o que entrou **durante** o exemplo. `have_been_enqueued` olha o que já está lá.

```ruby
# spec/requests/checkouts_spec.rb
RSpec.describe "Checkouts", type: :request do
  it "enfileira a cobrança" do
    order = create(:order, total_cents: 12_900)

    expect {
      post checkout_path, params: { order_id: order.id }
    }.to have_enqueued_job(ChargeOrderJob)
      .with(order)
      .on_queue("payments")
  end
end
```

O entrevistador também espera:

```ruby
expect { action }.to have_enqueued_job(ChargeOrderJob).exactly(:once)
expect { action }.to have_enqueued_job(ChargeOrderJob).at(1.hour.from_now)

ChargeOrderJob.perform_later(order)
expect(ChargeOrderJob).to have_been_enqueued.with(order)
```

Use no spec de quem dispara o job. No spec do próprio job você já sabe que a classe existe.

**Importante na entrevista:**
O matcher some se o adapter for `:inline` ou `:sidekiq` sem fake. O job não fica na fila: ou já rodou, ou foi para o Redis. Se “não funciona”, olhe `queue_adapter` antes de culpar o RSpec.

Não faça mock de enqueue:

```ruby
expect(ChargeOrderJob).to receive(:perform_later).with(order)
checkout.call
```

Isso testa o nome do método, não a fila. `set(wait: 5.minutes).perform_later` já quebra o mock. Matcher observa o efeito — cheiro da [8.5](../08-testing/05-mocks-stubs.md).

**Na entrevista:**
> "Eu uso have_enqueued_job no request spec. Confiro classe, argumentos e queue. Não faço expect receive em perform_later."

---

## `perform_enqueued_jobs`

**O que é:**
Drena a fila do adapter `:test` e chama os jobs. Integração curta. Fácil de abusar.

```ruby
it "marca o pedido como pago depois de drenar a fila" do
  order = create(:order, total_cents: 12_900)
  allow(PaymentGateway).to receive(:charge)

  perform_enqueued_jobs only: ChargeOrderJob do
    ChargeOrderJob.perform_later(order)
  end

  expect(order.reload).to be_paid
end
```

Sem `only:`, um job que enfileira outro também roda. Não ligue um `around` global: se todo `perform_later` executa na hora, `have_enqueued_job` falha e você perdeu a prova de enqueue.

```ruby
# Armadilha: a fila nunca acumula
config.around { |example| perform_enqueued_jobs { example.run } }
```

**Na entrevista:**
> "perform_enqueued_jobs executa o que estava na fila de teste. Eu uso com only. Não ligo na suíte inteira, senão perco o teste de enqueue."

---

## Teste o `perform` no unitário

**O que é:**
O job spec chama `perform_now` e verifica o efeito. É o model spec da [8.1](../08-testing/01-rspec-model.md) no worker: comportamento seu, não o framework.

```ruby
# spec/jobs/charge_order_job_spec.rb
RSpec.describe ChargeOrderJob, type: :job do
  it "cobra e marca o pedido como pago" do
    order = create(:order, total_cents: 12_900)
    allow(PaymentGateway).to receive(:charge)

    described_class.perform_now(order)

    expect(PaymentGateway).to have_received(:charge).with(
      order_id: order.id,
      amount_cents: 12_900
    )
    expect(order.reload.status).to eq("paid")
  end
end
```

`create` vem do FactoryBot — [8.4](../08-testing/04-factorybot.md). Gateway é fronteira: stub cabe. Pedido é Active Record: não faça mock de `Order.find`.

`perform_later` neste arquivo não testa o `perform`. Só devolve para a fila. Se o job spec só tem `have_enqueued_job(described_class)`, você não testou o job.

Retry, dead set e uniqueness não se provam bem aqui. Isso é backend, não regra do `perform`.

**Na entrevista:**
> "No job spec eu chamo perform_now e olho o efeito. Enqueue eu deixo para quem dispara o job."

---

## Não bata no Redis

**O que é:**
A suíte de job quase nunca precisa do Redis real. Redis no spec traz processo extra, estado compartilhado e flake quando um exemplo não limpa a fila.

| Setup | O que acontece | Use em |
|---|---|---|
| `queue_adapter = :test` | array em memória | quase todos os specs Active Job |
| Sidekiq `fake!` | `Worker.jobs` em memória | worker `Sidekiq::Worker` |
| Sidekiq `inline!` | `perform` na hora | um exemplo que precisa do efeito |
| adapter `:sidekiq` + Redis | fila de verdade | smoke raro |

Sintomas: spec só passa com `redis-server` no ar; o exemplo seguinte vê job do anterior; CI cai com `Error connecting to Redis`; `have_enqueued_job` não vê nada.

Limpe memória, não o servidor:

```ruby
config.after { ActiveJob::Base.queue_adapter.enqueued_jobs.clear }
```

Redis de verdade: quase nunca na unidade. No máximo um spec de fumaça isolado, se a equipe precisa de um middleware do Sidekiq que só existe com Redis.

**Na entrevista:**
> "Eu não subo Redis para testar job. Adapter :test ou Sidekiq fake. Redis no spec é estado compartilhado e CI frágil."

---

## fake e inline no Sidekiq

**O que é:**
Worker com `Sidekiq::Worker` e `perform_async` não passa pelo Active Job. A API de teste é `Sidekiq::Testing`.

| Modo | `perform_async` faz o quê |
|---|---|
| `fake!` | empurra para `Worker.jobs` (padrão ao dar require) |
| `inline!` | chama `perform` na hora |
| `disable!` | manda para o Redis real |

```ruby
# spec/rails_helper.rb
require "sidekiq/testing"

RSpec.configure do |config|
  config.before do
    Sidekiq::Testing.fake!
    Sidekiq::Worker.clear_all
  end
end
```

```ruby
RSpec.describe ChargeOrderWorker, type: :worker do
  it "acumula o job na fila fake" do
    described_class.perform_async(42)

    expect(described_class.jobs.size).to eq(1)
    expect(described_class.jobs.first["args"]).to eq([42])
  end

  it "executa quando drena" do
    order = create(:order, total_cents: 12_900)
    allow(PaymentGateway).to receive(:charge)

    described_class.perform_async(order.id)
    described_class.drain

    expect(order.reload).to be_paid
  end
end
```

`inline!` no exemplo cobra na hora — e some com a prova de enqueue. Se a app usa Active Job na frente do Sidekiq, o dia a dia continua no adapter `:test`. `fake` e `inline` entram quando o código chama `perform_async` ou quando `test.rb` apontou `:sidekiq`.

**Na entrevista:**
> "fake acumula em memória, inline executa na hora, disable vai para o Redis. No spec eu fico no fake e drenei quando quero o efeito."

---

## Onde cada spec mora

Job não inventa um quarto tipo de spec. A seção 8 já definiu as camadas.

| Camada | Capítulo | Papel com job |
|---|---|---|
| Model spec | [8.1](../08-testing/01-rspec-model.md) | o mesmo formato: `describe`, `it`, efeito |
| Request spec | [8.2](../08-testing/02-request-spec.md) | o POST enfileirou? |
| FactoryBot | [8.4](../08-testing/04-factorybot.md) | `create(:order)` para o `perform` |
| Mocks e stubs | [8.5](../08-testing/05-mocks-stubs.md) | stub de gateway; sem mock de Active Record |

System spec da [8.3](../08-testing/03-system-spec.md) não drena Sidekiq. O navegador prova a tela; a fila prova o worker.

**Na entrevista:**
> "Request spec pergunta se enfileirou. Job spec pergunta se o perform cobra certo. Gateway eu stubo. Redis eu não ligo."

---

## Recapitulando

- Enqueue e perform são duas perguntas. Dois specs.
- Adapter `:test` + `ActiveJob::TestHelper` = fila em memória.
- `have_enqueued_job` no código que dispara o job. Sem mock de `perform_later`.
- `perform_now` testa a lógica do worker.
- `perform_enqueued_jobs` drena a fila; use `only:` e não ligue na suíte toda.
- A maioria dos specs não fala com Redis.
- Sidekiq: `fake!` acumula, `inline!` executa, `disable!` vai ao Redis.
- Request spec, factory e double já estão na seção 8.

---

## Exercícios práticos

### Exercício 1: o checkout enfileira

**Enunciado:** `POST /checkouts` cria o pedido de R$ 129,00 e enfileira `ChargeOrderJob` na queue `payments`. Escreva o expect do request spec. Não execute o job.

<details>
<summary>Solução</summary>

```ruby
RSpec.describe "Checkouts", type: :request do
  it "enfileira a cobrança" do
    expect {
      post checkouts_path, params: { total_cents: 12_900 }
    }.to have_enqueued_job(ChargeOrderJob)
      .with(Order.last)
      .on_queue("payments")
      .exactly(:once)
  end
end
```

Se o job recebe id, o `with` vira `with(Order.last.id)`. O matcher segue a assinatura do `perform`.

**Pontos-chave:**
- request spec prova enqueue, não cobrança;
- dinheiro em centavos;
- adapter `:test` precisa estar ligado.
</details>

### Exercício 2: o perform cobra

**Enunciado:** Escreva o job spec de `ChargeOrderJob#perform`. Stub do gateway. Pedido de `12_900` centavos vira `paid`. Não use `perform_later`.

<details>
<summary>Solução</summary>

```ruby
RSpec.describe ChargeOrderJob, type: :job do
  it "cobra e marca como pago" do
    order = create(:order, total_cents: 12_900)
    allow(PaymentGateway).to receive(:charge)

    described_class.perform_now(order)

    expect(PaymentGateway).to have_received(:charge).with(
      order_id: order.id,
      amount_cents: 12_900
    )
    expect(order.reload.status).to eq("paid")
  end
end
```

**Pontos-chave:**
- `perform_now` exercita o corpo;
- gateway é fronteira: stub;
- pedido é Active Record: record real de teste.
</details>

### Exercício 3: fake ou Redis?

**Enunciado:** O spec abaixo só passa com Redis no ar e falha no exemplo seguinte. Reescreva com `Sidekiq::Testing.fake!` e prove o enqueue sem executar.

```ruby
it "enfileira o worker" do
  ChargeOrderWorker.perform_async(42)
  expect(ChargeOrderWorker).to have_enqueued_sidekiq_job(42)
end
```

<details>
<summary>Solução</summary>

```ruby
require "sidekiq/testing"

RSpec.describe ChargeOrderWorker do
  before do
    Sidekiq::Testing.fake!
    Sidekiq::Worker.clear_all
  end

  it "enfileira o worker" do
    described_class.perform_async(42)

    expect(described_class.jobs.size).to eq(1)
    expect(described_class.jobs.first["args"]).to eq([42])
  end
end
```

`have_enqueued_job` é do Active Job. Worker puro olha `Worker.jobs`. `clear_all` evita vazamento. Redis continua desligado.

**Pontos-chave:**
- fake guarda em memória;
- limpe a fila entre exemplos;
- matcher de Active Job não substitui a API do Sidekiq.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
