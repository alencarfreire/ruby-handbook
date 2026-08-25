# 2.1 Classes e objetos

> **TL;DR**
> Classe é o molde. `User.new` aloca o objeto e chama `initialize`. Estado mora em `@`; de fora você só vê método. `attr_reader` / `attr_writer` / `attr_accessor` só geram método — não são “campo”. `object_id` é identidade. `freeze` trava mutação (`FrozenError`). A classe também é objeto: instância de `Class`.

## Conteúdo

- [class e new](#class-e-new)
- [initialize](#initialize)
- [Instance variable](#instance-variable)
- [attr_reader, attr_writer, attr_accessor](#attr_reader-attr_writer-attr_accessor)
- [object_id](#object_id)
- [freeze](#freeze)
- [A classe é um objeto](#a-classe-é-um-objeto)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## class e new

**O que é:**
`class User` cria um objeto `Class` e guarda na constante `User`. Instância nasce com `User.new`, não com `initialize` na mão.

**Como funciona:**
```ruby
class User
end

user = User.new
user.class   # User
User.class   # Class
```

`Class#new` faz duas coisas: `allocate` (objeto vazio) e `initialize` (você preenche). Sem `initialize` próprio, o de `Object` roda e não faz nada.

**Quando usar:**
Toda vez que um conceito tem estado e comportamento juntos: `User`, `Invoice`, `Cart`. Não abra classe para um Hash que só passa dado.

**Na entrevista:**
> "`new` não é `initialize`. `new` aloca e depois chama `initialize`. Eu não chamo `initialize` direto."

---

## initialize

**O que é:**
Hook de setup da instância. Não é construtor separado como no Java. É método de instância que o `new` chama.

**Como funciona:**
```ruby
class User
  def initialize(name, email)
    @name = name
    @email = email
  end
end

User.new("João", "joao@email.com")
# User.new  # ArgumentError — faltou arg
```

Última expressão de `initialize` não importa. O `new` devolve a instância, não o return do `initialize`.

**Quando usar:**
Atribuir `@` obrigatório. Validação barata. Busca e HTTP ficam para método depois.

**Na entrevista:**
> "`initialize` só monta o objeto. Se eu preciso buscar no banco, isso não entra no `initialize`. No Rails o Active Record faz o `new` / `create` por você."

---

## Instance variable

**O que é:**
`@name` mora na instância. Não tem `private` de variável: o encapsulamento é “sem método, de fora não lê”.

**Como funciona:**
```ruby
class User
  def initialize(name, email)
    @name = name
    @email = email
  end

  def label
    "#{@name} <#{@email}>"
  end
end

user = User.new("João", "joao@email.com")
user.label   # "João <joao@email.com>"
# user.name  # NoMethodError — @name não é método
```

`instance_variable_get(:@name)` existe. Você não usa em código de app. Typo em `@emial` vira `nil` — capítulo 1.2.

**Quando usar:**
Estado que sobrevive entre métodos daquela instância. Nome, e-mail, saldo em centavos, itens do carrinho.

**Na entrevista:**
> "`@` não é propriedade pública. Sem getter, `user.name` é `NoMethodError`. O Rails põe `@user` no controller porque a view renderiza no mesmo objeto."

---

## attr_reader, attr_writer, attr_accessor

**O que é:**
Atalho que **define método**. Não cria campo, não valida, não notifica. É metaprogramming de uma linha.

**Como funciona:**
```ruby
class User
  attr_reader :name          # def name; @name; end
  attr_writer :email         # def email=(value); @email = value; end
  attr_accessor :role        # os dois
end
```

Equivale a isto — e a entrevista quer que você escreva:

```ruby
class User
  def name = @name

  def email=(value)
    @email = value
  end
end
```

**Quando usar:**
- `attr_reader` — estado que o mundo lê, você escreve só no `initialize` / método interno.
- `attr_writer` — raro sozinho.
- `attr_accessor` — estado que realmente muda de fora. No Rails, atributo virtual (`password` que não é coluna).

Não jogue `attr_accessor` em tudo. Getter+setter público é API. Depois você não tira.

**Exemplo prático:**
```ruby
class Product
  attr_reader :name, :price_cents

  def initialize(name, price_cents)
    @name = name
    @price_cents = price_cents
  end

  def price_cents=(value)
    raise ArgumentError, "preço não pode ser negativo" if value.negative?
    @price_cents = value
  end

  def label
    "#{@name} — R$ #{format('%.2f', @price_cents / 100.0)}"
  end
end

camiseta = Product.new("Camiseta", 4990)  # R$ 49,90
camiseta.label          # "Camiseta — R$ 49.90"
camiseta.price_cents    # 4990
# camiseta.price_cents = -1  # ArgumentError
```

`price_cents=` é método. `attr_accessor :price_cents` não deixa validar.

**Na entrevista:**
> "`attr_accessor` só gera getter e setter burros. Se tem regra — centavos negativos, e-mail normalizado — eu escrevo o método. Posso combinar: `attr_reader` + writer na mão. No Rails, `attr_accessor :password` é atributo virtual, não coluna."

---

## object_id

**O que é:**
Identidade do objeto na VM. Dois `User.new` com o mesmo nome são **dois** objetos.

**Como funciona:**
```ruby
a = User.new("João", "joao@email.com")
b = User.new("João", "joao@email.com")

a.object_id == b.object_id  # false
a.equal?(b)                 # false — o mesmo objeto?
a.equal?(a)                 # true
a == b                      # false — você não definiu `==`
```

`equal?` é identidade. `==` é igualdade de valor — só se a classe implementar. `object_id` de Integer, Symbol, `true`/`false`/`nil` é estável: são valores imediatos.

**Quando usar:**
Debug (“é o mesmo User ou uma cópia?”). Comparar identidade em spec rara. Não use `object_id` como chave de negócio.

**Na entrevista:**
> "`object_id` e `equal?` respondem ‘é o mesmo objeto?’. `==` é valor, e o default de Object quase não ajuda. Symbol interned tem o mesmo `object_id` — String em geral não."

---

## freeze

**O que é:**
Marca o objeto imutável. Setter, `<<` no próprio objeto, reassign de `@` → `FrozenError`. É raso: o que está **dentro** não congela.

**Como funciona:**
```ruby
class Cart
  attr_accessor :items

  def initialize
    @items = []
  end
end

cart = Cart.new
cart.freeze
cart.frozen?            # true
# cart.items = []       # FrozenError (writer no cart)
cart.items << "Camiseta"  # ok — o Array não congelou
```

`Object#freeze` devolve o mesmo objeto. `dup` sai descongelado; `clone` copia o freeze.

**Quando usar:**
Constante que guarda objeto, config que ninguém deveria mutar, valor que você passou e não quer surpresa. Não é deep freeze e não é persistência.

**Na entrevista:**
> "`freeze` é raso. Congela o cart, não o array de dentro. String com `# frozen_string_literal: true` já nasce frozen — `<<` explode. Para valor imutável de verdade, Ruby 3.2+ tem `Data.define`."

---

## A classe é um objeto

**O que é:**
`User` é constante. O valor é um objeto — instância de `Class`. Você manda mensagem para a classe do mesmo jeito que manda para o João.

**Como funciona:**
```ruby
class User
  def initialize(name)
    @name = name
  end

  def self.guest
    new("visitante")
  end
end

User.class          # Class
Class.class         # Class — Class é instância de si
Class.superclass    # Module
User.superclass     # Object

User.guest          # mensagem no objeto User
User.new("João")    # idem: new é método de Class
```

Por isso `def self.guest` funciona: método no objeto classe. `Class.new` cria classe anônima em runtime — cai em metaprogramming, não aqui.

**Quando usar:**
Factory na classe (`User.guest`, `Product.free`), constante de domínio (`User::ROLES`). Estado da classe (`@` no `self` da classe) é o capítulo 1.2 — não use `@@`.

**Na entrevista:**
> "A classe é objeto. `User.new` é mensagem `new` no objeto `User`. `User.class` é `Class`. `Class.class` também é `Class`. Isso não é herança — herança é `superclass`."

---

## Recapitulando

- `class User` cria um objeto `Class`. Instância vem de `User.new`.
- `new` = `allocate` + `initialize`. Você implementa o segundo. O `new` devolve a instância.
- Estado em `@`. Sem método, de fora não existe.
- `attr_*` gera método burro. Regra, normalização, preço em centavos → método na mão.
- `object_id` / `equal?` = identidade. `==` = valor, se você definiu.
- `freeze` trava o objeto, não o que ele aponta. Mutação → `FrozenError`.
- Classe é objeto. `def self.x` é método nesse objeto.

---

## Exercícios práticos

### Exercício 1: O que o `new` chama?

**Enunciado:** O que roda em `User.new("João", "joao@email.com")`? Implemente `User` com `name` (só leitura) e `email` (leitura e escrita). `label` devolve `"João <joao@email.com>"`.

<details>
<summary>Solução</summary>

`Class#new` aloca e chama `initialize` com os mesmos args. O return do `initialize` é ignorado — `new` devolve a instância.

```ruby
class User
  attr_reader :name
  attr_accessor :email

  def initialize(name, email)
    @name = name
    @email = email
  end

  def label
    "#{@name} <#{@email}>"
  end
end

user = User.new("João", "joao@email.com")
user.label           # "João <joao@email.com>"
user.email = "outro@email.com"
# user.name = "Ana"  # NoMethodError
```

**Pontos-chave:**
- Você não chama `initialize` direto
- `attr_reader` / `attr_accessor` são métodos, não campos
</details>

### Exercício 2: `attr_accessor` vs método

**Enunciado:** Uma `Account` guarda saldo em centavos. Por que `attr_accessor :balance_cents` é fraco? Escreva reader + writer que recusa valor negativo. Crédito de R$ 10,00 no João.

<details>
<summary>Solução</summary>

`attr_accessor` aceita `-1`. Saldo negativo passa. Setter é o lugar da regra.

```ruby
class Account
  attr_reader :owner, :balance_cents

  def initialize(owner, balance_cents = 0)
    @owner = owner
    self.balance_cents = balance_cents
  end

  def balance_cents=(value)
    raise ArgumentError, "saldo não pode ser negativo" if value.negative?
    @balance_cents = value
  end

  def credit(cents)
    self.balance_cents = @balance_cents + cents
  end
end

conta = Account.new("João")
conta.credit(1000)         # R$ 10,00
conta.balance_cents        # 1000
# conta.balance_cents = -1 # ArgumentError
```

`self.balance_cents =` chama o writer. `@balance_cents =` fura a regra — no `initialize` use o writer.

**Pontos-chave:**
- `attr_accessor` não valida
- Writer na mão + `attr_reader`
- Centavos em Integer
</details>

### Exercício 3: `object_id` e `freeze`

**Enunciado:** O que imprime? O que explode?

```ruby
class Product
  attr_accessor :name, :tags

  def initialize(name)
    @name = name
    @tags = []
  end
end

a = Product.new("Camiseta")
b = Product.new("Camiseta")
a.freeze

p a.object_id == b.object_id
p a.equal?(b)
p a.frozen?
a.tags << "promo"
a.name = "Outra"
```

<details>
<summary>Solução</summary>

`false`, `false`, `true`. `a.tags << "promo"` **não** explode — freeze é raso, o Array continua mutável. `a.name = "Outra"` levanta `FrozenError`: o writer tenta mudar `@name` no produto congelado.

`a` e `b` são dois objetos. Mesmo nome não une identidade.

**Pontos-chave:**
- `object_id` / `equal?` ≠ valor
- `freeze` não congela o que está dentro
- Writer no objeto frozen → `FrozenError`
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
