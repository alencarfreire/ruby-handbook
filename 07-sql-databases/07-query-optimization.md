# 7.7 Otimização de query

> **TL;DR**
> Otimizar começa medindo, não criando índice no escuro. No PostgreSQL, use `EXPLAIN ANALYZE` para comparar o plano estimado com o trabalho real. `Seq Scan` não é automaticamente ruim, e `Index Scan` não é automaticamente bom. Evite `SELECT *`, desconfie de paginação com `OFFSET` alto e use paginação por cursor quando a lista cresce. No Rails, `.to_sql` mostra o SQL e `.explain` pede o plano ao banco. Para tipos e ordem das colunas de um índice, volte ao [capítulo 7.3](./03-indexes.md).

## Conteúdo

- [EXPLAIN e EXPLAIN ANALYZE](#explain-e-explain-analyze)
- [Como ler um plano](#como-ler-um-plano)
- [Seq Scan vs Index Scan](#seq-scan-vs-index-scan)
- [O custo de SELECT *](#o-custo-de-select-)
- [A armadilha da paginação com OFFSET](#a-armadilha-da-paginação-com-offset)
- [to_sql e explain no Rails](#to_sql-e-explain-no-rails)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## EXPLAIN e EXPLAIN ANALYZE

**O que é:**
`EXPLAIN` mostra o plano que o PostgreSQL pretende usar. Ele não executa um `SELECT`.

```sql
EXPLAIN
SELECT id, email
FROM users
WHERE email = 'ana@example.com';
```

`EXPLAIN ANALYZE` executa a query e acrescenta tempos e quantidades reais ao plano.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, email
FROM users
WHERE email = 'ana@example.com';
```

`BUFFERS` ajuda a enxergar páginas encontradas no cache (`hit`) ou lidas (`read`). Para uma primeira conversa de entrevista, `EXPLAIN ANALYZE` já é o centro da resposta.

**Como funciona:**
O PostgreSQL estima custos com estatísticas da tabela. O planner compara caminhos possíveis e escolhe o que parece mais barato.

Um trecho simplificado pode ser assim:

```text
Index Scan using index_users_on_email on users
  (cost=0.42..8.44 rows=1 width=30)
  (actual time=0.031..0.032 rows=1 loops=1)
  Index Cond: (email = 'ana@example.com')
Planning Time: 0.210 ms
Execution Time: 0.061 ms
```

Aqui existem dois mundos:

- `cost` e o primeiro `rows`: estimativas do planner;
- `actual time`, o segundo `rows` e `loops`: o que aconteceu de verdade.

`cost` não está em milissegundos. É uma unidade interna usada para comparar planos. Para duração real, olhe `actual time` e `Execution Time`.

**Quando usar:**
Use `EXPLAIN` quando não quiser executar uma query pesada. Use `EXPLAIN ANALYZE` quando precisar validar o plano com números reais.

**Importante na entrevista:**
`EXPLAIN ANALYZE` executa a instrução. Em `UPDATE`, `DELETE` ou `INSERT`, ele altera dados de verdade se você não proteger a operação. Em produção, avalie impacto, locks e volume antes de rodar.

---

## Como ler um plano

**Como funciona:**
Leia o plano de dentro para fora. Os nós mais indentados alimentam os nós acima.

Procure primeiro:

1. um nó com tempo alto;
2. muitas linhas processadas para poucas linhas devolvidas;
3. estimativa de `rows` muito diferente do valor real;
4. `loops` alto;
5. sort ou hash usando mais dados do que o esperado;
6. `Rows Removed by Filter` alto.

Exemplo:

```text
Seq Scan on orders
  (cost=0.00..18420.00 rows=50 width=24)
  (actual time=0.040..91.300 rows=42 loops=1)
  Filter: (status = 'pending')
  Rows Removed by Filter: 799958
```

A query devolveu 42 linhas, mas testou cerca de 800 mil. Esse é um sinal para investigar seletividade e índice.

Uma diferença grande entre linhas estimadas e reais também importa. Estatísticas desatualizadas ou colunas correlacionadas podem fazer o planner escolher um acesso ou join inadequado.

**Na entrevista:**
> “Eu comparo estimado e real. Se a diferença é grande, o planner pode escolher um join ou acesso inadequado. Também olho linhas removidas, loops e o nó que concentra tempo.”

---

## Seq Scan vs Index Scan

**O que é:**
`Seq Scan` percorre a tabela sequencialmente. `Index Scan` navega pelo índice e busca as linhas correspondentes na tabela.

Você também pode encontrar:

- `Index Only Scan`: tenta responder pelo índice;
- `Bitmap Index Scan`: encontra posições no índice;
- `Bitmap Heap Scan`: busca em lote as páginas da tabela.

**Como funciona:**
Um índice tem custo. O banco navega pela estrutura e, em um `Index Scan`, normalmente acessa páginas da tabela. Se o filtro devolve grande parte das linhas, ler a tabela em sequência pode ser mais barato.

```sql
SELECT id
FROM orders
WHERE status = 'completed';
```

Se 85% dos pedidos estão como `completed`, um índice simples em `status` pode não ajudar. O filtro tem baixa seletividade.

Agora compare:

```sql
SELECT id
FROM orders
WHERE external_id = 'ord_9f3a2';
```

Se `external_id` é quase único, o índice tende a evitar a leitura da tabela inteira.

**Quando usar:**
Índice costuma ajudar em filtros seletivos, joins, ordenações e buscas que combinam com sua estrutura. Ele também custa espaço e trabalho em escrita.

Os tipos de índice, índices compostos, parciais e a ordem das colunas estão no [capítulo 7.3 — Índices](./03-indexes.md).

**Na entrevista:**
> “Seq Scan não significa plano ruim. Para tabela pequena ou filtro que retorna boa parte dela, ele pode ser a melhor escolha. Eu avalio volume, seletividade e tempo real.”

---

## O custo de SELECT *

**O que é:**
`SELECT *` pede todas as colunas, mesmo quando a tela usa duas.

```sql
-- Evite se a lista usa apenas id e title
SELECT *
FROM posts
WHERE published = true;

-- Peça o necessário
SELECT id, title
FROM posts
WHERE published = true;
```

**Como funciona:**
Colunas extras aumentam tráfego entre PostgreSQL e Rails, memória para materializar objetos e trabalho de serialização. Colunas largas, como `text`, `jsonb` e payloads, tornam o desperdício mais visível.

Pedir menos colunas também pode permitir um `Index Only Scan` quando o índice contém tudo que a query precisa. Esse índice é chamado de **covering index**.

No PostgreSQL, `INCLUDE` pode cobrir a leitura sem transformar toda coluna em chave: `CREATE INDEX ON orders (customer_id) INCLUDE (total_cents);`. “Index only” não promete zero acesso à tabela, porque a checagem de visibilidade pode visitar o heap. Meça antes: índices maiores custam disco, cache e escrita. Veja tipos e composição no [capítulo 7.3](./03-indexes.md).

No Active Record:

```ruby
posts = Post
  .where(published: true)
  .select(:id, :title)
```

Tenha cuidado: isso ainda cria objetos `Post`, mas parcialmente carregados. Acessar uma coluna não selecionada pode gerar `ActiveModel::MissingAttributeError`.

Quando você quer valores simples, `pluck` evita instanciar models:

```ruby
pairs = Post
  .where(published: true)
  .pluck(:id, :title)
```

**Na entrevista:**
> “Eu não trato `SELECT *` como detalhe. Menos colunas reduzem I/O, rede e memória, e podem abrir espaço para um index-only scan.”

---

## A armadilha da paginação com OFFSET

**O que é:**
Paginação com `OFFSET` pula linhas antes de devolver a página.

```sql
SELECT id, created_at
FROM orders
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 200000;
```

**Como funciona:**
O banco não teleporta para a linha 200.001. Ele precisa localizar e descartar as linhas anteriores. Quanto maior o `OFFSET`, maior tende a ser o trabalho.

Também há um problema de consistência. Se pedidos entram ou saem entre duas requisições, uma linha pode aparecer de novo ou ser pulada.

Para feeds e listas grandes, prefira paginação por cursor, também chamada keyset pagination:

```sql
SELECT id, created_at
FROM orders
WHERE (created_at, id) < ('2026-08-25 14:30:00', 98765)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

O último `created_at` e `id` da página atual viram o cursor da próxima. O `id` desempata datas iguais e deixa a ordem determinística.

Um índice alinhado ajuda:

```sql
CREATE INDEX index_orders_on_created_at_and_id
ON orders (created_at DESC, id DESC);
```

No Rails, a ideia fica explícita:

```ruby
orders = Order
  .where("(created_at, id) < (?, ?)", cursor_time, cursor_id)
  .order(created_at: :desc, id: :desc)
  .limit(20)
```

**Quando usar:**
`OFFSET` é simples e aceitável para conjuntos pequenos, páginas rasas ou uma interface que realmente precisa ir à página 12. Keyset é melhor para scroll contínuo, feed e tabelas grandes.

**Na entrevista:**
> “OFFSET alto é O(n) no que foi pulado. Eu uso cursor com uma ordenação estável, normalmente `created_at` mais `id`, e crio um índice compatível.”

---

## to_sql e explain no Rails

**O que é:**
`to_sql` mostra o SQL de uma `ActiveRecord::Relation` sem carregar os registros.

```ruby
relation = Order
  .where(status: "pending")
  .order(created_at: :desc)
  .limit(20)

puts relation.to_sql
```

Isso revela `SELECT *`, joins e condições geradas pelo Active Record. Mas SQL legível não prova que a query é rápida.

`.explain` pede ao adapter o plano do banco:

```ruby
puts relation.explain
```

Com PostgreSQL e uma versão do Rails que aceita opções:

```ruby
puts relation.explain(:analyze, :buffers)
```

**Como funciona:**
`to_sql` é diagnóstico no lado do Rails. `.explain` consulta o PostgreSQL. Com `:analyze`, a query é executada, então valem os mesmos cuidados de `EXPLAIN ANALYZE`.

Relações com eager loading podem executar queries auxiliares para explicar o conjunto completo. Não presuma que `.explain` é sempre uma operação puramente local.

Você também pode copiar o SQL para `psql` e testar diretamente:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT ...;
```

**Na entrevista:**
> “No Rails eu começo com `relation.to_sql` para ver o que o Active Record gerou. Depois uso `.explain` ou levo o SQL ao PostgreSQL. Com analyze, lembro que a query roda.”

---

## Recapitulando

- Otimização começa com medição e SQL real.
- `EXPLAIN` estima; `EXPLAIN ANALYZE` executa e mede.
- `cost` não é tempo em milissegundos.
- Compare `rows` estimado com `actual rows`.
- Leia o plano dos nós internos para os externos.
- `Seq Scan` pode ser correto para tabela pequena ou filtro pouco seletivo.
- `Index Scan` também tem custo e não garante uma query rápida.
- `SELECT *` aumenta I/O, rede e memória.
- Covering index pode permitir `Index Only Scan`, mas aumenta custo de escrita.
- `OFFSET` alto lê e descarta muitas linhas.
- Keyset pagination usa o último valor como cursor e exige ordem estável.
- `.to_sql` mostra o SQL; `.explain` mostra o plano.
- Tipos e composição de índices ficam no [capítulo 7.3](./03-indexes.md).

---

## Exercícios práticos

### Exercício 1: Interpretando um plano

**Enunciado:** Leia o plano e explique o principal sinal de desperdício. Você criaria um índice sem investigar mais nada?

```text
Seq Scan on payments
  (actual time=0.025..145.000 rows=18 loops=1)
  Filter: (external_id = 'pay_123')
  Rows Removed by Filter: 1499982
Execution Time: 145.080 ms
```

<details>
<summary>Solução</summary>

O PostgreSQL testou cerca de 1,5 milhão de linhas para devolver 18. Como `external_id` parece seletivo, um índice nessa coluna é candidato forte.

Antes de criar, confirme distribuição, tipos das comparações, frequência da query e índices existentes. Depois compare `EXPLAIN ANALYZE` antes e depois.

**Pontos-chave:**
- `Rows Removed by Filter` está muito alto
- Seq Scan não é ruim por definição, mas aqui há desperdício claro
- Índice é hipótese até ser medido
</details>

### Exercício 2: Removendo SELECT *

**Enunciado:** Uma API devolve apenas `id`, `title` e `published_at`, mas a tabela `posts` também tem um `body` grande em `text`. Reescreva a relation para evitar carregar tudo. Mostre uma opção com models e outra sem instanciar models.

<details>
<summary>Solução</summary>

Com models parcialmente carregados:

```ruby
posts = Post
  .where(published: true)
  .select(:id, :title, :published_at)
```

Sem instanciar `Post`:

```ruby
rows = Post
  .where(published: true)
  .pluck(:id, :title, :published_at)
```

**Pontos-chave:**
- `select` devolve models, mas só com as colunas pedidas
- `pluck` devolve valores e evita instanciar models
- Menos colunas reduzem transferência e memória
</details>

### Exercício 3: Trocando OFFSET por cursor

**Enunciado:** Reescreva a paginação abaixo usando `created_at` e `id` como cursor. Explique por que as duas colunas são necessárias.

```ruby
Order
  .order(created_at: :desc)
  .offset(100_000)
  .limit(25)
```

<details>
<summary>Solução</summary>

```ruby
Order
  .where("(created_at, id) < (?, ?)", cursor_time, cursor_id)
  .order(created_at: :desc, id: :desc)
  .limit(25)
```

`created_at` sozinho pode empatar. O `id` cria uma ordem total e impede que linhas com a mesma data sejam puladas ou repetidas por causa do cursor.

**Pontos-chave:**
- Cursor evita descartar 100 mil linhas em toda requisição
- A ordenação precisa ser determinística
- O índice deve acompanhar a ordenação da query
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
