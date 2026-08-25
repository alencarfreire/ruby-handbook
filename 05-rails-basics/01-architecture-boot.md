# 5.1 Arquitetura e boot

> **TL;DR**
> Rails é MVC, mas “fat model, skinny controller” não fecha o desenho. Request real: Puma → middleware (Rack) → router → controller → view. Boot: `config/boot.rb` → `application.rb` → environment → initializers → Zeitwerk (autoload do Rails) → `Rails.application`. `bin/rails s` inicializa isso e entrega a app ao Puma. Classic autoload morreu no Rails 7.

## Conteúdo

- [MVC no Rails](#mvc-no-rails)
- [Fat model não basta](#fat-model-não-basta)
- [Ciclo do request](#ciclo-do-request)
- [Middleware](#middleware)
- [config/application.rb](#configapplicationrb)
- [Environment e initializers](#environment-e-initializers)
- [Zeitwerk no boot](#zeitwerk-no-boot)
- [Rails.application](#railsapplication)
- [bin/rails s](#binrails-s)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## MVC no Rails

**O que é:**
Três pastas, três papéis. Model guarda estado e regra. Controller recebe o request e decide o que devolver. View monta a resposta. No Rails 7.1+ isso ainda é o mapa que o entrevistador espera no quadro.

**Como funciona:**
```ruby
# config/routes.rb
resources :orders, only: [:create]

# app/controllers/orders_controller.rb
class OrdersController < ApplicationController
  def create
    @order = current_user.orders.build(order_params)
    if @order.save
      redirect_to @order, notice: "Pedido criado"
    else
      render :new, status: :unprocessable_entity
    end
  end
end

# app/models/order.rb — invariante, não orquestra pagamento
class Order < ApplicationRecord
  belongs_to :user
  validates :total_cents, numericality: { greater_than: 0 }
end
```

A view só lê `@order`. Não cobra cartão. Não manda e-mail.

**Quando usar:**
CRUD, formulário, tela que o Rails já resolve. Você não inventa arquitetura num `index`.

**Na entrevista:**
> "MVC no Rails é convenção de pasta. Route aponta pro controller. Controller fala com o model. View renderiza. Eu não vendo isso como arquitetura completa."

---

## Fat model não basta

**O que é:**
O mantra antigo: regra no model, controller magro. Serve para o começo. Quebra quando `User` valida e-mail, cobra, autoriza e gera relatório.

**Como funciona:**
```ruby
# RUIM — controller orquestrando o mundo
def create
  @order = Order.create!(order_params)
  PaymentGateway.charge(@order)
  OrderMailer.confirm(@order).deliver_later
end

# AINDA RUIM — god object com callback
class Order < ApplicationRecord
  after_create :charge_card, :send_mail
end

# MELHOR — um objeto, um trabalho
class CreateOrder
  def call(user:, params:)
    order = user.orders.create!(params)
    ChargeOrder.new(order).call
    OrderMailer.confirm(order).deliver_later
    order
  end
end
```

Model fica com invariante: validação, associação, centavos. Caso de uso sai. Controller: params, chama um objeto, responde.

**Quando usar:**
Fat model enquanto o arquivo tem uma razão. Service Object, Form Object, Query Object, Presenter, Policy quando aparece a segunda.

**Na entrevista:**
> "Fat model, skinny controller é incompleto. Eu começo no model. Quando User faz cobrança e permissão, eu extraio. Não espero 800 linhas."

---

## Ciclo do request

**O que é:**
O caminho de um HTTP até a resposta. Desenho de quadro que o pessoal inverte.

**Como funciona:**
Ordem real no Rails 7.1+:

1. Puma aceita o socket
2. Rack chama `Rails.application`
3. A pilha de **middleware** roda
4. O **router** (`ActionDispatch::Routing::RouteSet`) é o último da pilha
5. Instancia o controller e manda o action
6. Action busca model, seta instance variable
7. View renderiza — ou `head` / `redirect_to` / `render json:`
8. A resposta volta pela pilha de middleware

Quem desenha “router → middleware → controller” errou a ordem. Middleware envolve o router. Sem cookie/session/flash você nem chegou no action.

**Na entrevista:**
> "Puma, middleware, router, controller, view. O router não é o primeiro. Ele é o app no fim da pilha Rack."

---

## Middleware

**O que é:**
Objeto Rack. Recebe `env`, chama o próximo, devolve `[status, headers, body]`. A app Rails é uma pilha dessas.

**Como funciona:**
```ruby
Rails.application.middleware

# config/application.rb
config.middleware.use MeuMiddleware
```

Os que caem em entrevista: `ActionDispatch::HostAuthorization`, Cookies + session, `Rack::MethodOverride` (`_method=PATCH`), Flash, `ShowExceptions`. No fim, o RouteSet.

**Quando usar:**
Cross-cutting: header, locale, request id. Regra de `Order` não é middleware.

**Exemplo prático:**
```ruby
class RequestIdLogger
  def initialize(app)
    @app = app
  end

  def call(env)
    status, headers, body = @app.call(env)
    Rails.logger.info("request_id=#{headers["X-Request-Id"]}")
    [status, headers, body]
  end
end
```

**Na entrevista:**
> "Middleware é Rack. Roda em todo request, antes da rota. Eu não coloco regra de Order aí."

---

## config/application.rb

**O que é:**
A classe da app. Herda `Rails::Application`. Defaults e o que o boot carrega para todo environment.

**Como funciona:**
```ruby
# config/application.rb
require_relative "boot"
require "rails/all"
Bundler.require(*Rails.groups)

module Loja
  class Application < Rails::Application
    config.load_defaults 7.1
    config.autoload_lib(ignore: %w[assets tasks])
    config.time_zone = "America/Sao_Paulo"
  end
end
```

`load_defaults 7.1` trava os defaults da versão. Subir o número é decisão. `autoload_lib` no 7.1+ põe `lib/` no Zeitwerk e ignora o que não é constante. `rails/all` puxa os railties; API magra pode exigir um a um.

**Na entrevista:**
> "application.rb é a classe da app. load_defaults 7.1. Environment depois sobrescreve. lib/ só entra no autoload se eu chamar autoload_lib."

---

## Environment e initializers

**O que é:**
Environment especializa a app (`development`, `test`, `production`). Initializer roda uma vez no `initialize!`, em ordem alfabética.

**Como funciona:**
```ruby
# config/environment.rb
require_relative "application"
Rails.application.initialize!

# config/environments/development.rb
Rails.application.configure do
  config.enable_reloading = true   # produção: false
  config.eager_load = false        # produção: true
end
```

Rails 7.1 trocou o mental model: `enable_reloading` no lugar de `cache_classes` invertido. Dev recarrega. Produção eager loada.

Initializer **não** é lugar de `User.find`. Constante de `app/` recarrega em dev. O initializer não. Sobrou cópia morta: *"A copy of User has been removed from the module tree but is still active!"*

Precisa de model no boot? `config.to_prepare`. Não um `User` solto no arquivo.

**Quando usar:**
Environment: log, cache, eager load, host. Initializer: gem, inflector. Não: seed, query, “esquenta cache de User”.

**Na entrevista:**
> "Environment sobrescreve application.rb. Initializer roda uma vez. Em dev eu não referencio model de app/ lá — recarrega e o initializer não."

---

## Zeitwerk no boot

**O que é:**
O autoload do Rails. No boot ele só configura os loaders. Em development não carrega `app/models/user.rb` até alguém falar `User`.

**Como funciona:**
```ruby
Rails.autoloaders.main   # app/, recarrega
Rails.autoloaders.once   # carga única
```

Dev: lazy + reload. Produção: `eager_load = true`, o request não paga constante faltando. Loader nasce no `initialize!`. Inflector e pasta collapsed ficam no capítulo de Zeitwerk.

**Na entrevista:**
> "Zeitwerk configura no boot. Dev é lazy e recarrega. Produção eager loada. Eu não dou require em app/."

---

## Rails.application

**O que é:**
A instância singleton de `Loja::Application`. É a app Rack. Config, rotas, middleware, railties moram nela.

**Como funciona:**
```ruby
Rails.application.class           # Loja::Application
Rails.application.initialized?    # true depois do initialize!
Rails.application.config.time_zone
Rails.application.routes

status, headers, body = Rails.application.call(env)
```

`Rails` é module. `Rails.application` é o objeto. Console já passou do `initialize!`. Se `initialized?` é `false`, o script deu require em `application.rb` e esqueceu `environment.rb`.

**Na entrevista:**
> "Rails.application é a app Rack. Puma chama call(env). É aí que config, rotas e middleware se encontram."

---

## bin/rails s

**O que é:**
Sobe o processo. Não é mágica. É boot + Puma.

**Como funciona:**
```
bin/rails
  → config/boot.rb            # Bundler, Bootsnap
  → rails/commands            # "s" vira server
  → config/application.rb     # define Loja::Application
  → config/environment.rb     # Rails.application.initialize!
      → environments/*.rb
      → config/initializers/*
      → Zeitwerk nos autoload paths
      → eager_load se produção
      → monta a pilha de middleware
  → Puma lê config/puma.rb e faz bind
  → cada request: Rails.application.call(env)
```

`bin/rails s` e `bin/rails console` compartilham o mesmo `initialize!`. Depois: Puma espera socket, console espera você.

**Importante na entrevista:**
Boot lento em produção é eager load + initializer pesado + gem que conecta no require. Não é o router.

**Na entrevista:**
> "bin/rails s: boot.rb, application.rb, initialize!, Puma. O request só existe depois. Se o boot trava, eu olho initializer e eager load, não o controller."

---

## Recapitulando

- MVC é pasta e papel. Não é o desenho final da app.
- Fat model / skinny controller é ponto de partida. God object não.
- Request: Puma → middleware → router → controller → view.
- Router é o fim da pilha Rack, não o começo.
- `application.rb` define a classe. Environment sobrescreve. Initializer roda uma vez.
- Zeitwerk configura no boot. Dev lazy. Produção eager.
- `Rails.application` é a app Rack.
- `bin/rails s` inicializa e entrega ao Puma.

---

## Exercícios práticos

### Exercício 1: A ordem do request

**Enunciado:** No quadro o candidato escreveu `router → middleware → controller → view`. O que você corrige e por quê o cookie da session já existe no action?

<details>
<summary>Solução</summary>

A ordem real é Puma → middleware → router → controller → view.

O RouteSet é o último middleware. Cookies e session rodam **antes** da rota casar. Por isso `session[:user_id]` já está preenchido em `OrdersController#create`.

**Pontos-chave:**
- Middleware envolve, não sucede, o router
- Session não nasce no controller
- Quem inverte a seta não sabe que Rails é Rack
</details>

### Exercício 2: User com 800 linhas

**Enunciado:** `User` valida e-mail, cobra assinatura, monta relatório fiscal e decide permissão. O entrevistador pergunta se “fat model, skinny controller” ainda vale. O que você responde?

<details>
<summary>Solução</summary>

Vale como ponto de partida. Não vale como teto.

Invariante fica no model: e-mail, `subscription_cents` em Integer. Cobrança vira `RenewSubscription`. Relatório vira Query Object. Permissão vira Policy. Controller só chama e responde.

```ruby
def renew
  RenewSubscription.new(current_user).call
  redirect_to billing_path, notice: "Assinatura renovada"
end
```

**Pontos-chave:**
- Model dono de dado e invariante
- Caso de uso não é callback `after_save`
- Extração quando aparece a segunda responsabilidade
</details>

### Exercício 3: Initializer quebra em development

**Enunciado:** Este arquivo existe. Em produção o Puma sobe. Em development, depois do primeiro reload, explode com *removed from the module tree*. Por quê? Como você arruma?

```ruby
# config/initializers/default_role.rb
DEFAULT_ROLE = Role.find_by!(name: "user")
```

<details>
<summary>Solução</summary>

Initializer roda uma vez no `initialize!`. `Role` veio de `app/models` via Zeitwerk. Em development o reloader descarrega `Role`. `DEFAULT_ROLE` continua apontando para a classe velha. Produção não recarrega (`enable_reloading = false`), então passa.

```ruby
# config/initializers/default_role.rb
Rails.application.config.to_prepare { DefaultRole.reset }
```

Melhor: não buscar linha de banco no boot. Busque no uso.

**Pontos-chave:**
- Initializer ≠ request
- `app/` recarrega; initializer não
- `to_prepare` ou tire a query do boot
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
