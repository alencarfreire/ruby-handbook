# 6.3 Query interface

> **TL;DR**
> `where`, `order`, `limit` e `select` normalmente devolvem um `ActiveRecord::Relation`. A consulta é lazy: você monta SQL em etapas e o banco só é acessado quando o resultado precisa ser carregado. Use `find` para chave primária com exceção se não existir, `find_by` para um registro ou `nil` e `where` para continuar compondo. Prefira `pluck` quando só precisa de colunas, `exists?` para perguntar se há registro e `find_each` para lotes. Componha relações com `merge`, `where.not` e `or`. Valor externo entra por bind ou Hash; nome de coluna e direção de ordenação exigem allowlist.

## Conteúdo

- [Relation e execução lazy](#relation-e-execução-lazy)
- [where, order, limit e select](#where-order-limit-e-select)
- [find vs find_by vs where](#find-vs-find_by-vs-where)
- [pluck vs map](#pluck-vs-map)
- [exists?](#exists)
- [find_each](#find_each)
- [merge](#merge)
- [where.not](#wherenot)
- [or](#or)
- [Sanitização e entrada externa](#sanitização-e-entrada-externa)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Relation e execução lazy

**O que é:**
`ActiveRecord::Relation` representa uma consulta que ainda pode ser alterada. Ela não é um Array, embora responda a vários métodos de coleção depois de carregar os registros.

**Como funciona:**
Cada chamada devolve outra relação. O Active Record guarda as partes da consulta até precisar executar o SQL.

```ruby
orders = Order.where(status: "paid")
orders = orders.order(created_at: :desc)
orders = orders.limit(10)

orders.to_sql # mostra o SQL; não busca os pedidos
orders.to_a   # executa a consulta e devolve um Array
```

Métodos como `each`, `map`, `to_a`, `load` e vários métodos de busca materializam ou consultam a relação. Uma relação carregada guarda os registros em memória. No console, até inspecioná-la pode disparar uma consulta para exibir resultados.

**Na entrevista:**
> "Uma Relation é lazy e composable. `where` não traz todos os registros para filtrar em Ruby; ele acrescenta uma cláusula ao SQL. A consulta roda quando eu consumo o resultado."

---

## where, order, limit e select

**O que é:**
Esses métodos cobrem o caminho principal de uma consulta: filtrar linhas, ordenar, limitar quantidade e escolher colunas.

**Como funciona:**

```ruby
orders = Order
  .where(status: "paid", currency: "BRL")
  .order(created_at: :desc)
  .limit(20)
  .select(:id, :customer_id, :total_cents, :created_at)
```

O Hash em `where` gera igualdade, `IN` para Arrays e `IS NULL` para `nil`. O Active Record faz bind dos valores.

Para operadores, use placeholders:

```ruby
Order.where("total_cents >= ?", 10_000)
Order.where("created_at >= ?", 30.days.ago)
Order.where("status = ? AND currency = ?", "paid", "BRL")
```

`order` aceita Hash e pode combinar mais de uma coluna: `Order.order(created_at: :desc, id: :desc)`. `limit` gera `LIMIT`, diferente de carregar tudo e cortar um Array em Ruby.

`select` reduz as colunas retornadas, mas continua instanciando models:

```ruby
order = Order.select(:id, :total_cents).first
order.total_cents # disponível
order.status      # pode gerar ActiveModel::MissingAttributeError
```

Use `select` com cuidado quando o model será passado para outras camadas. Um objeto parcial parece um `Order`, mas não tem todos os atributos carregados.

**Na entrevista:**
> "Eu empurro filtro, ordenação, limite e projeção para o banco. Só lembro que `select` ainda cria models parciais; se quero apenas valores, considero `pluck`."

---

## find vs find_by vs where

**O que é:**
Os três procuram registros, mas têm contratos diferentes.

| Método | Procura | Retorno quando encontra | Quando não encontra |
|---|---|---|---|
| `find` | chave primária | model | levanta `ActiveRecord::RecordNotFound` |
| `find_by` | primeira linha do filtro | model | `nil` |
| `where` | conjunto filtrado | `Relation` | relação vazia |

**Como funciona:**

```ruby
Order.find(42)
# SELECT ... WHERE "orders"."id" = 42 LIMIT 1

Order.find_by(reference: "PED-2026-0042")
# Order ou nil

Order.where(status: "pending")
# ActiveRecord::Relation, inclusive se não houver linhas
```

`find` também aceita uma lista de IDs e exige encontrar todos. Use `find_by!` quando o filtro não é a chave primária, mas ausência ainda é erro.

Sem `order`, o “primeiro” de `find_by` não representa uma regra de negócio estável. Se a ordem importa, declare:

```ruby
Order.order(created_at: :desc).find_by(customer_id: customer.id)
```

Evite buscar com `where(...).first` quando `find_by` expressa melhor a intenção. Prefira `where` quando vai encadear mais condições ou trabalhar com vários registros.

**Na entrevista:**
> "`find` é chave primária e falha com exceção. `find_by` devolve um model ou nil. `where` sempre devolve Relation e mantém a consulta composable."

---

## pluck vs map

**O que é:**
`pluck` lê colunas diretamente do resultado SQL. `map` é Ruby: ele percorre objetos que a relação carregou.

```ruby
Order.where(status: "paid").pluck(:id)
# [3, 8, 13]

Order.where(status: "paid").map(&:id)
# instancia cada Order e então lê id
```

Para mais de uma coluna, `pluck(:id, :total_cents)` devolve Arrays como `[[3, 1590], [8, 4200]]`.

**Quando usar:**
Use `pluck` quando só precisa de valores persistidos. Você economiza instanciação de models e callbacks de leitura não entram na operação.

Use `map` quando o cálculo depende de comportamento Ruby do objeto:

```ruby
Order.where(status: "paid").map(&:formatted_total)
```

**Na entrevista:**
> "Para uma coluna do banco, uso `pluck`; ele não instancia um model por linha. Para chamar método do domínio, uso `map`, porque preciso dos objetos."

---

## exists?

**O que é:**
`exists?` responde se pelo menos uma linha atende à condição. O banco pode parar no primeiro resultado.

```ruby
Order.where(customer_id: customer.id, status: "pending").exists?
# true ou false
```

Não carregue uma coleção só para perguntar se existe:

```ruby
# Evite: pode materializar registros
Order.where(status: "pending").to_a.any?

# Prefira
Order.where(status: "pending").exists?
```

---

## find_each

**O que é:**
`find_each` processa muitos registros em lotes. Evita manter a tabela inteira em memória.

```ruby
Order.where(status: "pending").find_each(batch_size: 500) do |order|
  OrderProcessor.call(order)
end
```

Por padrão, o Active Record percorre pelo cursor da chave primária em ordem crescente. Uma ordenação comum da relação não deve ser usada para prometer a ordem de processamento; `find_each` controla a ordem dos lotes.

Você pode delimitar a execução com `start:` e `finish:`. `find_each` é indicado para manutenção, migração de dados e processamento offline. Ele reduz memória; não torna a operação interna automaticamente rápida, idempotente ou transacional.

**Na entrevista:**
> "Para milhões de linhas eu não uso `all.each`. Uso `find_each` com batch size, aceito a ordem de cursor e projeto o processamento para poder repetir sem corromper dados."

---

## merge

**O que é:**
`merge` combina as condições de outra relação. É útil quando o filtro pertence ao model relacionado ou já foi construído separadamente.

```ruby
active_customers = Customer.where(active: true, country: "BR")

orders = Order
  .joins(:customer)
  .where(status: "paid")
  .merge(active_customers)
```

`merge` não executa a relação recebida. Ele combina partes compatíveis da consulta e mantém o resultado como `Relation`.

---

## where.not

**O que é:**
`where.not` nega condições e gera SQL como `!=` ou `NOT IN`, conforme o valor.

```ruby
Order.where.not(status: "cancelled")
Order.where.not(status: ["cancelled", "refunded"])
Order.where.not(processed_at: nil)
```

O último exemplo procura `processed_at IS NOT NULL`.

**Importante na entrevista:**
SQL trabalha com lógica de três valores. Se a coluna aceita `NULL`, `where.not(status: "cancelled")` não inclui automaticamente linhas cujo status é `NULL`.

Se `NULL` também significa “não cancelado” no seu domínio, escreva essa regra explicitamente:

```ruby
Order.where.not(status: "cancelled").or(Order.where(status: nil))
```

---

## or

**O que é:**
`or` junta duas relações com `OR` sem abandonar a API de consulta.

As relações precisam ser estruturalmente compatíveis: mesmo model e mesma estrutura principal, diferindo nas condições que serão ligadas por `OR`.

```ruby
base = Order.where(currency: "BRL")

base
  .where(status: "pending")
  .or(base.where(status: "processing"))
```

Agrupe mentalmente a expressão. Misturar `where` e `or` sem uma base clara pode produzir SQL válido, mas uma regra diferente da esperada. Use `to_sql` e testes para conferir consultas importantes.

---

## Sanitização e entrada externa

**O que é:**
Sanitizar aqui significa impedir que entrada externa vire estrutura SQL. Valores devem ser enviados por Hash ou placeholders, não por interpolação.

```ruby
# RUIM — permite SQL injection
Order.where("reference = '#{params[:reference]}'")

# BOM — bind parameter
Order.where("reference = ?", params[:reference])

# BOM — Hash
Order.where(reference: params[:reference])
```

Bind protege **valores**. Ele não transforma nome de coluna, tabela, operador ou direção em parâmetro SQL. Para essas partes, use allowlist:

```ruby
SORT_COLUMNS = {
  "created_at" => :created_at,
  "total" => :total_cents
}.freeze

column = SORT_COLUMNS.fetch(params[:sort], :created_at)
direction = params[:direction] == "asc" ? :asc : :desc

Order.order(column => direction)
```

Em busca com `LIKE`, `%` e `_` são curingas. Escape a entrada com `sanitize_sql_like` e ainda use bind:

```ruby
term = ActiveRecord::Base.sanitize_sql_like(params[:query].to_s)
Customer.where("name LIKE ?", "%#{term}%")
```

O escape de `LIKE` resolve curingas, enquanto o placeholder resolve a passagem segura do valor. O Rails também oferece `sanitize_sql_array` quando uma API exige um fragmento pronto, mas Hash e binds são preferíveis na consulta normal. `Arel.sql` não sanitiza: só marca uma string como SQL conhecido. Nunca passe entrada externa a ele.

**Na entrevista:**
> "Valor externo vai em bind ou Hash. Para coluna e direção, bind não serve; uso allowlist. Em LIKE, escapo `%` e `_` com `sanitize_sql_like` e continuo usando placeholder."

---

## Recapitulando

- `ActiveRecord::Relation` é lazy e pode ser composta antes de executar SQL.
- `where`, `order`, `limit` e `select` mantêm a consulta no banco.
- `find` busca chave primária e levanta exceção; `find_by` devolve model ou `nil`; `where` devolve `Relation`.
- `pluck` traz valores sem instanciar models; `map` trabalha com objetos Ruby.
- `exists?` responde existência sem carregar uma coleção inteira.
- `find_each` percorre grandes conjuntos em lotes e controla a ordem por cursor.
- `merge` combina relações; `where.not` nega condições; `or` exige relações estruturalmente compatíveis.
- Valores externos entram por Hash ou bind. Estrutura SQL dinâmica exige allowlist.
- `sanitize_sql_like` escapa curingas de `LIKE`; `Arel.sql` não é sanitizador.

---

## Exercícios práticos

### Exercício 1: Escolha a busca certa

**Enunciado:** Você precisa implementar três operações: abrir um pedido por ID e responder 404 se ele não existir; buscar opcionalmente um cliente por e-mail; montar uma lista de pedidos pendentes que ainda receberá ordenação e limite. Escolha entre `find`, `find_by` e `where`.

<details>
<summary>Solução</summary>

```ruby
order = Order.find(params[:id])
customer = Customer.find_by(email: params[:email])
pending_orders = Order.where(status: "pending")
  .order(created_at: :asc)
  .limit(100)
```

Em um controller Rails, `ActiveRecord::RecordNotFound` pode ser convertido em 404. O cliente é opcional, então `nil` faz parte do contrato. A lista começa com `where` para continuar composable.

**Pontos-chave:**
- `find`: chave primária e exceção
- `find_by`: um registro ou `nil`
- `where`: relação para compor
</details>

### Exercício 2: Reduza memória e consultas desnecessárias

**Enunciado:** Obtenha apenas os IDs pagos, verifique se há pedidos pendentes e processe pedidos antigos sem carregar tudo de uma vez.

<details>
<summary>Solução</summary>

```ruby
ids = Order.where(status: "paid").pluck(:id)
has_pending = Order.where(status: "pending").exists?

Order.where("created_at < ?", 1.year.ago).find_each(batch_size: 500) do |order|
  ArchiveOrder.call(order)
end
```

**Pontos-chave:**
- `pluck` evita instanciar models para obter uma coluna
- `exists?` responde um booleano com intenção clara
- `find_each` limita o uso de memória
- O processamento deve tolerar retry se fizer parte de uma rotina operacional
</details>

### Exercício 3: Ordenação e busca seguras

**Enunciado:** Implemente uma busca de clientes por nome e aceite ordenação externa por `name` ou `created_at`, em `asc` ou `desc`. Não permita SQL arbitrário.

<details>
<summary>Solução</summary>

```ruby
columns = {
  "name" => :name,
  "created_at" => :created_at
}.freeze

column = columns.fetch(params[:sort], :created_at)
direction = %w[asc desc].include?(params[:direction]) ? params[:direction] : "desc"
term = ActiveRecord::Base.sanitize_sql_like(params[:query].to_s)

customers = Customer
  .where("name LIKE ?", "%#{term}%")
  .order(column => direction)
  .limit(50)
```

O termo continua em bind mesmo depois do escape de curingas. Coluna e direção passam por allowlist porque não podem ser bind parameters.

**Pontos-chave:**
- Bind para valor
- `sanitize_sql_like` para `%` e `_`
- Allowlist para estrutura SQL
- Limite aplicado no banco
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
