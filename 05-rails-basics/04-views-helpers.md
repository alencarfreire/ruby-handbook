# 5.4 Views e helpers

> **TL;DR**
> ERB é HTML com Ruby. Layout envolve a página. Partial é pedaço reutilizável. `render` escolhe o que entra. Helper é método da view — `ApplicationHelper` é global; `helper :foo` entra no controller. `content_for` joga bloco no layout. ERB escapa sozinho; `html_safe` é o buraco de XSS. Lógica de negócio sai da view — Presenter vem em 16.5.

## Conteúdo

- [ERB](#erb)
- [Layouts](#layouts)
- [Partials](#partials)
- [render](#render)
- [Helpers](#helpers)
- [content_for](#content_for)
- [html_safe e sanitize](#html_safe-e-sanitize)
- [Quando a lógica sai da view](#quando-a-lógica-sai-da-view)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## ERB

**O que é:**
Template do Rails. `.html.erb` em `app/views`. `UsersController#show` cai em `app/views/users/show.html.erb`.

**Como funciona:**
```erb
<%# app/views/users/show.html.erb %>
<h1><%= @user.name %></h1>
<% if @user.admin? %>
  <span>Admin</span>
<% end %>
```

| Tag | Faz |
|---|---|
| `<%= %>` | avalia e **imprime** (escapado) |
| `<% %>` | avalia e **não** imprime |
| `<%# %>` | comentário — some do HTML |

`@user` veio do controller. Instância do action vaza para a view. Slim e Haml existem; o default do Rails 7.1+ é ERB.

**Na entrevista:**
> "`<%= %>` imprime escapado. `<% %>` só roda. A view do `show` é `users/show.html.erb`. Instância do controller chega com `@`."

---

## Layouts

**O que é:**
Casca da página. Header, footer, `<head>`. A view do action entra no `yield`.

**Como funciona:**
```erb
<%# app/views/layouts/application.html.erb %>
<title><%= content_for(:title) || "Loja" %></title>
<%= csrf_meta_tags %>
<body>
  <%= render "shared/flash" %>
  <%= yield %>
</body>
```

`yield` sem nome é o corpo. `csrf_meta_tags` fica no layout — CSRF é 9.2.

```ruby
class Admin::OrdersController < ApplicationController
  layout "admin"
end

def show
  render layout: false   # só o HTML da view
end
```

Default: `layouts/application`. `layout false` quando o Turbo pede um fragmento. Não copie header em cada view.

**Na entrevista:**
> "Layout é a casca. `yield` é o miolo. `layout 'admin'` troca o arquivo. `layout false` devolve só a view."

---

## Partials

**O que é:**
Pedaço. Arquivo com `_` na frente: `_form.html.erb`. Você não abre no browser — outra view chama.

**Como funciona:**
```erb
<%# app/views/users/_form.html.erb %>
<%= form_with model: user do |f| %>
  <%= f.text_field :name %>
  <%= f.submit "Salvar" %>
<% end %>

<%# new.html.erb — sem underscore no render %>
<%= render "form", user: @user %>

<%= render "shared/flash" %>
<%# app/views/shared/_flash.html.erb %>
```

O `_` é convenção de arquivo. No `render` você **não** põe o underscore. HTML colado em dois arquivos → partial.

**Na entrevista:**
> "Partial começa com `_`. `render 'form'` busca `_form.html.erb`. `render @orders` usa `_order` e a local `order`."

---

## render

**O que é:**
O método que escolhe o template. No controller e na view. Não é `redirect_to`.

**Como funciona:**
```ruby
# no controller
render :show
render :new, status: :unprocessable_entity
render layout: "admin"
render layout: false
```

```erb
<%# na view %>
<%= render "form", user: @user %>
<%= render @orders %>
<%# _order.html.erb — local `order` em cada volta %>
```

`render "form", user: @user` passa local. Equivale a `locals: { user: @user }`.
`render @user` → `users/_user.html.erb` com local `user`.

```erb
<%# query na view — nunca %>
<%= render User.where(active: true) %>
```

A lista chega pronta do controller. `redirect_to` muda a URL; `render` não.

**Na entrevista:**
> "`render` escolhe o template nesta request. `redirect_to` manda o browser ir em outra. Collection usa o nome do model. Query não mora na view."

---

## Helpers

**O que é:**
Método da view. Module em `app/helpers`. Formata, monta tag, esconde `if` de CSS. Não é Service Object.

**Como funciona:**
```ruby
# app/helpers/application_helper.rb
module ApplicationHelper
  def reais(centavos)
    number_to_currency(centavos / 100.0, unit: "R$", separator: ",", delimiter: ".")
  end
end
```

```erb
<%= reais(@order.total_cents) %>
<%# R$ 10,20 %>
```

```ruby
class OrdersController < ApplicationController
  helper :invoices           # inclui InvoicesHelper aqui
  helper_method :current_cart  # método do controller vira helper
end
```

Pegadinha: `config.action_controller.include_all_helpers` **default é true**. `UsersHelper` já aparece em `OrdersController`. O mito “helper do resource só vale no resource” é falso até você desligar isso.

```ruby
# config/application.rb
config.action_controller.include_all_helpers = false
```

Com `false`: `ApplicationHelper` + o helper do controller. O resto entra com `helper :foo`.

`helper_method` não é module. É método do controller (`current_user`) que a view chama.

Helpers de framework: `link_to`, `form_with`, `number_to_currency`. Formatação e HTML pequeno. Não busque no banco.

**Na entrevista:**
> "ApplicationHelper é global. `helper :foo` inclui FooHelper naquele controller. Por default o Rails inclui todos os helpers. `helper_method` expõe método do controller para a view."

---

## content_for

**O que é:**
Você captura um bloco na view e o layout despeja em outro lugar. Título, extra no `<head>`, sidebar.

**Como funciona:**
```erb
<%# app/views/orders/show.html.erb %>
<% content_for :title, "Pedido ##{@order.id}" %>
<% content_for :head do %>
  <meta name="robots" content="noindex">
<% end %>
```

```erb
<%# layout %>
<title><%= content_for(:title) || "Loja" %></title>
<%= yield :head %>
<%= yield %>
```

`yield :title` e `content_for(:title)` no layout leem a mesma coisa.

`content_for` **concatena**. `provide` **grava uma**. Título: `provide`. Extra no head: `content_for` junta tags. Sem isso você empurra `@page_title` no controller só para o `<title>`.

**Na entrevista:**
> "`content_for` captura na view, o layout dá `yield :nome`. Concatena. `provide` não concatena — eu uso em título."

---

## html_safe e sanitize

**O que é:**
ERB escapa `<%= %>` sozinho. `<` vira `&lt;`. XSS não passa… até alguém marcar a string como segura.

**Como funciona:**
```erb
<% name = "<script>alert(1)</script>" %>
<%= name %>              <%# escapado — seguro %>
<%= name.html_safe %>    <%# o script roda — XSS %>
<%= raw(name) %>         <%# igual html_safe %>
<%= sanitize(name) %>    <%# tags perigosas saem %>
```

`html_safe` **não limpa**. Só mente para o Rails: “isso já é HTML bom”. `raw` é o mesmo gesto. `sanitize` limpa — whitelist de tags.

```ruby
def order_badge(order)
  tag.span(order.status, class: "badge")  # tag.* já vem html_safe
end

# RUIM — interpolou e desligou o escape
"<span>#{order.status}</span>".html_safe
```

Teaser. Ataque, cookie, `javascript:` em href — [9.1 XSS](/09-security/01-xss). `sanitize` em HTML de usuário. `html_safe` quase nunca na mão. Prefira `tag.*`.

**Na entrevista:**
> "ERB escapa. `html_safe` não sanitiza — só desliga o escape. Input de usuário com `html_safe` é XSS. Eu uso `sanitize` ou helper de tag. Detalhe de ataque é 9.1."

---

## Quando a lógica sai da view

**O que é:**
A view monta HTML. Não cobra, não autoriza, não dispara query. Se o ERB pergunta demais, o código está no arquivo errado.

**Como funciona:**
```erb
<%# RUIM — regra + query %>
<% if @order.status == "paid" && @order.user.plan == "pro" %>
  <span>Nota fiscal</span>
<% end %>
<% User.where(active: true).each do |user| %>
  <li><%= user.name %></li>
<% end %>

<%# BOM %>
<%= invoice_badge(@order) %>
<% @users.each do |user| %>
  <li><%= user.name %></li>
<% end %>
```

| O que a view quer | Para onde vai |
|---|---|
| Formatar dinheiro, data, badge | helper |
| Query, persistir, e-mail | controller / model / job |
| Autorizar | Policy (17.4) |
| Objeto só de apresentação | Presenter (16.5) |

Helper demais, com estado e dez métodos no mesmo `@order`, deixa de ser helper. Vira Presenter. Não monte isso aqui — só reconheça o cheiro.

**Na entrevista:**
> "View não faz query e não decide regra de negócio. Formatação vai para helper. Quando o helper vira objeto com estado, é Presenter — 16.5."

---

## Recapitulando

- ERB: `<%= %>` imprime escapado; `<% %>` só executa.
- Layout é casca. `yield` é o miolo. `layout "admin"` / `layout false`.
- Partial: arquivo `_foo`. `render "foo"` — sem underscore. `render @orders` usa `_order` e a local `order`.
- `render` não é `redirect_to`.
- `ApplicationHelper` é global. `helper :foo` inclui no controller. Default: **todos** os helpers entram. `helper_method` expõe método do controller.
- `content_for` captura; o layout dá `yield :nome`. `provide` não concatena.
- `html_safe` / `raw` desligam escape. Não limpam. XSS → 9.1.
- Lógica de negócio sai da view. Presenter é 16.5.

---

## Exercícios práticos

### Exercício 1: Por que isso é XSS?

**Enunciado:** O que o browser executa em cada linha? O usuário mandou `name = "<script>alert(1)</script>"`.

```erb
<%= name %>
<%= name.html_safe %>
<%= sanitize(name) %>
```

<details>
<summary>Solução</summary>

1. `<%= name %>` — texto escapado. O script **não** roda.
2. `<%= name.html_safe %>` — o Rails confia. O script **roda**. XSS.
3. `<%= sanitize(name) %>` — tag `script` sai. Não executa.

`html_safe` não sanitiza. Só marca a string. `raw` é o mesmo buraco.

**Pontos-chave:**
- Escape default do ERB é a defesa
- `html_safe` é opt-out
- Detalhe de ataque: [9.1 XSS](/09-security/01-xss)
</details>

### Exercício 2: O que `render @orders` busca?

**Enunciado:** Controller fez `@orders = Order.all`. A view tem `<%= render @orders %>`. Qual arquivo? Qual local existe dentro dele? Como passar outro nome?

<details>
<summary>Solução</summary>

Arquivo: `app/views/orders/_order.html.erb`. Local: `order` (model no singular). Não é `@order`.

```erb
<%# _order.html.erb %>
<td><%= order.id %></td>
<td><%= reais(order.total_cents) %></td>
```

Outro nome:

```erb
<%= render partial: "order", collection: @orders, as: :pedido %>
<%# local `pedido` %>
```

**Pontos-chave:**
- Collection usa o partial do model
- Local, não instância
- `as:` troca o nome
</details>

### Exercício 3: ApplicationHelper vs `helper :foo`

**Enunciado:** Você criou `InvoicesHelper#invoice_number`. Em `OrdersController#show` a view chama `invoice_number(@order)`. Funciona? E com `include_all_helpers = false`? Como esse `if` sai da view sem virar Presenter ainda?

```erb
<% if @order.status == "paid" && @order.total_cents > 1_000 && @order.user.pro? %>
  <%= link_to "Nota", invoice_path(@order) %>
<% end %>
```

<details>
<summary>Solução</summary>

Default (`include_all_helpers = true`): funciona. Todos os helpers entram em todas as views.

Com `false`: a view de `Orders` só tem `ApplicationHelper` + `OrdersHelper`. Quebra. Você move o método ou:

```ruby
class OrdersController < ApplicationController
  helper :invoices
end
```

O `if` longo é apresentação. Helper, não query:

```ruby
# app/helpers/orders_helper.rb
module OrdersHelper
  def invoice_link(order)
    return unless order.invoiceable?

    link_to "Nota", invoice_path(order)
  end
end
```

`order.invoiceable?` no model (regra). O helper só decide o HTML. Dez métodos e `OrderPresenter.new(order)` — isso é 16.5, não agora.

**Pontos-chave:**
- Default inclui todos os helpers — pegadinha de entrevista
- `helper :foo` importa o module no controller
- Regra no model; HTML no helper; Presenter depois
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
