# 6.7 Scopes e Query Object

> **TL;DR**
> Scope é uma consulta nomeada que devolve `ActiveRecord::Relation`. Use lambda para avaliar valores e argumentos na chamada. Método de classe é melhor quando existe fluxo de controle. Componha relações com encadeamento e `merge`, sem materializar cedo. Evite `default_scope`: ele esconde filtros e torna `unscoped` tentador. Quando uma busca acumular filtros opcionais, extraia um Query Object em `app/queries`, injete a relação inicial e continue devolvendo uma relação chainable.

## Conteúdo

- [Relação antes de Array](#relação-antes-de-array)
- [Scope com lambda](#scope-com-lambda)
- [Scope ou método de classe](#scope-ou-método-de-classe)
- [Composição com merge](#composição-com-merge)
- [A armadilha do default_scope](#a-armadilha-do-default_scope)
- [Quando extrair um Query Object](#quando-extrair-um-query-object)
- [Query Object em app/queries](#query-object-em-appqueries)
- [Mantenha a saída chainable](#mantenha-a-saída-chainable)
- [Na entrevista](#na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Relação antes de Array

**O que é:**
`ActiveRecord::Relation` representa uma consulta que ainda pode receber condições. Ela não é o Array final.

```ruby
orders = Order.where(status: "paid")
orders = orders.where(created_at: 30.days.ago..)
orders = orders.order(created_at: :desc).limit(20)
```

`where`, `order` e `limit` devolvem outra relação. O Rails adia a consulta até precisar dos registros: é o lazy loading.

Já `to_a`, `pluck`, `count` e `exists?` executam a consulta ou mudam o tipo do resultado:

```ruby
Order.paid.to_a        # Array<Order>
Order.paid.pluck(:id)  # Array<Integer>
Order.paid.count       # Integer
Order.paid.exists?     # true ou false
```

Esses métodos são úteis no limite da operação. Dentro de uma API de busca reutilizável, eles encerram o encadeamento.

---

## Scope com lambda

**O que é:**
Scope dá nome de domínio a uma relação.

```ruby
class Order < ApplicationRecord
  scope :paid, -> { where(status: "paid") }
  scope :recent, -> { where(created_at: 30.days.ago..) }
  scope :expensive, ->(minimum_cents) {
    where(total_cents: minimum_cents..)
  }
end

Order.paid.recent.expensive(20_000)
```

**Como funciona:**
A lambda roda quando o scope é chamado. Valores temporais não ficam presos ao carregamento da classe.

```ruby
class Subscription < ApplicationRecord
  scope :expired, -> { where(expires_at: ...Time.current) }
end
```

Para filtro opcional, devolva uma relação também no caso vazio:

```ruby
scope :with_status, ->(status) {
  status.present? ? where(status: status) : all
}
```

Assim `Order.with_status(nil).recent` continua válido.

---

## Scope ou método de classe

Os dois podem devolver `ActiveRecord::Relation` e participar do mesmo encadeamento.

Use scope quando:

- a cláusula é curta e declarativa;
- o nome descreve um subconjunto do model;
- há pouca ou nenhuma ramificação.

Use método de classe quando:

- existe validação ou normalização de argumentos;
- o fluxo de controle precisa de várias linhas;
- uma assinatura de método comunica melhor a API.

```ruby
class Order < ApplicationRecord
  def self.search_by_number(term)
    return all if term.blank?

    pattern = "%#{sanitize_sql_like(term)}%"
    where("number ILIKE ?", pattern)
  end
end
```

`sanitize_sql_like` escapa `%` e `_` fornecidos pelo usuário. O placeholder separa o valor da SQL.

**Na entrevista:**
> "Uso scope para relações pequenas e nomeadas. Se entrou ramificação ou transformação de entrada, prefiro método de classe ou Query Object."

---

## Composição com merge

**O que é:**
`merge` aplica as condições de uma relação em outra. Ele evita copiar uma regra que pertence ao model associado.

```ruby
class Customer < ApplicationRecord
  scope :active, -> { where(active: true, suspended_at: nil) }
end

class Order < ApplicationRecord
  belongs_to :customer

  scope :from_active_customers, -> {
    joins(:customer).merge(Customer.active)
  }
end
```

O join coloca a tabela associada na consulta; o `merge` leva as condições de `Customer.active` para ela.

```ruby
Order.from_active_customers.paid.order(created_at: :desc)
```

Evite duplicar `where(customers: { active: true })` em `Order`. Se a definição de cliente ativo mudar, a versão com `merge` acompanha a regra original.

---

## A armadilha do default_scope

**O que é:**
`default_scope` adiciona uma condição implicitamente às consultas do model.

```ruby
class Product < ApplicationRecord
  default_scope { where(archived_at: nil) }
end
```

Agora `Product.count`, `Product.find_by(sku: "ABC")` e consultas no console escondem arquivados sem mostrar essa decisão na chamada.

Condições do `default_scope` também podem participar da construção:

```ruby
class Article < ApplicationRecord
  default_scope { where(published: true) }
end

Article.new.published # true
```

Existe uma saída, mas ela também é perigosa:

```ruby
Product.unscoped.where(sku: "ABC")
```

`unscoped` remove o contexto de escopo. Em multi-tenant, soft delete ou autorização, você pode retirar uma proteção que deveria permanecer. Para remover só uma condição conhecida, `unscope(where: :archived_at)` é mais direcionado, mas depender disso em muitos lugares é um sinal ruim.

Prefira intenção explícita:

```ruby
class Product < ApplicationRecord
  scope :available, -> { where(archived_at: nil) }
end

Product.available.where(category: "books")
```

**Importante na entrevista:**
> "Evito `default_scope` porque ele altera toda consulta de forma invisível e incentiva `unscoped`. Um scope explícito deixa a regra visível e é mais seguro de manter."

---

## Quando extrair um Query Object

Scopes pequenos melhoram o vocabulário do model. Muitos filtros opcionais, joins e ordenações podem transformar model ou controller em uma lista difícil de testar.

Considere extrair quando:

- a mesma busca aparece em mais de um endpoint ou job;
- o controller conhece muitos detalhes da consulta;
- várias combinações de filtros precisam de teste;
- a consulta tem identidade própria, como busca administrativa de pedidos.

---

## Query Object em app/queries

**Exemplo prático:**
Crie `app/queries/orders/search.rb`:

```ruby
module Orders
  class Search
    def initialize(filters: {}, relation: Order.all)
      @filters = filters
      @relation = relation
    end

    def call
      relation
        .then { |scope| filter_status(scope) }
        .then { |scope| filter_customer(scope) }
        .then { |scope| filter_from(scope) }
    end

    private

    attr_reader :filters, :relation

    def filter_status(scope)
      return scope if filters[:status].blank?

      scope.where(status: filters[:status])
    end

    def filter_customer(scope)
      return scope if filters[:customer_id].blank?

      scope.where(customer_id: filters[:customer_id])
    end

    def filter_from(scope)
      return scope if filters[:from].blank?

      scope.where(created_at: filters[:from]..)
    end
  end
end
```

Em Rails 7.1, diretórios dentro de `app` entram normalmente no Zeitwerk (autoload do Rails). O caminho deve combinar com a constante: `orders/search.rb` define `Orders::Search`.

O controller cuida da apresentação e da paginação:

```ruby
def index
  @orders = Orders::Search
    .new(filters: search_filters.to_h.symbolize_keys)
    .call
    .includes(:customer)
    .order(created_at: :desc)
    .page(params[:page])
end
```

A relação inicial pode preservar um recorte anterior:

```ruby
base = current_account.orders.where(archived_at: nil)
orders = Orders::Search.new(filters: filters, relation: base).call
```

O Query Object não precisa descobrir o tenant. Ele apenas refina a relação segura recebida.

---

## Mantenha a saída chainable

**Pontos-chave:**

- receba ou crie uma relação;
- devolva a relação atual quando não houver filtro;
- não use `to_a`, `map`, `each`, `pluck` ou `load` dentro da busca;
- deixe `includes`, `order`, `limit` e paginação para o chamador quando não fizerem parte da regra.

```ruby
# RUIM: map transforma o resultado em Array.
def call
  relation.where(status: "paid").map(&:decorate)
end
```

Depois de materializar, o banco não pode mais aplicar `where` ou `limit`. O contrato desejado é: relação entrando, relação saindo.

---

## Na entrevista

> "Começo com scopes pequenos e explícitos. Uso `joins` com `merge` para compor regras de associações e evito `default_scope`. Quando a busca ganha muitos filtros, extraio um Query Object em `app/queries`. Injeto a relação base e devolvo `ActiveRecord::Relation`, sem materializar cedo, para preservar lazy loading, segurança do recorte e paginação no banco."

Se perguntarem por que não usar Array, destaque que filtrar, ordenar e limitar no banco evita trazer registros desnecessários para a memória.

---

## Recapitulando

- Scope é uma consulta nomeada e chainable.
- Lambda avalia valores e argumentos na chamada.
- Método de classe comporta lógica e normalização maiores.
- Filtro vazio deve devolver uma relação, não `nil`.
- `joins` com `merge` reutiliza a regra do model associado.
- `default_scope` esconde condições; `unscoped` pode remover proteção demais.
- Extraia um Query Object quando uma busca combinável crescer ou se repetir.
- Injete a relação base e materialize somente no limite da app.

---

## Exercícios práticos

### Exercício 1: Scope temporal

**Enunciado:** Corrija o scope para calcular o horário a cada chamada.

```ruby
cutoff = Time.current
scope :expired, -> { where(expires_at: ...cutoff) }
```

<details>
<summary>Solução</summary>

```ruby
scope :expired, -> { where(expires_at: ...Time.current) }
```

**Pontos-chave:**
- A lambda roda quando o scope é chamado.
- `where` mantém o resultado chainable.
</details>

### Exercício 2: Regra da associação

**Enunciado:** `Invoice` pertence a `Customer`. Escreva `Invoice.from_active_customers` reutilizando `Customer.active`.

<details>
<summary>Solução</summary>

```ruby
class Invoice < ApplicationRecord
  belongs_to :customer

  scope :from_active_customers, -> {
    joins(:customer).merge(Customer.active)
  }
end
```

**Pontos-chave:**
- O `joins` inclui a associação.
- O `merge` reaproveita a regra de `Customer`.
</details>

### Exercício 3: Query Object chainable

**Enunciado:** Corrija o método para ignorar valor vazio e permitir `order` e `limit` depois da chamada.

```ruby
def call
  Order.where(total_cents: minimum_cents..).to_a
end
```

<details>
<summary>Solução</summary>

```ruby
def call
  return relation if minimum_cents.blank?

  relation.where(total_cents: minimum_cents..)
end
```

`relation` pode ser recebida no `initialize`, com `Order.all` como default.

**Pontos-chave:**
- Sem `to_a`, a saída continua sendo `ActiveRecord::Relation`.
- O caso vazio devolve a relação original.
- A relação injetada pode preservar tenant ou autorização.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
