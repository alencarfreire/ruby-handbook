# 1.6 Enumerable

> **TL;DR**
> Enumerable é mixin, não classe. Você implementa `each` e ganha `map`, `select`, `find`, `reduce`. Array, Hash e Range já incluem. Transformação é `map`, não `each` + `<<`. `index_by` é ActiveSupport. `lazy` adia. Na entrevista: desenhe `map` com `each` na cabeça.

## Conteúdo

- [O mixin e o each](#o-mixin-e-o-each)
- [map](#map)
- [select e reject](#select-e-reject)
- [find](#find)
- [reduce](#reduce)
- [each_with_object](#each_with_object)
- [group_by e index_by](#group_by-e-index_by)
- [all?, any?, none?, one?](#all-any-none-one)
- [Encadear e lazy](#encadear-e-lazy)
- [each + << vs map](#each--vs-map)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O mixin e o each

**O que é:**
Enumerable é um module. O contrato é um: implementar `each` e dar `yield` em cada elemento. O resto (`map`, `select`, `reduce`) é construído em cima.

**Como funciona:**
```ruby
class Fila
  include Enumerable

  def initialize(itens)
    @itens = itens
  end

  def each(&block)
    @itens.each(&block)
  end
end

Fila.new([1, 2, 3]).map { |n| n * 2 }  # [2, 4, 6]
```

Sem `each`, `map` vira `NoMethodError`. Array, Hash e Range já incluem. Hash entrega par chave/valor:

```ruby
{ nome: "João", role: "admin" }.map { |chave, valor| "#{chave}=#{valor}" }
# ["nome=João", "role=admin"]
```

**Quando usar:**
Coleção própria (fila, páginas de API) que você quer filtrar e transformar sem reescrever `map`.

**Na entrevista:**
> "Enumerable precisa de `each`. Você implementa a iteração; o Ruby te dá a API. Array não é especial — só já tem o mixin."

---

## map

**O que é:**
Transforma cada elemento. Devolve **outro** Array. Não muta. Relação 1-para-1: N entra, N sai.

**Como funciona:**
```ruby
[1, 2, 3].map { |n| n * 2 }  # [2, 4, 6]
users.map(&:email)           # ["joao@email.com", ...]
```

Alias: `collect`. Em Rails quase ninguém fala `collect`.

**Quando usar:**
Lista de IDs, e-mails, DTOs. Sempre que o `each` só serviria para empilhar no array.

**Na entrevista:**
> "map é transformação. Se eu estou fazendo `result <<` dentro do each, era map. O `&:email` é `{ |u| u.email }`."

---

## select e reject

**O que é:**
Filtro. `select` fica com quem passa no block. `reject` joga fora quem passa. Também devolvem Array novo.

**Como funciona:**
```ruby
[1, 2, 3, 4].select(&:even?)  # [2, 4]
[1, 2, 3, 4].reject(&:even?)  # [1, 3]
[1, 2, 3, 4].filter_map { |n| n * 2 if n.even? }  # [4, 8]
```

Aliases: `find_all`; `filter` (Ruby 2.6+). `filter_map` (2.7+) é select + map numa passada; `nil`/`false` cai fora. `select!` muta — prefira o que devolve novo.

**Quando usar:**
Subconjunto. Não use `map` + `compact` se o ponto era filtrar.

**Na entrevista:**
> "select filtra, map transforma. No Active Record, `User.select(:id)` é SQL — não é o select do Enumerable. Confundir os dois queima."

---

## find

**O que é:**
Primeiro elemento que passa no block. Se ninguém passa, `nil`. Para no primeiro match. Alias: `detect`. Se você faz `select.first`, era `find`.

**Como funciona:**
```ruby
users.find { |u| u.email == "joao@email.com" }
[1, 3, 5].find(&:even?)  # nil
```

**Na entrevista:**
> "find do Enumerable percorre Ruby. `User.find(1)` é SQL pelo PK — outra API. Array#find não levanta RecordNotFound."

---

## reduce

**O que é:**
Acumula. Entra coleção, sai um valor. Alias: `inject`.

**Como funciona:**
```ruby
[1, 2, 3, 4].reduce(0) { |soma, n| soma + n }  # 10
[1, 2, 3, 4].reduce(:+)                         # 10

itens = [1010, 2500, 990]  # centavos
itens.reduce(0, :+)        # 4500

[].reduce(:+)      # erro — vazio sem inicial
[].reduce(0, :+)   # 0
```

Sem valor inicial, o primeiro elemento vira o acumulador. O block **tem que devolver** o próximo acc. Esquecer isso é o bug clássico. Para montar Hash, prefira `each_with_object`.

**Na entrevista:**
> "reduce é fold. Eu passo o inicial. Array vazio sem inicial quebra. Para Hash eu não forço reduce."

---

## each_with_object

**O que é:**
Itera e empurra para um objeto que você passou. No fim devolve **esse** objeto. O block não precisa retornar o acumulador.

**Como funciona:**
```ruby
[:a, :b, :c].each_with_object({}) { |sym, h| h[sym] = sym.to_s }
# { a: "a", b: "b", c: "c" }

# reduce equivalente — mais fácil errar o return
[:a, :b, :c].reduce({}) { |h, sym| h[sym] = sym.to_s; h }
```

**Quando usar:**
Lookup `id => record` fora do Rails, índice na mão.

**Na entrevista:**
> "each_with_object é reduce que já devolve o objeto. Eu não fico lembrando de retornar o Hash no fim do block."

---

## group_by e index_by

**O que é:**
`group_by` é core: chave → **Array** de elementos. `index_by` é ActiveSupport: chave → **um** elemento. Não existe no Ruby puro.

**Como funciona:**
```ruby
users.group_by(&:role)
# { "admin" => [user1, user3], "user" => [user2] }

# ActiveSupport — Rails
users.index_by(&:id)
# { 1 => #<User id: 1>, 2 => #<User id: 2> }

# Ruby puro
users.each_with_object({}) { |user, h| h[user.id] = user }
```

Chave duplicada no `index_by`: o **último** ganha. Não avisa.

**Quando usar:**
`group_by` — dashboard, "pedidos por status". `index_by` — lookup O(1) no serializer, evitar `find` dentro de loop.

**Na entrevista:**
> "group_by é N por chave. index_by é 1 por chave, e é ActiveSupport. Fora do Rails eu faço each_with_object."

---

## all?, any?, none?, one?

**O que é:**
Predicados. Devolvem true/false. Param no primeiro elemento que decide (short-circuit).

**Como funciona:**
```ruby
[2, 4, 6].all?(&:even?)    # true
[1, 2, 3].any?(&:even?)    # true
[1, 3, 5].none?(&:even?)   # true
[1, 2, 3].one?(&:even?)    # true — exatamente um

[nil, false].any?  # false
[0, ""].any?       # true — 0 e "" são truthy

[].all? { false }  # true  — verdade vácua
[].any?            # false
[].none?           # true
[].one?            # false
```

`all?` no vazio é true: não existe contraexemplo. Sem block, a pergunta é "é truthy?" — não é "tem número".

**Na entrevista:**
> "all? no array vazio é true. any? é false. Eu cito isso. E 0 é truthy — `any?` sem block não é 'tem número'."

---

## Encadear e lazy

**O que é:**
Você empilha: filtra, transforma, unique. Cada passo eager materializa um Array novo. `lazy` devolve Enumerator::Lazy — o trabalho só roda quando você força (`to_a`, `first`, `take`).

**Como funciona:**
```ruby
users.select(&:active?).map(&:email).uniq.sort

# lazy — range infinito não trava
(1..).lazy.map { |n| n * 2 }.select { |n| n > 10 }.take(3).to_a
# [12, 14, 16]
```

No Rails, cadeia de Enumerable em Relation **não** é query:

```ruby
# RUIM — carrega todos os users
User.all.select(&:active?).map(&:email)

# BOM — SQL
User.where(active: true).pluck(:email)
```

**Quando usar:**
Cadeia curta em Array já na memória. `lazy` para stream grande ou "os primeiros N que passam". Query grande fica no banco.

**Na entrevista:**
> "Eu encadeio select e map em Array. Em Active Record eu não encadeio Enumerable — vira load inteiro. lazy adia; Enumerator a fundo é outro capítulo."

---

## each + << vs map

**O que é:**
O cheiro mais comum em review júnior: construir Array na mão com `each` e shovel quando `map` / `select` já fazem.

**Como funciona:**
```ruby
# RUIM
emails = []
users.each { |user| emails << user.email }

# BOM
emails = users.map(&:email)
users.select(&:active?).map(&:email)
users.filter_map { |u| u.email if u.active? }
```

**each continua certo** quando o ponto é efeito colateral: job, log, mailer. Aí não existe array de saída.

```ruby
users.each { |user| WelcomeMailer.deliver_later(user) }
```

**Na entrevista:**
> "Na cabeça: array vazio, each, shovel do yield, devolve o array. É isso que o mixin faz."

```ruby
def meu_map(lista)
  resultado = []
  lista.each { |item| resultado << yield(item) }
  resultado
end

meu_map([1, 2, 3]) { |n| n * 2 }  # [2, 4, 6]
```

Se pedirem `select`, entra um `if yield(item)` antes do shovel. `reduce` troca o array por um acumulador.

---

## Recapitulando

- Enumerable é mixin. O contrato é `each`.
- `map` transforma. `select` / `reject` filtram. `find` pega o primeiro.
- `reduce` acumula; `each_with_object` monta objeto sem o return do acc.
- `group_by` → lista. `index_by` → um (ActiveSupport).
- `all?` no vazio é true. `any?` no vazio é false.
- Encadear em Array. Em Relation, SQL. `lazy` adia.
- `each` + `<<` para transformar é cheiro; para efeito colateral é ok.
- Na entrevista: `map` = `each` + `<<` + `yield`.

---

## Exercícios práticos

### Exercício 1: map com each

**Enunciado:** Sem usar `map` / `collect`, escreva `meu_map(lista)` que recebe um block e devolve o array transformado. Depois explique, em uma frase de entrevista, o que o Enumerable faz por baixo.

<details>
<summary>Solução</summary>

```ruby
def meu_map(lista)
  resultado = []
  lista.each { |item| resultado << yield(item) }
  resultado
end

meu_map(["joão", "maria"]) { |nome| nome.upcase }  # ["JOÃO", "MARIA"]
```

Frase: "Enumerable só exige `each`. `map` é um each que empilha o retorno do block."

**Pontos-chave:**
- Array novo — não muta `lista`
- `yield(item)` é o block do chamador
- `select` seria o mesmo esqueleto com `if yield(item)`
</details>

### Exercício 2: mate o each + <<

**Enunciado:** Este código passou no review. Reescreva sem array mutável. O resultado é a lista de e-mails ativos do domínio `empresa.com`, em minúsculo.

```ruby
ativos = []
users.each do |user|
  if user.active? && user.email.end_with?("@empresa.com")
    ativos << user.email.downcase
  end
end
ativos
```

<details>
<summary>Solução</summary>

```ruby
users
  .select { |user| user.active? && user.email.end_with?("@empresa.com") }
  .map { |user| user.email.downcase }

users.filter_map do |user|
  user.email.downcase if user.active? && user.email.end_with?("@empresa.com")
end
```

**Pontos-chave:**
- Filtro é `select` (ou a condição do `filter_map`)
- Transformação é `map`
- `each` + `<<` só ficaria se o ponto fosse efeito (mailer, job)
</details>

### Exercício 3: group_by, index_by e o vazio

**Enunciado:** Três perguntas curtas.

1. Você tem `users` em memória. Precisa de `id => user` no serializer e de `role => [users]` no dashboard. Qual método em cada caso? `index_by` é Ruby core?
2. Dois users com o mesmo `id` — o que o `index_by(&:id)` faz?
3. O que vale cada linha? Por quê?

```ruby
[].all?(&:even?)
[].any?(&:even?)
[].none?
[].one?
```

<details>
<summary>Solução</summary>

1. Lookup: `users.index_by(&:id)`. Dashboard: `users.group_by(&:role)`. `index_by` é ActiveSupport. Fora do Rails: `each_with_object`.
2. O último ganha. Sem aviso.
3. `true`, `false`, `true`, `false`. `all?` vazio é verdade vácua. `any?` precisa de um. `none?` no vazio é true. `one?` exige exatamente um.

**Pontos-chave:**
- group_by = lista; index_by = um
- index_by não está no core
- `all?` / `none?` no `[]` pegam quem recita a docs sem pensar
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
