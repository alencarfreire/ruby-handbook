# 7.3 Índices

> **TL;DR**
> Índice troca espaço e custo de escrita por leitura mais rápida. No PostgreSQL, o padrão é B-tree: bom para igualdade, intervalos e ordenação. Índice `unique` protege a regra no banco. Em índice composto, a ordem das colunas importa: a regra prática é atender primeiro a coluna mais à esquerda. Índice parcial guarda só as linhas que cumprem um `WHERE`. Use `EXPLAIN` para conferir se o plano escolheu `Index Scan` ou `Seq Scan`, mas não trate `Seq Scan` como erro automático. No Rails, crie com `add_index` e mantenha apenas índices que pagam seu custo.

## Conteúdo

- [B-tree: o índice padrão](#b-tree-o-índice-padrão)
- [Índice unique](#índice-unique)
- [Índice composto e a coluna mais à esquerda](#índice-composto-e-a-coluna-mais-à-esquerda)
- [Índice parcial](#índice-parcial)
- [EXPLAIN: Index Scan e Seq Scan](#explain-index-scan-e-seq-scan)
- [add_index no Rails](#add_index-no-rails)
- [O custo de manter índices](#o-custo-de-manter-índices)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## B-tree: o índice padrão

**O que é:**
B-tree é o índice padrão no PostgreSQL e no `add_index`. Essa estrutura separada da tabela organiza valores e referências para o banco chegar a menos linhas. Ela não muda o resultado: dá outra opção ao planner, que pode usá-la ou não.

```sql
CREATE INDEX index_orders_on_created_at ON orders (created_at);
```

B-tree atende bem igualdade e intervalo:

```sql
SELECT * FROM users WHERE email = 'ana@example.com';
SELECT * FROM orders WHERE total_cents >= 10_000;
SELECT *
FROM orders
WHERE created_at >= '2026-08-01'
  AND created_at <  '2026-09-01';
```

```sql
SELECT *
FROM orders
ORDER BY created_at DESC
LIMIT 20;
```

Ele também ajuda nessa ordenação e pode ser percorrido nos dois sentidos. Não crie outro índice só para inverter `ASC` e `DESC` em uma coluna.

**Importante na entrevista:**
B-tree não resolve qualquer busca textual. Este filtro não aproveita um B-tree comum como uma busca direta:

```sql
SELECT * FROM products WHERE name LIKE '%café%';
```

O `%` inicial permite texto em qualquer posição. Esse problema pede outra estratégia, fora do foco deste capítulo.

**Na entrevista:**
> "No PostgreSQL, B-tree é o default. Ele é a primeira opção para igualdade, range e ordenação. Eu não assumo que serve para todo operador, como um `LIKE` com curinga no começo."

---

## Índice unique

**O que é:**
Um índice `unique` acelera a busca e impede valores duplicados. A diferença importante não é só performance: ele protege uma regra de integridade no banco.

```sql
CREATE UNIQUE INDEX index_users_on_email ON users (email);
```

Agora duas transações não conseguem gravar o mesmo e-mail com sucesso.

**Como funciona:**
```ruby
class User < ApplicationRecord
  validates :email, presence: true, uniqueness: true
end
```

A validação melhora a mensagem, mas sozinha tem uma condição de corrida. Requests A e B podem consultar antes de qualquer gravação, ambas passar e depois inserir. Para uma regra real, use validação e índice `unique`.

No PostgreSQL, um índice unique comum aceita várias linhas com `NULL`. Por isso, se o valor é obrigatório, combine unicidade com `null: false` na coluna.

**Exemplo prático:**

```ruby
class AddUniqueIndexToUsersEmail < ActiveRecord::Migration[7.1]
  def change
    change_column_null :users, :email, false
    add_index :users, :email, unique: true
  end
end
```

Se já existem duplicados ou valores nulos, essa migration falha. Limpe os dados antes de adicionar a regra.

**Na entrevista:**
> "`validates uniqueness` não garante unicidade sob concorrência. Eu mantenho a validação para feedback e coloco um índice unique como garantia definitiva no PostgreSQL."

---

## Índice composto e a coluna mais à esquerda

**O que é:**
Um índice composto contém mais de uma coluna. A ordem declarada faz parte do desenho do índice.

```sql
CREATE INDEX index_orders_on_customer_id_and_created_at
ON orders (customer_id, created_at);
```

Ele está organizado primeiro por `customer_id` e, dentro de cada cliente, por `created_at`.

**Como funciona:**
A regra prática do prefixo mais à esquerda diz que esse índice atende melhor queries que começam pelas primeiras colunas:

```sql
SELECT * FROM orders WHERE customer_id = 42;

SELECT *
FROM orders
WHERE customer_id = 42
  AND created_at >= '2026-08-01'
ORDER BY created_at DESC
LIMIT 20;
```

Já esta query não fornece a coluna mais à esquerda:

```sql
SELECT * FROM orders WHERE created_at >= '2026-08-01';
```

Não conte com `(customer_id, created_at)` como substituto de um índice próprio em `created_at` para esse padrão. O PostgreSQL tem mais opções do que uma regra absoluta, mas o índice tende a ser muito menos eficiente quando a primeira coluna não participa.

A ordem escrita no `WHERE` não precisa copiar a ordem do índice. O planner entende estas condições como equivalentes:

```sql
WHERE customer_id = 42 AND status = 'paid'
WHERE status = 'paid' AND customer_id = 42
```

O que importa é a ordem das colunas no índice e o padrão de consulta, não a ordem visual do SQL.

**Na entrevista:**
> "Em `(customer_id, created_at)`, penso no índice como ordenado primeiro por cliente. Ele é forte para cliente sozinho ou cliente mais data. Para data sozinha, eu avalio outro índice. A ordem do `WHERE` não muda isso."

---

## Índice parcial

**O que é:**
Um índice parcial guarda apenas as linhas que cumprem uma condição.

Se quase todos os pedidos estão concluídos, mas o dashboard consulta os pendentes, você pode indexar só essa parte:

```sql
CREATE INDEX index_orders_pending_on_created_at
ON orders (created_at)
WHERE status = 'pending';
```

**Como funciona:**
O índice fica menor porque não contém pedidos com outros status. Isso pode reduzir espaço e custo de manutenção em comparação com um índice que cobre toda a tabela.

A query precisa ser compatível com a condição. O índice acima não serve como caminho geral para `SELECT * FROM orders ORDER BY created_at`.

**Quando usar:**
- Uma pequena parte da tabela é consultada com frequência
- Registros ativos convivem com muitos registros arquivados
- Uma fila consulta repetidamente itens pendentes

Ele também pode impor unicidade em um subconjunto:

```sql
CREATE UNIQUE INDEX index_users_on_email_active
ON users (email)
WHERE deleted_at IS NULL;
```

Assim, o e-mail é único entre usuários não removidos. O significado precisa bater com a regra do produto.

**Na entrevista:**
> "Índice parcial é útil quando a query sempre filtra um subconjunto estável, como `deleted_at IS NULL`. Ele fica menor, mas só ajuda queries compatíveis com o predicado do índice."

---

## EXPLAIN: Index Scan e Seq Scan

**O que é:**
`EXPLAIN` mostra o plano que o PostgreSQL pretende usar. Ele ajuda você a verificar se o índice entrou no caminho escolhido.

```sql
EXPLAIN
SELECT * FROM users WHERE email = 'ana@example.com';
```

```text
Index Scan using index_users_on_email on users
  Index Cond: (email = 'ana@example.com')
```

`Index Scan` indica que o PostgreSQL percorreu o índice para localizar linhas da tabela.

```text
Seq Scan on users
  Filter: (email = 'ana@example.com')
```

`Seq Scan` lê a tabela em sequência e aplica o filtro. Aparece sem índice útil ou quando essa leitura é estimada como mais barata.

**Importante na entrevista:**
`Seq Scan` não é sinônimo de query ruim.

Ele pode ser a escolha correta quando:

- A tabela é pequena
- A query retorna grande parte das linhas
- O filtro tem baixa seletividade, como um booleano comum

Se 90% dos usuários têm `active = true`, um índice apenas em `active` pode não compensar:

```sql
SELECT * FROM users WHERE active = true;
```

O planner trabalha com estimativas e estatísticas. `EXPLAIN` sozinho não executa a query; mostra estimativas. O ponto aqui é reconhecer o acesso por índice ou a leitura sequencial, sem transformar `Index Scan` em regra cega.

**Na entrevista:**
> "Eu olho o `EXPLAIN`. `Index Scan` mostra uso do índice; `Seq Scan` mostra leitura sequencial. Mas um Seq Scan pode ser correto para tabela pequena ou resultado grande. Eu comparo o plano com a seletividade da consulta."

---

## add_index no Rails

**O que é:**
`add_index` é a API de migration do Rails para criar índices. O adapter do PostgreSQL gera o SQL correspondente.

```ruby
class AddIndexToOrdersCustomerId < ActiveRecord::Migration[7.1]
  def change
    add_index :orders, :customer_id
  end
end
```

```ruby
add_index :users, :email, unique: true
add_index :orders, [:customer_id, :created_at]
```

```ruby
add_index :orders,
          :created_at,
          where: "status = 'pending'",
          name: "index_orders_pending_on_created_at"
```

**Como funciona:**
O Rails gera um nome automaticamente, mas um nome explícito deixa claro o propósito de índices parciais e evita nomes longos ou ambíguos.

```ruby
add_reference :orders, :customer, null: false, foreign_key: true
```

Rails normalmente cria o índice com `references`. Mesmo assim, confira o schema. Foreign key protege a referência; índice acelera o acesso.

Em uma tabela grande de produção, criar um índice pode bloquear operações enquanto o PostgreSQL trabalha. O adapter suporta criação concorrente:

```ruby
class AddIndexToOrdersCustomerId < ActiveRecord::Migration[7.1]
  disable_ddl_transaction!

  def change
    add_index :orders, :customer_id, algorithm: :concurrently
  end
end
```

`CREATE INDEX CONCURRENTLY` não pode rodar dentro da transaction padrão da migration. A opção reduz bloqueios, mas a migration deixa de ter rollback atômico. Siga o processo de deploy do projeto.

**Na entrevista:**
> "No Rails uso `add_index`; passo array para composto, `unique: true` para unicidade e `where:` para parcial no PostgreSQL. Em tabela grande, avalio `algorithm: :concurrently` com `disable_ddl_transaction!`."

---

## O custo de manter índices

**O que é:**
Índice não é grátis. Em `INSERT`, `DELETE` e em `UPDATE` de coluna indexada, o PostgreSQL também mantém os índices afetados.

**Como funciona:**
Os principais custos são:

- Mais I/O e CPU nas escritas
- Mais espaço em disco
- Mais páginas competindo por cache
- Migrations de criação e remoção com impacto operacional

Índices duplicados também desperdiçam recursos. Se existe `(customer_id, created_at)`, um índice separado em `customer_id` pode ser redundante para algumas cargas, porque o composto já começa por essa coluna. Não remova no automático: confira as outras queries, o tamanho dos índices e o comportamento real.

Um índice em `active` com dois valores também pode custar em toda escrita e quase nunca vencer um `Seq Scan`.

**Quando usar:**
O índice costuma valer a pena quando uma leitura importante e frequente evita trabalho suficiente para pagar o custo de manutenção.

Pergunte qual query ele atende, quantas linhas ela seleciona, se a coluna muda muito e se outro índice já cobre o mesmo prefixo. Unicidade é um motivo adicional: nesse caso o índice também protege uma regra.

**Na entrevista:**
> "Eu não indexo todas as colunas. Cada índice melhora certos reads e piora writes, além de ocupar disco e cache. Antes de criar, ligo o índice a uma query ou a uma constraint."

---

## Recapitulando
- B-tree é o índice padrão do PostgreSQL.
- Índice `unique` protege a regra sob concorrência; validação do Rails sozinha não protege.
- Em índice composto, a ordem das colunas importa.
- `(a, b)` atende bem `a` e `a + b`; não conte com ele para `b` sozinho.
- Índice parcial contém apenas linhas que cumprem seu `WHERE`.
- `Seq Scan` pode ser a escolha correta para tabela pequena ou resultado grande.
- No Rails, use `add_index`, com opções como `unique:`, `where:` e `algorithm:`.
- Mais índices significam mais custo nas escritas.

---

## Exercícios práticos

### Exercício 1: Escolha a ordem do índice composto

**Enunciado:** Uma tela lista os pedidos de um cliente do mais recente para o mais antigo. A query principal é:

```sql
SELECT *
FROM orders
WHERE customer_id = 42
ORDER BY created_at DESC
LIMIT 20;
```

Proponha um índice. Ele também atende bem uma busca só por data?

<details>
<summary>Solução</summary>

```ruby
add_index :orders, [:customer_id, :created_at]
```

O índice agrupa primeiro por cliente e mantém `created_at` ordenado dentro dele. Pode ser percorrido de trás para frente. Para data sozinha, o composto não é o melhor caminho porque falta a coluna mais à esquerda; avalie um índice separado se essa query for relevante.

**Pontos-chave:**
- O padrão de query define a ordem
- O prefixo mais à esquerda importa
</details>

### Exercício 2: Garanta unicidade de verdade

**Enunciado:** O model `Membership` tem `validates :user_id, uniqueness: { scope: :team_id }`. Explique o problema e escreva a migration que garante uma participação por usuário em cada time.

<details>
<summary>Solução</summary>

A validação consulta antes de gravar, então duas requests podem passar. A garantia precisa estar no PostgreSQL:

```ruby
class AddUniqueIndexToMemberships < ActiveRecord::Migration[7.1]
  def change
    add_index :memberships,
              [:user_id, :team_id],
              unique: true
  end
end
```

Mantenha a validação para uma mensagem amigável. O índice resolve a corrida.

**Pontos-chave:**
- Validação melhora feedback
- Índice unique garante integridade
- A combinação, não cada coluna isolada, é única
</details>

### Exercício 3: Interprete o Seq Scan

**Enunciado:** Uma tabela pequena tem 500 usuários, e 480 estão ativos. Mesmo com índice em `active`, o `EXPLAIN` mostra `Seq Scan` para `WHERE active = true`. Isso prova que o índice está quebrado? O que você diria na entrevista?

<details>
<summary>Solução</summary>

Não. A query retorna 96% de uma tabela pequena. Ler em sequência pode ser mais barato que consultar o índice e buscar quase todas as linhas. Relacione o plano ao volume e à proporção, sem exigir `Index Scan`.

**Pontos-chave:**
- `Seq Scan` não é erro automático
- Resultado grande favorece leitura sequencial
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
