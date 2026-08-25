# 2.7 Metaprogramação

> **TL;DR**
> Metaprogramming é código que escreve código. `define_method` gera família de métodos. `send` ignora visibilidade; `public_send` respeita. `class_eval` abre a classe; `instance_eval` troca o `self` do objeto. `respond_to?` pergunta se a mensagem existe. Rails vive disso: `has_many :orders` inventa `orders`, `order_ids`, `orders=`. Se dá para ler com três `def`, escreva três `def`. `method_missing` é o [2.8](08-method-missing.md).

## Conteúdo

- [O que é metaprogramação](#o-que-é-metaprogramação)
- [define_method](#define_method)
- [send vs public_send](#send-vs-public_send)
- [class_eval](#class_eval)
- [instance_eval](#instance_eval)
- [respond_to?](#respond_to)
- [Rails: has_many gera métodos](#rails-has_many-gera-métodos)
- [Quando NÃO usar](#quando-não-usar)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que é metaprogramação

**O que é:**
Código que define, chama ou inspeciona métodos em runtime. Em Ruby não é truque de biblioteca: você abre classe, cria método e manda mensagem pelo nome.

Você já usa. `attr_reader :name` não é açúcar de compilador — é um método que gera outro método.

**Como funciona:**
```ruby
class User
  attr_reader :name  # define o método name
end

User.instance_methods(false)  # [:name]
```

**Quando usar:**
Família mecânica (`pending?`, `paid?`). DSL de gem. Framework. Quase nunca na feature de terça.

**Na entrevista:**
> "Metaprogramming em Ruby é de primeira classe. `attr_accessor` já é isso. Eu uso para gerar método repetido. Se são três e cada um tem regra, eu escrevo três `def`."

---

## define_method

**O que é:**
Cria método de instância em runtime. O block vira o corpo e fecha sobre a variável do loop. No [1.5](/01-ruby-basics/05-methods-and-blocks#define_method) foi menção. Aqui o ponto é a closure, não a string.

**Como funciona:**
```ruby
class Order
  STATUSES = %i[pending paid canceled].freeze

  STATUSES.each do |status|
    define_method("#{status}?") { self.status.to_sym == status }
  end
end

order.paid?  # true se status == "paid"
```

`each` cria escopo. `for` reutiliza a variável — os três métodos veriam `:canceled`.

**Quando usar:**
Lista estável, corpo idêntico, nome previsível. Três `def` também resolvem. A lista cresce e continua mecânica? Aí o `each` paga.

**Na entrevista:**
> "`define_method` com `each`. O block captura a volta. `for` compartilha a variável e os três veem o último. Família mecânica, ok. Regras diferentes, eu escrevo `def`."

---

## send vs public_send

**O que é:**
Os dois chamam método pelo nome. `send` entra no private. `public_send` para na porta.

**Como funciona:**
```ruby
class Account
  def deposit(cents)
    credit(cents)
  end

  private

  def credit(cents)
    @balance_cents = (@balance_cents || 0) + cents
  end
end

account.send(:credit, 1_000)         # passa — furou o private
account.public_send(:credit, 1_000)  # NoMethodError
account.public_send(:deposit, 1_000) # passa
```

Nome vem de fora? `send` é furo. `params[:action]` vira `destroy` ou método privado.

```ruby
# RUIM
user.send(params[:action])

# MENOS RUIM — ainda perigoso se a API pública for ampla
user.public_send(params[:action])

# BOM
ALLOWED = %w[name email phone].freeze
field = params[:field].to_s
user.public_send(field) if ALLOWED.include?(field)
```

`__send__` existe porque alguém pode redefinir `send`. Em código seu, `public_send` é o default.

**Quando usar:**
`public_send` quando o nome é dado. `send` só se você **quer** o private — teste, nunca params.

**Na entrevista:**
> "`send` ignora private. `public_send` respeita. Params nunca entram no `send`. Mesmo no `public_send` eu faço allowlist."

---

## class_eval

**O que é:**
Abre a classe (ou o module) e avalia um block ou uma string no contexto dela. `self` é a classe. `def` no block vira método de instância.

**Como funciona:**
```ruby
String.class_eval do
  def shout
    "#{upcase}!"
  end
end

"oi".shout  # "OI!"
```

Block é código. String é texto parseado depois — stacktrace ruim e injeção fácil.

```ruby
# RUIM
User.class_eval "def #{params[:field]}; end"
```

Monkey patch em `String` no app? Não. O snippet é mecanismo, não estilo.

Nome da classe no fonte? Reabra com `class User; end`. `class_eval` entra quando a classe chega numa variável: `klass.class_eval { define_method(...) }`.

**Quando usar:**
DSL, concern, gem. Classe só na mão em runtime. Não para pular o `def`.

**Na entrevista:**
> "`class_eval` abre a classe. Block, não string. Nome no fonte? Eu reabro com `class`. String de `class_eval` é o caminho do `eval`."

---

## instance_eval

**O que é:**
Avalia o block com `self` igual ao objeto. Enxerga `@ivar` e método privado. `def` ali vira método singleton daquele objeto.

**Como funciona:**
```ruby
user.instance_eval { @name = "João" }
user.instance_eval { def initials; "JF"; end }
user.initials      # "JF"
User.new.initials  # NoMethodError
```

A pegadinha é na **classe**:

```ruby
Box.class_eval { def packed?; true; end }
Box.instance_eval { def default_label; "sem etiqueta"; end }

Box.new.packed?        # true — instância
Box.default_label      # "sem etiqueta" — método de classe
Box.new.default_label  # NoMethodError
```

`instance_eval` no objeto `Box` define método no singleton de `Box`. Isso é método de classe. Precisa passar argumento ao block? `instance_exec`.

DSL: o block do caller roda com `self` da config (`setup { timeout 30 }`). Em produção, furar `@ivar` com `instance_eval` é cheiro.

**Quando usar:**
DSL (`configure`). Teste que precisa furar encapsulamento. Não no código da feature.

**Na entrevista:**
> "`class_eval` na classe cria método de instância. `instance_eval` na classe cria método de classe. DSL usa `instance_eval` para o block falar a língua do objeto."

---

## respond_to?

**O que é:**
Pergunta se o objeto responde àquela mensagem. Duck typing: você não pergunta a classe, pergunta o contrato.

**Como funciona:**
```ruby
"oi".respond_to?(:upcase)        # true
"oi".respond_to?(:each)          # false
user.respond_to?(:credit)        # false se credit for private
user.respond_to?(:credit, true)  # true — inclui private
order.respond_to?(:paid?)        # true — define_method já registrou
```

`is_a?(Array)` amarra a classe. `respond_to?(:each)` aceita Array, Set, Relation. O `true` é o par do `send`: os dois veem o private.

**Quando usar:**
Adapter, serializer, helper que aceita mais de um tipo. Se só `User` entra, o tipo já disse.

**Na entrevista:**
> "`respond_to?` é duck typing. `define_method` já faz o método existir, então volta true. `method_missing` sem o par quebra isso — é o próximo capítulo."

Não implemente `respond_to_missing?` aqui. Nasce com `method_missing`, no [2.8](08-method-missing.md).

---

## Rails: has_many gera métodos

**O que é:**
Macros do Active Record são metaprogramming de framework. Você declara. O Rails instala uma família de métodos no model.

**Como funciona:**
```ruby
class User < ApplicationRecord
  has_many :orders
end

user.orders                # Relation
user.orders.create!(total_cents: 1990)
user.order_ids             # [1, 2, 3]
user.respond_to?(:orders)  # true
```

`has_many :orders` não é comentário. No load, o Rails define `orders`, `orders=`, `order_ids`. `has_one`, `belongs_to`, `enum` e `scope` fazem o mesmo tipo de trabalho.

```ruby
class Order < ApplicationRecord
  enum :status, { pending: 0, paid: 1, canceled: 2 }
end

order.paid?
order.paid!
Order.paid  # scope
```

Não invente o source na entrevista. Macro no load, método existe, Relation na chamada. Não é `method_missing` por request — isso fica no 2.8, com `find_by_*`.

**Na entrevista:**
> "`has_many` gera método no carregamento. Por isso `user.orders` existe e o `respond_to?(:orders)` é true. `enum` e `scope` são a mesma ideia."

---

## Quando NÃO usar

**O que é:**
A parte que separa quem decorou API de quem já manteve o código. Barato de escrever. Caro de ler, de testar, de seguir no stacktrace.

**Como funciona:**
```ruby
# RUIM — três métodos claros escondidos no loop
%i[name email phone].each do |field|
  define_method(field) { @data[field] }
end

# BOM
def name  = @data[:name]
def email = @data[:email]
def phone = @data[:phone]
```

O “bom” é maior. O grep acha. O stacktrace aponta a linha.

Deixa de valer se: são dois ou três métodos; o nome vem de params ou YAML; você vai monkey patchar `String` no `app/`; o único ganho é “ficou DRY”; você quer `method_missing` para parecer Rails ([2.8](08-method-missing.md)).

Biblioteca gera método porque a API é o produto. No app, a feature é o produto.

**Na entrevista:**
> "Eu sei fazer. Eu evito. Stacktrace de `define_method` aponta o block, não o negócio. Três `def` eu escrevo. `send` com params eu recuso. Magia é para gem e para o Rails."

---

## Recapitulando

- Metaprogramming: cria ou chama método em runtime. `attr_reader` já é isso.
- `define_method` + `each` gera família. Closure captura a volta. `for` não.
- `send` fura private. `public_send` respeita. Params passam por allowlist.
- `class_eval`: `def` vira instância. `instance_eval` na classe: método de classe. Block, não string.
- `respond_to?` pergunta o contrato. Método de `define_method` já aparece.
- `has_many` / `enum` / `scope` geram método no load — não é `method_missing` por request.
- Se lê melhor com `def`, use `def`. `method_missing` fica no 2.8.

---

## Exercícios práticos

### Exercício 1: `send` ou `public_send`?

**Enunciado:** O que cada linha faz? Qual você usaria se o nome viesse de `params[:field]`?

```ruby
class Wallet
  def credit(cents) = @balance_cents = balance_cents + cents
  def balance_cents = @balance_cents ||= 0
  private
  def wipe = @balance_cents = 0
end

wallet.send(:credit, 500)
wallet.public_send(:credit, 500)
wallet.send(:wipe)
wallet.public_send(:wipe)
wallet.public_send(params[:field])
```

<details>
<summary>Solução</summary>

As duas de `credit` passam. `send(:wipe)` zera o saldo — private não existe para o `send`. `public_send(:wipe)` levanta `NoMethodError`.

`public_send(params[:field])` ainda é perigoso: `"credit"` ou `"freeze"` mexem no objeto. Allowlist:

```ruby
ALLOWED = %w[balance_cents].freeze
field = params[:field].to_s
wallet.public_send(field) if ALLOWED.include?(field)
```

**Pontos-chave:**
- `send` = ignora visibilidade
- `public_send` = API pública
- Params não escolhem método livre
</details>

### Exercício 2: Onde o `def` nasce?

**Enunciado:** Depois deste código, o que existe? O que explode?

```ruby
class Ticket; end

Ticket.class_eval { def used?; true; end }
Ticket.instance_eval { def default_price_cents; 1990; end }

Ticket.new.used?
Ticket.used?
Ticket.default_price_cents
Ticket.new.default_price_cents
```

<details>
<summary>Solução</summary>

`Ticket.new.used?` → `true`. `class_eval` define método de instância. `Ticket.used?` → `NoMethodError`.

`Ticket.default_price_cents` → `1990`. `instance_eval` na classe define singleton method em `Ticket`. `Ticket.new.default_price_cents` → `NoMethodError`.

**Pontos-chave:**
- `class_eval` + `def` = instância
- `instance_eval` + `def` na classe = método de classe
- A classe é objeto. `instance_eval` nela fala com esse objeto
</details>

### Exercício 3: Isso precisa de metaprogramming?

**Enunciado:** Reescreva sem `define_method`. Depois diga em que condição o loop voltaria a fazer sentido. `has_many :items` no mesmo model é a mesma coisa que o seu loop?

```ruby
class Invoice
  %i[draft issued paid].each do |status|
    define_method("#{status}?") { self.status.to_s == status.to_s }
  end
end
```

<details>
<summary>Solução</summary>

```ruby
class Invoice
  def draft?  = status.to_s == "draft"
  def issued? = status.to_s == "issued"
  def paid?   = status.to_s == "paid"
end
```

Três predicados fixos: `def` ganha. O loop volta se a lista for longa, vier de constante compartilhada com enum/validação, e o corpo continuar idêntico.

`has_many :items` é a mesma *ideia* — método gerado no load — mas não é o seu loop. É macro do framework. Você não reescreve `has_many` na mão para “ficar explícito”.

**Pontos-chave:**
- Três `def` claros vencem três `define_method`
- Loop quando a lista é o dado, não o código
- Rails gera método; o app consome a macro
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
