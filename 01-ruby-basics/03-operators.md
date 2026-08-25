# 1.3 Operadores

> **TL;DR**
> Operador em Ruby é método. `==` compara valor, `eql?` valor e tipo (Hash usa), `equal?` identidade. `===` é case equality — o `when` chama isso. `<=>` destrava Comparable. `&&` / `||` na expressão; `and` / `or` têm precedência baixa e pegam gente. `&.` para nil. `||=` memoiza, mas `false` quebra. `*` explode Array, `**` explode Hash. `..` inclui o fim, `...` não.

## Conteúdo

- [Aritméticos](#aritméticos)
- [Igualdade](#igualdade)
- [Case equality](#case-equality)
- [Spaceship e Comparable](#spaceship-e-comparable)
- [Lógicos](#lógicos)
- [Safe navigation](#safe-navigation)
- [Memoization](#memoization)
- [Splat](#splat)
- [Ranges](#ranges)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Aritméticos

**O que é:**
`+`, `-`, `*`, `/`, `%`, `**`. São métodos: `5 + 2` é `5.+(2)`.

**Como funciona:**
```ruby
10 / 3      # 3 — Integer corta
10 / 3.0    # 3.333...
10 % 3      # 1
2 ** 10     # 1024
10.fdiv(3)  # 3.333... sem promover na mão
```

**Quando usar:**
Conta, offset, potência. Dinheiro: Integer em centavos, não Float.

**Na entrevista:**
> "Integer dividido por Integer devolve Integer. `5 / 2` é `2`. Quem veio de JS ou Python 3 espera `2.5`."

## Igualdade

**O que é:**
Três perguntas. Entrevistador ama essa.

- `==` — mesmo valor? `1 == 1.0` → `true`
- `eql?` — valor **e** tipo? `1.eql?(1.0)` → `false`
- `equal?` — mesmo objeto? `object_id`

**Como funciona:**
```ruby
1 == 1.0          # true
1.eql?(1.0)       # false
1.equal?(1)       # true — Integer é imediato

a = "joão"
b = "joão"
a == b            # true
a.eql?(b)         # true
a.equal?(b)       # false
```

**Exemplo prático:**
Hash usa `eql?` e `hash`, não `==`.

```ruby
precos = { 1 => "inteiro" }
precos[1]     # "inteiro"
precos[1.0]   # nil
```

**Na entrevista:**
> "`==` é valor. `eql?` é valor e classe — o Hash depende disso. `equal?` é `object_id`. Eu não sobrescrevo `equal?`. Se implemento `eql?`, implemento `hash` junto."

## Case equality

**O que é:**
`===` não é “igualdade estrita”. É “esse padrão cobre esse valor?”. O `when` chama `===` com o padrão à esquerda.

**Como funciona:**
```ruby
(1..10) === 7          # true
String === "joão"      # true — is_a?
/jo/ === "joão"        # true — match
->(n) { n.odd? } === 3 # true — Proc#=== chama call

case 7
when String then "texto"
when 1..10  then "faixa"
end
# "faixa" — when faz (1..10) === 7
```

**Quando usar:**
`case`, `grep`, DSL. Fora disso, `==` ou `is_a?`.

**Na entrevista:**
> "`===` é case equality. Classe, Range, Regexp e Proc implementam cada um do seu jeito. O `when` faz `padrão === alvo`."

## Spaceship e Comparable

**O que é:**
`<=>` devolve `-1`, `0`, `1` ou `nil`. Inclua Comparable e ganha `< <= > >= == between?`.

**Como funciona:**
```ruby
3 <=> 5       # -1
5 <=> 5       # 0
3 <=> "a"     # nil — incomparável

class Money
  include Comparable
  attr_reader :cents
  def initialize(cents) = @cents = cents
  def <=>(other)
    return nil unless other.is_a?(Money)
    cents <=> other.cents
  end
end

Money.new(100) < Money.new(250)  # true
```

**Quando usar:**
Ordenar tipo seu. Devolva `nil` se não for comparável — não estoure.

**Na entrevista:**
> "Eu implemento só `<=>` e incluo Comparable. O resto vem de graça."

## Lógicos

**O que é:**
`&&`, `||`, `!` na expressão. `and`, `or`, `not` fazem a mesma conta com precedência mais baixa. Só `false` e `nil` são falsy.

**Como funciona:**
```ruby
true && "ok"      # "ok" — devolve operando, não Boolean
nil || "padrão"   # "padrão"

status = true and false
status            # true
# parse: (status = true) and false

status = true && false
status            # false
```

`||` vs `or` é a mesma armadilha:

```ruby
aviso = user.admin? or user.moderator?
# (aviso = user.admin?) or user.moderator?

aviso = user.admin? || user.moderator?  # o que você quis
```

**Quando usar:**
Expressão e default: `&&` / `||`. `and` / `or` — evite. `find_by(...) or raise` funciona, mas `|| raise` lê igual.

**Na entrevista:**
> "Eu uso `&&` e `||`. `and` e `or` pegam em atribuição. `x = a and b` não faz o que o olho lê."

## Safe navigation

**O que é:**
`&.` chama o método só se o receptor não for `nil`. Se for, devolve `nil`.

**Como funciona:**
```ruby
user&.profile&.city     # nil se user (ou profile) é nil

user&.name.upcase
# name nil → NoMethodError. o &. só cobre name

user&.name&.upcase      # nil seguro

false&.to_s             # "false" — não é nil, chama
```

**Quando usar:**
Associação opcional, cadeia que admite buraco. Não use para esconder bug.

**Na entrevista:**
> "`&.` é nil-safe, não false-safe. Só cobre a chamada colada nele. `user&.name.upcase` ainda explode."

## Memoization

**O que é:**
`||=` atribui se o atual é falsy. Cache barato em instância de request.

**Como funciona:**
```ruby
def active_users
  @active_users ||= User.where(active: true).to_a
end
# @active_users || @active_users = User.where(active: true).to_a
```

**Exemplo prático:**
```ruby
# RUIM — false é falsy, busca de novo
def feature_on?
  @feature_on ||= Settings.fetch(:feature_on)
end

# BOM
def feature_on?
  return @feature_on unless @feature_on.nil?
  @feature_on = Settings.fetch(:feature_on)
end
```

**Quando usar:**
Método caro, mesmo resultado no objeto. Request-lived: ok. Class var / job que reusa instância: cuidado.

**Na entrevista:**
> "`||=` memoiza. Quebra se o valor válido for `false`. Aí eu comparo com `nil` ou uso `defined?`."

## Splat

**O que é:**
`*` explode ou junta Array (posicional). `**` explode ou junta Hash (keyword).

**Como funciona:**
```ruby
def sum(*nums) = nums.reduce(0, :+)
sum(1, 2, 3)        # 6
sum(*[1, 2, 3])     # 6

primeiro, *resto = [1, 2, 3]  # 1, [2, 3]

def greet(name:) = "Olá, #{name}!"
opts = { name: "João" }
greet(opts)         # ArgumentError em Ruby 3 — falta **
greet(**opts)       # "Olá, João!"
```

`**nil` em 3.3 é Hash vazio.

**Quando usar:**
Delegar argumento, passar options. Rails 7.1+ vive de `**`.

**Na entrevista:**
> "`*` é Array. `**` é keyword. Em Ruby 3 eu escrevo `**hash`. Sem isso, ArgumentError."

## Ranges

**O que é:**
`..` inclui os dois lados. `...` corta o fim.

**Como funciona:**
```ruby
(1..3).to_a      # [1, 2, 3]
(1...3).to_a     # [1, 2]

arr = %w[a b c d]
arr[1..]         # ["b", "c", "d"]
arr[..1]         # ["a", "b"]

case idade
when ..17 then "menor"
when 18.. then "adulto"
end
```

**Quando usar:**
`case`, slice, faixa de data. Em Range numérico/Time, `cover?` não caminha o intervalo.

**Na entrevista:**
> "`..` inclui o fim, `...` não. Off-by-one clássico. Range infinito existe: `1..` e `..10`."

## Recapitulando

- Operador é método. `equal?` você não mexe.
- `==` valor. `eql?` valor e tipo — Hash. `equal?` identidade.
- `===` é case equality. O `when` chama com o padrão à esquerda.
- `<=>` + Comparable = ordem.
- `&&` / `||` na expressão. `and` / `or` têm precedência de armadilha.
- `&.` só pula `nil`, e só na chamada colada.
- `||=` memoiza. `false` válido quebra.
- `*` posicional, `**` keyword. Ruby 3 exige `**` no Hash.
- `..` inclusivo. `...` exclusivo no fim.

## Exercícios práticos

### Exercício 1: `==`, `eql?`, `equal?`

**Enunciado:** O que cada linha devolve? Por quê?

```ruby
1 == 1.0
1.eql?(1.0)
"a" == "a"
"a".eql?("a")
"a".equal?("a")
h = { 1 => "x" }
h[1.0]
```

<details>
<summary>Solução</summary>

```ruby
1 == 1.0         # true  — valor
1.eql?(1.0)      # false — Integer vs Float
"a" == "a"       # true
"a".eql?("a")    # true  — conteúdo
"a".equal?("a")  # false — dois objetos
h[1.0]           # nil   — Hash usa eql?
```

`1.equal?(1)` seria `true` (Integer imediato). Não misture com String.

**Pontos-chave:**
- Três perguntas, três métodos
- Hash não usa `==`
- `===` é outro contrato — não misture
</details>

### Exercício 2: Por que `status` fica `true`?

**Enunciado:** Explique o parse e reescreva para `status` ser `false`.

```ruby
status = User.active.exists? and User.admin.exists?
```

Primeiro `exists?` é `true`, o segundo é `false`. Qual o valor de `status`?

<details>
<summary>Solução</summary>

```ruby
(status = User.active.exists?) and User.admin.exists?
```

`status` recebe `true`. O `and` avalia o segundo lado e descarta.

```ruby
status = User.active.exists? && User.admin.exists?  # false
```

**Pontos-chave:**
- `and` / `or` são mais baixos que `=`
- Na expressão, `&&` e `||`
- Mesmo bug existe com `or` e default
</details>

### Exercício 3: `||=` e `false`

**Enunciado:** O método é chamado 3 vezes. `Settings.fetch` devolve `false`. Quantas vezes o `fetch` roda? Como corrigir sem perder memoization?

```ruby
def checkout_enabled?
  @checkout_enabled ||= Settings.fetch(:checkout_enabled)
end
```

<details>
<summary>Solução</summary>

Roda **3 vezes**. `false` é falsy, então `||=` nunca grava.

```ruby
def checkout_enabled?
  return @checkout_enabled unless @checkout_enabled.nil?
  @checkout_enabled = Settings.fetch(:checkout_enabled)
end
```

`defined?(@checkout_enabled)` também serve — distingue “nunca setou” de “setou `false`”. `nil?` basta quando `nil` não é valor válido.

**Pontos-chave:**
- `||=` testa truthiness, não “já calculou”
- Flag booleana não combina com `||=`
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
