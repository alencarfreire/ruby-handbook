# 9.5 Autorização (Pundit)

> **TL;DR**
> Autenticação responde **quem é você**; autorização responde **o que você pode fazer**. No Pundit, uma `Policy` recebe usuário e recurso. O controller chama `authorize`; listagens passam por `policy_scope`. `pundit_user` define quem será avaliado. Role é dado de entrada, não a decisão inteira. Sem login normalmente é 401; com login e sem permissão, 403. Esconder botão ajuda a UX, mas não protege endpoint. `if current_user.admin?` espalhado na view é smell: consulte a policy e autorize de novo no servidor.

## Conteúdo

- [Autenticação não é autorização](#autenticação-não-é-autorização)
- [Policy](#policy)
- [authorize no controller](#authorize-no-controller)
- [pundit_user](#pundit_user)
- [Scope](#scope)
- [Role vs Policy](#role-vs-policy)
- [Autorização na view](#autorização-na-view)
- [401 vs 403](#401-vs-403)
- [Falha fechada e verificação](#falha-fechada-e-verificação)
- [Pundit e CanCanCan](#pundit-e-cancancan)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Autenticação não é autorização

**O que é:**
Autenticação confirma identidade. Senha, sessão ou token dizem que o request veio da Ana. Autorização decide se Ana pode editar o pedido 42.

Ter `current_user` não libera tudo. Uma app pode autenticar bem e aceitar `/orders/42/edit` de qualquer usuário logado. Trocar o ID na URL é o teste clássico de IDOR: acesso indevido a um objeto por referência direta.

**Na entrevista:**
> "Autenticação prova quem é o usuário. Autorização decide o que esse usuário pode fazer com aquele recurso. Login não substitui policy."

---

## Policy

**O que é:**
Policy é um objeto Ruby que centraliza decisões de acesso. No Pundit, `OrderPolicy` recebe `user` e `record`. Métodos como `show?` e `update?` respondem se a ação é permitida.

**Como funciona:**

```ruby
class ApplicationPolicy
  attr_reader :user, :record

  def initialize(user, record)
    raise Pundit::NotAuthorizedError, "login obrigatório" unless user
    @user = user
    @record = record
  end

  def show? = false
  def create? = false
  def update? = false
  def destroy? = false
end
```

Negar no pai é **fail closed**: uma regra nova não nasce liberada sem querer.

```ruby
class OrderPolicy < ApplicationPolicy
  def show?
    user.admin? || record.user_id == user.id
  end

  def create?
    user.active?
  end

  def update?
    user.admin? || (record.user_id == user.id && record.pending?)
  end

  def destroy?
    user.admin?
  end
end
```

Validação responde se o objeto é válido. Policy responde se **este usuário** pode executar a ação. São responsabilidades diferentes.

**Na entrevista:**
> "Pundit usa classes Ruby simples. A policy recebe user e record. Eu nego por padrão e libero considerando role, ownership e estado."

---

## authorize no controller

**O que é:**
`authorize` executa a policy antes da operação protegida. Se a decisão for falsa, o Pundit levanta `Pundit::NotAuthorizedError`.

**Como funciona:**

```ruby
class ApplicationController < ActionController::Base
  include Pundit::Authorization
end
```

```ruby
class OrdersController < ApplicationController
  def update
    @order = Order.find(params[:id])
    authorize @order

    if @order.update(order_params)
      redirect_to @order, notice: "Pedido atualizado", status: :see_other
    else
      render :edit, status: :unprocessable_entity
    end
  end
end
```

Em `update`, o Pundit infere `OrderPolicy#update?`. Em action fora do REST padrão, deixe a query explícita.

```ruby
def cancel
  order = Order.find(params[:id])
  authorize order, :cancel?
  order.cancel!
  redirect_to order, notice: "Pedido cancelado", status: :see_other
end
```

Autorize **antes** de alterar estado, enfileirar job ou revelar dado. Strong params não são autorização: `permit(:status)` filtra entrada, mas não decide quem pode alterar o status.

**Na entrevista:**
> "Eu chamo authorize antes do efeito. Pundit infere policy e query pela action; numa ação customizada, passo `:cancel?`. Strong params e policy resolvem problemas diferentes."

---

## pundit_user

**O que é:**
É o objeto entregue como primeiro argumento da policy. Por padrão, `pundit_user` retorna `current_user`.

Você sobrescreve quando a identidade de autorização precisa de contexto explícito, como usuário e tenant.

```ruby
class ApplicationController < ActionController::Base
  include Pundit::Authorization

  private

  def pundit_user
    { user: current_user, account: current_account }
  end
end
```

A policy passa a receber esse contexto no lugar de `current_user`. Numa app real, prefira um objeto imutável a um Hash solto. Não transforme o contexto num saco de dependências. Se `current_user` basta, mantenha o padrão.

**Na entrevista:**
> "pundit_user é a identidade avaliada e, por padrão, é current_user. Eu sobrescrevo só quando a autorização precisa de contexto, como user mais tenant."

---

## Scope

**O que é:**
Policy decide uma ação sobre um recurso. `Scope` decide **quais registros** entram numa coleção.

Sem scope, o `show` pode estar protegido enquanto o `index` entrega pedidos de todo mundo.

**Como funciona:**

```ruby
class OrderPolicy < ApplicationPolicy
  class Scope
    def initialize(user, scope)
      @user = user
      @scope = scope
    end

    def resolve
      if @user.admin?
        @scope.all
      else
        @scope.where(user_id: @user.id)
      end
    end
  end
end
```

```ruby
def index
  @orders = policy_scope(Order).order(created_at: :desc)
end
```

`policy_scope(Order)` chama `OrderPolicy::Scope#resolve`. Retornar `ActiveRecord::Relation` mantém filtro, ordenação e paginação no banco.

Não faça `Order.all.select { |order| policy(order).show? }`: isso carrega tudo e filtra em memória. Scope protege a coleção; `authorize` protege a ação sobre um registro. Um não substitui o outro.

**Na entrevista:**
> "Scope é autorização da coleção. Eu devolvo uma Relation limitada por tenant, owner ou role. Não faço Order.all e select em Ruby."

---

## Role vs Policy

**O que é:**
Role é um fato: `admin`, `manager`, `member`. Policy é a decisão contextual: esta pessoa pode executar esta ação neste recurso agora?

RBAC organiza permissões por papel. Policy pode usar `user.finance_manager?` junto com `record.awaiting_approval?`, ownership e tenant. Role é entrada da decisão, não substituta dela.

**Na entrevista:**
> "Role é um fato sobre o usuário. Policy combina role, ação e recurso. Admin pode ser atalho, mas a decisão fica centralizada."

---

## Autorização na view

**O que é:**
A view consulta a policy para não oferecer uma ação proibida. Isso melhora UX, mas não cria segurança.

```erb
<%# BOM %>
<% if policy(@order).update? %>
  <%= link_to "Editar", edit_order_path(@order) %>
<% end %>
```

```erb
<%# RUIM — regra duplicada na apresentação %>
<% if current_user.admin? || @order.user_id == current_user.id %>
  <%= link_to "Editar", edit_order_path(@order) %>
<% end %>
```

O smell não é o `if` em ERB. É reimplementar a regra. Um atacante monta `PATCH /orders/42` sem clicar no botão, então o controller ainda chama `authorize @order`.

**Na entrevista:**
> "Esconder botão é UX, não segurança. Na view eu consulto policy(record), não duplico admin ou ownership. No controller eu autorizo de novo."

---

## 401 vs 403

**O que é:**

| Status | Significado | Exemplo |
|---|---|---|
| 401 Unauthorized | autenticação ausente ou inválida | token expirado |
| 403 Forbidden | identidade conhecida, ação negada | Ana tenta apagar pedido de Bruno |

O nome de 401 confunde: apesar de `Unauthorized`, ele trata de autenticação.

```ruby
class ApplicationController < ActionController::API
  include Pundit::Authorization
  rescue_from Pundit::NotAuthorizedError, with: :forbidden

  private

  def forbidden
    render json: { error: "Acesso negado" }, status: :forbidden
  end
end
```

Em app HTML com sessão, o usuário anônimo costuma ser redirecionado ao login. Em API, preserve o contrato HTTP. Às vezes um recurso sensível responde 404 para não confirmar existência; faça isso como decisão consistente contra enumeração.

**Na entrevista:**
> "401 é falta de credencial válida. 403 é usuário conhecido sem permissão. Em HTML posso redirecionar ao login; em API preservo o status."

---

## Falha fechada e verificação

**O que é:**
O risco prático é esquecer `authorize` ou `policy_scope`. Hooks transformam o esquecimento em erro durante desenvolvimento e teste.

```ruby
class ApplicationController < ActionController::Base
  include Pundit::Authorization

  after_action :verify_authorized, except: :index
  after_action :verify_policy_scoped, only: :index
end
```

Esse exemplo assume que todo `index` tem coleção. Login, health check e páginas públicas pedem exceções conscientes com `skip_authorization` ou `skip_policy_scope`.

Em request specs, teste permitido e negado. Confira status **e efeito**: o usuário proibido recebe 403 ou redirect e o registro não muda. Um teste unitário da policy não prova que o controller chamou `authorize`.

---

## Pundit e CanCanCan

Pundit usa policies explícitas. CanCanCan é a alternativa popular baseada em abilities, normalmente com `can?` e `authorize!`. As duas resolvem autorização; escolha pelo padrão e pelas necessidades do time.

---

## Recapitulando

- Autenticação identifica; autorização decide acesso.
- `Policy` recebe usuário e recurso; `authorize` roda antes do efeito.
- `pundit_user` é `current_user`; `policy_scope` limita coleções.
- Role é entrada da policy, não a decisão inteira.
- Policy na view melhora UX; `admin?` duplicado é smell e não protege endpoint.
- 401 indica autenticação inválida; 403 indica permissão negada.
- Hooks detectam endpoints sem autorização.

## Exercícios práticos

### Exercício 1: Policy de documento

**Enunciado:** Escreva `DocumentPolicy#update?`. Admin edita qualquer documento. O autor edita apenas o próprio documento em estado `draft`.

<details>
<summary>Solução</summary>

```ruby
class DocumentPolicy < ApplicationPolicy
  def update?
    user.admin? || (record.user_id == user.id && record.draft?)
  end
end
```

No controller, antes do update: `authorize @document`.

**Pontos-chave:**
- Ownership e estado entram na decisão
- A policy não roda sozinha
</details>

### Exercício 2: Scope multi-tenant

**Enunciado:** Escreva o scope de `Invoice`. Admin vê todas as faturas da própria conta; membro vê apenas as próprias. Ninguém vê outra conta.

<details>
<summary>Solução</summary>

```ruby
def resolve
  invoices = @scope.where(account_id: @user.account_id)
  @user.admin? ? invoices : invoices.where(user_id: @user.id)
end
```

No controller: `@invoices = policy_scope(Invoice)`.

**Pontos-chave:**
- O filtro de tenant vem antes do privilégio local
- O retorno continua sendo `ActiveRecord::Relation`
</details>

### Exercício 3: Botão escondido

**Enunciado:** Corrija o endpoint e a view. Diga o status para um usuário autenticado sem permissão.

```ruby
def destroy
  order = Order.find(params[:id])
  order.destroy!
  redirect_to orders_path
end
```

```erb
<% if current_user.admin? %>
  <%= button_to "Remover", order_path(order), method: :delete %>
<% end %>
```

<details>
<summary>Solução</summary>

```ruby
def destroy
  order = Order.find(params[:id])
  authorize order
  order.destroy!
  redirect_to orders_path, status: :see_other
end
```

```erb
<% if policy(order).destroy? %>
  <%= button_to "Remover", order_path(order), method: :delete %>
<% end %>
```

Usuário autenticado sem permissão recebe 403. Sem autenticação válida, 401 ou redirect ao login na app HTML.

**Pontos-chave:**
- Botão escondido não protege o endpoint
- `authorize` vem antes de `destroy!`
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
