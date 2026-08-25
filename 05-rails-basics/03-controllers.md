# 5.3 Controllers

> **TL;DR**
> O Rails instancia o controller e chama a action. Você responde com `render` (esta request) ou `redirect_to` (a próxima). Sem os dois, render implícito do template. `ApplicationController` é o pai: login, `before_action`, `rescue_from`. `@order` chega na view via `view_assigns`; variável local não chega. Filter que dá `render`/`redirect_to` para a action. Controller gordo é smell: orquestra o HTTP, não implementa o caso de uso. `permit`/`require` ficam no 5.5.

## Conteúdo

- [ApplicationController](#applicationcontroller)
- [Actions](#actions)
- [render vs redirect_to](#render-vs-redirect_to)
- [before_action e filters](#before_action-e-filters)
- [rescue_from](#rescue_from)
- [Instance variables na view](#instance-variables-na-view)
- [Controller gordo](#controller-gordo)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## ApplicationController

**O que é:**
Pai de todo controller da app. `UsersController < ApplicationController < ActionController::Base`. Auth, locale, `rescue_from` genérico e `before_action` que vale para tudo moram aqui. Não é o lugar do `create` do pedido.

**Como funciona:**
```ruby
# app/controllers/application_controller.rb
class ApplicationController < ActionController::Base
  before_action :require_login

  private

  def current_user
    @current_user ||= User.find_by(id: session[:user_id])
  end

  def require_login
    redirect_to login_path, alert: "Faça login" unless current_user
  end
end
```

API-only herda de `ActionController::API`: sem CSRF de cookie, sem helper de view, stack menor. HTML full-stack fica em `Base`.

**Quando usar:**
Comportamento de **todo** request autenticado. Exceção de uma resource? `skip_before_action` no filho. Exceção de um caso de uso? Não sobe para o pai.

**Na entrevista:**
> "ApplicationController é o pai. Login, locale e rescue_from genérico ficam ali. A action do pedido não."

---

## Actions

**O que é:**
Método **público** do controller. A rota aponta para `orders#create`; o Rails instancia `OrdersController` e manda `create`. Método `private` não é action — mesmo que alguém invente a rota.

**Como funciona:**
```ruby
class OrdersController < ApplicationController
  def index
    @orders = current_user.orders.order(created_at: :desc)
  end

  def show
    @order = current_user.orders.find(params[:id])
    # sem render — Rails procura show.html.erb
  end

  def create
    @order = current_user.orders.build(order_params) # order_params: 5.5
    if @order.save
      redirect_to @order, notice: "Pedido criado", status: :see_other
    else
      render :new, status: :unprocessable_entity
    end
  end
end
```

`order_params` é 5.5 — params cru não vai no model. REST de scaffold (`index show new create edit update destroy`) não é lei. `approve` / `export` pedem rota membro; isso é 5.2.

**Quando usar:**
Um verbo HTTP, um resultado. `create` cria. Não misture export de CSV e três e-mails no mesmo método.

**Na entrevista:**
> "Action é método público. O Rails instancia, chama, você devolve resposta. Se ninguém renderiza nem redireciona, ele procura o template do nome da action."

---

## render vs redirect_to

**O que é:**
`render` fecha **esta** request: corpo agora, URL não muda, o verbo continua o que chegou. `redirect_to` manda o browser **começar outra**: em geral GET na URL nova.

**Como funciona:**
```ruby
# Falhou validação — fica no POST /orders, reexibe o form com erros
render :new, status: :unprocessable_entity

# Deu certo — 303, browser faz GET /orders/42
redirect_to @order, notice: "Pedido criado", status: :see_other

# Implícito: equivalente a render :show
def show
  @order = Order.find(params[:id])
end
```

Dois `render`, ou `render` + `redirect_to` na mesma action: `AbstractController::DoubleRenderError`. O `if/else` resolve. `return` depois do `redirect_to` também — mas o `if/else` lê melhor.

**Quando usar:**

| Situação | Resposta |
|---|---|
| GET que só exibe | render implícito |
| POST/PATCH/DELETE ok | `redirect_to`, `status: :see_other` |
| Validação falhou | `render :new` / `:edit`, `status: :unprocessable_entity` |
| Voltar de onde veio | `redirect_back_or_to(fallback)` |

`see_other` (303) e `unprocessable_entity` (422) não são frescura. Turbo no Rails 7.1+ espera isso: 302 depois de POST reenvia POST; 200 no form inválido não troca o frame. URL externa no `redirect_to` o Rails 7 recusa (`allow_other_host: false`).

**Na entrevista:**
> "render é esta request. redirect_to é a próxima. Depois de create com sucesso eu redireciono — Post/Redirect/Get. Com erro eu renderizo o form de novo, 422. Dois renders na mesma action estouram DoubleRenderError."

---

## before_action e filters

**O que é:**
Gancho em volta da action. `before_action`, `after_action`, `around_action`. A documentação antiga dizia *filter*; o método `before_filter` saiu. Você fala `before_action`.

**Como funciona:**
```ruby
class OrdersController < ApplicationController
  before_action :set_order, only: %i[show edit update destroy]
  before_action :require_owner, only: %i[edit update destroy]
  skip_before_action :require_login, only: :index

  private

  def set_order
    @order = current_user.orders.find(params[:id])
  end

  def require_owner
    return if @order.user_id == current_user.id

    redirect_to orders_path, alert: "Sem permissão"
  end
end
```

`render` ou `redirect_to` no `before_action` seta `performed?` e **para a cadeia**: action e filters seguintes não rodam. `redirect_to x and return` é truque da **action** quando ainda tem código embaixo. No filter, o Rails já para sozinho.

Ordem: pai primeiro, depois o filho. `only` / `except` / `if` / `unless` restringem. `prepend_before_action` fura a fila.

`after_action` olha o que saiu (log, header). `around_action` envolve com `yield` — locale, timezone. Transação de banco no controller é smell.

**Quando usar:**
Lookup repetido (`set_order`), gate de authz, locale. Três controllers com o mesmo `before_action`? Concern (5.6), não copy-paste eterno no pai “porque sim”.

**Na entrevista:**
> "before_action roda antes. Se ele redireciona, a action não roda. only e except evitam o set_record no index. before_filter morreu no Rails 5 — eu não falo esse nome."

---

## rescue_from

**O que é:**
Gancho do Action Controller: exceção X vira resposta Y. Teaser — a mecânica de `raise`/`rescue` é 3.3. Aqui só o encaixe no request.

**Como funciona:**
```ruby
class ApplicationController < ActionController::Base
  rescue_from ActiveRecord::RecordNotFound, with: :not_found

  private

  def not_found
    redirect_to root_path, alert: "Não encontrado"
  end
end
```

O filho herda. Mais específico no controller da resource; genérico no pai. Block também vale. Não substitui `rescue` dentro do Service Object.

**Quando usar:**
Erro que atravessa vários controllers: `RecordNotFound`, não autorizado. Fluxo feliz/triste do `create` não é exceção — é `if @order.save`.

**Na entrevista:**
> "rescue_from é do controller. RecordNotFound e policy, sim. StandardError ali vira 200 mentiroso. exceptions_app e página de 500 não são este capítulo."

---

## Instance variables na view

**O que é:**
Você faz `@order = ...` na action. O template lê `@order`. Não é o mesmo objeto: o Rails **copia** as instance variables do controller para o view context (`view_assigns`). Local da action não atravessa.

**Como funciona:**
```ruby
def show
  @order = Order.find(params[:id])
  total = @order.amount_cents # local — a view não vê
end
```

```erb
<%# show.html.erb %>
<%= @order.id %>
<%= total %>
<%# total: NameError. Não veio no view_assigns. %>
```

`@` no controller não é API pública da classe. É o canal que o Action View combinou. Ivars internas (`@_lookup_context` e cia.) não copiam.

**Quando usar:**
Um ou dois objetos que o template precisa. `@order` e, no máximo, uma coleção ao lado. Cinco `@` no `show` é a view pedindo Presenter — ou o controller fazendo query de mais.

**Na entrevista:**
> "@order chega na view porque o Rails copia ivar no view_assigns. Não é mágica de ERB e não é o mesmo self. user sem arroba some. Se eu estou passando oito variáveis, o controller está gordo."

---

## Controller gordo

**O que é:**
Action que cria, calcula, manda e-mail, baixa estoque, monta CSV e ainda escolhe o layout. O controller virou o caso de uso. Isso é smell, não “Rails way”.

**Como funciona:**
```ruby
# RUIM — regra, I/O e HTTP no mesmo método
def create
  @order = Order.new(params[:order])
  @order.total_cents = @order.items.sum { |i| i.price_cents * i.qty }
  @order.status = "pago" if @order.total_cents < 10_000
  @order.save!
  UserMailer.confirm(@order).deliver_now
  Stock.decrement!(@order)
  redirect_to @order
end

# BOM — HTTP aqui, regra fora
def create
  @order = PlaceOrder.new(user: current_user, attrs: order_params).call
  redirect_to @order, notice: "Pedido criado", status: :see_other
rescue ActiveRecord::RecordInvalid => error
  @order = error.record
  render :new, status: :unprocessable_entity
end
```

O controller **orquestra**: autentica, autoriza, chama um objeto, decide `render` ou `redirect_to`. “Skinny controller, fat model” foi o slogan velho. Model gordo também fede. Service Object / Form Object são seção 17. Na entrevista júnior: *não fica no controller*.

**Quando usar:**
Sempre que a action passa de “achar registro + uma chamada + responder”. `index` com `current_user.orders` está magro. `create` de 80 linhas não está.

**Na entrevista:**
> "Controller gordo é smell. Ele escolhe o status HTTP. A regra de desconto não mora nele. Eu extraio. Strong params não é a extração — é só o filtro da borda, e isso é 5.5."

---

## Recapitulando

- `ApplicationController` é o pai. Auth e `rescue_from` genérico ficam ali.
- Action = método público. Sem `render`/`redirect_to`, template do nome da action.
- `render` = esta request. `redirect_to` = a próxima. Sucesso: 303. Form inválido: 422.
- Dois renders na mesma action: `DoubleRenderError`.
- `before_action` com `only`/`except`. Redirect no filter para a action.
- `before_filter` não existe mais.
- `@ivar` vai para a view por `view_assigns`. Local não vai.
- Controller orquestra. Caso de uso gordo sai daqui.
- `permit`/`require` não são deste capítulo.

---

## Exercícios práticos

### Exercício 1: render ou redirect_to?

**Enunciado:** `POST /orders` cai em `create`. O pedido salva. O pedido falha validação. Para cada caso: o que você chama, qual status, e o que o Turbo faz se você errar o status.

<details>
<summary>Solução</summary>

Salvou: `redirect_to @order, status: :see_other` (303). O browser/Turbo faz GET no `show`. 302 depois de POST reenvia POST — o usuário atualiza a página e duplica pedido.

Falhou: `render :new, status: :unprocessable_entity` (422). Mesma request, `@order` com errors, form reaparece. 200 faz o Turbo tratar como sucesso e não substituir o frame.

**Pontos-chave:**
- Post/Redirect/Get no sucesso
- 303 e 422 são contrato do Rails 7.1+ com Turbo
- `render` no sucesso deixa a URL em `/orders` com POST — F5 vira segundo create
</details>

### Exercício 2: DoubleRenderError

**Enunciado:** Este `update` explode com `DoubleRenderError`. O `set_order` que renderiza 404 também é culpado? Reescreva o `update`.

```ruby
class OrdersController < ApplicationController
  before_action :set_order

  def update
    @order.update!(order_params)
    redirect_to @order
    render :edit
  end

  private

  def set_order
    @order = Order.find_by(id: params[:id])
    render :not_found unless @order
  end
end
```

<details>
<summary>Solução</summary>

O culpado é o `update`: `redirect_to` **e** `render` na mesma action. Sempre explode quando o record existe.

O `set_order` **não** é cúmplice. `render` no `before_action` seta `performed?` e a action não roda. `and return` aqui é mito de quem viu isso dentro da action.

```ruby
def update
  if @order.update(order_params)
    redirect_to @order, status: :see_other
  else
    render :edit, status: :unprocessable_entity
  end
end
```

404 mais limpo: `Order.find` + `rescue_from ActiveRecord::RecordNotFound` no pai.

**Pontos-chave:**
- Um caminho HTTP por action
- Filter que já respondeu não chama a action
- `and return` é da action, não do `before_action`
</details>

### Exercício 3: O que sai deste create?

**Enunciado:** Liste o que **fica** no controller e o que **sai**. Uma frase por item. Não escreva a classe extra — só o destino (model, mailer/job, Service Object).

```ruby
def create
  @order = Order.new(params[:order])
  @order.total_cents = @order.items.sum { |i| i.price_cents * i.qty }
  @order.status = "pago" if @order.total_cents < 10_000
  if @order.save
    UserMailer.confirm(@order).deliver_now
    redirect_to @order
  else
    render :new
  end
end
```

<details>
<summary>Solução</summary>

Fica:
- Chamar o objeto que cria o pedido
- `redirect_to` no sucesso, `render :new` (422) no erro
- Autenticação/autorização se ainda não estiver no filter

Sai:
- `params[:order]` cru — filtro de params (5.5), nunca no `new` direto
- Soma de item e regra dos R$ 100 — model ou Service Object (`PlaceOrder`)
- `UserMailer.confirm` síncrono — o service enfileira um job; o controller não conhece o mailer
- Status 302 implícito e `render` 200 — viram 303 e 422

**Pontos-chave:**
- Controller escolhe o HTTP
- Regra de preço não é action
- Strong params não resolve o smell — só a borda
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
