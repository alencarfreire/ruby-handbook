# 7.6 N+1 no banco

> **TL;DR**
> N+1 é o formato de acesso em que uma query busca N registros e outras N queries buscam dados relacionados: 1 + N `SELECT`s. O PostgreSQL não enxerga “uma associação Rails”; ele recebe comandos separados, paga round trip, planejamento e execução para cada um. Você confirma o problema nos logs contando queries repetidas e usa `EXPLAIN (ANALYZE, BUFFERS)` para entender o custo de cada formato. A correção costuma transformar 1 + N em duas queries com `IN (...)` ou em uma query com `JOIN`. Duas queries evitam duplicar as colunas do pai; `JOIN` reduz round trips, mas multiplica linhas. As APIs `includes`, `preload` e `eager_load` ficam no [capítulo 6.5](../06-active-record/05-n-plus-one.md); aqui o foco é diagnosticar o SQL.

## Conteúdo

- [O formato 1 + N](#o-formato-1--n)
- [O que o PostgreSQL vê](#o-que-o-postgresql-vê)
- [Diagnóstico pelos logs](#diagnóstico-pelos-logs)
- [Duas queries com IN](#duas-queries-com-in)
- [Uma query com JOIN](#uma-query-com-join)
- [JOIN ou duas queries](#join-ou-duas-queries)
- [Lendo EXPLAIN](#lendo-explain)
- [Por que includes existe](#por-que-includes-existe)
- [Armadilhas de diagnóstico](#armadilhas-de-diagnóstico)
- [Na entrevista](#na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O formato 1 + N

**O que é:**
N+1 não é uma query lenta isolada. É um padrão de várias queries.

Imagine uma tela com 20 posts e o nome do autor de cada post. Primeiro vem a lista:

```sql
SELECT posts.*
FROM posts
ORDER BY posts.created_at DESC
LIMIT 20;
```

Depois, para cada post, a app pede o autor:

```sql
SELECT users.* FROM users WHERE users.id = 42 LIMIT 1;
SELECT users.* FROM users WHERE users.id = 17 LIMIT 1;
SELECT users.* FROM users WHERE users.id = 93 LIMIT 1;
-- mais 17 SELECTs
```

São 21 queries: uma para os posts e 20 para os autores.

O N vem do tamanho do resultado inicial. Se a página passar de 20 para 100 posts, o total passa de 21 para 101 queries.

Essa relação linear é a pista principal:

```text
queries totais = 1 + quantidade de registros pais
```

O mesmo ocorre em `has_many`: a app repete `SELECT comments.* FROM comments WHERE comments.post_id = ?`. O número de comentários não define N; o que define é quantas vezes ela consulta a associação.

**Importante na entrevista:**
Uma página com poucos registros pode esconder o problema. Com dois posts, três queries parecem baratas. Com 200 posts, a mesma forma vira 201 queries.

---

## O que o PostgreSQL vê

**Como funciona:**
O banco não sabe que o Ruby está dentro de um `each`. Ele recebe comandos independentes pela conexão.

Para cada comando, existe custo de rede, uso da conexão, planejamento, execução e devolução do resultado.

Uma query de 0,4 ms parece rápida. Cem queries de 0,4 ms já somam 40 ms só de execução reportada. Ainda faltam rede, espera por conexão e trabalho da app.

No log, o SQL costuma ter a mesma forma e mudar só o parâmetro:

```sql
SELECT users.* FROM users WHERE users.id = $1 LIMIT $2;
```

Para o PostgreSQL, são várias execuções dessa instrução. Ele não junta automaticamente IDs recebidos em momentos diferentes para fabricar um `IN` ou um `JOIN`.

No `pg_stat_statements`, a instrução normalizada pode aparecer com `calls` alto. É uma pista, não prova: as chamadas podem vir de muitos requests legítimos. Correlacione com endpoint e janela de tempo.

---

## Diagnóstico pelos logs

**Exemplo prático:**
Considere este código:

```ruby
posts = Post.order(created_at: :desc).limit(3)

posts.each do |post|
  puts post.author.name
end
```

Um log simplificado mostra:

```text
Post Load (1.2ms)  SELECT "posts".* FROM "posts"
                   ORDER BY "posts"."created_at" DESC LIMIT $1

User Load (0.5ms)  SELECT "users".* FROM "users"
                   WHERE "users"."id" = $1 LIMIT $2  [["id", 42]]
User Load (0.4ms)  SELECT "users".* FROM "users"
                   WHERE "users"."id" = $1 LIMIT $2  [["id", 17]]
User Load (0.4ms)  SELECT "users".* FROM "users"
                   WHERE "users"."id" = $1 LIMIT $2  [["id", 93]]
```

Procure três sinais:

1. uma query inicial que retorna uma coleção;
2. outra forma de `SELECT` repetida logo depois;
3. só o valor da chave muda entre as repetições.

Não olhe apenas o tempo da linha mais lenta. N+1 pode ser um conjunto de queries individualmente rápidas.

Em development, `verbose_query_logs` ajuda a ligar SQL à linha Ruby que disparou a consulta:

```ruby
# config/environments/development.rb
config.active_record.verbose_query_logs = true
```

O ponto importante é a origem. A query pode nascer na view, em um serializer ou em um helper, mesmo que a coleção tenha sido criada no controller.

Para medir, mantenha o request e varie o tamanho da coleção. Se 10, 20 e 50 posts geram 11, 21 e 51 queries, o diagnóstico fica forte.

---

## Duas queries com IN

**Como funciona:**
Uma forma de remover o crescimento linear é buscar pais e filhos em lote.

```sql
SELECT posts.*
FROM posts
ORDER BY posts.created_at DESC
LIMIT 20;
```

Depois, uma única query usa as chaves dos pais:

```sql
SELECT comments.*
FROM comments
WHERE comments.post_id IN (101, 102, 103, 104, 105);
```

Agora a quantidade de queries é fixa: duas, não 1 + N.

A app recebe dois conjuntos e associa cada comentário ao post pelo `post_id`. O banco não devolve um objeto Rails montado. Ele devolve linhas.

Esse formato tem vantagens:

- não repete todas as colunas de `posts` para cada comentário;
- preserva com clareza o `LIMIT` aplicado aos posts;
- evita a multiplicação de linhas do `JOIN`.

O índice relevante no lado filho costuma ser:

```sql
CREATE INDEX index_comments_on_post_id ON comments (post_id);
```

O custo não vira zero. Uma lista enorme de IDs e uma associação gigante ainda podem consumir memória e transferir muitas linhas. A diferença é que o número de round trips deixa de acompanhar cada pai.

---

## Uma query com JOIN

**Como funciona:**
Outra forma é pedir pais e filhos em uma instrução:

```sql
SELECT posts.*, comments.*
FROM posts
LEFT OUTER JOIN comments
  ON comments.post_id = posts.id
WHERE posts.published = TRUE;
```

Isso reduz o acesso a um round trip. Também permite filtrar ou ordenar por colunas da tabela associada.

Mas o resultado é tabular. Se um post tem três comentários, as colunas desse post aparecem três vezes. Um post sem comentários aparece uma vez, com colunas de comentário em `NULL`.

O `LEFT OUTER JOIN` mantém o post sem comentários. Um `INNER JOIN` descartaria esse post.

Essa multiplicação importa para:

- volume transferido;
- memória, contagens e paginação;
- necessidade de `DISTINCT` em algumas consultas.

`COUNT(*)` conta as linhas do join, não os posts. Para contar posts únicos, use `COUNT(DISTINCT posts.id)`.

---

## JOIN ou duas queries

**Quando usar:**
Não existe uma resposta universal. Compare o formato que o banco devolve.

| Critério | Duas queries | `JOIN` |
|---|---|---|
| Round trips | 2 | 1 |
| Colunas do pai repetidas | não | sim, uma vez por filho |
| Filtro por coluna associada | exige outra estratégia | direto |
| `LIMIT` nos pais | simples | exige cuidado |
| Associação `has_many` grande | evita duplicar o pai | pode explodir linhas |
| Um-para-um | ainda custa 2 queries | costuma encaixar bem |

Para mostrar 20 posts e todos os comentários, duas queries costumam produzir um formato previsível.

Para buscar apenas posts com comentário aprovado, o `JOIN` expressa o filtro no banco:

```sql
SELECT DISTINCT posts.*
FROM posts
JOIN comments ON comments.post_id = posts.id
WHERE comments.approved = TRUE;
```

Um erro clássico é aplicar `LIMIT 20` diretamente sobre um join um-para-muitos e imaginar que virão 20 posts. O limite vale para as linhas do resultado. Um post com 20 comentários pode ocupar as 20 linhas.

Você pode limitar os pais em uma subquery antes do join ou usar duas queries. A escolha depende do resultado necessário.

---

## Lendo EXPLAIN

**O que é:**
`EXPLAIN` mostra o plano escolhido pelo PostgreSQL. `EXPLAIN ANALYZE` executa a query e acrescenta tempos e quantidades reais.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT comments.*
FROM comments
WHERE comments.post_id IN (101, 102, 103);
```

Uma saída resumida pode ser:

```text
Bitmap Heap Scan on comments
  Recheck Cond: (post_id = ANY ('{101,102,103}'::bigint[]))
  Heap Blocks: exact=8
  Buffers: shared hit=14
  -> Bitmap Index Scan on index_comments_on_post_id
       Index Cond: (post_id = ANY ('{101,102,103}'::bigint[]))
Planning Time: 0.180 ms
Execution Time: 0.320 ms
```

Leia primeiro:

- tipo de scan: sequencial, índice, bitmap;
- `rows` estimadas e reais e quantos `loops` ocorreram;
- `Buffers` encontrados em cache ou lidos;
- tempo total.

`EXPLAIN` de uma query filha não revela sozinho que a app a executou cem vezes. Ele explica uma execução. Para fechar o diagnóstico, combine plano com contagem nos logs ou `calls` no `pg_stat_statements`.

Já um subplano correlacionado pode mostrar `loops=100` dentro de **uma** instrução SQL. Isso também é repetição de trabalho, mas não é o mesmo N+1 de 101 round trips da app.

`ANALYZE` realmente roda a consulta e pode ser pesado em produção. No Rails, `relation.explain` ajuda, mas compare o SQL completo gerado.

Um índice na chave estrangeira barateia cada scan, mas não transforma N comandos em uma operação em lote. Você normalmente verifica as duas dimensões.

---

## Por que includes existe

**Como funciona:**
O código Rails navega objetos: `post.comments`, `comment.author`. O PostgreSQL trabalha com conjuntos de linhas.

Sem uma ponte, o acesso lazy à associação combina naturalmente com um loop Ruby e produz 1 + N. `includes` existe para declarar antes qual grafo de objetos será usado e permitir que o Active Record carregue associações em lote.

Do ponto de vista SQL, o objetivo é chegar a duas queries com `IN (...)` ou a uma query com `LEFT OUTER JOIN`.

O Active Record pode escolher duas queries ou um join conforme a relação referencia a tabela associada. Essa escolha e as diferenças entre `includes`, `preload` e `eager_load` estão no [capítulo 6.5](../06-active-record/05-n-plus-one.md).

Aqui, a pergunta é outra: quantos comandos chegaram ao PostgreSQL, que linhas cada formato devolveu e qual plano foi executado?

Carregar tudo antecipadamente também não é grátis. Se a associação não for usada, você trocou N+1 por dados desnecessários. Se ela tiver milhões de linhas, talvez precise de agregação, filtro ou paginação em vez de materializar todos os objetos.

---

## Armadilhas de diagnóstico

**Pontos-chave:**

- `CACHE` no log do Rails pode indicar query cache. Nesse caso, nem toda linha representa novo round trip ao PostgreSQL.
- Uma query rápida repetida muitas vezes continua sendo problema.
- `EXPLAIN ANALYZE` mede uma instrução, não o request inteiro.
- `JOIN` não é automaticamente melhor: pode multiplicar linhas e dados transferidos.
- Duas queries não são N+1. O problema é crescer para uma query por registro.
- Paginação reduz N, mas só limita o dano. Não remove o formato.
- A associação pode ser disparada na serialização, depois de o controller parecer terminado.
- Ambiente local tem latência baixa. Em produção, banco remoto torna round trips mais visíveis.

Antes de corrigir, identifique a coleção pai, a query repetida e se as repetições acompanham N. Depois decida se o resultado pede filtro no join ou se duas queries evitam multiplicar linhas.

---

## Na entrevista

> "N+1 é uma query para carregar N pais e mais uma query por pai. Eu confirmo nos logs: o mesmo `SELECT` se repete mudando só o ID. O PostgreSQL vê comandos separados, então paga vários round trips. A correção SQL vira duas queries, com `WHERE foreign_key IN (...)`, ou uma query com `JOIN`. Eu escolho olhando cardinalidade: join reduz round trips, mas duplica as colunas do pai e pode atrapalhar paginação. Depois uso `EXPLAIN ANALYZE` para o plano de cada formato e contagem de queries para o request inteiro. Índice melhora cada execução, mas não elimina N+1."

Se perguntarem por que `EXPLAIN` não basta:

> "Porque ele explica uma instrução. N+1 é a repetição entre instruções. Eu preciso combinar o plano com logs, tracing ou `pg_stat_statements`."

---

## Recapitulando

- N+1 tem forma 1 + N: uma query de pais, uma por pai.
- O banco recebe comandos separados e não sabe que vieram de um loop Ruby.
- O log revela SQL repetido com parâmetros diferentes.
- Duas queries usam as chaves dos pais em um `IN (...)`.
- `JOIN` usa um round trip, mas multiplica linhas em relações um-para-muitos.
- `LIMIT`, `COUNT` e paginação exigem cuidado depois de um join.
- `EXPLAIN (ANALYZE, BUFFERS)` mostra o custo de uma instrução.
- Logs ou `pg_stat_statements` mostram a repetição entre instruções.
- Índice reduz o custo de acesso; não reduz N para uma operação em lote.
- `includes` liga o grafo de objetos do Rails ao acesso em conjuntos do SQL.
- A API de eager loading está no [capítulo 6.5](../06-active-record/05-n-plus-one.md).

---

## Exercícios práticos

### Exercício 1: Conte as queries

**Enunciado:** Uma página carrega 30 pedidos. Para cada pedido, acessa `order.customer.name` e depois `order.items.count`, ambos sem eager loading. Quantos `SELECT`s podem ser executados? Que formas de SQL você procuraria no log?

<details>
<summary>Solução</summary>

Pode haver 61 queries: uma para `orders`, 30 para `customers` e 30 contagens de `order_items`. No log, procure duas instruções repetidas:

```sql
SELECT customers.* FROM customers WHERE customers.id = $1 LIMIT $2;
SELECT COUNT(*) FROM order_items WHERE order_items.order_id = $1;
```

**Pontos-chave:**
- Um request pode ter mais de um N+1; agregação repetida também entra no padrão.
- Conte o conjunto, não apenas a query mais lenta.
</details>

### Exercício 2: Escolha o formato

**Enunciado:** Você precisa listar 20 posts com todos os comentários. Cada post tem, em média, 100 comentários e várias colunas de texto grandes. Você começaria com `JOIN` ou duas queries? Explique o que mediria no PostgreSQL.

<details>
<summary>Solução</summary>

Eu começaria comparando duas queries:

```sql
SELECT posts.* FROM posts ORDER BY posts.created_at DESC LIMIT 20;
SELECT comments.* FROM comments WHERE comments.post_id IN (...);
```

Um join pode devolver cerca de 2.000 linhas e repetir as colunas grandes de cada post em todas elas. Duas queries mantêm o limite nos pais e não repetem esse payload.

Eu mediria linhas, bytes transferidos, tempo total, buffers, scans, índice em `comments.post_id` e materialização na app. Se a consulta precisar filtrar pelos comentários, um join ou uma subquery pode entrar no plano.

**Pontos-chave:**
- Um round trip não garante menos trabalho total.
- Compare cardinalidade e o resultado necessário, não só o número de queries.
</details>

### Exercício 3: Interprete o EXPLAIN

**Enunciado:** O `EXPLAIN ANALYZE` de `SELECT * FROM users WHERE id = 42` mostra `Execution Time: 0.08 ms`. O endpoint ainda leva 300 ms e o log contém 500 consultas com essa forma. O índice da chave primária resolveu o problema? Qual é o próximo passo?

<details>
<summary>Solução</summary>

Não. O índice tornou cada busca barata, mas o endpoint ainda faz 500 execuções e 500 round trips.

O próximo passo é descobrir qual coleção dispara essas consultas e transformar os IDs em acesso em lote ou join, conforme a cardinalidade e o resultado necessário.

Depois, repita o request e confirme que a contagem deixou de crescer com N. Use `EXPLAIN` para validar a nova query em lote.

**Pontos-chave:**
- Plano bom por query não significa request eficiente.
- Índice e N+1 são dimensões diferentes.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
