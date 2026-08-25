# 2.6 Comparable

> **TL;DR**
> `<=>` devolve `-1`, `0`, `1` ou `nil`. Você implementa só isso, dá `include Comparable` e ganha `< > <= >= == between?`. `==` vem de graça: o mixin pergunta se o spaceship deu `0`. `sort` usa `<=>` — o mixin nem é obrigatório para ordenar. Devolva `nil` se o tipo não compara. Dinheiro: Integer em centavos. Versão: não compare string.

## Conteúdo

- [O mixin](#o-mixin)
- [O spaceship](#o-spaceship)
- [include Comparable](#include-comparable)
- [Os operadores](#os-operadores)
- [between? e clamp](#between-e-clamp)
- [sort](#sort)
- [Money](#money)
- [Version](#version)
- [Por que == vem de graça](#por-que--vem-de-graça)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O mixin

**O que é:**
Comparable é module, igual Enumerable. Lá o contrato é `each`. Aqui o contrato é `<=>`. Um método. O resto o Ruby monta.

**Como funciona:**
`Object` só te dá `==` de identidade (`equal?`). Sem `<=>` e sem o mixin, `Ticket.new(1) < Ticket.new(2)` é `NoMethodError`. User não tem “menor que” de graça.

**Quando usar:**
Value object com **uma** ordem natural: dinheiro, versão, nota, prioridade. User, Order, Post — não.

**Na entrevista:**
> "Comparable é o Enumerable da ordem. Você implementa `<=>`. O mixin te dá os operadores. sort só precisa do spaceship."

---

## O spaceship

**O que é:**
`<=>` (spaceship) é o método de comparação. Quatro respostas, não duas.

| retorno | significado |
|---|---|
| `-1` | `self` vem antes de `other` |
| `0` | equivalentes na ordem |
| `1` | `self` vem depois |
| `nil` | incomparável — tipo errado |

**Como funciona:**
```ruby
3 <=> 5       # -1
5 <=> 5       # 0
5 <=> 3       # 1
3 <=> "a"     # nil

[1, 0] <=> [1, 2]     # -1 — Array decide no primeiro que difere
["2", "0"] <=> ["10"] # 1 — string, não número
```

**Quando usar:**
Toda vez que o tipo tem ordem. Devolva `nil` se `other` não for o seu tipo. Não levante. Não invente `0` para calar o erro — aí `Money == String` vira true.

**Na entrevista:**
> "`<=>` não é boolean. É -1, 0, 1 ou nil. nil quer dizer 'não sei comparar', não 'são iguais'."

---

## include Comparable

**O que é:**
O mixin lê o seu `<=>` e define os operadores. Sem o `include`, `<=>` sozinho já serve para `sort` / `min` / `max`. Os `<` `>` `==` de valor **não** aparecem.

**Como funciona:**
```ruby
class Priority
  include Comparable
  attr_reader :level

  def initialize(level) = @level = level

  def <=>(other)
    return nil unless other.is_a?(Priority)
    level <=> other.level
  end
end

baixa = Priority.new(1)
alta  = Priority.new(10)

baixa < alta                  # true
baixa == Priority.new(1)      # true
baixa.between?(Priority.new(0), Priority.new(5))  # true
```

O `return nil unless other.is_a?(Priority)` é o contrato. Sem isso, `priority <=> 3` compara o Integer interno e mente.

**Quando usar:**
Quando alguém vai escrever `a < b` no domínio. Se a única operação é `sort_by(&:price_cents)`, o mixin é teatro.

**Na entrevista:**
> "include Comparable. Um `<=>`. Tipo errado: eu devolvo nil. sort funciona só com o spaceship; o mixin é para o operador."

---

## Os operadores

**O que é:**
Açúcar em cima do spaceship. Na cabeça:

```ruby
def <(other)  = (self <=> other) < 0
def ==(other) = (self <=> other) == 0
```

(`==` de verdade ainda trata identidade e o `nil` — a ideia é essa.)

**Como funciona:**
```ruby
a = Priority.new(1)
b = Priority.new(2)

a < b                 # true  — <=> deu -1
a <= a                # true  — <=> deu 0
a == Priority.new(1)  # true
a == "urgente"        # false — <=> deu nil
a < "urgente"         # ArgumentError
```

Essa assimetria cai em entrevista. `==` com tipo errado é `false`. `<` com tipo errado estoura: `comparison of Priority with String failed`. `<=` e `>=` incluem o empate — não reimplemente.

**Quando usar:**
Comparação no domínio (`preco < teto`, `versao >= minima`). Não use para “é o mesmo registro do banco” — aí é `id`.

**Na entrevista:**
> "`<` em cima de nil levanta. `==` em cima de nil é false. Por isso eu devolvo nil no `<=>` e deixo o mixin decidir."

---

## between? e clamp

**O que é:**
`between?(min, max)` pergunta se está no intervalo **fechado**. `clamp(min, max)` empurra para dentro. Os dois vêm do Comparable (`clamp` desde 2.4; aceita Range).

**Como funciona:**
```ruby
18.between?(18, 65)   # true — inclui as pontas
12.clamp(0, 10)       # 10
(-1).clamp(0..10)     # 0

preco = Money.new(15_000)  # R$ 150,00
preco.between?(Money.new(10_000), Money.new(20_000))  # true
```

**Quando usar:**
Faixa (idade, desconto, timeout). `clamp` em input que não pode sair do range — percentual, retry, nota.

**Na entrevista:**
> "between? é inclusivo. clamp não valida: corrige."

---

## sort

**O que é:**
`Array#sort` chama `<=>` entre os elementos. Não exige `include Comparable`. Exige um spaceship que fale a mesma língua.

**Como funciona:**
```ruby
[Priority.new(10), Priority.new(1), Priority.new(5)].sort  # 1, 5, 10
[Priority.new(1), "x"].sort  # ArgumentError: comparison of Priority with String failed

# User não precisa ser Comparable
users.sort_by(&:created_at)
pedidos.sort_by { |p| -p.total_cents }  # maior primeiro
```

`sort_by` extrai a chave uma vez. `sort { |a, b| a.preco <=> b.preco }` compara várias. Em entrevista, `sort_by` ganha.

**Quando usar:**
`sort` no value object. `sort_by` no model. Não coloque Comparable em `User` só para ordenar por nome.

**Na entrevista:**
> "sort usa `<=>`, não o mixin. Se a ordem é um campo, sort_by. Comparable é para o tipo *ser* a ordem."

---

## Money

**O que é:**
Value object de dinheiro. Integer em **centavos**. Float não entra — capítulo 1.1 já matou isso.

**Exemplo prático:**
```ruby
class Money
  include Comparable
  attr_reader :cents

  def initialize(cents) = @cents = Integer(cents)

  def <=>(other)
    return nil unless other.is_a?(Money)
    cents <=> other.cents
  end

end

a = Money.new(1_010)   # R$ 10,10
b = Money.new(1_020)   # R$ 10,20

a < b                  # true
a == Money.new(1_010)  # true
a == 1010              # false
[b, a].sort            # [a, b]
```

O mixin só ordena. `+` você escreve à parte. No Rails, `money-rails` existe; na entrevista pedem as 15 linhas.

**Na entrevista:**
> "Money guarda centavos em Integer, inclui Comparable, compara cents. `== 1010` é false — Integer não é Money."

---

## Version

**O que é:**
Versão semântica (`major.minor.patch`). String mente: `"1.10" < "1.2"` e `"2.0.0" > "10.0.0"` é false (`"1" < "2"`).

**Exemplo prático:**
```ruby
class Version
  include Comparable
  attr_reader :major, :minor, :patch

  def initialize(major, minor, patch)
    @major, @minor, @patch = Integer(major), Integer(minor), Integer(patch)
  end

  def self.parse(texto)
    major, minor, patch = texto.split(".").map(&:to_i)
    new(major, minor, patch || 0)
  end

  def <=>(other)
    return nil unless other.is_a?(Version)
    [major, minor, patch] <=> [other.major, other.minor, other.patch]
  end

  def to_s = "#{major}.#{minor}.#{patch}"
end

v1, v2 = Version.parse("1.10.0"), Version.parse("1.2.0")
v1 > v2                     # true — 10 > 2 no minor
[v1, v2].sort.map(&:to_s)  # ["1.2.0", "1.10.0"]
```

O truque é `Array#<=>` em três inteiros. Em produção: `Gem::Version`. No quadro: essa classe.

**Na entrevista:**
> "Versão eu não comparo como string. Quebro em inteiros e deixo o Array#<=> decidir. 1.10 fica depois de 1.2."

---

## Por que == vem de graça

**O que é:**
A pergunta clássica. Você não escreveu `def ==`. Mesmo assim `Money.new(100) == Money.new(100)` é true. Por quê?

**Como funciona:**
`Object#==` é identidade: dois `new` são diferentes. `include Comparable` **sobrescreve** `==`. Se `<=>` deu `0`, iguais. Se deu `-1` ou `1`, diferentes. Se deu `nil`, `false` — sem ArgumentError.

```ruby
# o que o mixin faz, resumido
def ==(other)
  return true if equal?(other)
  (self <=> other) == 0   # nil == 0 → false
end
```

O `<=>` tem que ser simétrico: `a <=> a` é `0`; se `a <=> b` é `-1`, `b <=> a` é `1`. Quebrar isso quebra `sort` de forma feia.

**Importante na entrevista:**
Comparable **não** define `eql?` nem `hash`. Hash e Set usam os dois. `==` bate e a chave não:

```ruby
Money.new(100) == Money.new(100)              # true
{ Money.new(100) => "ok" }[Money.new(100)]    # nil
```

`==` é valor (mixin). `eql?`/`hash` é outro contrato. Se precisar de chave, implemente os dois em cima de `cents`.

**Na entrevista:**
> "`==` vem de graça porque Comparable delega para `<=> == 0`. Eu não reescrevo `==` se o spaceship já define a igualdade. eql? e hash o mixin não mexe."

---

## Recapitulando

- Comparable é mixin. O contrato é `<=>`.
- Spaceship: `-1`, `0`, `1`, `nil`. nil = incomparável, não é empate.
- `include Comparable` libera `< > <= >= == between? clamp`.
- `==` é `<=> == 0`. Por isso vem de graça. Tipo errado → `false`.
- `<` com `nil` explode (`ArgumentError`).
- `sort` / `min` / `max` usam `<=>`. O mixin é opcional para ordenar.
- `sort_by` no model. Comparable no value object.
- Money: Integer em centavos. Version: três inteiros, não string.
- `eql?` / `hash` não vêm no pacote.

---

## Exercícios práticos

### Exercício 1: por que == vem de graça?

**Enunciado:** Implemente `Rating` (nota 0–10, Integer). Inclua Comparable. Mostre `r1 == r2` com dois `new` iguais, `r1 < r2`, e `r1 == 7` (false). Em duas frases: de onde veio o `==`, e o que acontece no `<` se o outro não for `Rating`.

<details>
<summary>Solução</summary>

```ruby
class Rating
  include Comparable
  attr_reader :value

  def initialize(value)
    @value = Integer(value)
    raise ArgumentError unless (0..10).cover?(@value)
  end

  def <=>(other)
    return nil unless other.is_a?(Rating)
    value <=> other.value
  end
end

r1, r2, r3 = Rating.new(7), Rating.new(7), Rating.new(9)
r1 == r2   # true — mesmo valor, objetos diferentes
r1 < r3    # true
r1 == 7    # false — <=> devolveu nil
```

"`==` o Comparable monta: pergunta se `<=>` deu 0. Sem o mixin, dois `new(7)` dariam false." "`r1 < 7` levanta ArgumentError; `==` com tipo errado só devolve false."

**Pontos-chave:**
- Um método: `<=>`
- `==` grátis via `0`
- `nil` no tipo errado
</details>

### Exercício 2: Version que string quebra

**Enunciado:** Ordene `["2.0.0", "1.10.0", "1.2.0"]` como String e com a classe `Version` deste capítulo. Por que a ordem string está errada para semver?

<details>
<summary>Solução</summary>

```ruby
versos = ["2.0.0", "1.10.0", "1.2.0"]

versos.sort
# ["1.10.0", "1.2.0", "2.0.0"] — 1.10 antes de 1.2, errado

versos.map { |v| Version.parse(v) }.sort.map(&:to_s)
# ["1.2.0", "1.10.0", "2.0.0"]
```

`"1.10.0" <=> "1.2.0"` compara caractere. No terceiro passo `"1" < "2"`, então 1.10 “é menor”. Numericamente o minor 10 > 2.

**Pontos-chave:**
- String não é semver
- Array de Integer + `<=>` resolve
- `Gem::Version` existe fora do quadro
</details>

### Exercício 3: sort sem mixin

**Enunciado:** Tire o `include Comparable` de `Money`. O que continua funcionando: `[b, a].sort`, `a < b`, `a == Money.new(a.cents)`, `a.between?(x, y)`? Quando `sort_by(&:cents)` seria melhor do que tornar `Money` Comparable?

<details>
<summary>Solução</summary>

Sem o mixin, com `<=>` no lugar:

- `[b, a].sort` — funciona. `Array#sort` chama `<=>`.
- `a < b` — `NoMethodError`.
- `a == Money.new(a.cents)` — `false`. Voltou `Object#==` (identidade).
- `a.between?(x, y)` — `NoMethodError`.

`sort_by(&:cents)` é melhor quando a ordem é só daquela lista, ou quando o array é outro tipo (`Invoice`) e a chave é o atributo. Comparable entra quando `a < b` faz parte da linguagem do domínio.

**Pontos-chave:**
- sort ≠ mixin
- `==` sem mixin é identidade — a pegadinha
- mixin é API de operador, não requisito de ordenação
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
