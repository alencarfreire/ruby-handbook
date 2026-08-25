# 2.3 Modules e mixins

> **TL;DR**
> Module tem dois papéis: namespace (`Billing::Invoice`) e mixin (`include Trackable`). `include` enfia o module nos `ancestors`, entre a classe e a superclasse. Herança é “é um”; mixin é “sabe fazer”. Ruby só herda de uma classe. Concern do Rails é module com açúcar — detalhe no 5.6. `prepend` e `extend` são o 2.5.

## Conteúdo

- [Dois papéis](#dois-papéis)
- [Namespace](#namespace)
- [Mixin e include](#mixin-e-include)
- [ancestors](#ancestors)
- [Mixin vs herança](#mixin-vs-herança)
- [O que o mixin não faz](#o-que-o-mixin-não-faz)
- [Concern — só o cheiro](#concern--só-o-cheiro)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Dois papéis

**O que é:**
Não existe palavra `namespace`. O mesmo `module` organiza constante **e** empresta método. Você escolhe o papel pelo uso.

**Como funciona:**
```ruby
# namespace — ninguém inclui
module Billing
  class Invoice; end
end

# mixin — ninguém instancia
module Trackable
  def track(event) = "#{self.class.name}:#{event}"
end
```

Não misture os dois no mesmo module.

**Na entrevista:**
> "Module é namespace ou mixin. Billing agrupa. Trackable inclui."

---

## Namespace

**O que é:**
Caixa de constantes. Classe, outro module, `TAX_CENTS` — tudo atrás de `::`. Fora da caixa, o nome curto não existe.

**Como funciona:**
```ruby
module Billing
  TAX_CENTS = 50  # R$ 0,50

  class Invoice
    def total_cents
      1_000 + TAX_CENTS  # acha no module que envolve
    end
  end
end

Billing::Invoice.new.total_cents  # 1050
Billing::TAX_CENTS                # 50
# Invoice                         # NameError
```

Classe aninhada **é** constante. `Billing::Invoice` é o nome. Zeitwerk (autoload do Rails) mapeia `app/services/billing/invoice.rb` para isso. Aninha de novo: `Billing::Reports::Monthly`.

**Quando usar:**
Domínio (`Billing`, `Identity`). Gem (`Stripe::Customer`). Evitar `UserService` solto na raiz.

**Exemplo prático:**
```ruby
# app/models/billing/invoice.rb  e  app/models/fiscal/invoice.rb
module Billing
  class Invoice < ApplicationRecord; end
end

module Fiscal
  class Invoice < ApplicationRecord; end  # outra Invoice, zero colisão
end
```

**Na entrevista:**
> "Namespace é constante com `::`. Zeitwerk casa pasta com o nome. Eu não crio `BillingInvoice` camelado se o domínio já é Billing."

---

## Mixin e include

**O que é:**
Mixin é module que vira parte da classe. `include Trackable` coloca o comportamento na **instância**. A classe “sabe fazer” sem ser filha de `Trackable`.

**Como funciona:**
```ruby
module Trackable
  def track(event) = "#{self.class.name}:#{event}"
end

class Order
  include Trackable
end

class User
  include Trackable
end

Order.new.track("pago")  # "Order:pago"
User.new.track("login")  # "User:login"
```

`self` no mixin é a instância. Sem pai comum. Enumerable (1.6) é o canônico: você faz `each`, o module entrega `map`.

**Quando usar:**
Comportamento transversal (audit, archive) em classes de árvores diferentes.

**Na entrevista:**
> "include mistura o module na instância. Order e User incluem Trackable. Não existe classe Trackable no meio."

---

## ancestors

**O que é:**
Lista onde o Ruby procura o método. Esquerda → direita: a classe, os mixins, a superclasse, até `BasicObject`.

**Como funciona:**
Um `include`: `[Order, Trackable, Object, Kernel, BasicObject]`. O module entra **entre** a classe e o que vinha depois. Vários `include`: o **último** fica mais perto da classe.

```ruby
class Order
  include Trackable
  include Auditable
end

Order.ancestors
# [Order, Auditable, Trackable, Object, Kernel, BasicObject]
```

`super` segue essa lista, não “o pai da classe”:

```ruby
class Order
  def total_cents = 1_000  # R$ 10,00
end

module Discountable
  def total_cents = super - 100  # R$ 1,00 off
end

class PromoOrder < Order
  include Discountable
end

PromoOrder.ancestors
# [PromoOrder, Discountable, Order, Object, Kernel, BasicObject]

PromoOrder.new.total_cents  # 900
```

`Discountable` roda antes de `Order`. `super` é o próximo da cadeia.

**Quando usar:**
Debug de mixin: `ancestors` e `method(:total_cents).owner`.

**Na entrevista:**
> "include coloca o module nos ancestors, à esquerda da superclasse. Último include é o primeiro da fila. super anda nessa lista."

---

## Mixin vs herança

**O que é:**
Herança simples: uma superclasse. Mixin soma comportamento sem mentir o tipo.

**Como funciona:**
```ruby
# RUIM — Invoice não é um User
class Invoice < User; end

# BOM — os dois pagam, sem parentesco
class User
  include Payable
end

class Invoice
  include Payable
end
```

Pergunta de corte: **é um** ou **sabe fazer**?

| Relação | Ferramenta |
|---|---|
| PromoOrder **é um** Order | herança |
| Invoice **sabe** cobrar | mixin |
| User e Invoice **sabem** auditar | mixin, não superclasse comum |

Herança carrega estado e identidade. Mixin carrega método. `is_a?(Order)` → herda. Só `respond_to?(:charge)` → mixin.

**Quando usar:**
Especializar (`PromoOrder < Order`) → herança. Cortar na horizontal (`Payable`) → mixin. Superclasse que só empilha método era module.

**Na entrevista:**
> "Herança simples. Mixin resolve o resto. Eu não crio BaseModelGod para compartilhar archive. É um → herda. Sabe fazer → include."

---

## O que o mixin não faz

**O que é:**
Module não instancia. Ivar mora no objeto, não no module — dois mixins no mesmo `@name` se atropelam.

**Como funciona:**
```ruby
Trackable.new  # NoMethodError

module Named
  def name = @name
  def name=(value) = @name = value
end

module Nickname
  def nickname = @name  # mesmo slot
end

class User
  include Named
  include Nickname
end

user = User.new
user.name = "João"
user.nickname  # "João" — colidiu
```

`@name` é da instância. Prefixe ou extraia (`user.wallet.charge`). `include` não define método de classe — isso é `extend`, capítulo 2.5.

**Na entrevista:**
> "Module não tem new. Ivar de mixin é ivar do objeto. Colisão de @name é clássica. Estado de verdade eu extraio."

---

## Concern — só o cheiro

**O que é:**
`ActiveSupport::Concern` é module com gancho. Continua mixin. Pasta, `class_methods` e o abuso ficam no 5.6.

**Como funciona:**
```ruby
# só para reconhecer na tela — não é o tema
module Archivable
  extend ActiveSupport::Concern

  included do
    scope :archived, -> { where.not(archived_at: nil) }
  end

  def archive!
    update!(archived_at: Time.current)
  end
end
```

Sem `Concern`, o `scope` no corpo do module não cola na classe. É açúcar em cima de `include`.

**Quando usar:**
Saiba ler. Implementar e “concern gorduroso” — 5.6.

**Na entrevista:**
> "Concern é module. include continua include. O Concern só facilita hook de classe. Padrão Rails eu deixo para o 5.6."

---

## Recapitulando

- Module = namespace **ou** mixin. Um papel por module.
- Namespace: `Billing::Invoice`. Constante com `::`. Zeitwerk casa pasta.
- Mixin: `include Trackable`. Método de instância. `self` é o objeto.
- `ancestors` mostra a fila. Último `include` fica mais perto da classe.
- `super` anda nos ancestors, não só na superclasse.
- Herança: é um. Mixin: sabe fazer. Uma superclasse só.
- Module não instancia. Ivar de mixin é do objeto — colide fácil.
- Concern é mixin com gancho. Detalhe no 5.6. `prepend` / `extend` no 2.5.

---

## Exercícios práticos

### Exercício 1: Namespace ou mixin?

**Enunciado:** Para cada um, namespace, mixin, ou nenhum dos dois? Uma frase.

1. `Billing` com `Invoice`, `CreditNote` e `TAX_CENTS`
2. `track(event)` em `Order`, `User` e `Payment`
3. Um `Utils` com `format_cents` e `include Utils` nos models

<details>
<summary>Solução</summary>

1. **Namespace.** Agrupa constante e classe. Ninguém dá `include Billing`.
2. **Mixin.** `Trackable` com `include`. As três classes não formam uma árvore.
3. **Nenhum `Utils`.** `format_cents` é helper ou método de `Money`. `include Utils` é gaveta.

**Pontos-chave:**
- Um module, um papel
- `Utils` na entrevista é red flag
- Mixin tem verbo; namespace tem domínio
</details>

### Exercício 2: Desenhe os ancestors

**Enunciado:** O que imprime `PromoOrder.ancestors` (corte em `Object`)? Quem responde `total_cents`? Qual o valor?

```ruby
class Order
  def total_cents = 2_000  # R$ 20,00
end

module Taxable
  def total_cents = super + 50  # R$ 0,50
end

module Discountable
  def total_cents = super - 200  # R$ 2,00
end

class PromoOrder < Order
  include Taxable
  include Discountable
end

PromoOrder.new.total_cents
```

<details>
<summary>Solução</summary>

```ruby
# [PromoOrder, Discountable, Taxable, Order]
```

Último `include` (`Discountable`) fica logo depois da classe.

Chamada: `Discountable` (`super - 200`) → `Taxable` (`super + 50`) → `Order` (`2000`).

`2000 + 50 - 200` → **1850** (R$ 18,50).

**Pontos-chave:**
- Ordem do include é de baixo para cima na fila
- `super` é o próximo ancestor, não “o pai”
- `method(:total_cents).owner` → `Discountable`
</details>

### Exercício 3: Herança ou mixin?

**Enunciado:** `User` autentica. `Invoice` cobra em centavos. `Admin` é um `User` com permissão extra. Os três precisam de `audit(action)`. Como você monta? O que **não** vira superclasse?

<details>
<summary>Solução</summary>

```ruby
module Auditable
  def audit(action) = "#{self.class.name}##{action}"
end

class User
  include Auditable
  def authenticate(password); end
end

class Admin < User
  def permission? = true
end

class Invoice
  include Auditable
  def charge(cents) = @paid_cents = cents
end
```

`Admin < User` é um. `Auditable` sabe fazer. **Não** existe `class Invoice < User` nem superclasse só para empilhar `audit`.

**Pontos-chave:**
- Uma herança de verdade (`Admin`)
- Mixin na horizontal (`Auditable`)
- Parentesco falso é o que o entrevistador quer que você recuse
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
