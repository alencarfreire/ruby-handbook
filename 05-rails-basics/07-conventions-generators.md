# 5.7 Convenções e generators

> **TL;DR**
> Rails aposta em convention over configuration: você só configura o que foge do padrão. Model singular (`User`), tabela plural (`users`), controller plural (`UsersController`). Generator escreve o arquivo no path que o Zeitwerk (autoload do Rails) espera. `bin/rails generate` cria. `bin/rails destroy` desfaz. Scaffold é CRUD inteiro — protótipo, não domínio de produção.

## Conteúdo

- [Convention over configuration](#convention-over-configuration)
- [Model singular, tabela plural](#model-singular-tabela-plural)
- [model, controller, migration](#model-controller-migration)
- [scaffold](#scaffold)
- [destroy](#destroy)
- [O que você não gera com scaffold](#o-que-você-não-gera-com-scaffold)
- [Nome de arquivo e Zeitwerk](#nome-de-arquivo-e-zeitwerk)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Convention over configuration

**O que é:**
O Rails escolhe o default. Arquivo, classe, tabela, rota e view seguem o mesmo nome. Você não declara o mapeamento até quebrar a regra.

**Como funciona:**
```text
User → app/models/user.rb → tabela users
     → UsersController → app/views/users/ → resources :users → users_path
```

Não é mágica. Inflector + Zeitwerk + Active Record olham o nome da classe. `User` vira `users`. `belongs_to :user` procura `user_id`. A view `index` cai em `app/views/users/index.html.erb`.

**Quando usar:**
Código novo no inglês pluralizável. Foge só com motivo: tabela legada, STI, chave que não é `recurso_id`.

**Na entrevista:**
> "Convention over configuration. O Rails assume path, tabela e rota a partir do nome. Eu só configuro a exceção — `self.table_name`, `foreign_key:`, namespace."

---

## Model singular, tabela plural

**O que é:**
A classe é **uma** linha. A tabela guarda **várias**. Controller e rota falam do recurso no plural.

**Como funciona:**
```ruby
# app/models/user.rb          → tabela users
class User < ApplicationRecord
end

# app/models/order_item.rb    → order_items, FKs order_id / product_id
class OrderItem < ApplicationRecord
  belongs_to :order
  belongs_to :product
end
```

O inflector já sabe o irregular: `Person` → `people`, `Category` → `categories`.

```ruby
class LegacyClient < ApplicationRecord
  self.table_name = "tbl_cli"
end

belongs_to :author, class_name: "User", foreign_key: "author_id"
```

**Quando usar:**
Convenção no código novo. `table_name` só em legado. Não pluralize o model (`Users`) para “combinar” com a tabela.

**Na entrevista:**
> "Model singular, tabela plural. `User` / `users`. `OrderItem` / `order_items`. Tabela outra? `self.table_name`. Eu não renomeio a classe para plural."

---

## model, controller, migration

**O que é:**
Generator é template (Thor + railties). Você passa nome e atributos; ele escreve o arquivo no path certo. Não sobe servidor. Não pensa regra de negócio. Os três do dia a dia criam **pedaços**. Nenhum é CRUD completo. `g` é alias de `generate`.

**Como funciona:**
```bash
bin/rails g model Product name:string price_cents:integer
# app/models/product.rb
# db/migrate/XXXX_create_products.rb
# test/models/product_test.rb + fixtures
```

Não cria rota, controller nem view. A migration **não roda** — falta `bin/rails db:migrate`.

```bash
bin/rails g controller Products index show
```

Sai controller, views vazias, helper, test. Nas rotas o default **não é REST**:

```ruby
get "products/index"
get "products/show"
```

Armadilha clássica. `--skip-routes` e você escreve `resources`. Scaffold também escreve `resources`. O generator de controller, não.

```bash
bin/rails g migration AddStockToProducts stock:integer
# AddStockToProducts      → add_column :products, :stock, :integer
# RemoveStockFromProducts
# CreateProducts
```

Nome que não casa → arquivo vazio, você escreve o `change`.

**Exemplo prático:**
```bash
bin/rails g model Product name:string price_cents:integer
bin/rails g migration AddStockToProducts stock:integer
bin/rails db:migrate
bin/rails g controller Products --skip-routes
```

```ruby
resources :products, only: %i[index show]
```

**Quando usar:**
Model novo: `g model`. Coluna nova: `g migration`. Tela: `g controller --skip-routes` + `resources` na mão. Generate de novo em cima de arquivo existente pergunta ou pula — não faz merge.

**Na entrevista:**
> "g model não cria rota. g controller não cria resources — cria get 'products/index'. Migration eu gero, depois db:migrate. Em app de verdade eu uso o trio, não o scaffold."

---

## scaffold

**O que é:**
Um generate que empilha os outros. Model, migration, controller com os sete actions REST, views Turbo, `resources`, fixture, test de controller e system spec. CRUD de tutorial.

**Como funciona:**
```bash
bin/rails g scaffold Product name:string price_cents:integer
# resources :products na rota
# before_action :set_product + strong params gerados
```

```bash
bin/rails g scaffold Product name:string --api
```

Sem views. JSON. Continua CRUD genérico.

**Quando usar:**
Spike, workshop, protótipo de uma tarde. Recurso burro: nome, descrição, ninguém autentica nada.

**Na entrevista:**
> "Scaffold gera o CRUD inteiro. Serve para protótipo. Em produção eu não scaffoldo User, Order, Payment. Gero model e migration e escrevo o controller."

---

## destroy

**O que é:**
O inverso do generate. Apaga o que aquele generator **teria** criado. Não é rollback de migration. Não pergunta se você editou o arquivo.

**Como funciona:**
```bash
bin/rails d scaffold Product   # d = destroy
bin/rails d model Product
bin/rails d migration AddStockToProducts
```

Some arquivo e tira a rota que ele inseriu. A migration **fica** se você já rodou: o arquivo some, a tabela no banco não. `db:rollback` se ela ainda é a última; senão, `drop_table` numa migration nova.

Destroy casa com o **mesmo** generator e os **mesmos** argumentos. `d scaffold Product` não desfaz um `g model Product` solto.

**Quando usar:**
Minutos depois do generate, antes de commitar. Depois que tem regra de negócio, apague na mão. Destroy não faz diff.

**Na entrevista:**
> "destroy desfaz o generate. Apaga arquivo, mesmo o que eu editei. Não dá rollback no banco. Migration já migrada eu trato com rollback ou nova migration."

---

## O que você não gera com scaffold

**O que é:**
Scaffold assume recurso REST burro: sem policy, sem estado, sem dinheiro de verdade. App de produção quase nunca é isso.

**Como funciona:**
Não scaffold:

- `User` / sessão — auth. Senha, reset, session. Devise ou código seu, não sete actions.
- `Order`, `Payment`, `Invoice` — estado, dinheiro, idempotência.
- Nested de verdade — scaffold não monta nested routes nem Pundit.
- API versionada — `--api` ainda é CRUD raso, sem serializer nem `v1`.
- Admin de dado sensível — index vaza tudo.
- Recurso que já tem model — duplica classe e migration.

O cheiro: `g scaffold User email:string password:string` commitado com senha em texto e `UsersController` público.

**Exemplo prático:**
```bash
# produção
bin/rails g model Order user:references status:integer total_cents:integer
bin/rails db:migrate
# controller, policy, Service Object — na mão

# spike de uma tarde
bin/rails g scaffold Note title:string body:text
```

**Quando usar:**
Scaffold quando o recurso morre no fim da demo. Model + migration quando vai para o PR.

**Na entrevista:**
> "Eu não scaffoldo User nem Order. Scaffold é CRUD sem autorização. Em produção eu gero model e migration e escrevo o resto."

---

## Nome de arquivo e Zeitwerk

**O que é:**
O generator acerta o contrato do Zeitwerk: path snake_case, constante CamelCase. Você quebra o app quando renomeia um lado só. Loader em si está no [3.2 Zeitwerk](/03-ruby-advanced/02-zeitwerk-autoload).

**Como funciona:**
```text
bin/rails g model OrderItem
  app/models/order_item.rb                    → OrderItem

bin/rails g controller Admin::Users
  app/controllers/admin/users_controller.rb   → Admin::UsersController

bin/rails g model Admin::User
  app/models/admin/user.rb                    → Admin::User
  tabela admin_users
```

`users_controller.rb` com `class UserController` explode. `order_item.rb` com `class OrderItems` explode.

Acrônimo (`API`) não vem de graça. Sem inflection, `g controller API::Users` espera `Api::UsersController`.

**Quando usar:**
Aceite o path do generate. Namespace (`Admin::`) quando a pasta é de verdade. Não invente `app/models/users/user.rb` por estética.

**Na entrevista:**
> "Generator já põe o arquivo onde o Zeitwerk espera. `order_item.rb` é `OrderItem`. Renomeei a classe e esqueci o arquivo? O check quebra. Namespace é pasta."

---

## Recapitulando

- Convenção: model singular, tabela plural, controller plural, views no plural.
- Você configura só a exceção (`table_name`, `foreign_key`, namespace).
- `g model` / `g migration` / `g controller` são pedaços. Controller generator **não** gera `resources`.
- Scaffold empilha CRUD + views + rota. Protótipo, não domínio.
- `destroy` apaga arquivo, inclusive o editado. Banco não volta sozinho.
- Não scaffold: User, pagamento, API versionada, admin sensível, recurso que já existe.
- Path do generate = constante do Zeitwerk. Mexeu num, mexe no outro.

---

## Exercícios práticos

### Exercício 1: Nomeie o trio

**Enunciado:** Para cada model, diga classe, arquivo e tabela. Rails 7.1, inflector default.

```text
User    OrderItem    Person    Admin::User
```

<details>
<summary>Solução</summary>

```text
User         User          app/models/user.rb            users
OrderItem    OrderItem     app/models/order_item.rb      order_items
Person       Person        app/models/person.rb          people
Admin::User  Admin::User   app/models/admin/user.rb      admin_users
```

FK segue o nome da associação: `belongs_to :user` → `user_id`. `Person` → `people` é inflector, não gambiarra.

**Pontos-chave:**
- Classe nunca vai plural
- snake_case no arquivo
- Namespace prefixa a tabela
</details>

### Exercício 2: Qual generator?

**Enunciado:** Em cada caso, o que você roda — e o que você **não** roda?

1. Tabela nova `products`, model `Product`, sem tela.
2. Coluna `stock` em `products`.
3. Tela REST de `Note` para um spike de sexta.
4. `ProductsController` com `index` e `show` no app de produção.

<details>
<summary>Solução</summary>

1. `bin/rails g model Product …` + `db:migrate`. Sem scaffold.
2. `bin/rails g migration AddStockToProducts stock:integer` + `db:migrate`. Sem `g model`.
3. `bin/rails g scaffold Note title:string body:text`. Spike. Scaffold ok.
4. `bin/rails g controller Products --skip-routes` e `resources :products, only: %i[index show]`. Sem scaffold. Sem `g controller Products index show` solto — isso mete `get "products/index"`.

**Pontos-chave:**
- Model e migration cobrem persistência
- Scaffold é atalho de spike
- Controller generator default não é REST
</details>

### Exercício 3: Scaffold de User no PR

**Enunciado:** O júnior rodou `bin/rails g scaffold User email:string password:string`, migrou, commitou. O PR tem `UsersController` público, senha em texto, `resources :users`. O que você fala no review? Como desfaz se o código ainda é o gerado? E se a migration já está em main?

<details>
<summary>Solução</summary>

Scaffold de `User` não é auth. Senha sem digest. Index lista todo mundo. Destroy sem autorização. Não entra.

Branch local, arquivo ainda gerado:

```bash
bin/rails d scaffold User
bin/rails db:rollback   # se create_users ainda é a última
```

Migration em main: **não** destroy em produção. Apague controller, views e rota no PR. Tabela fica se já tem dado. Auth de verdade é `password_digest` + `has_secure_password` ou Devise. Nova migration se a coluna precisa mudar.

**Pontos-chave:**
- Scaffold ≠ autenticação
- `destroy` é limpo antes do código virar domínio
- Migration em main: nova migration, não apagar arquivo no servidor
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
