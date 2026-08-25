# 3.4 Proc, lambda e yield

> **TL;DR**
> Block não é objeto. Proc é. Lambda também é Proc — com `lambda?`. `proc {}` / `Proc.new` perdoa arity e o `return` sai do método. `lambda {}` / `-> {}` cobra arity e o `return` sai só do lambda. `yield` não aloca; `&block` aloca e viaja. `block_given?` evita `LocalJumpError`. `curry` existe; quase não cai. Rails: `scope :paid, -> { where(...) }`.

## Conteúdo

- [Block não é objeto](#block-não-é-objeto)
- [Como criar](#como-criar)
- [Arity](#arity)
- [return](#return)
- [yield, block_given? e &block](#yield-block_given-e-block)
- [Closure](#closure)
- [curry](#curry)
- [No Rails](#no-rails)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Block não é objeto

**O que é:**
Block (`{ }` / `do/end`) é sintaxe. Não tem classe, não vai pra variável. Proc é o objeto. Lambda é Proc com `lambda? == true`. Sintaxe do block, `{ }` vs `do/end` e `&:to_s`: [1.5](/01-ruby-basics/05-methods-and-blocks).

**Como funciona:**
```ruby
p = proc { |n| n * 2 }
l = ->(n) { n * 2 }

p.class       # Proc
l.class       # Proc
p.lambda?     # false
l.lambda?     # true
```

Três nomes, dois objetos. Block some no fim da chamada. Guardar, passar, testar? Vira Proc.

**Na entrevista:**
> "Block não é objeto. Proc é. Lambda também é Proc — eu olho `lambda?`. A diferença que cai é arity e return."

---

## Como criar

**O que é:**
Quatro literais, duas espécies.

| Literal | Espécie | `lambda?` |
|---|---|---|
| `proc { }` | proc | `false` |
| `Proc.new { }` | proc | `false` |
| `lambda { }` | lambda | `true` |
| `-> { }` / `->(x) { }` | lambda | `true` |

**Como funciona:**
`proc` e `Proc.new` são o mesmo no Ruby 3. `lambda` e `->` também. Código novo: `->` para lambda. Keyword vale: `->(n:) { n * 2 }`.

Chamar: `dobra.call(3)`, `dobra[3]`, `dobra.(3)` — os três disparam.

`Proc.new` **sem** block no Ruby 3: `ArgumentError`. Não capture o block implícito do método assim. Use `&block`.

**Quando usar:**
`->` quando o callable é API e vai viver. `proc` só se você quer o comportamento de block. No Rails, quase sempre `->`.

**Na entrevista:**
> "`->` é lambda. `proc` é Proc.new. Os dois são classe Proc. Eu distingo com `lambda?`."

---

## Arity

**O que é:**
Quantos args o callable aceita. **Lambda cobra, igual método. Proc perdoa, igual block.** Primeiro clássico.

**Como funciona:**
```ruby
p = proc { |a, b| [a, b] }
p.call(1)        # [1, nil]  — falta vira nil
p.call(1, 2, 3)  # [1, 2]    — extra ignora

l = ->(a, b) { [a, b] }
l.call(1, 2)     # [1, 2]
l.call(1)        # ArgumentError (given 1, expected 2)
l.call(1, 2, 3)  # ArgumentError
```

Proc **desestrutura array**, como o block do `each`. Lambda não:

```ruby
proc { |a, b| a + b }.call([10, 20])  # 30
->(a, b) { a + b }.call([10, 20])     # ArgumentError
->((a, b)) { a + b }.call([10, 20])   # 30 — você pediu o par
```

Default e splat no lambda afrouxam, como no `def`: `->(a, b = 0)` aceita um arg; `->(*args)` aceita N.

**Quando usar:**
Callback com contrato: lambda. `map`/`each`: o Ruby já te dá proc-like. Passar `->(a, b)` no `map` de `[[1, 2]]` quebra; block não.

**Na entrevista:**
> "Lambda é método: número certo ou ArgumentError. Proc é block: falta nil, extra ignora, array unsplata. Por isso `map(&->(a, b) { })` em array de pares explode e o block não."

---

## return

**O que é:**
Segundo clássico. **Lambda: `return` sai do lambda.** **Proc: `return` sai do método onde o proc nasceu.** Não do `call`. Do método léxico.

**Como funciona:**
```ruby
def com_proc
  f = proc { return "proc" }
  f.call
  "método"
end
com_proc  # "proc" — furou o método

def com_lambda
  f = -> { return "lambda" }
  f.call
  "método"
end
com_lambda  # "método" — o return ficou no lambda
```

Proc que **sobrevive** ao método e depois dá `return`:

```ruby
def registrar
  proc { return "ok" }
end

registrar.call  # LocalJumpError — o método já acabou
```

Lambda não tem esse buraco: o `return` sempre volta pra ele mesmo.

`next` nos dois devolve valor e segue o callable. `break` no proc tenta sair do iterator que deu `yield`; no lambda vira `LocalJumpError`. Na entrevista, arity + return bastam. `break` é o follow-up.

**Quando usar:**
Callback guardado (`after_commit`, job, `scope`): **lambda**. `return` no proc de callback ou fura o método na hora, ou `LocalJumpError` depois.

**Na entrevista:**
> "return no proc é return do método. return no lambda é return do lambda. Proc que escapa e dá return: LocalJumpError. Por isso callback eu escrevo com `->`."

---

## yield, block_given? e &block

**O que é:**
O método recebe **no máximo um** block. `yield` chama sem criar Proc. `&block` na assinatura **aloca** Proc. `block_given?` pergunta sem consumir. Sem block, `yield` é `LocalJumpError`.

**Como funciona:**
```ruby
def with_lock
  raise "precisa de block" unless block_given?
  lock!
  result = yield self
  unlock!
  result
end

order.with_lock { |o| o.charge!(cents) }
```

`yield user` passa arg. `yield` várias vezes é o `each`.

Guardar ou passar adiante pede `&`:

```ruby
def each_paid(&block)
  raise ArgumentError, "block obrigatório" unless block
  Order.paid.find_each(&block)
end

each_paid(&handler)  # Proc vira block de novo
```

Com `&block` na assinatura, `block` é `nil` se ninguém passou. `block_given?` continua válido. Hot path: `yield`. Callback / `find_each(&block)` / ivar: `&block`.

**Quando usar:**
`yield` + `block_given?` se o block morre na chamada. `&block` se o Proc viaja — outro método, lista de callbacks, thread.

**Na entrevista:**
> "yield não cria objeto. &block cria Proc. Preciso só chamar? yield. Preciso guardar ou passar? &block. block_given? evita o LocalJumpError."

---

## Closure

**O que é:**
Proc/lambda carrega o binding. A local do método onde nasceu vive enquanto o Proc existir.

**Como funciona:**
```ruby
def make_counter
  n = 0
  -> { n += 1 }
end

c = make_counter
c.call  # 1
c.call  # 2
```

`n` não some no `end`. Dois counters: dois `n`. Escopo do block: [1.2](/01-ruby-basics/02-variables-and-scope).

**Na entrevista:**
> "Proc é closure. Ele leva as locais junto. Counter, memo, callback que lê `user` de fora — é isso."

---

## curry

**O que é:**
`Proc#curry` espera os args aos poucos. Menciona se perguntarem. Não é o dia a dia Rails.

**Como funciona:**
```ruby
soma = ->(a, b, c) { a + b + c }
soma.curry.call(1).call(2).call(3)  # 6
soma.curry[1][2][3]                 # 6
```

Lambda combina melhor: arity é contrato, o curry sabe quando completar. Proc com arity frouxa (`|*args|`) precisa de `curry(n)`.

**Na entrevista:**
> "curry existe em Proc. Eu quase não uso. Se pedirem, mostro o `->(a, b)` virando `add_ten`."

---

## No Rails

**O que é:**
O `->` no model é lambda. Avalia **na hora da query**, não no load da classe.

**Como funciona:**
```ruby
class Order < ApplicationRecord
  scope :paid, -> { where(status: :paid) }
  scope :since, ->(date) { where("created_at >= ?", date) }

  after_commit -> { NotifyJob.perform_later(id) }, on: :create
end
```

Sem lambda, `where(...)` no `scope` roda no `class` load — conexão nem existe, ou o valor congela. Com `->`, cada chamada executa de novo. `around_action` / `around_save`: o Rails dá `yield` no meio.

**Quando usar:**
`scope`, callback, `if: -> { paid? }` no `validates`. Preferir `->` sempre que o callable for guardado.

**Na entrevista:**
> "scope com -> é lambda pra não rodar no load. Callback também. Proc nesse lugar é o return/LocalJumpError esperando pra acontecer."

---

## Recapitulando

- Block não é objeto. Proc é. Lambda é Proc com `lambda?`.
- `proc {}` / `Proc.new` = proc. `lambda {}` / `-> {}` = lambda.
- Arity: lambda cobra; proc perdoa e unsplata array.
- `return` no lambda sai do lambda; no proc sai do método. Proc que escapa + `return` = `LocalJumpError`.
- `yield` não aloca. `&block` aloca e viaja. `block_given?` se o block é opcional.
- Proc é closure: leva as locais.
- `curry` existe; raro no Rails.
- Rails: `scope` e callback com `->`.

---

## Exercícios práticos

### Exercício 1: O que cada `call` faz?

**Enunciado:** Sem rodar, diga o resultado de cada linha.

```ruby
p = proc { |a, b| [a, b] }
l = ->(a, b) { [a, b] }

p.call(1)
p.call(1, 2, 3)
p.call([1, 2])

l.call(1)
l.call(1, 2)
l.call([1, 2])
```

<details>
<summary>Solução</summary>

```ruby
p.call(1)        # [1, nil]
p.call(1, 2, 3)  # [1, 2]
p.call([1, 2])   # [1, 2]  — unsplat

l.call(1)        # ArgumentError
l.call(1, 2)     # [1, 2]
l.call([1, 2])   # ArgumentError — um arg (o array)
```

Lambda com desestrutura: `->((a, b)) { [a, b] }.call([1, 2])` # `[1, 2]`.

**Pontos-chave:**
- Proc = block: falta nil, extra cai, array abre
- Lambda = método: conta certa ou `ArgumentError`
- `map(&->(a, b) { })` em `[[1, 2]]` quebra
</details>

### Exercício 2: O que cada método devolve?

**Enunciado:** Qual o retorno de `alpha` e `beta`? E se alguém guardar o callable e chamar depois?

```ruby
def alpha
  f = proc { return 1 }
  f.call
  2
end

def beta
  f = -> { return 1 }
  f.call
  2
end

def gamma
  proc { return 1 }
end
```

<details>
<summary>Solução</summary>

`alpha` → `1`. O `return` do proc é return de `alpha`. A linha `2` não roda.

`beta` → `2`. O `return` sai do lambda. `beta` segue.

`gamma.call` depois do método: `LocalJumpError`. O stack de `gamma` já morreu.

```ruby
alpha       # 1
beta        # 2
gamma.call  # LocalJumpError
```

Troca o `proc` de `gamma` por `-> { return 1 }` e o `call` devolve `1`, sem erro.

**Pontos-chave:**
- Proc fura o método léxico
- Lambda devolve e o método continua
- Callback que vive = lambda
</details>

### Exercício 3: O `find_each` não recebe o block

**Enunciado:** Por que o block do caller não chega no `find_each`? Como corrige?

```ruby
def each_paid_broken
  Order.paid.find_each
end

each_paid_broken { |o| puts o.id }
```

<details>
<summary>Solução</summary>

Um método, um block. `find_each` sem `&` não herda o block do caller. Sem block, `find_each` devolve Enumerator — o seu `{ |o| ... }` fica em `each_paid_broken` e ninguém chama.

```ruby
def each_paid(&block)
  Order.paid.find_each(&block)
end

# ou, se só encaminha na hora:
def each_paid
  Order.paid.find_each { |order| yield order }
end
```

A primeira guarda o Proc e passa. A segunda dá `yield` por item. Sem um dos dois, o block some.

**Pontos-chave:**
- Block não “escorre” sozinho para o método interno
- Encaminha com `&block` ou com `yield` dentro
- `find_each` sem block = Enumerator
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
