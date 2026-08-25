# 5.2 Rotas

> **TL;DR**
> Rotas moram em `config/routes.rb`. `resources :articles` gera as 7 actions REST. `resource` singular não tem `:id` nem index. member age no registro; collection na lista. `namespace` muda URL e module; `scope` escolhe o que muda. `root` é a home. Helper: `articles_path`. `as:` troca o nome. `bin/rails routes` lista tudo.

## Conteúdo

- [config/routes.rb](#configroutesrb)
- [As 7 actions REST](#as-7-actions-rest)
- [resources](#resources)
- [resource singular](#resource-singular)
- [member e collection](#member-e-collection)
- [namespace vs scope](#namespace-vs-scope)
- [root](#root)
- [constraints](#constraints)
- [rails routes](#rails-routes)
- [Route helpers e as:](#route-helpers-e-as)
- [concern](#concern)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## config/routes.rb

**O que é:**
O mapa HTTP → action. Um arquivo, uma DSL. O Rails lê no boot.

**Como funciona:**
```ruby
# config/routes.rb
Rails.application.routes.draw do
  get "saude", to: "health#show"
  resources :articles
  root "home#index"
end
```

`get "saude", to: "health#show"` é verbo + path + `"controller#action"`. Primeira que casa ganha. Catch-all no topo engole o resto — `resources` e `root` vêm antes de `get "*path"`. Closure na rota só em spike. App de verdade: controller.

**Na entrevista:**
> "Rotas ficam em `config/routes.rb`. DSL no `draw`. Ordem importa: a primeira match ganha."

---

## As 7 actions REST

**O que é:**
O contrato que o entrevistador quer de cor. Sete actions. Oito linhas no `rails routes` porque `update` aceita PATCH e PUT.

| HTTP | Path | Action | Helper |
|---|---|---|---|
| GET | `/articles` | `index` | `articles_path` |
| GET | `/articles/new` | `new` | `new_article_path` |
| POST | `/articles` | `create` | `articles_path` |
| GET | `/articles/:id` | `show` | `article_path(id)` |
| GET | `/articles/:id/edit` | `edit` | `edit_article_path(id)` |
| PATCH/PUT | `/articles/:id` | `update` | `article_path(id)` |
| DELETE | `/articles/:id` | `destroy` | `article_path(id)` |

**Como funciona:**
`index` e `create` na collection. `show`, `update`, `destroy` no membro. `new` e `edit` são GET — formulário, não mutam. Form HTML manda PATCH via `_method`. PUT existe por compat. `resources` declara `new` antes de `show`: `/articles/new` não vira `id = "new"`.

**Importante na entrevista:**
Peça "as 7" → action + verbo + path. Peça o dump → 8 linhas, `update` duplicado.

**Na entrevista:**
> "Sete actions: index, new, create, show, edit, update, destroy. PATCH e PUT caem no update. Por isso o `rails routes` mostra oito linhas."

---

## resources

**O que é:**
Atalho. `resources :articles` gera as 7. Plural: tem collection e tem `:id`.

**Como funciona:**
```ruby
resources :articles
resources :articles, only: %i[index show]
resources :articles, except: %i[destroy]

resources :articles do
  resources :comments, only: %i[index create]
end
# /articles/:article_id/comments
```

`only` / `except` cortam o que a tela não usa. API sem formulário: cai `new` e `edit`. Nested: um nível. Dois vira inferno de helper.

**Quando usar:**
CRUD de coleção. Quase sempre plural.

**Na entrevista:**
> "`resources` gera as 7. Sem tela de new/edit, eu passo `only:` ou `except:`. Nested eu paro em um nível."

---

## resource singular

**O que é:**
Um recurso que não é lista. Sem index. Sem `:id` na URL. O registro é o da sessão, não o de id 42.

**Como funciona:**
```ruby
resource :profile
# GET    /profile       show
# GET    /profile/new   new
# POST   /profile       create
# GET    /profile/edit  edit
# PATCH  /profile       update
# DELETE /profile       destroy
```

Controller continua `ProfilesController` (plural). A URL que muda. Perfil do `current_user`: `resource :profile, only: %i[show update]` — não `resources :profiles`.

**Quando usar:**
Perfil, sessão, carrinho, conta. Um por request.

**Na entrevista:**
> "`resource` singular: sem index, sem `:id`. Profile do usuário logado é o exemplo clássico. O controller continua plural."

---

## member e collection

**O que é:**
Action extra que não é uma das 7. member precisa do `:id`. collection não.

**Como funciona:**
```ruby
resources :articles do
  member do
    get :preview          # GET /articles/:id/preview
    patch :publish        # PATCH /articles/:id/publish
  end
  collection do
    get :search           # GET /articles/search
  end
  # atalho: get :preview, on: :member
end
```

Helpers: `preview_article_path(article)` vs `search_articles_path`. Membro no singular, collection no plural.

**Quando usar:**
`publish` / `preview` no registro. `search` / `export` na lista. CRUD disfarçado não vira member: use `update`.

**Na entrevista:**
> "member entra `:id`. collection não. `preview_article_path` vs `search_articles_path`. Eu não crio member para o que é um `update`."

---

## namespace vs scope

**O que é:**
Os dois agrupam. `namespace` muda URL **e** module. `scope` você escolhe o que muda.

**Como funciona:**
```ruby
namespace :admin do
  resources :articles
end
# /admin/articles  Admin::ArticlesController  admin_articles_path

scope module: :admin do
  resources :articles
end
# /articles  Admin::ArticlesController  articles_path

scope path: :admin do
  resources :articles
end
# /admin/articles  ArticlesController  articles_path
```

`namespace :admin` é `scope path: :admin, module: :admin, as: :admin`. Helper e view (`app/views/admin/articles/`) também ganham `admin`.

**Quando usar:**
Painel `/admin` com `Admin::` → `namespace`. Module sem mudar URL → `scope module:`. URL `/admin` sem module → `scope path:`.

**Na entrevista:**
> "namespace muda URL e module. scope escolhe. `namespace :admin` vira `Admin::ArticlesController` e `/admin/articles`. Só o module: `scope module:`."

---

## root

**O que é:**
A home. `GET /`. Helper: `root_path` / `root_url`.

**Como funciona:**
```ruby
root "home#index"
# igual a: root to: "home#index"
```

Sem `root`, `GET /` é 404. Redirect pós-login quase sempre cai em `root_path`.

**Na entrevista:**
> "`root` é GET /. Eu uso `root \"home#index\"`. O helper é `root_path`."

---

## constraints

**O que é:**
Filtro na hora de casar a rota. Segmento, formato, subdomain, lambda no request.

**Como funciona:**
```ruby
get "articles/:id", to: "articles#show", constraints: { id: /\d+/ }
# /articles/42 casa; /articles/foo não

constraints subdomain: "api" do
  resources :articles
end

constraints ->(req) { req.remote_ip == "127.0.0.1" } do
  mount Sidekiq::Web, at: "/sidekiq"
end
```

Não casa → 404, não 403. Papel de usuário é Policy, não rota.

**Quando usar:**
`id` numérico, subdomain de API, painel em localhost. Não use para autorização.

**Na entrevista:**
> "Constraint decide se a rota casa. Falhou, 404 — não é 403. Autorização não mora em `routes.rb`."

---

## rails routes

**O que é:**
O dump: verb, path, helper, `controller#action`.

**Como funciona:**
```bash
bin/rails routes
bin/rails routes -g article     # grep no helper/path/controller
bin/rails routes -c articles    # só ArticlesController
bin/rails routes --expanded     # um bloco por rota
```

Rails 7.1+: `bin/rails routes`, não `rake routes`. Coluna do nome é o helper sem `_path`: `article` → `article_path`.

**Na entrevista:**
> "`bin/rails routes` lista. `-g` filtra. A coluna do nome é o helper sem `_path`."

---

## Route helpers e as:

**O que é:**
Método gerado para não hardcodar URL. `_path` é relativo. `_url` é absoluto — mailer, outro host.

**Como funciona:**
```ruby
articles_path              # /articles
article_path(article)      # /articles/42 — usa to_param
edit_article_path(article)
articles_url               # http://loja.test/articles

get "entrar", to: "sessions#new", as: :login
# login_path → /entrar  (path não muda)

resources :articles, as: :posts
# posts_path — URL ainda /articles
```

`as:` troca o nome do helper. Colisão de nome: o boot reclama. Não renomeie à toa — o time procura `article_path`.

**Quando usar:**
View, redirect, mailer. `as:` em URL legado ou colisão. `_url` fora do request atual.

**Na entrevista:**
> "`_path` relativo, `_url` absoluto. Mailer usa `_url`. `as:` só o nome do helper, não o path."

---

## concern

**O que é:**
Bloco de rotas reutilizável. DRY no `routes.rb`, não no controller.

**Como funciona:**
```ruby
concern :commentable do
  resources :comments, only: %i[index create]
end

resources :articles, concerns: :commentable
resources :photos, concerns: :commentable
```

Dois recursos? Escreve duas vezes. Meia dúzia de commentable? concern. Não é o `ActiveSupport::Concern` do model.

**Na entrevista:**
> "concern de rota é bloco reutilizável. Não é o concern do model. Eu uso se o aninhamento se repete de verdade."

---

## Recapitulando

- `config/routes.rb`, DSL no `draw`. Primeira match ganha.
- 7 actions REST. `update` = PATCH e PUT → 8 linhas no dump.
- `resources` plural com `:id`. `resource` singular sem index e sem `:id`.
- member: `:id`. collection: lista. Helper singular vs plural.
- `namespace` = path + module + helper. `scope` escolhe.
- `root` é `GET /`. `root_path`.
- Constraint casa rota (404). Não autoriza (403).
- `bin/rails routes`. `_path` vs `_url`. `as:` renomeia helper.
- concern de rota ≠ concern de model.

---

## Exercícios práticos

### Exercício 1: As 7 actions

**Enunciado:** O entrevistador pede: "`resources :orders` — fale as 7. Verbo, path, action, helper." Escreva a tabela. Quantas linhas o `bin/rails routes -g order` mostra para essas actions?

<details>
<summary>Solução</summary>

| HTTP | Path | Action | Helper |
|---|---|---|---|
| GET | `/orders` | `index` | `orders_path` |
| GET | `/orders/new` | `new` | `new_order_path` |
| POST | `/orders` | `create` | `orders_path` |
| GET | `/orders/:id` | `show` | `order_path(id)` |
| GET | `/orders/:id/edit` | `edit` | `edit_order_path(id)` |
| PATCH/PUT | `/orders/:id` | `update` | `order_path(id)` |
| DELETE | `/orders/:id` | `destroy` | `order_path(id)` |

Oito linhas no dump: `update` aparece duas vezes (PATCH e PUT). Sete actions.

**Pontos-chave:**
- Helper da collection no plural; do membro no singular
- `new` e `edit` são GET
- Não fale "oito actions"
</details>

### Exercício 2: namespace ou scope?

**Enunciado:** Você precisa de `Admin::OrdersController` em `/admin/orders`, helper `admin_orders_path`. Qual bloco? E se a URL tiver que continuar `/orders`?

<details>
<summary>Solução</summary>

```ruby
namespace :admin do
  resources :orders
end
# /admin/orders + Admin:: + admin_orders_path

scope module: :admin do
  resources :orders
end
# /orders + Admin:: + orders_path
```

`scope path: :admin` sozinho cai em `OrdersController`, sem `Admin::`.

**Pontos-chave:**
- `namespace` = path + module + `as`
- URL sem prefixo, classe no module → `scope module:`
- path sem module → `scope path:`
</details>

### Exercício 3: member, collection e as:

**Enunciado:** Em `OrdersController` existem `pay` (POST num pedido) e `export` (GET da lista). A tela de login legado é `GET /entrar` → `SessionsController#new`, mas o time quer `login_path`. Escreva as rotas.

<details>
<summary>Solução</summary>

```ruby
resources :orders do
  post :pay, on: :member        # POST /orders/:id/pay
  get  :export, on: :collection # GET /orders/export
end

get "entrar", to: "sessions#new", as: :login  # login_path → /entrar
```

`pay` no collection seria `/orders/pay`, sem pedido. `export` no member exigiria `:id` à toa.

**Pontos-chave:**
- member = registro; collection = lista
- `as:` muda o helper, não o path
- `_path` na view; `_url` no mailer
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
