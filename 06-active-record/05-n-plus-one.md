# 6.5 N+1

> **TL;DR**
> N+1 acontece quando você busca uma coleção e depois carrega uma associação uma vez para cada registro. Cem posts podem virar 101 queries. `preload` sempre usa queries separadas. `eager_load` força `LEFT OUTER JOIN`. `includes` escolhe a estratégia e é o padrão mais comum. Includes aninhados evitam o problema em vários níveis. Bullet ajuda a detectar; `strict_loading!` transforma lazy loading inesperado em erro.

## Conteúdo

- [O problema](#o-problema)
- [`includes` vs `preload` vs `eager_load`](#includes-vs-preload-vs-eager_load)
- [`includes`](#includes)
- [`preload`](#preload)
- [`eager_load`](#eager_load)
- [Condições na associação](#condições-na-associação)
- [Includes aninhados](#includes-aninhados)
- [`strict_loading!`](#strict_loading)
- [Bullet](#bullet)
- [Como escolher](#como-escolher)
- [Importante na entrevista](#importante-na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O problema

**O que é:**
Você faz uma query para buscar N registros. Depois, ao percorrer o resultado, dispara uma query por registro para carregar uma associação. O total vira `1 + N`.

```ruby
class Post < ApplicationRecord
  belongs_to :author
  has_many :comments
end

posts = Post.published.limit(100) # 1 query

posts.each do |post|
  puts post.author.name           # até 100 queries
end
```

O log repete a carga de autor, mudando apenas o ID:

```text
Post Load
Author Load  WHERE authors.id = 12
Author Load  WHERE authors.id = 27
Author Load  WHERE authors.id = 31
# ...
```

**Como funciona:**
O Active Record faz lazy loading: `post.author` consulta o banco na primeira vez que a associação é acessada. Isoladamente isso é útil. Dentro de um loop, o custo cresce com a coleção.

Carregue a associação antes do loop:

```ruby
posts = Post.includes(:author).published.limit(100)

posts.each do |post|
  puts post.author.name # usa a associação carregada
end
```

Paginação reduz N, mas não corrige a causa. Trinta itens ainda podem gerar 31 queries.

**Na entrevista:**
> "N+1 é uma query para a coleção mais uma por item ao acessar uma associação com lazy loading. Eu faço eager loading apenas das associações usadas pela resposta."

---

## `includes` vs `preload` vs `eager_load`

Esta é a comparação clássica de entrevista:

| Método | Estratégia | Queries típicas | Uso |
|---|---|---:|---|
| `includes` | Escolhe separadas ou join | 2 ou 1 | Padrão para evitar N+1 |
| `preload` | Sempre separadas | 2 | Quando você quer garantir separação |
| `eager_load` | Sempre `LEFT OUTER JOIN` | 1 | Quando a associação participa da query |

Os três deixam `post.author` carregado. Muda a forma de buscar os dados.

**Importante na entrevista:**
Não diga que `includes` sempre faz duas queries. Normalmente faz, mas pode usar join quando a query referencia a tabela associada.

Também não existe vencedor universal. Join reduz viagens ao banco, mas pode repetir linhas e colunas. Queries separadas podem transferir menos dados.

---

## `includes`

**O que é:**
É a API de alto nível para eager loading. Você declara as associações; o Active Record escolhe a estratégia.

```ruby
posts = Post.includes(:author, :comments)
```

Sem referência às tabelas associadas, o caso comum faz uma query para posts, outra para autores e outra para comentários. A quantidade é por associação declarada, não por item.

**Quando usar:**
Use como primeira escolha quando quer evitar N+1 e não precisa controlar se haverá join.

Se você filtra pela associação, `includes` pode mudar para `LEFT OUTER JOIN`:

```ruby
Post.includes(:author).where(authors: { active: true })
```

Uma condição SQL em string precisa de `references`:

```ruby
Post
  .includes(:author)
  .where("authors.active = ?", true)
  .references(:author)
```

Sem `references`, a tabela pode não entrar na query e o banco retorna erro.

---

## `preload`

**O que é:**
`preload` sempre carrega cada associação em uma query separada.

```ruby
posts = Post.preload(:author, :comments)
```

Aqui há uma query para posts, uma para autores e uma para comentários.

**Quando usar:**
Use quando você quer eager loading, mas quer manter a query principal separada. Isso evita a repetição das colunas do pai que um join com `has_many` pode produzir.

`preload` sozinho não permite filtrar a query principal pela tabela associada:

```ruby
# authors não participa da query principal
Post.preload(:author).where(authors: { active: true })
```

Você pode separar as responsabilidades:

```ruby
Post
  .joins(:author)
  .where(authors: { active: true })
  .preload(:author)
```

`joins` filtra os posts. `preload` carrega os autores em outra query.

---

## `eager_load`

**O que é:**
`eager_load` força um `LEFT OUTER JOIN` e monta os models a partir de uma consulta.

```ruby
posts = Post
  .eager_load(:author)
  .where(authors: { active: true })
  .order("authors.name ASC")
```

**Quando usar:**
Use quando precisa carregar a associação e quer que a tabela associada participe da mesma query.

Com `has_many`, o banco pode devolver várias linhas para o mesmo pai:

```ruby
Post.eager_load(:comments)
```

Um post com 200 comentários repete as colunas do post em 200 linhas do resultado bruto. O Active Record reconstrói os objetos principais, mas o banco ainda processa e transfere esse volume.

Uma query não é automaticamente mais rápida do que duas. Cardinalidade e largura das linhas importam.

---

## Condições na associação

**O que é:**
Filtrar junto com eager loading pode mudar tanto os pais retornados quanto os filhos carregados.

```ruby
posts = Post
  .includes(:comments)
  .where(comments: { approved: true })
```

A consulta retorna posts com comentários aprovados. A coleção `post.comments` carregada por ela contém os comentários que atendem à condição, não necessariamente todos os comentários do post.

Se você quer filtrar pelos aprovados, mas carregar todos:

```ruby
posts = Post
  .joins(:comments)
  .where(comments: { approved: true })
  .distinct
  .preload(:comments)
```

Se só precisa filtrar e não acessará a associação, use apenas `joins`. `joins` disponibiliza a tabela para a consulta; não promete carregar a associação.

---

## Includes aninhados

**O que é:**
O N+1 pode reaparecer no segundo nível. Carregar comentários não carrega o autor de cada comentário.

```ruby
# Ainda faz lazy loading de comment.author
posts = Post.includes(:comments)

# Carrega os dois níveis
posts = Post.includes(comments: :author)
```

Combine associações diretas e aninhadas:

```ruby
posts = Post.includes(
  :author,
  comments: [:author, :reactions]
)
```

Para mais níveis, aninhe Hashes:

```ruby
Post.includes(comments: { author: :avatar })
```

**Quando usar:**
Carregue a árvore exigida pela resposta, não o grafo inteiro do domínio. Includes profundos demais consomem memória e aumentam o volume transferido.

Adicionar um filtro depois pode criar outra consulta, mesmo com a associação carregada:

```ruby
post.comments                    # usa a coleção carregada
post.comments.where(spam: false) # nova consulta
```

---

## `strict_loading!`

**O que é:**
Strict loading proíbe lazy loading inesperado. Em vez de esconder outra query, o Rails levanta `ActiveRecord::StrictLoadingViolationError`.

```ruby
post = Post.first
post.strict_loading!
post.comments.to_a # levanta erro
```

Você pode aplicar à relação ou ao model:

```ruby
posts = Post.strict_loading.includes(:author)

class Post < ApplicationRecord
  self.strict_loading_by_default = true
end
```

Em Rails 7.1+, o modo `:n_plus_one_only` busca impedir lazy loading com potencial de N+1 sem bloquear todo acesso lazy:

```ruby
Post.strict_loading(mode: :n_plus_one_only)
```

**Quando usar:**
É útil em endpoints, serializers e testes. Ative com cuidado: caminhos que dependiam de lazy loading começarão a falhar.

---

## Bullet

**O que é:**
Bullet é uma gem que observa queries e avisa sobre N+1, eager loading não utilizado e oportunidades de counter cache. Costuma rodar em desenvolvimento e, às vezes, em teste.

```ruby
group :development, :test do
  gem "bullet"
end
```

Bullet ajuda a localizar o problema; não substitui julgamento. Uma sugestão pode carregar dados demais, e fluxos dinâmicos podem gerar falso positivo.

Ele complementa `strict_loading!`: Bullet observa e recomenda; strict loading impõe a regra e pode levantar erro.

---

## Como escolher

**Quando usar:**

1. Confirme o acesso à associação dentro da coleção.
2. Carregue só o que aquele fluxo usa.
3. Comece com `includes` se não precisa controlar a estratégia.
4. Use `preload` para garantir queries separadas.
5. Use `eager_load` quando precisa do `LEFT OUTER JOIN`.
6. Use `joins` sozinho quando só quer filtrar ou ordenar.
7. Confira os níveis aninhados.
8. Compare quantidade de queries, tempo e memória no caso real.

```ruby
Post.includes(:author) # escolha comum
Post.preload(:comments) # separação garantida
Post.eager_load(:author).where(authors: { active: true })
Post.joins(:author).where(authors: { active: true }) # só filtro
```

Não faça eager loading preventivo de tudo. Trocar centenas de queries por milhares de objetos desnecessários também degrada o endpoint.

---

## Importante na entrevista

Uma resposta forte define `1 + N`, aponta lazy loading no loop, compara as três APIs e explica como detecta regressão.

> "`preload` sempre usa queries separadas. `eager_load` força `LEFT OUTER JOIN`. `includes` normalmente separa, mas pode usar join quando a query referencia a associação. Eu verifico níveis aninhados, uso Bullet e posso ativar `strict_loading!`."

Se perguntarem qual é mais rápido:

> "Depende da cardinalidade e das colunas. Join reduz viagens, mas pode repetir muitas linhas do pai. Eu meço no fluxo real."

---

## Recapitulando

- N+1 é uma query inicial mais uma por item.
- `includes` escolhe entre queries separadas e join.
- `preload` sempre usa queries separadas.
- `eager_load` força `LEFT OUTER JOIN`.
- `joins` não carrega a associação por si só.
- Condições podem limitar os filhos carregados.
- Includes aninhados evitam N+1 em outros níveis.
- `strict_loading!` falha em lazy loading proibido.
- Bullet aponta N+1 durante desenvolvimento ou teste.
- Menos queries não garante menor custo.

---

## Exercícios práticos

### Exercício 1: Dois níveis

**Enunciado:** Corrija o N+1 ao exibir `post.author.name` e `comment.author.name` para cada comentário.

<details><summary>Solução</summary>

```ruby
posts = Post.includes(:author, comments: :author)
```

**Pontos-chave:** carrega a associação direta e a árvore `comments -> author`.
</details>

### Exercício 2: Estratégia separada

**Enunciado:** Você mostrará todos os comentários, mas quer garantir que a query de posts fique separada. Qual API usa?

<details><summary>Solução</summary>

```ruby
posts = Post.published.preload(:comments)
```

**Pontos-chave:** `preload` nunca troca para join.
</details>

### Exercício 3: Filtrar e carregar

**Enunciado:** Busque posts com algum comentário aprovado, mas carregue todos os comentários sem N+1.

<details><summary>Solução</summary>

```ruby
posts = Post
  .joins(:comments)
  .where(comments: { approved: true })
  .distinct
  .preload(:comments)
```

**Pontos-chave:** `joins` filtra; `preload` carrega a coleção completa; `distinct` evita pais repetidos.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
