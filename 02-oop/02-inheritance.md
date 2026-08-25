# 2.2 Herança

> **TL;DR**
> Ruby herda com `<`. Uma classe, um pai — herança simples. `super` chama o método do ancestral; sem parênteses reenvia os args, `super()` não. `ancestors` é a ordem do lookup. STI é herança + coluna `type` no Rails — detalhe depois. Se não é IS-A, não herda: compartilhou comportamento, use module.

## Conteúdo

- [O que é herança](#o-que-é-herança)
- [Herança simples](#herança-simples)
- [super](#super)
- [ancestors](#ancestors)
- [STI](#sti)
- [Quando não herdar](#quando-não-herdar)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que é herança

**O que é:**
A subclass é um tipo do pai. Relação **IS-A**: `Admin` é um `User`. A filha ganha os métodos. Você especializa, não copia.

**Como funciona:**
```ruby
class User
  def initialize(name)
    @name = name
  end

  def greet
    "Olá, #{@name}"
  end
end

class Admin < User
  def ban(user)
    "#{@name} baniu #{user}"
  end
end

admin = Admin.new("Ana")
admin.greet              # "Olá, Ana" — veio de User
admin.ban("João")        # "Ana baniu João"
admin.is_a?(User)        # true
admin.instance_of?(User) # false
```

`is_a?` sobe a cadeia. `instance_of?` pergunta a classe exata.

**Quando usar:**
Quando a filha **é** o pai com regra a mais. `Admin < User`. `PixPayment < Payment`. `UsersController < ApplicationController`.

**Na entrevista:**
> "Herança é IS-A. Admin é User. Eu herdo o que já existe e acrescento o que muda. Se a relação é TEM-UM, eu não herdo."

---

## Herança simples

**O que é:**
Uma classe tem **um** pai. Não existe `class Foo < Bar, Baz`. Vários comportamentos entram por module (próximo capítulo).

**Como funciona:**
```ruby
class Payment; end
class PixPayment < Payment
end

# SyntaxError — Ruby não aceita dois pais
# class Hybrid < Payment, Refundable
# end

PixPayment < Payment  # true  — PixPayment é subclass
Payment < PixPayment  # false
Payment < Payment     # false
Payment <= Payment    # true  — ela mesma conta no <=
```

`<` faz duas coisas. Na definição, escolhe o pai. Como método, pergunta se a esquerda é subclass da direita. Cai em entrevista.

Toda classe sem `<` herda `Object`. `Object` inclui `Kernel`. No topo fica `BasicObject`.

```ruby
class User; end
User.superclass         # Object
Object.superclass       # BasicObject
BasicObject.superclass  # nil
```

**Quando usar:**
Hierarquia curta. Um nível, no máximo dois. Depois disso o lookup some da cabeça.

**Na entrevista:**
> "Ruby é herança simples. Um `<`. Dois comportamentos: eu incluo module. `Admin < User` é true porque Admin é subclass."

---

## super

**O que é:**
Chama o **mesmo** método no próximo ancestral. Não é “chame o pai”: é “continue o lookup”.

**Como funciona:**
```ruby
class User
  def initialize(name)
    @name = name
  end

  def greet
    "Olá, #{@name}"
  end
end

class Admin < User
  def initialize(name, role)
    super(name)   # User#initialize só recebe name
    @role = role
  end

  def greet
    "#{super} (#{@role})"
  end
end

Admin.new("Ana", "superadmin").greet
# "Olá, Ana (superadmin)"
```

A armadilha: `super` sem parênteses reenvia **todos** os args do método atual. `super()` manda zero. `super(x)` manda o que você escolheu.

```ruby
class Admin < User
  def initialize(name, role)
    super          # ArgumentError — passa name E role
    super()        # ArgumentError — User#initialize exige name
    super(name)    # certo
    @role = role
  end
end
```

Sem `super` no `initialize` da filha, o `@name` do pai **não** é setado. O `initialize` da filha substitui o do pai por completo.

**Quando usar:**
Quando você especializa e ainda precisa do de cima. `initialize`, `charge`, `to_s`.

**Na entrevista:**
> "super sem parênteses reenvia os args. super() não manda nada. No initialize da subclass eu escrevo super(name) explícito. Esquecer o super é bug clássico."

---

## ancestors

**O que é:**
A lista que o Ruby percorre quando você manda uma mensagem. Primeiro a classe, depois o que ela inclui, depois o pai, até `BasicObject`.

**Como funciona:**
```ruby
class User; end
class Admin < User; end

Admin.ancestors
# [Admin, User, Object, Kernel, BasicObject]

Admin.superclass  # User
User.superclass   # Object
```

O lookup para no primeiro método com aquele nome. O `greet` de `Admin` esconde o de `User` — a menos que você chame `super`.

Module entra nessa lista. `include` coloca o module **depois** da classe. `prepend` coloca **antes**. Detalhe em 2.3 e 2.5. Aqui: `ancestors` é a fonte da verdade.

```ruby
module Auditable; end

class User
  include Auditable
end

User.ancestors
# [User, Auditable, Object, Kernel, BasicObject]
```

`Kernel` aparece porque `Object` inclui `Kernel`. É daí que vêm `puts`, `raise`, `require`.

**Quando usar:**
Quando o método “não é o que você achava”. Imprime `ancestors` e `method(:charge).owner`.

**Na entrevista:**
> "Eu olho ancestors. A ordem é a ordem do lookup. include entra depois da classe. prepend entra antes. Kernel está lá porque Object inclui Kernel."

---

## STI

**O que é:**
Single Table Inheritance. No Rails, várias classes na **mesma** tabela, discriminadas pela coluna `type`. É herança de model, não um segundo mecanismo do Ruby.

**Como funciona:**
```ruby
# tabela users com coluna type
class User < ApplicationRecord
end

class Admin < User
end

Admin.create!(name: "Ana")
# INSERT ... type = 'Admin'
```

`Admin.all` vira `WHERE type = 'Admin'`. O Ruby só vê `class Admin < User`. Schema e coluna nula ficam no Active Record.

**Quando usar:**
Quando as subclasses **são** o mesmo registro e o schema é quase igual. Dez colunas só da filha: não é STI.

**Na entrevista:**
> "STI é herança de Active Record. Uma tabela, coluna type, class Admin < User. Eu só uso quando o schema é quase o mesmo. Detalhe eu deixo para models."

---

## Quando não herdar

**O que é:**
Herança é o acoplamento mais forte que o Ruby te dá. Se “X é um Y” soa forçada, não herda.

**Como funciona:**
```ruby
# RUIM — User não é um Audit
class User < Auditable
end

# BOM — User TEM comportamento de audit
module Auditable
  def audit(action)
    "#{self.class} fez #{action}"
  end
end

class User
  include Auditable
end

# RUIM — Order não é um Payment
class Order < Payment
end

# BOM — composição
class Order
  def initialize(payment)
    @payment = payment
  end

  def checkout(cents)
    @payment.charge(cents)
  end
end
```

Sinais de erro: a filha ignora metade do pai; o pai ganha `if type ==`; a hierarquia tem três níveis; o “pai” só existe para dividir método.

**Quando usar:**
IS-A claro (`PixPayment < Payment`). Convenção do Rails (`UsersController < ApplicationController`, `User < ApplicationRecord`). STI com schema compartilhado.

Module quando o comportamento é transversal (audit, `Enumerable`), quando a classe já tem pai, ou quando você quer testar o mixin sozinho.

**Na entrevista:**
> "Eu herdo quando é IS-A. Comportamento compartilhado é module. Mixin primeiro, herança só quando a hierarquia é real. ApplicationController é a exceção que o Rails já escolheu."

---

## Recapitulando

- `<` define o pai e também pergunta “é subclass?”.
- Herança simples: um pai. O resto é module.
- `is_a?` sobe a cadeia. `instance_of?` é a classe exata.
- `super` continua o lookup. Sem `()` reenvia os args. Sem `super` no `initialize`, o pai não roda.
- `ancestors` é a ordem do lookup. `superclass` é só o próximo pai.
- STI = mesma tabela + coluna `type`. Mencione; não desenhe o schema aqui.
- Não é IS-A → não herda. Compartilhou método → module.

---

## Exercícios práticos

### Exercício 1: `super` vs `super()`

**Enunciado:** O que acontece em cada `initialize`? Qual versão você escreveria?

```ruby
class User
  def initialize(name)
    @name = name
  end
end

class AdminA < User
  def initialize(name, role)
    super
    @role = role
  end
end

class AdminB < User
  def initialize(name, role)
    super()
    @role = role
  end
end

class AdminC < User
  def initialize(name, role)
    super(name)
    @role = role
  end
end
```

<details>
<summary>Solução</summary>

`AdminA.new("Ana", "admin")` — `ArgumentError`. `super` sem parênteses manda `name` e `role` para `User#initialize`.

`AdminB.new("Ana", "admin")` — `ArgumentError`. `super()` manda zero args.

`AdminC.new("Ana", "admin")` — funciona. `@name = "Ana"`, `@role = "admin"`. É a que você escreve no quadro.

**Pontos-chave:**
- `super` ≠ `super()`
- `initialize` da filha substitui o do pai
- Sem `super(name)`, `@name` não existe
</details>

### Exercício 2: Leia os `ancestors`

**Enunciado:** Sem rodar, escreva `PixPayment.ancestors` e diga quem responde `charge`.

```ruby
module Fee
  def charge
    "taxa"
  end
end

class Payment
  def charge
    "pagamento"
  end
end

class PixPayment < Payment
  include Fee
end
```

<details>
<summary>Solução</summary>

```ruby
PixPayment.ancestors
# [PixPayment, Fee, Payment, Object, Kernel, BasicObject]
```

`PixPayment.new.charge` devolve `"taxa"`. `include Fee` coloca `Fee` **depois** de `PixPayment` e **antes** de `Payment`. `PixPayment` não define `charge`, então o lookup para em `Fee`.

`PixPayment.superclass` continua `Payment`. `superclass` não lista module.

**Pontos-chave:**
- `ancestors` é a ordem do lookup
- `include` entra entre a classe e o pai
- `superclass` ≠ `ancestors`
</details>

### Exercício 3: Herda ou inclui?

**Enunciado:** Para cada par, escolha `<` ou `include` e justifique em uma frase.

1. `Admin` e `User`
2. `Invoice` e `PdfExportable` (gera PDF)
3. `UsersController` e `ApplicationController`
4. `Order` e `Payment`

<details>
<summary>Solução</summary>

1. `class Admin < User` — Admin **é** User. IS-A. No Rails, candidato a STI se a tabela for a mesma.
2. `include PdfExportable` — Invoice **tem** a habilidade de exportar. Não é um exporter.
3. `class UsersController < ApplicationController` — convenção do Rails. O controller da app **é** um controller.
4. Nem um nem outro na vertical. `Order` **tem** um `Payment`. Composição: recebe o payment e chama `charge`.

**Pontos-chave:**
- IS-A → `<`
- Comportamento extra → module
- TEM-UM → composição, não herança
- Framework já escolheu o pai? Siga a convenção
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
