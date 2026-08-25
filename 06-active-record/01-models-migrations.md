# 6.1 Models e migrations

> **TL;DR**
> Model Rails normalmente herda de `ApplicationRecord`, que herda de `ActiveRecord::Base`. Por convenção, `User` usa `users`. Migration versiona mudanças no banco: crie uma nova, rode `bin/rails db:migrate` e reverta com `bin/rails db:rollback`. Use `change` quando o Rails conhece a inversão; use `up`/`down` quando a volta precisa ser explícita. `create_table` cria a primary key, e `t.timestamps` adiciona `created_at` e `updated_at`. Em produção, nunca edite migration já aplicada. `schema.rb` representa o schema em Ruby; `structure.sql` preserva melhor recursos específicos do PostgreSQL.
## Conteúdo
- [Model e Active Record](#model-e-active-record)
- [ApplicationRecord e ActiveRecord::Base](#applicationrecord-e-activerecordbase)
- [Convenção de nomes](#convenção-de-nomes)
- [Criando uma migration](#criando-uma-migration)
- [create_table, primary key e timestamps](#create_table-primary-key-e-timestamps)
- [Alterando uma tabela](#alterando-uma-tabela)
- [change, up e down](#change-up-e-down)
- [Migrate e rollback](#migrate-e-rollback)
- [Migration de produção é histórico](#migration-de-produção-é-histórico)
- [schema.rb vs structure.sql](#schemarb-vs-structuresql)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---
## Model e Active Record
**O que é:**
Model representa dados e regra de negócio. O Active Record liga uma classe Ruby a uma tabela do banco.
```ruby
class User < ApplicationRecord
  validates :email, presence: true, uniqueness: true
end
```
Sem escrever SQL para o caso comum, você cria e consulta registros:
```ruby
user = User.create!(name: "João", email: "joao@email.com")
User.find(user.id)
User.find_by(email: "joao@email.com")
user.update!(name: "João Silva")
```
**Como funciona:**
O Active Record lê as colunas da tabela. Se `users` tem `name` e `email`, `User` responde a `name`, `name=`, `email` e `email=`. Ele também faz type casting entre PostgreSQL e Ruby.

Model e migration têm papéis diferentes:

- **model:** comportamento atual da app;
- **migration:** passo que mudou a estrutura do banco.

**Na entrevista:**
> "O model é a classe persistida. A migration não define o model; ela versiona o schema. O Active Record lê esse schema e expõe os atributos."

---
## ApplicationRecord e ActiveRecord::Base
**O que é:**
`ActiveRecord::Base` é a base do Active Record. Em uma app Rails 7.1+, seus models normalmente herdam de `ApplicationRecord`.
```ruby
# app/models/application_record.rb
class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class
end
# app/models/user.rb
class User < ApplicationRecord
end
```
`primary_abstract_class` marca `ApplicationRecord` como base abstrata principal. Ela não procura uma tabela `application_records`.

**Quando usar:**
Coloque em `ApplicationRecord` só comportamento realmente comum a todos os models. Regra exclusiva de pedido fica em `Order`, não na classe base.

Herdar diretamente de `ActiveRecord::Base` pode fazer sentido em uma biblioteca ou fora de uma app Rails. No fluxo padrão, `ApplicationRecord` é o ponto comum da aplicação.

**Na entrevista:**
> "Meus models herdam de `ApplicationRecord`. Assim eu tenho um lugar para configuração compartilhada sem acoplar cada model diretamente à base do framework."

---
## Convenção de nomes
**Como funciona:**
O Rails converte o nome da classe para `snake_case` e pluraliza.

| Model | Tabela |
|---|---|
| `User` | `users` |
| `OrderItem` | `order_items` |
| `Person` | `people` |
```ruby
class OrderItem < ApplicationRecord
  # Usa order_items
end
```
Em banco legado, você pode sair da convenção:
```ruby
class Customer < ApplicationRecord
  self.table_name = "legacy_customers"
  self.primary_key = "customer_code"
end
```
**Quando usar:**
Siga a convenção em tabelas novas. Use `table_name` e `primary_key` customizados para integrar com um schema que você não controla.

**Na entrevista:**
> "Classe singular em CamelCase, tabela plural em snake_case. `OrderItem` aponta para `order_items`. Eu sobrescrevo isso só quando preciso."

---
## Criando uma migration
**O que é:**
Migration é uma classe Ruby com uma mudança incremental no schema. O timestamp no arquivo identifica e ordena a versão.
```bash
bin/rails generate migration CreateProducts
```
```text
db/migrate/20260825120000_create_products.rb
```
```ruby
class CreateProducts < ActiveRecord::Migration[7.1]
  def change
  end
end
```
Você também pode gerar model e migration juntos:
```bash
bin/rails generate model Product name:string price_cents:bigint
```
Leia o arquivo gerado antes de executar. Generator não decide `null`, default, índice nem impacto de lock por você.

**Na entrevista:**
> "Migration é histórico executável do schema. Eu reviso tipo, constraint, índice e impacto operacional antes de rodar."

---
## create_table, primary key e timestamps
**Exemplo prático:**
```ruby
class CreateProducts < ActiveRecord::Migration[7.1]
  def change
    create_table :products do |t|
      t.string :name, null: false
      t.bigint :price_cents, null: false
      t.timestamps null: false
    end
  end
end
```
`create_table :products` cria `id` como primary key por padrão. Em uma app Rails atual com PostgreSQL, esse `id` normalmente é `bigint` e o banco gera o valor.
```ruby
product = Product.create!(name: "Café", price_cents: 2_590)
product.id          # preenchido depois do INSERT
product.price_cents # 2590 centavos, ou R$ 25,90
```
`t.timestamps` cria:

- `created_at`: criação do registro;
- `updated_at`: última atualização.

O Active Record mantém os dois nas operações normais. `null: false` exige que os valores existam no banco.

Se a aplicação usa UUID, declare a escolha:
```ruby
create_table :orders, id: :uuid do |t|
  t.bigint :total_cents, null: false
  t.timestamps null: false
end
```
**Importante na entrevista:**
Primary key identifica a linha. Índice único protege outra regra, como e-mail único. E dinheiro não vai em `float`: use centavos em inteiro.

---
## Alterando uma tabela
**Como funciona:**
Depois que a tabela existe, crie outra migration.
```bash
bin/rails generate migration AddEmailToUsers email:string
```
```ruby
class AddEmailToUsers < ActiveRecord::Migration[7.1]
  def change
    add_column :users, :email, :string
    add_index :users, :email, unique: true
  end
end
```
Para tabela com dados, pense na transição. Adicionar `null: false` pode falhar se linhas antigas não tiverem valor. Um caminho seguro costuma ser:

1. adicionar a coluna aceitando `NULL`;
2. preencher dados antigos;
3. validar os dados;
4. aplicar `change_column_null` em outra migration.
```ruby
class RequireEmailOnUsers < ActiveRecord::Migration[7.1]
  def change
    change_column_null :users, :email, false
  end
end
```
Para trocar o tipo, existe `change_column`:
```ruby
change_column :products, :price_cents, :bigint
```
No PostgreSQL, trocar tipo pode converter dados, reescrever tabela ou segurar lock. Uma linha de Ruby não significa uma operação barata.

**Na entrevista:**
> "Em tabela com dados, planejo compatibilidade, backfill e constraint em etapas. Em tabela grande, avalio lock e tempo da operação."

---
## change, up e down
**O que é:**
`change` descreve a transformação uma vez. O Rails tenta inverter operações conhecidas no rollback.
```ruby
class AddActiveToUsers < ActiveRecord::Migration[7.1]
  def change
    add_column :users, :active, :boolean, default: true, null: false
  end
end
```
Na ida, adiciona a coluna. Na volta, remove.

Use `up` e `down` quando a inversão não é óbvia:
```ruby
class ChangeProductsPriceToBigint < ActiveRecord::Migration[7.1]
  def up
    change_column :products, :price_cents, :bigint
  end
  def down
    change_column :products, :price_cents, :integer
  end
end
```
Mesmo com `down`, voltar pode falhar se um valor não couber em `integer`. Reversível no código não significa seguro para os dados.

Para SQL manual, declare os dois caminhos:
```ruby
def up
  execute "CREATE VIEW active_users AS SELECT * FROM users WHERE active = TRUE"
end
def down
  execute "DROP VIEW active_users"
end
```
**Quando usar:**

- `change` para operações que o Rails sabe inverter;
- `up`/`down` para SQL manual ou volta explícita;
- `reversible` quando só um trecho de `change` precisa dos dois sentidos.

Operação sem inversão conhecida pode levantar `ActiveRecord::IrreversibleMigration`.

**Na entrevista:**
> "Prefiro `change` quando a operação é reversível. Para SQL manual ou mudança destrutiva, escrevo `up` e `down`. Rollback não recupera dado apagado."

---
## Migrate e rollback
**Como funciona:**
```bash
bin/rails db:migrate
bin/rails db:migrate:status
bin/rails db:rollback
bin/rails db:rollback STEP=2
```
`db:migrate` aplica migrations pendentes. O Rails registra versões executadas na tabela `schema_migrations`. `db:rollback` desfaz a última; `STEP=2` desfaz duas.

Para chegar a uma versão específica:
```bash
bin/rails db:migrate VERSION=20260825120000
```
**Importante na entrevista:**
Rollback executa a operação inversa. Não é backup. Remover e recriar uma coluna não restaura o conteúdo perdido.

No PostgreSQL, migrations usam transação por padrão quando as operações permitem. Ainda assim, em produção você avalia lock, volume e compatibilidade com a versão da app durante o deploy.

---
## Migration de produção é histórico
**O que é:**
Nunca edite uma migration que já foi aplicada em produção. A versão já está em `schema_migrations`; mudar o arquivo não faz o Rails executá-lo novamente.

Se `AddEmailToUsers` já rodou e `email` precisa ser obrigatório, faça outra migration:
```ruby
class RequireEmailOnUsers < ActiveRecord::Migration[7.1]
  def change
    change_column_null :users, :email, false
  end
end
```
Antes de uma migration ser compartilhada ou aplicada em ambiente relevante, você pode corrigi-la localmente. Depois disso, preserve o histórico. Assim, quem executou a versão original e quem montar um banco novo chegam ao mesmo estado.

**Na entrevista:**
> "Migration aplicada é histórica. O Rails controla a versão, não um checksum do conteúdo. Para corrigir produção, eu crio uma nova migration."

---
## schema.rb vs structure.sql
**O que é:**
Depois de migrar, o Rails mantém um dump do estado atual. Um banco novo pode carregar esse dump sem reproduzir todo o histórico.

`db/schema.rb` representa o schema com a DSL Ruby:
```ruby
create_table "products", force: :cascade do |t|
  t.string "name", null: false
  t.bigint "price_cents", null: false
  t.datetime "created_at", null: false
  t.datetime "updated_at", null: false
end
```
Para usar o formato nativo:
```ruby
# config/application.rb
config.active_record.schema_format = :sql
```
O Rails passa a gerar `db/structure.sql`. Ele preserva melhor views, triggers, extensões, tipos e outros recursos específicos do PostgreSQL.

**Quando usar:**

- `schema.rb`: schema bem representado pela DSL, com leitura simples;
- `structure.sql`: dependência relevante de recursos nativos do PostgreSQL.

Versione o dump escolhido. Não o edite para mudar o banco: escreva uma migration. O dump mostra o estado atual; migrations levam bancos existentes ao próximo estado.

**Na entrevista:**
> "`schema.rb` é uma representação Ruby, simples e mais portável. `structure.sql` é fiel ao PostgreSQL. A escolha depende dos recursos usados pela app."

---
## Recapitulando
- Model herda de `ApplicationRecord`; ela herda de `ActiveRecord::Base`.
- `User` usa `users`; `OrderItem` usa `order_items`.
- `create_table` cria `id` como primary key por padrão.
- `t.timestamps` cria `created_at` e `updated_at`.
- Dinheiro fica em inteiro, como `price_cents`.
- `add_column` altera a estrutura; com dados, planeje backfill e constraint.
- Use `change` para inversão conhecida e `up`/`down` para volta explícita.
- `db:migrate` aplica pendentes; `db:rollback` desfaz.
- Migration aplicada em produção não é editada. Crie outra.
- `schema.rb` usa DSL Rails; `structure.sql` preserva detalhes do PostgreSQL.

---
## Exercícios práticos
### Exercício 1: Criar produtos
**Enunciado:** Crie `products` com nome obrigatório, preço obrigatório em centavos, primary key padrão e timestamps obrigatórios.

<details>
<summary>Solução</summary>

```ruby
class CreateProducts < ActiveRecord::Migration[7.1]
  def change
    create_table :products do |t|
      t.string :name, null: false
      t.bigint :price_cents, null: false
      t.timestamps null: false
    end
  end
end
```
`id` vem de `create_table`. R$ 25,90 entra como `2590` centavos.

**Pontos-chave:**
- Inteiro para dinheiro
- `null: false` protege no banco
- Timestamps são mantidos pelo Active Record

</details>
### Exercício 2: Corrigir produção
**Enunciado:** A migration de `email` já rodou em produção. Agora a coluna deve ser obrigatória. O que você faz?

<details>
<summary>Solução</summary>

Não edite a migration antiga. Preencha e-mails nulos e crie outra migration:
```ruby
class RequireEmailOnUsers < ActiveRecord::Migration[7.1]
  def change
    change_column_null :users, :email, false
  end
end
```
**Pontos-chave:**
- Migration aplicada é histórico
- Dados antigos precisam respeitar a constraint
- Correção de schema ganha nova versão

</details>
### Exercício 3: View reversível
**Enunciado:** Crie uma migration reversível para a view PostgreSQL `active_users`. Use SQL manual.

<details>
<summary>Solução</summary>

```ruby
class CreateActiveUsersView < ActiveRecord::Migration[7.1]
  def up
    execute "CREATE VIEW active_users AS SELECT * FROM users WHERE active = TRUE"
  end
  def down
    execute "DROP VIEW active_users"
  end
end
```
`up` e `down` evitam que o Rails tenha que adivinhar a inversão do SQL. Para views importantes, `structure.sql` preserva melhor a estrutura.

**Pontos-chave:**
- SQL manual pede volta explícita
- `down` desfaz a estrutura, não recupera dados
- `structure.sql` é fiel ao PostgreSQL

</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
