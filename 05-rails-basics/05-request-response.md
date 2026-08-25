# 5.5 Request, response e strong params

> **TL;DR**
> O controller não lê o HTTP cru. Você pega `request`, monta `response`. `params` junta rota, query e body — chave string, acesso indiferente. Não passa `params` no model: mass assignment. `require` exige a raiz; `permit` lista o que entra. Nested precisa de Hash/Array no `permit`. Status com símbolo (`:created`). `head` é resposta sem body. Cookie e session: teaser; o resto é auth.

## Conteúdo

- [Request e response](#request-e-response)
- [params](#params)
- [Mass assignment](#mass-assignment)
- [require e permit](#require-e-permit)
- [Nested permit](#nested-permit)
- [Status e head](#status-e-head)
- [Cookies e session](#cookies-e-session)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Request e response

**O que é:**
Dois objetos do ciclo. `request` é o que chegou (método, path, headers, IP, format). `response` é o que sai (status, headers, body). O controller fala com eles. Você quase nunca instancia na mão.

**Como funciona:**
```ruby
class UsersController < ApplicationController
  def show
    request.get?                 # true
    request.path                 # "/users/42"
    request.fullpath             # "/users/42?tab=perfil"
    request.format               # Mime[:html] ou Mime[:json]
    request.headers["Authorization"]
    request.remote_ip
    request.user_agent

    response.status = 200
    response.headers["X-Request-Id"]
  end
end
```

`request.method` devolve string (`"GET"`). No `if`, use `get?` / `post?`. `request.body` é o IO cru — params já parseou. Não leia o body depois de `params`: o stream pode ter sido consumido.

**Quando usar:**
Header de auth, IP, `request.format.json?` no mesmo action. Não use `request` para achar o user — isso é session / current_user.

**Na entrevista:**
> "Request é o que entrou, response é o que sai. Params não é o request inteiro. Eu não parseio o body na mão se o Rails já montou params."

---

## params

**O que é:**
Hash do Action Controller. Junta três fontes: rota (`:id`), query string (`?tab=perfil`) e body (form ou JSON). Tipo real: `ActionController::Parameters`. Não é `Hash`.

**Como funciona:**
```ruby
# GET /users/42?tab=perfil
params[:id]     # "42"  — string, veio da rota
params[:tab]    # "perfil"
params["id"]    # "42"  — indifferent access

params[:id].class  # String, não Integer
User.find(params[:id])  # o find converte

# JSON POST /users  { "user": { "name": "João" } }
params[:user]          # ActionController::Parameters
params[:user][:name]   # "João"
params.to_h            # só o que já passou por permit
params.to_unsafe_h     # tudo — red flag em code review
```

Chave HTTP é string. No código você escreve symbol. O Rails esconde com indifferent access — o mesmo motivo do capítulo 1.1. Fora do controller, um Hash normal **não** faz isso: `{ "id" => "42" }[:id]` é `nil`.

Valor de form/query chega string. `"1"` não é `1`. `"true"` não é `true`. Checkbox desmarcado nem entra em params.

JSON sem raiz `:user`: o Rails faz wrap no formato JSON. Form HTML já manda `user[name]`. `require(:user)` quebra no Postman e funciona no browser? É wrap.

**Quando usar:**
Ler input do cliente. ID da rota, filtros de index, body do create. Não use params como objeto de negócio — extraia, permita, passe adiante.

**Na entrevista:**
> "Params mistura rota, query e body. Chave string, acesso com symbol. É Parameters, não Hash. `to_unsafe_h` eu não uso. E o valor vem string — `params[:id]` não é Integer."

---

## Mass assignment

**O que é:**
Mandar um Hash inteiro no `new` / `update` / `assign_attributes`. O model escreve todo atributo que existir, inclusive o que o cliente não deveria tocar: `admin`, `role`, `account_id`, `balance_centavos`.

**Como funciona:**
```ruby
# RUIM — o form manda o que quiser
User.create(params[:user])
# POST user[name]=João&user[admin]=true  → vira admin

# BOM — só o que você listou
User.create(user_params)
```

GitHub, 2012: mass assignment publicou chave pública. O Rails tirou `attr_accessible` do model e pôs a trava no controller. Em 7.1+ a defesa é `permit`. Validação (`validates :role`) **não** substitui: `"admin"` é valor válido.

**Quando usar:**
Nunca passe params cru no Active Record. Nem no `update`, nem no `assign_attributes`, nem “só neste endpoint interno”.

**Na entrevista:**
> "Mass assignment é o cliente escrever coluna que não é dele. Strong params é a lista branca no controller. Validação não resolve — `admin: true` é um valor válido."

---

## require e permit

**O que é:**
`require` exige a chave raiz e devolve o Parameters de dentro. `permit` lista os escalares que podem ir ao model. O resto some. Sem `permit`, o Active Record recusa o Parameters.

**Como funciona:**
```ruby
class UsersController < ApplicationController
  def create
    user = User.new(user_params)
    if user.save
      redirect_to user, status: :see_other
    else
      render :new, status: :unprocessable_entity
    end
  end

  private

  def user_params
    params.require(:user).permit(:name, :email, :phone)
  end
end
```

`require(:user)` sem `:user` → `ActionController::ParameterMissing` → 400. É o comportamento certo: create sem raiz está malformado.

`permit(:name, :email)` tira `admin`, `role`, qualquer outra chave. Em development o log avisa `Unpermitted parameter`. Em production, silêncio — a chave some, a action segue. Não é 403.

```ruby
params.require(:user).permit(:name)
# { name: "João", admin: true }  →  { name: "João" }

params.permit(:q, :page)   # index sem raiz — ok
params.require(:id)        # scalar da rota, se você quiser falhar cedo
```

`permit!` libera tudo. Mesma coisa que mass assignment. Não.

`to_h` depois do `permit` vira Hash com string keys das chaves permitidas. Antes do `permit`, `to_h` em Parameters não-permitted levanta erro — o Rails te impede de “só converter”.

**Quando usar:**
Um método privado por resource: `user_params`, `order_params`. Index com filtro: `permit` sem `require`. Nunca `permit!`. Nunca `params[:user]` direto no `update`.

**Na entrevista:**
> "`require` é a raiz. `permit` é a lista branca. Unpermitted não explode em production — some. `permit!` é mass assignment com outro nome."

---

## Nested permit

**O que é:**
Hash aninhado e array não passam num `permit(:address)`. Você declara a forma: chave → lista, ou chave → array vazio para lista de escalares.

**Como funciona:**
```ruby
# RUIM — :address some se for Hash
params.require(:user).permit(:name, :address)

# Hash aninhado
params.require(:user).permit(
  :name,
  address: [:street, :city, :zip]
)

# Array de IDs
params.require(:user).permit(:name, tag_ids: [])

# accepts_nested_attributes_for
params.require(:order).permit(
  :user_id,
  items_attributes: [:id, :product_id, :quantity, :_destroy]
)
```

`tag_ids: []` é array de escalar. Sem o `[]`, o array não entra. Nested attributes: `:id` e `:_destroy` no form de edição. Sem `:id` no update, o Rails cria outro filho.

Permit **não** é recursivo. Cada nível você escreve:

```ruby
params.require(:user).permit(
  :name,
  company_attributes: [
    :id,
    :legal_name,
    address_attributes: [:id, :street, :city]
  ]
)
```

**Quando usar:**
Form com endereço, nested attributes, `has_many` no mesmo POST. API que manda `items: [{ product_id, quantity }]`. Se o JSON é um blob, talvez não seja params — é outro endpoint.

**Na entrevista:**
> "`permit(:address)` não deixa Hash entrar. Eu declaro `address: [:street, :city]`. Array de ID é `tag_ids: []`. Nested attributes: `:id` e `:_destroy` no permit, senão duplica na edição."

---

## Status e head

**O que é:**
O número HTTP da response. Você passa símbolo Rails (`:created`), não o inteiro, na prosa do código. `head` manda só status e headers — body vazio.

**Como funciona:**
```ruby
render json: user, status: :created          # 201
render json: { errors: user.errors }, status: :unprocessable_entity  # 422
head :no_content                             # 204
head :not_found                              # 404
head :unauthorized                           # 401
redirect_to user_url(user), status: :see_other  # 303 — POST → GET
```

| Símbolo | Código | Quando |
|---|---|---|
| `:ok` | 200 | GET / update com body |
| `:created` | 201 | POST que criou |
| `:no_content` | 204 | DELETE / PATCH sem body |
| `:see_other` | 303 | redirect depois de POST |
| `:bad_request` | 400 | params malformado |
| `:unauthorized` | 401 | não autenticado |
| `:forbidden` | 403 | autenticado, sem permissão |
| `:not_found` | 404 | não existe |
| `:unprocessable_entity` | 422 | validação |

`head :ok` ≠ `render json: {}`. Head não tem body. DELETE de API: `head :no_content`. DELETE de HTML: `redirect_to` com `:see_other`. Turbo / Rails 7+: POST redirect 303. 302 reenvia POST — “clicou duas vezes, criou dois”.

**Quando usar:**
API fala status. HTML quase sempre 200 + template, 422 no form inválido, 303 no create/update/destroy. Não invente código. 200 em create é o que o entrevistador marca.

**Na entrevista:**
> "Símbolo, não número. Create 201. Validação 422. Delete de API 204. Redirect pós-POST é 303. `head` é status sem body."

---

## Cookies e session

**O que é:**
Dois jeitos de lembrar o cliente entre requests. Cookie viaja no header. Session no Rails 7.1+ default é cookie assinado (`cookie_store`): o dado mora no browser, o servidor só confia na assinatura. Teaser — auth de verdade é o capítulo 9.

**Como funciona:**
```ruby
cookies[:locale] = "pt-BR"
cookies.signed[:user_id] = user.id      # tamper-evident
cookies.encrypted[:cart_id] = cart.id   # ninguém lê
cookies.delete(:locale)

session[:user_id] = user.id
session.delete(:user_id)
reset_session                           # login e logout — session fixation
```

Cookie cru o cliente altera. `signed` detecta troca. `encrypted` esconde o valor. Sem senha na session. `reset_session` no login — sem isso, session id plantado vira a sessão autenticada.

**Quando usar:**
Locale, session id, flag de UI. Identidade do user: session + lookup no banco, não “cookie `admin=true`”. Token de API: header, não session.

**Na entrevista:**
> "Session default é cookie assinado. Eu não guardo segredo lá. Login chama `reset_session`. Cookie cru o cliente mente — signed/encrypted ou nem usa."

---

## Recapitulando

- `request` entra, `response` sai. Params não é o HTTP inteiro.
- Params junta rota + query + body. Chave string, symbol funciona. Valor string.
- `ActionController::Parameters` não é Hash. `to_unsafe_h` é fuga.
- Mass assignment: Hash cru no model. Strong params é a lista branca.
- `require` raiz. `permit` escalares. Unpermitted some; em production não explode.
- Nested: `address: [:street]`, `tag_ids: []`, nested attributes com `:id` e `:_destroy`.
- Status em símbolo. `head` sem body. POST redirect 303.
- Cookie/session: teaser. Assinado ≠ secreto. `reset_session` no login.

---

## Exercícios práticos

### Exercício 1: O create do GitHub

**Enunciado:** Este action é o que o entrevistador coloca na tela. O que passa? O que você muda — e por quê `validates :role` no model **não** resolve?

```ruby
class UsersController < ApplicationController
  def create
    user = User.create(params[:user])
    redirect_to user
  end
end
```

O POST manda `user[name]=João&user[role]=admin`. A coluna `role` existe.

<details>
<summary>Solução</summary>

Mass assignment. `params[:user]` inclui `role`. O model escreve admin.

```ruby
class UsersController < ApplicationController
  def create
    user = User.new(user_params)
    if user.save
      redirect_to user, status: :see_other
    else
      render :new, status: :unprocessable_entity
    end
  end

  private

  def user_params
    params.require(:user).permit(:name, :email)
  end
end
```

`validates :role, inclusion: { in: %w[user admin] }` aceita `"admin"` — é valor válido. Quem não pode escolher é o cliente, não o banco.

**Pontos-chave:**
- Strong params no controller, não validação no model
- Sem `permit`, `role` entra
- Create HTML responde 303, não 302 cego
</details>

### Exercício 2: Nested que some

**Enunciado:** O form manda `user[name]` e `user[address][street]`. Por que `address` chega `nil` no model? Corrija o `permit`.

```ruby
def user_params
  params.require(:user).permit(:name, :address)
end
```

Depois: o mesmo user tem `tag_ids[]=1&tag_ids[]=2`. Como permite?

<details>
<summary>Solução</summary>

`:address` no `permit` só aceita escalar. Hash aninhado é filtrado.

```ruby
def user_params
  params.require(:user).permit(
    :name,
    address: [:street, :city, :zip],
    tag_ids: []
  )
end
```

`tag_ids: []` é a forma de array de escalar. `permit(:tag_ids)` também some com o array.

**Pontos-chave:**
- Nested Hash se declara
- Array de ID é `chave: []`
- Unpermitted em production não levanta — o dado some e você acha que o form “não mandou”
</details>

### Exercício 3: Status, head e params string

**Enunciado:** Para cada caso, status (símbolo) e se usa `head` ou `render`/`redirect_to`. No último, o que imprime?

1. POST `/users` criou o registro — API JSON.
2. DELETE `/users/1` — API JSON, sem body.
3. POST HTML `/users` — create ok, vai para o show.
4. `params[:id]` de `/users/42` — `params[:id] + 1` e `params[:id].class`.

<details>
<summary>Solução</summary>

1. `render json: user, status: :created` — 201 com body.
2. `head :no_content` — 204, sem body. `render json: {}` é outra coisa.
3. `redirect_to user, status: :see_other` — 303. 201 não é o fluxo HTML.
4. `params[:id]` é `"42"`. `"42" + 1` levanta `TypeError`. Classe: `String`. `User.find` converte; conta sua não.

**Pontos-chave:**
- API create 201; HTML create 303
- `head` ≠ JSON vazio
- Params é string — indifferent access não converte tipo
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
