# 12.1 Active Job

> **TL;DR**
> Request HTTP não espera SMTP nem webhook. Active Job é a API do Rails: você escreve `perform`, chama `perform_later`, o adapter decide onde a fila mora. `ApplicationJob` é a base da app. `perform_later` serializa e enfileira; `perform_now` roda na hora, no processo atual. Argumento de Active Record vira GlobalID e é recarregado no worker. Adapter `:async` não sobrevive restart. Produção usa Sidekiq. Enfileire depois do commit.

## Conteúdo

- [Por que async](#por-que-async)
- [O que é Active Job](#o-que-é-active-job)
- [ApplicationJob](#applicationjob)
- [perform_later vs perform_now](#perform_later-vs-perform_now)
- [Argumentos e GlobalID](#argumentos-e-globalid)
- [Adapter](#adapter)
- [Enfileirar depois do commit](#enfileirar-depois-do-commit)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Por que async

**O que é:**
Trabalho que não precisa terminar antes da resposta HTTP. E-mail, webhook, PDF, resize de imagem. O usuário já tem o pedido criado. Ele não precisa esperar o SMTP da AWS.

**Como funciona:**
O request grava o dado e devolve 201/302. Um worker, em outro processo, faz o I/O lento. Se o SMTP cair, o request já respondeu. A falha fica no job, não na cara do usuário.

```ruby
# RUIM — o checkout espera o e-mail
def create
  @order = Order.create!(order_params)
  OrderMailer.confirmation(@order).deliver_now
  redirect_to @order
end

# BOM — o request só persiste e enfileira
def create
  @order = Order.create!(order_params)
  OrderMailer.confirmation(@order).deliver_later
  redirect_to @order
end
```

`deliver_later` já usa Active Job. Você não precisa de um job só para chamar o mailer.

Webhook é o mesmo padrão. HTTP para parceiro tem timeout, retry e corpo que você não controla. Não bloqueie o `create`.

```ruby
def create
  @order = Order.create!(order_params)
  NotifyPartnerJob.perform_later(@order)
  redirect_to @order
end
```

**Quando usar:**
I/O externo, CPU pesada, qualquer coisa que você aceitaria perder da resposta e retentar depois. Não jogue no job a regra que o usuário precisa ver agora: validação, estoque, cobrança síncrona.

**Na entrevista:**
> "E-mail e webhook saem do request. O usuário espera o pedido criado, não o SMTP. Active Job é a porta. O adapter, em produção, é Sidekiq."

---

## O que é Active Job

**O que é:**
A fachada de fila do Rails. Você escreve contra `ActiveJob::Base`. Troca o backend sem reescrever o job.

**Como funciona:**
`perform_later` serializa classe, argumentos e opções. Entrega isso ao adapter. O adapter empurra para memória, thread ou Redis. O worker instancia o job e chama `perform`.

Não é o Sidekiq. Sidekiq é um adapter. Retry fino, dead set e uniqueness ficam no [12.2](/12-background-jobs/02-sidekiq) e no [12.3](/12-background-jobs/03-retry-dead-uniqueness).

**Quando usar:**
Sempre que a app enfileira trabalho. Mailer, job seu, gem que aceita Active Job. Evite chamar a API do Sidekiq direto no controller: você perde a troca de adapter e o teste padrão do Rails.

**Na entrevista:**
> "Active Job é a API. Sidekiq é o backend. Eu escrevo o job uma vez e aponto o adapter no environment."

---

## ApplicationJob

**O que é:**
A classe base da app. Mora em `app/jobs/application_job.rb`. Seus jobs herdam dela, não de `ActiveJob::Base` direto.

**Como funciona:**
O generator do Rails 7.1+ deixa o esqueleto assim:

```ruby
class ApplicationJob < ActiveJob::Base
  # retry_on ActiveRecord::Deadlocked
  # discard_on ActiveJob::DeserializationError
end
```

`retry_on` e `discard_on` são da API do Active Job. Política de retry de produção — quantas vezes, dead set, uniqueness — é conversa do 12.3. Aqui importa o lugar: default da app fica em `ApplicationJob`. Exceção de um job específico fica no próprio job.

```ruby
class WelcomeEmailJob < ApplicationJob
  queue_as :mailers

  def perform(user)
    UserMailer.welcome(user).deliver_now
  end
end
```

`bin/rails generate job WelcomeEmail` cria o arquivo em `app/jobs/` e um test stub. `queue_as` nomeia a fila. Com `:async` o nome é quase um rótulo. Com Sidekiq, vira fila de verdade.

**Quando usar:**
Todo job da app herda `ApplicationJob`. Callback comum, tag de log, descarte de GlobalID morto — na base. Comportamento de um fluxo só — no job.

**Na entrevista:**
> "ApplicationJob é o ApplicationRecord dos jobs. Default da app mora lá. Eu não herdo ActiveJob::Base no job da feature."

---

## perform_later vs perform_now

**O que é:**
Dois jeitos de disparar o mesmo `perform`. Um enfileira. O outro executa agora.

**Como funciona:**

```ruby
user = User.find(42)

WelcomeEmailJob.perform_later(user)
# serializa, entrega ao adapter, o request segue

WelcomeEmailJob.perform_now(user)
# instancia e chama perform neste processo, nesta thread
```

`perform_later` respeita o adapter. Em development com `:async`, outra thread do Puma pega o job. Em production com Sidekiq, o Redis segura até um processo worker puxar.

`perform_now` ignora a fila. Útil no console, num rake que já é batch, ou quando o mailer interno do job precisa ser síncrono — o job em si já está no worker.

```ruby
# agenda pelo Active Job; o cron de verdade é o 12.4
WelcomeEmailJob.set(wait: 5.minutes).perform_later(user)
WelcomeEmailJob.set(queue: :mailers).perform_later(user)
```

`deliver_later` / `deliver_now` do Action Mailer são o mesmo recorte: later passa pelo Active Job; now manda o SMTP na hora.

**Quando usar:**
Controller, callback, mailer da request → `perform_later`. Console, script, o `perform` de um job que só orquestra → `perform_now` no colaborador.

**Importante na entrevista:**
`perform_now` não é o adapter `:inline`. `:inline` faz *todo* `perform_later` virar execução imediata. `perform_now` é esta chamada.

**Na entrevista:**
> "perform_later serializa e enfileira. perform_now roda agora, no processo atual. No request eu uso later."

---

## Argumentos e GlobalID

**O que é:**
O que você passa no `perform_later` precisa sobreviver a JSON/YAML do adapter. Active Record não vai na fila como objeto vivo. Vira GlobalID (`gid://loja/User/42`) e o worker recarrega do banco.

**Como funciona:**

```ruby
class NotifyPartnerJob < ApplicationJob
  def perform(order)
    PartnerClient.notify_paid(order)
  end
end

order = Order.create!(total_cents: 12_900)
NotifyPartnerJob.perform_later(order)
# na fila: gid://loja/Order/17
# no worker: Order.find(17)
```

Tipos que passam: Integer, String, Float, `nil`, true/false, Symbol, Date/Time, BigDecimal, Array, Hash, GlobalID. Proc, IO e `ActiveRecord::Relation` não passam.

O reload é o ponto fino. O worker vê o estado *atual* do banco, não o snapshot do enqueue. Se o e-mail precisa do nome de quando o pedido foi feito, passe o valor. Se precisa do registro fresco, passe o model ou o id.

```ruby
# snapshot — o nome não muda se o user editar depois
WelcomeEmailJob.perform_later(user.id, user.name)

# fresco — o worker busca de novo
WelcomeEmailJob.perform_later(user)
```

Se o registro sumiu antes do worker rodar, a desserialização levanta `ActiveJob::DeserializationError`. Por isso o esqueleto comenta `discard_on ActiveJob::DeserializationError`: bem-vindo de um user apagado não precisa de retry.

Passar id e fazer o `find` você mesmo dá a mesma carga, com query explícita:

```ruby
class GenerateInvoicePdfJob < ApplicationJob
  def perform(invoice_id)
    invoice = Invoice.find(invoice_id)
    InvoicePdf.render(invoice)
  end
end
```

**Quando usar:**
Model no argumento quando o job só precisa do registro atual. Id quando você quer `find` com lock, `includes` ou tratar `RecordNotFound` no próprio `perform`. Nunca passe relation.

**Na entrevista:**
> "Active Record vira GlobalID e o worker dá find. Não é snapshot. Se o registro foi apagado, DeserializationError. Eu passo id quando a query do job importa."

---

## Adapter

**O que é:**
Quem segura a fila. Active Job não persiste sozinho. O adapter é a escolha por environment.

**Como funciona:**

```ruby
# config/environments/development.rb
config.active_job.queue_adapter = :async

# config/environments/test.rb
config.active_job.queue_adapter = :test

# config/environments/production.rb
config.active_job.queue_adapter = :sidekiq
```

| Adapter | Onde roda | Serve para |
|---|---|---|
| `:async` | thread pool do processo web | development |
| `:inline` | a mesma thread, na hora | script pontual |
| `:test` | array em memória | spec |
| `:sidekiq` | Redis + processo worker | production |

`:async` é o default de development *e* o default de production se você não configurar nada. Job some no deploy, no kill do Puma, no OOM. Não é fila. É "roda daqui a pouco, se o processo continuar vivo".

`:inline` executa no `perform_later`. Útil para um rake que não quer worker. Em test, o Rails 7.1+ usa `:test`: o job fica enfileirado para você asserir. Como testar isso é o [12.5](/12-background-jobs/05-testing-jobs).

`:sidekiq` exige a gem e o Redis. Internos do worker, concurrency e `sidekiq.yml` são o 12.2. Aqui: em produção você aponta o adapter e sobe um processo worker.

**Quando usar:**
Development com `:async` para ver o e-mail sair sem Redis. Test com `:test`. Production com Sidekiq. Não suba produção no default.

**Na entrevista:**
> "async é thread do próprio processo. Morre no restart. Production eu seto :sidekiq. inline e perform_now não são a mesma coisa."

---

## Enfileirar depois do commit

**O que é:**
O worker é outro processo, outra conexão. Se você enfileira dentro da transaction, o job pode rodar antes do `COMMIT`. O `find` não acha o registro. Ou acha estado velho.

**Como funciona:**
`after_save` / `after_create` ainda estão na transaction. `after_create_commit` roda quando o banco confirmou. O 6.4 e o 6.6 já cortam o callback. Aqui o recorte é o enqueue.

```ruby
# RUIM — o job pode ganhar a corrida do COMMIT
class Order < ApplicationRecord
  after_create :enqueue_confirmation

  def enqueue_confirmation
    OrderConfirmationJob.perform_later(self)
  end
end

# BOM — a fila só vê o registro confirmado
class Order < ApplicationRecord
  after_create_commit :enqueue_confirmation

  def enqueue_confirmation
    OrderConfirmationJob.perform_later(self)
  end
end
```

O mesmo vale no service que abre `Order.transaction`. `perform_later` depois do bloco, não no meio.

```ruby
order = nil
Order.transaction do
  order = Order.create!(attrs)
  order.items.create!(item_attrs)
end
OrderConfirmationJob.perform_later(order)
```

Rails 7.2+ tem `enqueue_after_transaction_commit` para o próprio Active Job adiar o push. Em 7.1 o hábito da entrevista continua sendo `after_create_commit` ou enqueue fora do bloco. Não trate o flag como default do 7.1.

Enfileirar depois do commit não torna e-mail e banco atômicos. Se o Redis recusar o push, o pedido já existe. Job precisa ser idempotente. Outbox é o degrau acima, quando perder o enqueue não é aceitável.

**Quando usar:**
Sempre que o worker depende do registro que você acabou de gravar. Cache externo e webhook entram na mesma regra.

**Na entrevista:**
> "Eu não faço perform_later no after_create. O worker pode correr na frente do COMMIT. after_create_commit, ou depois do bloco da transaction."

---

## Recapitulando

- Request não espera e-mail nem webhook. Isso é job.
- Active Job é a API. Sidekiq é o adapter de produção.
- `ApplicationJob` é a base. Job da feature herda dela.
- `perform_later` enfileira. `perform_now` roda agora. `:inline` muda *todo* later.
- Model vira GlobalID e o worker recarrega. Não é snapshot. Registro sumiu → `DeserializationError`.
- `:async` morre com o processo. Production seta `:sidekiq`.
- Enfileire depois do commit: `after_create_commit` ou fora da transaction.

---

## Exercícios práticos

### Exercício 1: E-mail fora do request

**Enunciado:** O `UsersController#create` grava o user e manda o e-mail de boas-vindas com `deliver_now`. Explique o problema e tire o SMTP do request. Sem inventar job se o mailer já resolve.

<details>
<summary>Solução</summary>

`deliver_now` segura a response no SMTP. Timeout do provedor vira 500 no cadastro.

```ruby
def create
  @user = User.create!(user_params)
  UserMailer.welcome(@user).deliver_later
  redirect_to @user
end
```

`deliver_later` passa pelo Active Job. Job dedicado só vale se houver mais passo do que mandar o e-mail.

**Pontos-chave:**
- Cadastro não depende de SMTP
- Mailer já tem `deliver_later`
- Adapter em produção precisa existir
</details>

### Exercício 2: GlobalID de registro apagado

**Enunciado:** `WelcomeEmailJob.perform_later(user)` roda segundos depois. Nesse intervalo o user foi destruído. O que o worker levanta? Onde você decide o que fazer?

<details>
<summary>Solução</summary>

O argumento era um GlobalID. Na hora do perform o locator faz `User.find` e falha com `ActiveJob::DeserializationError`.

```ruby
class ApplicationJob < ActiveJob::Base
  discard_on ActiveJob::DeserializationError
end
```

Na base, se a regra da app é "sumiu, esquece". No job, se só aquele fluxo pode descartar. Retry não traz o user de volta.

**Pontos-chave:**
- GlobalID recarrega; não leva o objeto
- `DeserializationError` ≠ bug de SMTP
- `discard_on` na base ou no job, conforme o default
</details>

### Exercício 3: Job na frente do COMMIT

**Enunciado:** Um `Checkout` cria a order dentro de `Order.transaction` e, ainda no bloco, chama `NotifyPartnerJob.perform_later(order)`. Em development "funciona". Em produção com Sidekiq o worker loga `RecordNotFound`. Por quê, e como você enfileira?

<details>
<summary>Solução</summary>

`:async` no mesmo processo costuma perder a corrida para o COMMIT. Sidekiq é outro processo: ele lê o Redis na hora e busca uma linha que ainda não foi commitada.

```ruby
order = nil
Order.transaction do
  order = Order.create!(attrs)
  order.reserve_stock!
end
NotifyPartnerJob.perform_later(order)
```

Se o enqueue mora no model, `after_create_commit`, não `after_create`.

**Pontos-chave:**
- Worker vê só dado commitado
- Adapter async esconde o bug
- Enqueue depois do bloco ou no `after_create_commit`
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
