# 3.5 Enumerator e lazy

> **TL;DR**
> Enumerator é o objeto da iteração. `each` (e `map`, `select`) sem block devolve um. Você puxa com `next` / `take`; acaba em `StopIteration`. `lazy` transforma a cadeia em pull: `map` e `select` não materializam Array no meio. Range infinito e arquivo grande pedem isso. Array de 20 itens na RAM não pede. Relation do Active Record já é lazy de SQL — `Enumerable#lazy` em cima de `User.all` não salva query.

## Conteúdo

- [O objeto Enumerator](#o-objeto-enumerator)
- [each sem block](#each-sem-block)
- [next, peek e rewind](#next-peek-e-rewind)
- [Enumerator.new](#enumeratornew)
- [Cadeia lazy](#cadeia-lazy)
- [Sequências infinitas](#sequências-infinitas)
- [Quando lazy ajuda](#quando-lazy-ajuda)
- [Quando lazy não ajuda](#quando-lazy-não-ajuda)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O objeto Enumerator

**O que é:**
Enumerator é uma classe. Representa “como percorrer”, não o Array pronto. Inclui Enumerable — então responde a `map`, `select`, `take`. A diferença: o valor ainda não foi gerado. Alguém precisa puxar.

**Como funciona:**
```ruby
enum = [10, 20, 30].each
enum.class          # Enumerator
enum.is_a?(Enumerable)  # true

enum.to_a           # [10, 20, 30]
```

O mixin ([1.6](/01-ruby-basics/06-enumerable)) vive no `each`. Enumerator **é** o `each` empacotado: você guarda, passa, encadeia `with_index`, puxa um a um.

**Quando usar:**
Quando a coleção não cabe na cabeça como lista fechada: stream, arquivo, contador, “os primeiros N que passam no filtro”.

**Na entrevista:**
> "Enumerator é o iterator objeto. Enumerable é o mixin. Sem block, `each` te entrega o Enumerator em vez de iterar na hora."

---

## each sem block

**O que é:**
Quase todo método de Enumerable, sem block, devolve Enumerator. Não é bug. É o jeito de encadear depois: `with_index`, `with_object`, `lazy`.

**Como funciona:**
```ruby
[1, 2, 3].each.class     # Enumerator
[1, 2, 3].map.class      # Enumerator
[1, 2, 3].select.class   # Enumerator
File.foreach("log.txt").class  # Enumerator

letras = %w[a b c]
letras.map.with_index { |letra, i| "#{i}:#{letra}" }
# ["0:a", "1:b", "2:c"]

(1..10).select.with_index { |n, i| i.even? }
# [1, 3, 5, 7, 9] — filtra pelo índice, não pelo valor
```

`with_index` e `with_object` são métodos de **Enumerator**, não de Array. Por isso o `each` solto existe: monta o Enumerator, aí você cola o índice.

**Quando usar:**
Índice (`each.with_index`), acumulador (`each.with_object`), ou passar o enumerator adiante.

**Na entrevista:**
> "Sem block, each não itera — devolve Enumerator. É assim que with_index entra. Eu não faço `each_with_index` por magia: é each + with_index."

---

## next, peek e rewind

**O que é:**
Iterator externo. Você puxa o próximo valor. Interno é o `each` com block: o Ruby empurra. Externo é você no volante.

**Como funciona:**
```ruby
enum = [1, 2, 3].each

enum.next   # 1
enum.next   # 2
enum.peek   # 3 — olha, não consome
enum.next   # 3
enum.next   # StopIteration
```

`peek` não anda o cursor. `rewind` volta ao começo — **se** a fonte deixar. Array deixa. Arquivo já lido até o EOF, em geral, não.

`Kernel#loop` trata `StopIteration` sozinho. É o idioma:

```ruby
enum = [10, 20].each
loop { puts enum.next }
# 10
# 20
# sai limpo — ninguém vê a exceção
```

**Quando usar:**
Parser, lexer, “consumo este token se for X”. No Rails do dia a dia quase não aparece. Na entrevista aparece.

**Na entrevista:**
> "next puxa. peek olha. Acabou: StopIteration. loop já trata isso. rewind só funciona se a fonte puder recomeçar."

---

## Enumerator.new

**O que é:**
Você constrói o iterator na mão. O block recebe um yielder. Cada `yielder << valor` é um item que o consumidor vai puxar. Nada roda até alguém chamar `next`, `take`, `to_a`.

**Como funciona:**
```ruby
pares = Enumerator.new do |yielder|
  n = 0
  loop do
    yielder << n
    n += 2
  end
end

pares.take(4)  # [0, 2, 4, 6]
```

`take` no Enumerator **sem** `lazy` já para depois de N. O yielder é pull: o `loop` interno só anda quando o consumidor pede.

Cuidado: `map` / `select` **nesse** Enumerator ainda são eager do Enumerable — tentam ir até o fim. Sequência infinita + `map` sem `lazy` = hang.

```ruby
# RUIM — map eager no infinito
pares.map { |n| n * 10 }.take(3)  # não volta

# BOM — take primeiro, ou lazy
pares.take(3).map { |n| n * 10 }  # [0, 20, 40]
pares.lazy.map { |n| n * 10 }.take(3).to_a
```

**Quando usar:**
Gerador próprio (páginas de API, tickets, IDs). Quando a fonte não é Array.

**Na entrevista:**
> "Enumerator.new recebe o yielder. Eu empilho com <<. O loop infinito é ok porque take e next puxam. map sem lazy no infinito trava."

---

## Cadeia lazy

**O que é:**
`Enumerable#lazy` devolve `Enumerator::Lazy`. `map`, `select`, `reject`, `grep`, `drop`, `take`, `flat_map` continuam lazy: cada um é um estágio, nenhum monta Array no meio. O trabalho dispara em `to_a`, `force`, `first`, `reduce`, `each`.

**Como funciona:**
```ruby
# eager — 1.6: cada passo é Array novo
(1..1_000_000).select(&:even?).map { |n| n * 3 }.take(3)
# filtra um milhão, mapeia ~500k, aí pega 3

# lazy — puxa só o suficiente para 3 resultados
(1..1_000_000).lazy
  .select(&:even?)
  .map { |n| n * 3 }
  .take(3)
  .to_a
# [6, 12, 18]
```

`force` é alias de `to_a` no Lazy. Sem um desses no fim, você está segurando uma receita, não o prato.

O que **força** mesmo em cadeia lazy: `sort`, `group_by`, `min`, `max`, `reduce` / `inject`, `count` (percorre tudo), `uniq` até o fim se você materializa. `first` e `take` param cedo.

**Quando usar:**
Pipeline em cima de fonte grande ou infinita, e você só quer um prefixo. Recap do [1.6](/01-ruby-basics/06-enumerable): em Array pequeno, a cadeia eager já está boa.

**Na entrevista:**
> "lazy adia map e select. to_a e force executam. sort não tem como ser lazy de verdade — precisa de todo mundo. Eu não coloco lazy por costume; coloco quando o meio da cadeia explodiria."

---

## Sequências infinitas

**O que é:**
Range aberto `(1..)`, `Enumerator.new` com `loop`, ciclo. Sem ponto de parada na fonte. Quem tem que parar é o consumidor: `take`, `first`, `find`.

**Como funciona:**
```ruby
(1..).take(3)                 # [1, 2, 3] — take segura
(1..).select(&:even?).take(3) # hang — select eager
(1..).map { |n| n * 2 }.first # hang — map eager

(1..).lazy.select(&:even?).take(3).to_a  # [2, 4, 6]
(1..).lazy.map { |n| n * 2 }.first       # 2
```

`find` no lazy infinito é ok se existir match. Se não existir, não volta — agora sem estourar RAM no meio.

**Quando usar:**
Gerar até achar, demo de entrevista. Em produção, infinito sem timeout é bug disfarçado.

**Na entrevista:**
> "Range infinito + map eager trava. lazy + take resolve. take sozinho no Range já resolve — o perigo é o select/map no meio."

---

## Quando lazy ajuda

**O que é:**
O ganho não é “Ruby mais rápido”. É **não materializar** o intermediário. Arquivo de 2 GB, log, CSV: você não quer 2 GB em Array de linhas para achar as 10 primeiras com `ERROR`.

**Como funciona:**
```ruby
# IO grande — lê linha a linha, para no 10º match
File.foreach("log.txt").lazy
  .map(&:chomp)
  .reject(&:empty?)
  .grep(/ERROR/)
  .take(10)
  .to_a
```

Se você abre com `File.open`, o `to_a` tem que rodar **dentro** do block. A cadeia lazy não lê sozinha — o handle precisa estar aberto na hora do force.

No Rails, o primo **não** é `lazy`. É batch no banco:

```ruby
# NÃO é Enumerable#lazy — é query em fatias
User.find_each(batch_size: 1000) do |user|
  UserMailer.digest(user).deliver_later
end
```

**Quando usar:**
Stream de IO, “primeiros N depois de filtrar”, gerador infinito com corte. Job que processa arquivo linha a linha.

**Na entrevista:**
> "lazy brilha em IO e em 'quero 10, não o arquivo inteiro'. User.find_each é outro problema: memória do banco, não do Enumerator. User.all.lazy ainda carrega a tabela."

---

## Quando lazy não ajuda

**O que é:**
Coleção já na RAM, pequena, e você vai consumir **tudo**. Aí lazy só empilha objetos `Enumerator::Lazy` e chama um `each` extra por estágio. Perde clareza. Não ganha memória.

**Como funciona:**
```ruby
# inútil — 20 users já estão na memória
users.lazy.select(&:active?).map(&:email).to_a

# a cadeia do 1.6 basta
users.select(&:active?).map(&:email)
```

Relation não vira stream com `.lazy`:

```ruby
# RUIM — carrega todos, aí brinca de lazy
User.all.lazy.select { |u| u.email.end_with?("@empresa.com") }.map(&:id).to_a

# BOM — SQL
User.where("email LIKE ?", "%@empresa.com").pluck(:id)
```

`sort`, `group_by`, `reduce` no lazy **exigem** a sequência inteira. Você pagou o wrapper e ainda materializou.

`uniq` lazy segura um Set do que já viu — memória cresce com a cardinalidade. Não é de graça.

**Quando usar:**
Quase nunca nesse cenário. Prefira a cadeia eager do 1.6, ou SQL.

**Na entrevista:**
> "lazy não é otimização mágica. Array pequeno: atrapalha. Active Record: a query é que é lazy, não o mixin. Se eu vou sort, eu já precisei de tudo."

---

## Recapitulando

- Enumerator é o iterator objeto. Sem block, `each` / `map` / `select` devolvem um.
- `with_index` cola no Enumerator — por isso o `each` solto existe.
- `next` / `peek` / `rewind`: iterator externo. Fim = `StopIteration`. `loop` engole.
- `Enumerator.new` + yielder: gerador. `take` puxa; `map` eager no infinito trava.
- `lazy` faz `map`/`select` pull. Dispara em `to_a` / `force` / `first`.
- Infinito: corte no consumidor (`take`, `find`). Sem corte, hang.
- Ajuda: IO grande, prefixo depois do filtro. Não ajuda: Array pequeno, `User.all`, `sort`.
- `find_each` é batch de SQL. Não confundir com `Enumerable#lazy`.

---

## Exercícios práticos

### Exercício 1: gerador de ímpares

**Enunciado:** Com `Enumerator.new`, faça um enumerator infinito de ímpares positivos (1, 3, 5, …). Tire os 5 primeiros. Depois explique por que `impares.map { |n| n * 10 }.take(3)` não volta, e o que você mudaria.

<details>
<summary>Solução</summary>

```ruby
impares = Enumerator.new do |yielder|
  n = 1
  loop do
    yielder << n
    n += 2
  end
end

impares.take(5)  # [1, 3, 5, 7, 9]
```

`map` sem lazy percorre até o fim para montar Array. O fim não existe. Duas saídas:

```ruby
impares.take(3).map { |n| n * 10 }                 # [10, 30, 50]
impares.lazy.map { |n| n * 10 }.take(3).to_a       # [10, 30, 50]
```

**Pontos-chave:**
- Yielder só anda quando alguém puxa
- `take` no Enumerator (não-lazy) já corta
- `map` eager no infinito é hang, não erro bonito
</details>

### Exercício 2: log sem explodir a RAM

**Enunciado:** Reescreva para não carregar o arquivo inteiro. Quer as 3 primeiras linhas que contêm `ERROR`, sem linha vazia, já com `chomp`. O arquivo pode ter milhões de linhas.

```ruby
linhas = File.readlines("log.txt")
linhas
  .map(&:chomp)
  .reject(&:empty?)
  .select { |linha| linha.include?("ERROR") }
  .take(3)
```

<details>
<summary>Solução</summary>

```ruby
File.foreach("log.txt").lazy
  .map(&:chomp)
  .reject(&:empty?)
  .select { |linha| linha.include?("ERROR") }
  .take(3)
  .to_a
```

`File.readlines` monta Array de todas as linhas. `foreach` entrega Enumerator. `lazy` impede o `select` de ir até o EOF antes do `take`. Sem `to_a` no fim você devolve `Enumerator::Lazy`, não as 3 strings.

**Pontos-chave:**
- `readlines` = RAM do arquivo
- `foreach` + `lazy` + `take` = para no 3º match
- `to_a` / `force` materializa
</details>

### Exercício 3: o que a entrevista pergunta

**Enunciado:** Três perguntas curtas. Responda em frase de entrevista.

1. O que `[1, 2, 3].map` devolve sem block? Para que serve?
2. `User.all.lazy.map(&:email).to_a` evita carregar todos os users?
3. O que imprime? Por quê?

```ruby
enum = [:a, :b].each
loop { puts enum.next }
puts "fim"
```

<details>
<summary>Solução</summary>

1. Enumerator. Serve para encadear (`with_index`) ou puxar depois com `next` / `each`.
2. Não. O lazy do Enumerable itera a Relation e o AR carrega a tabela. Não é query lazy. Use `pluck(:email)` ou `find_each` se o ponto for memória.
3. Imprime `a`, `b`, depois `fim`. `loop` trata `StopIteration` quando o enumerator acaba.

**Pontos-chave:**
- Sem block → Enumerator, não Array
- AR lazy ≠ Enumerable lazy
- `loop` + `next` é o idioma do fim
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
