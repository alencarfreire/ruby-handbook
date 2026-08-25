# 7.2 Agregações

> **TL;DR**
> Agregações resumem várias linhas em um valor: `COUNT`, `SUM`, `AVG`, `MIN` e `MAX`. `GROUP BY` cria um resumo por grupo. `WHERE` filtra linhas antes da agregação; `HAVING` filtra os grupos depois. `COUNT(*)` conta linhas, enquanto `COUNT(coluna)` ignora `NULL`. No Active Record, você usa `count`, `sum` e `group`, mas ainda precisa entender o SQL gerado.

## Conteúdo

- [O que são agregações](#o-que-são-agregações)
- [COUNT](#count)
- [COUNT(*) vs COUNT(coluna)](#count-vs-countcoluna)
- [SUM e AVG](#sum-e-avg)
- [MIN e MAX](#min-e-max)
- [GROUP BY](#group-by)
- [WHERE vs HAVING](#where-vs-having)
- [Agregações no Active Record](#agregações-no-active-record)
- [Importante na entrevista](#importante-na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que são agregações

**O que é:**
Uma função de agregação recebe várias linhas e devolve um resumo.

Pense em uma tabela `orders`:

```text
id | status    | customer_id | total_cents | paid_at
---+-----------+-------------+-------------+--------------------
1  | paid      | 10          | 5000        | 2026-08-01 10:00
2  | pending   | 10          | 3000        | NULL
3  | paid      | 20          | 7000        | 2026-08-02 11:00
4  | cancelled | 30          | 2000        | NULL
```

Sem `GROUP BY`, todas as linhas filtradas formam um grupo:

```sql
SELECT COUNT(*) AS order_count
FROM orders;
-- 4
```

**Na entrevista:**
> "Agregação transforma um conjunto de linhas em um resumo. Sem `GROUP BY`, o conjunto inteiro é um grupo. Com `GROUP BY`, eu recebo um resumo para cada grupo."

---

## COUNT

**O que é:**
`COUNT` conta linhas ou valores, dependendo do argumento.

```sql
SELECT COUNT(*) AS paid_orders
FROM orders
WHERE status = 'paid';
```

Para contar clientes diferentes que fizeram pedido:

```sql
SELECT COUNT(DISTINCT customer_id) AS unique_customers
FROM orders;
```

`DISTINCT` remove repetições antes da contagem. Se o cliente `10` aparece em dois pedidos, ele conta uma vez.

**Na entrevista:**
> "Para quantidade de linhas eu uso `COUNT(*)`. Para entidades únicas, como clientes que compraram, uso `COUNT(DISTINCT customer_id)`."

---

## COUNT(*) vs COUNT(coluna)

**O que é:**
A diferença aparece quando a coluna aceita `NULL`:

- `COUNT(*)` conta todas as linhas.
- `COUNT(coluna)` conta apenas valores não nulos.
- `COUNT(DISTINCT coluna)` conta valores únicos e não nulos.

Na tabela de exemplo existem quatro pedidos, mas só dois têm `paid_at`:

```sql
SELECT
  COUNT(*) AS all_orders,
  COUNT(paid_at) AS orders_with_paid_at
FROM orders;
```

**Quando usar:**
Use `COUNT(*)` para contar linhas. Use `COUNT(coluna)` quando a presença daquele valor faz parte da pergunta.

**Na entrevista:**
> "`COUNT(*)` conta a linha mesmo que alguma coluna seja `NULL`. `COUNT(coluna)` ignora `NULL`."

---

## SUM e AVG

**O que é:**
`SUM` soma. `AVG` calcula a média. As duas funções ignoram `NULL`.

```sql
SELECT
  SUM(total_cents) AS revenue_cents,
  ROUND(AVG(total_cents), 2) AS average_ticket_cents
FROM orders
WHERE status = 'paid';
```

Com os dados de exemplo, a soma é `12000` e a média é `6000` centavos.

No PostgreSQL, `SUM` de um conjunto vazio devolve `NULL`, não zero. `COUNT` devolve zero.

```sql
SELECT COALESCE(SUM(total_cents), 0) AS revenue_cents
FROM orders
WHERE status = 'refunded';
```

`AVG(total_cents)` ignora valores nulos no numerador e no denominador. Não troque `NULL` por zero sem pensar: `AVG(COALESCE(total_cents, 0))` responde outra pergunta.

**Na entrevista:**
> "No PostgreSQL, `COUNT` de um conjunto vazio é zero, mas `SUM` é `NULL`. Se a regra exige zero, uso `COALESCE`."

---

## MIN e MAX

**O que é:**
`MIN` devolve o menor valor; `MAX`, o maior. Ambos ignoram `NULL`.

```sql
SELECT
  MIN(total_cents) AS smallest_order_cents,
  MAX(total_cents) AS largest_order_cents
FROM orders
WHERE status = 'paid';
```

**Importante na entrevista:**
`MAX(total_cents)` devolve o maior valor, não a linha inteira. Para buscar o pedido completo:

```sql
SELECT *
FROM orders
WHERE status = 'paid'
ORDER BY total_cents DESC
LIMIT 1;
```

---

## GROUP BY

**O que é:**
`GROUP BY` separa as linhas em grupos. A agregação roda uma vez para cada grupo.

```sql
SELECT status, COUNT(*) AS order_count
FROM orders
GROUP BY status;
```

```text
status    | order_count
----------+------------
paid      | 2
pending   | 1
cancelled | 1
```

No PostgreSQL, uma coluna no `SELECT` precisa estar no `GROUP BY` ou dentro de uma agregação.

```sql
-- Inválido: customer_id não define o grupo e não foi agregado
SELECT status, customer_id, COUNT(*)
FROM orders
GROUP BY status;
```

Você também pode agrupar por uma combinação:

```sql
SELECT customer_id, status, COUNT(*) AS order_count
FROM orders
GROUP BY customer_id, status;
```

Cada grupo agora representa um cliente e um status.

**Na entrevista:**
> "Se agrupo por status, posso selecionar status e `COUNT(*)`, mas não um `customer_id` arbitrário."

---

## WHERE vs HAVING

**O que é:**
Os dois filtram, mas atuam em momentos diferentes:

- `WHERE` filtra linhas antes do agrupamento.
- `HAVING` filtra grupos depois da agregação.

Para considerar só pedidos pagos e manter clientes com pelo menos dois:

```sql
SELECT
  customer_id,
  COUNT(*) AS paid_order_count,
  SUM(total_cents) AS revenue_cents
FROM orders
WHERE status = 'paid'
GROUP BY customer_id
HAVING COUNT(*) >= 2;
```

A ordem lógica relevante é `FROM`, `WHERE`, `GROUP BY`, agregações, `HAVING`, `SELECT` e `ORDER BY`.

`WHERE COUNT(*) >= 2` é inválido porque a contagem ainda não existe na etapa do `WHERE`.

**Na entrevista:**
> "`HAVING` vem depois do agrupamento na ordem lógica. Uso `WHERE` para condições sobre linhas e `HAVING` para condições sobre `COUNT`, `SUM` ou outra agregação do grupo."

---

## Agregações no Active Record

**O que é:**
O Active Record oferece métodos de cálculo. A conta acontece no PostgreSQL; o Rails recebe o resultado.

Sem grupo, o retorno é um valor:

```ruby
Order.count
Order.where(status: "paid").count
Order.where(status: "paid").sum(:total_cents)
```

`average`, `minimum` e `maximum` seguem a mesma ideia. Prefira esses cálculos a carregar registros e agregar em Ruby.

Com `group`, o Active Record devolve um `Hash`:

```ruby
Order.group(:status).count
# { "cancelled" => 1, "paid" => 2, "pending" => 1 }

Order.group(:status).sum(:total_cents)
# { "cancelled" => 2000, "paid" => 12000, "pending" => 3000 }
```

`where`, `group` e `having` podem ser combinados:

```ruby
Order
  .where(status: "paid")
  .group(:customer_id)
  .having("COUNT(*) >= ?", 2)
  .sum(:total_cents)
```

As variações de contagem mantêm a semântica do SQL:

```ruby
Order.count(:paid_at)                  # ignora NULL
Order.distinct.count(:customer_id)     # clientes únicos
```

Com `joins`, cuidado para não multiplicar linhas:

```ruby
Order.joins(:items).count
# Pode contar itens do join, não pedidos

Order.joins(:items).distinct.count(:id)
# Conta pedidos únicos
```

Não aplique `DISTINCT` no automático. Primeiro identifique o que cada linha representa depois do join.

**Na entrevista:**
> "`group(:status).count` deixa a agregação no banco e devolve um Hash. Se existe join, verifico se ele duplicou os pedidos antes de escolher `distinct`."

---

## Importante na entrevista

As pegadinhas mais comuns são semânticas:

1. `COUNT(*)` conta linhas; `COUNT(coluna)` ignora `NULL`.
2. `WHERE` filtra linhas antes de agrupar.
3. `HAVING` filtra grupos depois de agrupar.
4. Coluna selecionada precisa estar no `GROUP BY` ou ser agregada.
5. `SUM` de conjunto vazio é `NULL` no PostgreSQL.
6. Join pode duplicar a entidade que você pretendia contar.
7. `MAX(coluna)` devolve o valor máximo, não a linha completa.

Uma resposta curta para `HAVING`:

> "Uso `HAVING` quando a condição depende do grupo já calculado, como clientes com `COUNT(*) >= 5`. Se a condição é sobre cada pedido, como status pago, uso `WHERE` antes do `GROUP BY`."

---

## Recapitulando

- `COUNT` conta, `SUM` soma, `AVG` calcula média, `MIN` e `MAX` encontram extremos.
- Sem `GROUP BY`, todas as linhas filtradas formam um grupo.
- `GROUP BY` produz um resultado por grupo.
- `COUNT(*)` inclui todas as linhas; `COUNT(coluna)` ignora `NULL`.
- `COUNT(DISTINCT coluna)` conta valores únicos e não nulos.
- `WHERE` filtra linhas antes da agregação.
- `HAVING` filtra o resultado dos grupos.
- No Active Record, `group(:status).count` devolve um `Hash`.
- Prefira calcular no PostgreSQL em vez de carregar registros e agregar em Ruby.

---

## Exercícios práticos

### Exercício 1: Contagem de pagamentos

**Enunciado:** A tabela `orders` tem 100 linhas. Em 70 delas, `paid_at` tem uma data; nas demais, é `NULL`. Qual é o resultado de `COUNT(*)` e `COUNT(paid_at)`? Escreva a consulta.

<details>
<summary>Solução</summary>

```sql
SELECT
  COUNT(*) AS all_orders,
  COUNT(paid_at) AS paid_orders
FROM orders;
```

O resultado é `100` e `70`, respectivamente.

**Pontos-chave:**
- `COUNT(*)` conta linhas.
- `COUNT(paid_at)` ignora as 30 ocorrências de `NULL`.
</details>

### Exercício 2: WHERE ou HAVING?

**Enunciado:** Liste clientes que fizeram pelo menos três pedidos pagos e gastaram mais de R$ 500,00 nesses pedidos. Retorne cliente, quantidade e total em centavos.

<details>
<summary>Solução</summary>

```sql
SELECT
  customer_id,
  COUNT(*) AS order_count,
  SUM(total_cents) AS spent_cents
FROM orders
WHERE status = 'paid'
GROUP BY customer_id
HAVING COUNT(*) >= 3
   AND SUM(total_cents) > 50000;
```

**Pontos-chave:**
- `WHERE` remove pedidos não pagos antes dos grupos.
- `HAVING` verifica contagem e soma depois do agrupamento.
- R$ 500,00 vira `50000` centavos.
</details>

### Exercício 3: Active Record por status

**Enunciado:** Escreva Active Record para obter o total em centavos por status, considerando só pedidos criados a partir de 1º de agosto de 2026. Qual é o tipo do retorno?

<details>
<summary>Solução</summary>

```ruby
totals_by_status = Order
  .where(created_at: Time.zone.local(2026, 8, 1)..)
  .group(:status)
  .sum(:total_cents)
```

O retorno é um `Hash`: as chaves são os status e os valores são as somas.

```ruby
{ "paid" => 12000, "pending" => 3000 }
```

**Pontos-chave:**
- `where` filtra antes do agrupamento.
- `group(:status)` define os grupos.
- `sum(:total_cents)` executa a consulta.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
