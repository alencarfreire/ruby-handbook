# 2.4 self e visibilidade

> **TL;DR**
> `self` é o receptor atual. Instância no `def` comum. Classe no corpo e no `def self.x`. `class << self` abre a singleton class. `private` chama com self implícito; no 2.7+, `self.foo` também. Receptor **outro** continua proibido. `private` depois de `def self.x` **não** esconde o class method — use `private_class_method` ou `private` dentro de `class << self`. `protected` só para `other.foo` na mesma família. Visibilidade é API, não segurança: `send` fura.

## Conteúdo

- [O que é self](#o-que-é-self)
- [self no método de instância](#self-no-método-de-instância)
- [self no corpo da classe](#self-no-corpo-da-classe)
- [self no class method](#self-no-class-method)
- [class << self](#class--self)
- [public, private e protected](#public-private-e-protected)
- [Método de classe privado](#método-de-classe-privado)
- [Ruby 2.7+ e self.foo](#ruby-27-e-selffoo)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que é self

**O que é:**
O objeto que está recebendo a mensagem agora. Muda com o contexto. Não é variável: você não faz `self = x`.

**Como funciona:**
```ruby
class User
  p self                 # User — corpo da classe

  def label = self       # a instância
  def self.kind = self   # User de novo
end

User.new.label.class  # User
User.kind             # User
```

1.2 já cobriu o suficiente para escopo: `@` mora no `self` atual. 2.1 já disse que a classe é objeto. Aqui o assunto é o receptor — quem responde, quem é `private`.

**Na entrevista:**
> "`self` é o receptor. No método de instância é o objeto. No corpo da classe e no class method é a classe."

---

## self no método de instância

**O que é:**
Dentro de `def label`, `self` é quem recebeu `label`. `format_brl` sem ponto é `self.format_brl`.

**Como funciona:**
```ruby
class Invoice
  attr_accessor :cents
  def initialize(cents) = (@cents = cents)
  def label = "Fatura de #{format("R$ %.2f", cents / 100.0)}"

  def apply_discount(percent)
    self.cents = cents - (cents * percent / 100)  # sem self vira local
  end
end

Invoice.new(1990).label  # "Fatura de R$ 19.90"
```

`self.attr =` no writer. `self` sozinho para devolver o objeto. Quase nunca `self.foo` no resto.

**Na entrevista:**
> "No método de instância eu não escrevo `self.foo`. Escrevo `foo`. Writer é a exceção: `self.email =`, senão vira local."

---

## self no corpo da classe

**O que é:**
Entre `class User` e o `end`, `self` **é** `User`. Macro do Rails roda aí.

**Como funciona:**
```ruby
class User < ApplicationRecord
  has_many :orders                    # self é User
  scope :active, -> { where(active: true) }
  @kind = "user"                      # class instance — 1.2
end
```

`has_many` é método de classe, não palavra-chave. Fora do Rails é a mesma coisa: `attr_reader :code` é `self.attr_reader(:code)`.

**Na entrevista:**
> "`has_many` é método. `self` no corpo da classe é a própria classe, então `has_many :orders` é `User.has_many(:orders)`."

---

## self no class method

**O que é:**
`def self.draft` define método na classe. Lá dentro, `self` é quem chamou — a classe ou a subclass.

**Como funciona:**
```ruby
class Invoice
  def self.draft(cents) = new(cents: cents, status: :draft)
  def self.paid = where(status: :paid)
end

class CreditNote < Invoice; end
CreditNote.draft(500)   # self dentro de draft é CreditNote
```

`new` e `where` já batem no `self`. `Invoice.where` **congela** o nome — subclass fica presa na super. Factory e query moram aqui. Estado por classe: `@` no class method, não `@@` (1.2).

**Na entrevista:**
> "Class method: `self` é a classe. Dentro, `new` e `where` já falam com quem chamou. `Invoice.where` escrito com o nome fixo prende a subclass."

---

## class << self

**O que é:**
Abre a singleton class do objeto atual. No corpo da classe, o atual **é** a classe. Os `def` dali são class methods.

**Como funciona:**
```ruby
class User
  class << self
    def active = where(active: true)
    def admins = active.where(role: "admin")
  end
end
```

`def self.active` e `class << self; def active` gravam o mesmo método. O bloco vale para vários class methods ou para `private` no meio. Um `def` só? `def self.x` lê melhor. `class << obj` numa instância existe — raro no app. Eigenclass pesada fica para 2.7.

**Na entrevista:**
> "`class << self` abre a singleton class da classe. É o mesmo lugar onde `def self.x` grava. Eu uso quando vou marcar class method como private."

---

## public, private e protected

**O que é:**
Visibilidade. Default: `public`. `private`: self implícito (e `self.foo` no 2.7+). `protected`: outro da mesma família chama com receptor. 1.5 mostrou a chamada. Aqui o desenho.

**Como funciona:**
```ruby
class Order
  def checkout
    charge!
    send_receipt
  end

  private

  def charge!; end
  def send_receipt = OrderMailer.paid(self).deliver_later
end

order.checkout   # ok
order.charge!    # NoMethodError (private method `charge!')
```

`private` sem args muda o default do que vem **abaixo**. Também aceita lista: `private :charge!, :send_receipt`.

`protected` é o caso “outro eu”:

```ruby
class Coupon
  def initialize(discount_cents) = (@discount_cents = discount_cents)

  def stacks_with?(other)
    discount_cents + other.discount_cents <= 5_000  # R$ 50,00
  end

  protected
  attr_reader :discount_cents
end
```

Private quebraria `other.discount_cents`. Public vazaria o número. `public` na API; `private` no detalhe (`before_action`, callback); `protected` quase nunca. Não é segurança: `send` fura, `public_send` respeita.

**Na entrevista:**
> "Private em Ruby não é o do Java. Sem receptor, ou `self.foo` a partir do 2.7. Outro objeto, mesmo da mesma classe, não chama. Protected existe para `other.foo`. Eu quase não escrevo. E `send` fura — não é firewall."

---

## Método de classe privado

**O que é:**
Class method que o mundo não deve chamar. A armadilha: o `private` de instância **não pega** `def self.x`.

**Como funciona:**
```ruby
class Invoice
  def self.create_for!(cents)
    new(cents: cents, number: next_number).tap(&:save!)
  end

  private

  def self.next_number            # AINDA PÚBLICO
    "NF-#{Time.now.to_i}"
  end
end

Invoice.next_number               # chama. Sem erro.
```

`private` sem args marca os `def` de **instância**. `def self.next_number` grava na singleton class. Outra lista.

Dois jeitos certos:

```ruby
def self.next_number = "NF-#{Time.now.to_i}"
private_class_method :next_number
```

```ruby
class Invoice
  class << self
    def create_for!(cents) = new(cents: cents, number: next_number)

    private
    def next_number = "NF-#{Time.now.to_i}"
  end
end
```

Nos dois, `next_number` implícito funciona dentro da classe. `Invoice.next_number` explode. Atalho: `private_class_method def self.next_number; ...; end`. Gerador, digest, factory interno. Job precisa chamar? Não é privado.

**Na entrevista:**
> "`private` não esconde `def self.foo`. A correção é `private_class_method :foo` ou `private` dentro de `class << self`."

---

## Ruby 2.7+ e self.foo

**O que é:**
Até 2.6, private = **zero** receptor. `self.charge!` quebrava igual `other.charge!`. 2.7 liberou receptor **self**. Outro objeto segue proibido.

**Como funciona:**
```ruby
class User
  def normalize!
    self.email = email.to_s.strip.downcase
    self.compact_name!          # 2.7+: ok. 2.6: NoMethodError
  end

  def merge_email_from(other)
    # other.compact_name!       # NoMethodError — outro receptor
    self.email = other.email
  end

  private
  attr_accessor :email
  def compact_name!; end
end
```

Writer privado **sempre** aceitou `self.email =` — sem o `self`, vira local. O 2.7 igualou o resto. No app novo `self.foo` vale; o implícito continua mais limpo.

**Na entrevista:**
> "A partir do 2.7, `self.foo` chama private. `other.foo` não. Writer privado já era `self.x =` desde sempre. No Rails 7 isso já é o normal."

---

## Recapitulando

- `self` é o receptor. Instância no `def` comum. Classe no corpo e no `def self.x`.
- Writer: `self.email =`. Sem `self`, Ruby cria local.
- Macro (`has_many`, `attr_reader`) é método no `self` da classe.
- `class << self` = singleton class da classe. Mesmo lugar do class method.
- `private`: self implícito; 2.7+ também `self.foo`. Outro receptor: `NoMethodError`.
- `protected`: `other.foo` na mesma família. Raro.
- `private` **não** pega `def self.x`. `private_class_method` ou `private` dentro de `class << self`.
- Visibilidade é API. `send` fura. `public_send` respeita.

---

## Exercícios práticos

### Exercício 1: Quem é self?

**Enunciado:** O que cada `self` é? O que devolve `CreditNote.factory`?

```ruby
class Invoice
  p self

  def initialize(cents) = (@cents = cents)
  def owner = self
  def self.factory(cents) = new(cents)
end

class CreditNote < Invoice; end
```

<details>
<summary>Solução</summary>

O `p self` no corpo imprime `Invoice`. `invoice.owner` devolve a instância. `Invoice.factory(1990)` devolve uma `Invoice`.

`CreditNote.factory(1990)` devolve uma `CreditNote`: o método foi herdado e `self` é quem chamou. `Invoice.new(cents)` com o nome fixo fabricava super.

**Pontos-chave:**
- Corpo da classe: `self` é a classe
- Método de instância: o objeto
- Class method: quem recebeu a chamada, inclusive subclass
</details>

### Exercício 2: Por que `Invoice.token` ainda é público?

**Enunciado:** O autor achou que `token` ficou privado. O que acontece? Como você esconde de verdade? Mostre os dois jeitos.

```ruby
class Invoice
  def self.issue!(cents)
    new(cents: cents, token: token).tap(&:save!)
  end

  private

  def self.token = "inv_#{SecureRandom.hex(4)}"
end
```

<details>
<summary>Solução</summary>

`Invoice.token` **roda**. `private` sem args só afeta `def` de instância. `def self.token` foi para a singleton class.

```ruby
def self.token = "inv_#{SecureRandom.hex(4)}"
private_class_method :token
```

```ruby
class Invoice
  class << self
    def issue!(cents) = new(cents: cents, token: token)

    private
    def token = "inv_#{SecureRandom.hex(4)}"
  end
end
```

Nos dois, `Invoice.issue!(1990)` segue válido: `token` é implícito. `Invoice.token` vira `NoMethodError`.

**Pontos-chave:**
- `private` ≠ `private_class_method`
- `def self.x` não entra na lista que o `private` de baixo marca
- `class << self` + `private` é o mesmo efeito
</details>

### Exercício 3: `self.foo`, `other.foo` e o writer

**Enunciado:** Ruby 3.3. Quais linhas passam? Quais explodem? Por quê?

```ruby
class Account
  def initialize(email) = (@email = email)
  def normalize!
    self.email = email.to_s.strip.downcase
    self.stamp!
  end
  def copy_email_from(other)
    other.stamp!
    self.email = other.email
  end
  private
  attr_accessor :email
  def stamp!; end
end

a = Account.new(" João@Email.com ")
b = Account.new("ana@email.com")
a.normalize!
a.copy_email_from(b)
a.stamp!
a.send(:stamp!)
```

<details>
<summary>Solução</summary>

`a.normalize!` passa: writer privado sempre pôde, `self.stamp!` é 2.7+. `a.copy_email_from(b)` explode em `other.stamp!` — mesmo da mesma classe. `other.email` também: reader `private`. `a.stamp!` explode. `a.send(:stamp!)` passa.

`stamp!` só de dentro. E-mail do outro: API pública ou `protected`.

**Pontos-chave:**
- 2.7+: `self.foo` ok no private
- `other.foo` private = `NoMethodError`
- Writer privado precisa de `self.x =`
- `send` não prova que o método é público
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
