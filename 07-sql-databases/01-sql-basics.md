# 7.1 SQL básico

> **TL;DR**
> SQL descreve o resultado que você quer. `SELECT` escolhe colunas, `WHERE` filtra linhas, `JOIN` combina tabelas, `ORDER BY` ordena e `LIMIT` corta o resultado. `INNER JOIN` exige correspondência; `LEFT JOIN` preserva a tabela da esquerda. `NULL` é ausência: use `IS NULL`, não `= NULL`. Active Record monta SQL, mas é o PostgreSQL que executa.

## Conteúdo

- [Modelo dos exemplos](#modelo-dos-exemplos)
- [SELECT e aliases](#select-e-aliases)
- [WHERE](#where)
- [NULL](#null)
- [INNER JOIN](#inner-join)
- [LEFT JOIN](#left-join)
- [ORDER BY e LIMIT](#order-by-e-limit)
- [Juntando as cláusulas](#juntando-as-cláusulas)
- [SQL e Active Record](#sql-e-active-record)
- [Importante na entrevista](#importante-na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Modelo dos exemplos

Vamos consultar três tabelas de uma loja:

| Tabela | Colunas usadas |
|---|---|
| `users` | `id`, `name`, `active`, `deleted_at`, `created_at` |
| `orders` | `id`, `user_id`, `status`, `total_cents`, `created_at` |
| `payments` | `id`, `order_id`, `paid_at` |

`orders.user_id` referencia `users.id`; `payments.order_id` referencia `orders.id`. Um usuário pode ter vários pedidos. Um pedido pode ter zero ou mais pagamentos.

---

## SELECT e aliases

**O que é:**
`SELECT` define as colunas do resultado. `FROM` define a origem das linhas.

```sql
SELECT id, name, created_at
FROM users;
```

`SELECT *` traz tudo. No código, prefira só o necessário. Também é possível selecionar expressões:

```sql
SELECT id, total_cents, total_cents / 100.0 AS total_reais
FROM orders;
```

`AS` cria um alias temporário para coluna, expressão ou tabela; não altera o schema.

```sql
SELECT u.name AS user_name, o.id AS order_id
FROM users AS u
INNER JOIN orders AS o ON o.user_id = u.id;
```

Qualificar `u.id` e `o.id` evita ambiguidade. No PostgreSQL, alias de saída pode aparecer no `ORDER BY`, mas não no `WHERE` do mesmo nível.

Active Record equivalente:

```ruby
Order.select(:id, :total_cents)
```

**Na entrevista:**
> "`SELECT` é a projeção: escolhe colunas ou expressões. Alias melhora a leitura e eu qualifico colunas quando há join."

---

## WHERE

**O que é:**
`WHERE` mantém apenas as linhas cuja condição é verdadeira.

```sql
SELECT id, status, total_cents
FROM orders
WHERE status = 'paid'
  AND total_cents >= 10000;
```

Operadores comuns são `IN`, `BETWEEN`, `<>` e `ILIKE` — este último ignora maiúsculas no PostgreSQL. Use parênteses ao misturar `AND` e `OR`:

```sql
WHERE active = true
  AND (name ILIKE 'ana%' OR name ILIKE 'bia%')
```

No Rails, faça bind dos valores. Nunca interpole entrada externa numa string SQL:

```ruby
Order.where(status: params[:status])
Order.where("total_cents >= ?", params[:minimum_cents])

# RUIM: permite SQL injection
Order.where("status = '#{params[:status]}'")
```

**Na entrevista:**
> "`WHERE` filtra linhas. Em Active Record eu uso hash ou placeholder para bindar params, não interpolação."

---

## NULL

**O que é:**
`NULL` representa valor ausente ou desconhecido. Não é zero, `false` nem string vazia.

`WHERE deleted_at = NULL` está errado. Use `IS NULL` ou `IS NOT NULL`:

```sql
SELECT id, name FROM users WHERE deleted_at IS NULL;
SELECT id, name FROM users WHERE deleted_at IS NOT NULL;
```

**Como funciona:**
SQL usa lógica de três valores: `true`, `false` e `unknown`. Uma comparação comum com `NULL` produz `unknown`; o `WHERE` mantém apenas `true`.

```sql
SELECT id
FROM payments
WHERE paid_at >= timestamp '2026-01-01 00:00:00';
```

Uma linha com `paid_at NULL` não entra.

No Active Record:

```ruby
User.where(deleted_at: nil)      # IS NULL
User.where.not(deleted_at: nil)  # IS NOT NULL
```

**Na entrevista:**
> "`NULL` é ausência. Eu uso `IS NULL`, nunca `= NULL`, e lembro da lógica de três valores."

---

## INNER JOIN

**O que é:**
`INNER JOIN` devolve somente linhas com correspondência nos dois lados.

```sql
SELECT u.name, o.id AS order_id, o.status
FROM users AS u
INNER JOIN orders AS o ON o.user_id = u.id;
```

Usuário sem pedido não aparece. Se um usuário tem três pedidos, aparecem três linhas. O join combina linhas; ele não deduplica a tabela pai.

O `ON` diz como as tabelas se relacionam. Você pode encadear joins:

```sql
SELECT u.name, o.id AS order_id, p.paid_at
FROM users AS u
INNER JOIN orders AS o ON o.user_id = u.id
INNER JOIN payments AS p ON p.order_id = o.id
WHERE p.paid_at IS NOT NULL;
```

**Na entrevista:**
> "`INNER JOIN` exige match. Em relação um-para-muitos, a linha lógica do pai pode se repetir."

---

## LEFT JOIN

**O que é:**
`LEFT JOIN` preserva todas as linhas da tabela à esquerda. Sem correspondência, as colunas da direita vêm como `NULL`.

Para encontrar usuários sem pedidos:

```sql
SELECT u.id, u.name
FROM users AS u
LEFT JOIN orders AS o ON o.user_id = u.id
WHERE o.id IS NULL;
```

**Importante na entrevista:**
Um filtro da tabela direita no `WHERE` pode eliminar as linhas sem match:

```sql
-- Usuários sem pedido são eliminados
SELECT u.name, o.id
FROM users AS u
LEFT JOIN orders AS o ON o.user_id = u.id
WHERE o.status = 'paid';
```

Para manter todos os usuários e juntar apenas pedidos pagos, filtre no `ON`:

```sql
SELECT u.name, o.id
FROM users AS u
LEFT JOIN orders AS o
  ON o.user_id = u.id
 AND o.status = 'paid';
```

**Na entrevista:**
> "`LEFT JOIN` mantém a esquerda. Filtro da direita no `WHERE` pode remover os `NULL`; se o filtro define o match, eu coloco no `ON`."

---

## ORDER BY e LIMIT

**O que é:**
`ORDER BY` define a ordem. `ASC` é crescente e `DESC` é decrescente. Sem essa cláusula, o banco não garante ordem.

```sql
SELECT id, status, created_at
FROM orders
ORDER BY created_at DESC, id DESC;
```

O segundo campo desempata pedidos com o mesmo `created_at`. No PostgreSQL, você também controla onde ficam os valores ausentes:

```sql
SELECT id, paid_at
FROM payments
ORDER BY paid_at DESC NULLS LAST;
```

`LIMIT` restringe a quantidade de linhas:

```sql
SELECT id, status, created_at
FROM orders
ORDER BY created_at DESC, id DESC
LIMIT 10;
```

`LIMIT 10` sem `ORDER BY` devolve até dez linhas, mas não promete quais. Active Record equivalente:

```ruby
Order.order(created_at: :desc, id: :desc).limit(10)
```

**Na entrevista:**
> "`LIMIT` corta quantidade, não ordena. Para um resultado previsível, combino com `ORDER BY` e um desempate."

---

## Juntando as cláusulas

```sql
SELECT
  u.id AS user_id,
  u.name AS user_name,
  o.id AS order_id,
  o.total_cents
FROM users AS u
INNER JOIN orders AS o ON o.user_id = u.id
WHERE u.active = true
  AND u.deleted_at IS NULL
  AND o.status = 'paid'
ORDER BY o.created_at DESC, o.id DESC
LIMIT 20;
```

Uma ordem lógica útil para ler essa consulta é:

```text
FROM / JOIN → WHERE → SELECT → ORDER BY → LIMIT
```

O otimizador do PostgreSQL pode escolher outra ordem física, desde que preserve o resultado.

---

## SQL e Active Record

Active Record compõe a consulta, mas o banco recebe SQL:

```ruby
orders = Order
  .joins(:user)
  .where(status: "paid", users: { active: true, deleted_at: nil })
  .select("orders.id, orders.total_cents, users.name AS user_name")
  .order(created_at: :desc, id: :desc)
  .limit(20)

puts orders.to_sql
```

O mapeamento mental é direto: `select`, `where`, `joins`, `left_joins`, `order` e `limit`. Leia o log e use `to_sql`: associações e scopes podem gerar uma consulta diferente da que você imaginou.

---

## Importante na entrevista

- `INNER JOIN` exige correspondência; `LEFT JOIN` preserva a esquerda.
- Um join um-para-muitos pode repetir dados do pai.
- `NULL` exige `IS NULL` ou `IS NOT NULL`.
- Sem `ORDER BY`, ordem por ID é coincidência, não contrato.
- Alias melhora a leitura, mas não cria coluna persistida.
- Entrada externa deve ser bindada, nunca interpolada.
- Active Record não elimina a necessidade de entender SQL.

---

## Recapitulando

- `SELECT` escolhe colunas e `FROM` escolhe a origem.
- `WHERE` mantém condições verdadeiras.
- `INNER JOIN` exige match; `LEFT JOIN` mantém a esquerda.
- Filtro no `ON` afeta o match; no `WHERE`, afeta o resultado combinado.
- `NULL` é ausência e participa de lógica de três valores.
- `ORDER BY` ordena; `LIMIT` restringe quantidade.
- Active Record ajuda a escrever, mas o PostgreSQL executa SQL.

---

## Exercícios práticos

### Exercício 1: Pedidos pagos recentes

**Enunciado:** Liste `id`, `total_cents` e `created_at` dos 10 pedidos pagos mais recentes. Desempate por `id`, também decrescente.

<details>
<summary>Solução</summary>

```sql
SELECT id, total_cents, created_at
FROM orders
WHERE status = 'paid'
ORDER BY created_at DESC, id DESC
LIMIT 10;
```

```ruby
Order.where(status: "paid")
     .select(:id, :total_cents, :created_at)
     .order(created_at: :desc, id: :desc)
     .limit(10)
```

**Pontos-chave:** filtro, ordem determinística e limite têm responsabilidades diferentes.
</details>

### Exercício 2: Usuários sem pedidos

**Enunciado:** Liste `id` e `name` dos usuários ativos que ainda não têm pedido.

<details>
<summary>Solução</summary>

```sql
SELECT u.id, u.name
FROM users AS u
LEFT JOIN orders AS o ON o.user_id = u.id
WHERE u.active = true
  AND o.id IS NULL
ORDER BY u.id ASC;
```

```ruby
User.left_joins(:orders)
    .where(active: true, orders: { id: nil })
    .select(:id, :name)
    .order(id: :asc)
```

**Pontos-chave:** o `LEFT JOIN` preserva usuários sem match; nesses casos, `o.id` é `NULL`.
</details>

### Exercício 3: Filtro no lugar certo

**Enunciado:** Liste todos os usuários e, quando existir, o `id` de cada pedido pago. Usuários sem pedido pago também devem aparecer.

<details>
<summary>Solução</summary>

```sql
SELECT u.id AS user_id, u.name, o.id AS paid_order_id
FROM users AS u
LEFT JOIN orders AS o
  ON o.user_id = u.id
 AND o.status = 'paid'
ORDER BY u.id ASC, o.id ASC;
```

O filtro de status fica no `ON`: ele escolhe quais pedidos dão match sem remover usuários. No `WHERE`, eliminaria as linhas em que `o.status` é `NULL`.

**Pontos-chave:** `ON` controla a correspondência; `WHERE` filtra o resultado combinado.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
