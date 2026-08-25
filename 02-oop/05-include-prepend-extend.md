# 2.5 include vs prepend vs extend

> **TL;DR**
> `include` põe o module **depois** da classe: mixin de instância; no empate a classe ganha. `prepend` põe **antes**: o module envolve e chega na classe com `super`. `extend` não mexe em `ancestors` — entra no singleton (class method, ou só naquele objeto). Rails: `prepend` no lugar de `alias_method_chain`; `extend` (ou `ClassMethods`) para API de classe. Na entrevista: desenhe `ancestors`.

## Conteúdo

- [include](#include)
- [prepend](#prepend)
- [extend](#extend)
- [ancestors](#ancestors)
- [included e ClassMethods](#included-e-classmethods)
- [No Rails](#no-rails)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## include

**O que é:**
Mixin na instância. O module entra na cadeia **depois** da classe. Método da classe ganha do module. `super` na classe cai no module.

**Como funciona:**
```ruby
module Greetable
  def greet = "Olá"
end

class User
  include Greetable
end

User.new.greet  # "Olá"
User.ancestors  # [User, Greetable, Object, Kernel, BasicObject]
```

Último `include` fica mais perto: `include A; include B` → `[User, B, A, Object, ...]`. O mesmo module duas vezes não reordena — o Ruby ignora.

Empate: a classe vence. O module só aparece se ela chama `super` ou não define o método.

```ruby
module Greetable
  def greet = "module"
end

class User
  include Greetable
  def greet = "classe + #{super}"
end

User.new.greet  # "classe + module"
```

**Quando usar:**
Comportamento de instância compartilhado: Enumerable, Comparable, concern que mexe no objeto.

**Na entrevista:**
> "include é mixin de instância. O module fica depois da classe. Se os dois têm o método, a classe ganha. super na classe chega no module."

---

## prepend

**O que é:**
O module entra **antes** da classe. Lookup acha o module primeiro. Chegar na classe é `super`. É wrap, não “mistura embaixo”.

**Como funciona:**
```ruby
module WithPrefix
  def greet = ">> #{super}"
end

class User
  prepend WithPrefix
  def greet = "Olá"
end

User.new.greet  # ">> Olá"
User.ancestors  # [WithPrefix, User, Object, Kernel, BasicObject]
```

Sem `super` no module, a classe some do caminho. Você não “incluiu um default” — tapou o método.

Último `prepend` fica na frente: `prepend A; prepend B` → `[B, A, User, ...]`.

**Quando usar:**
Instrumentar, cache, audit, soft-delete. Gem que precisa encaixar em `save` / `deliver` / `perform` sem editar a classe.

**Na entrevista:**
> "prepend inverte. O module é o wrapper. super vai para a classe. Se eu esqueço o super, engoli o original."

---

## extend

**O que é:**
Métodos do module vão para o **singleton** do receptor. Classe + `extend` = class method. Objeto + `extend` = só aquele objeto.

**Como funciona:**
```ruby
module Finders
  def recent = order(created_at: :desc).limit(10)
end

class User < ApplicationRecord
  extend Finders
end

User.recent      # class method
User.ancestors   # [User, ApplicationRecord, ..., Object] — sem Finders

User.singleton_class.ancestors
# [#<Class:User>, Finders, #<Class:ApplicationRecord>, ...]
```

Num objeto só: `joao.extend(AdminActions)` — `joao.ban!` ok, o outro user levanta `NoMethodError`.

`extend` sempre foi público. A partir do Ruby 2.1, `include` e `prepend` também: `User.include Greetable` funciona fora do `class`.

**Quando usar:**
API de classe (`User.recent`). Comportamento em **um** objeto. O padrão `included` + `extend ClassMethods`.

**Na entrevista:**
> "extend não muda ancestors da classe. Entra no singleton. Na classe vira class method. No objeto, só nele."

---

## ancestors

**O que é:**
A lista do lookup. Entrevista desenha no quadro. Sem o desenho, include e prepend viram sinônimo.

**Como funciona:**

```
include M
  User  →  M  →  superclasse  →  Object  →  Kernel  →  BasicObject

prepend M
  M  →  User  →  superclasse  →  Object  →  Kernel  →  BasicObject

extend M
  User  →  superclasse  →  Object  →  ...          (sem M)
  singleton(User)  →  M  →  singleton(super)  →  ...
```

`Kernel` está aí porque `Object` inclui `Kernel` — por isso `puts` existe em quase tudo. Os retornos ficam no exercício 1.

**Na entrevista:**
> "Três setas. include: classe, depois module. prepend: module, depois classe. extend: ancestors da classe quieto; o module está no singleton."

---

## included e ClassMethods

**O que é:**
Hook que o Ruby chama quando o module entra. É aí que o mixin ganha class method sem o caller lembrar do `extend`.

**Como funciona:**
```ruby
module Auditable
  def self.included(base)
    base.extend ClassMethods
  end

  module ClassMethods
    def audit_on(*fields) = @audit_fields = fields
    def audit_fields = @audit_fields || []
  end

  def audited? = self.class.audit_fields.any?
end

class Order
  include Auditable
  audit_on :status, :total_cents
end

Order.audit_fields           # [:status, :total_cents]
Order.new.audited?           # true
```

O mesmo recorte existe em `prepended` e `extended`. Sem DSL na classe, não invente hook.

**Na entrevista:**
> "included recebe a classe. O truque clássico é base.extend ClassMethods. Concern do Rails é esse padrão com açúcar."

---

## No Rails

**O que é:**
Duas frases que caem: `prepend` matou `alias_method_chain`; class method de mixin é `extend` — o Concern só esconde isso.

**Como funciona:**

Antes (Rails 2/3, não escreva):

```ruby
def save_with_cache_bust(...)
  save_without_cache_bust(...).tap { bust_cache }
end
alias_method_chain :save, :cache_bust
```

Agora:

```ruby
module CacheBust
  def save(...)
    super.tap { Rails.cache.delete([self.class.name, id]) }
  end
end

class User < ApplicationRecord
  prepend CacheBust
end
```

O `save` original continua na cadeia. O module roda primeiro, chama `super`, limpa o cache. Outra gem dá `prepend` de novo: última na frente, cada uma chama `super`.

`alias_method` ainda existe — para guardar um nome. Wrap de biblioteca é `prepend`. Sem `super`, você **substitui** (soft-delete que não chama o `destroy` do AR).

Class method: no app você escreve concern. Por baixo é `extend`.

```ruby
module Filterable
  extend ActiveSupport::Concern

  class_methods do
    def search(q) = where("name ILIKE ?", "%#{q}%")
  end
end

class Product < ApplicationRecord
  include Filterable
end

Product.search("camisa")  # class method — Concern deu extend
```

Sem Concern é o hook da seção anterior. Capítulo de concern é outro. Ponto daqui: **class method de mixin = extend**. Module só com class method: `extend Filterable` na classe, sem concern vazio.

**Na entrevista:**
> "alias_method_chain morreu. prepend + super é o wrap. include sozinho não cria class method — ou eu dou extend, ou o included estende ClassMethods, ou o Concern faz os dois."

---

## Recapitulando

- `include`: module **depois** da classe. Mixin de instância. Classe ganha o empate.
- `prepend`: module **antes**. Wrap. Sem `super`, some o original.
- `extend`: singleton. Classe → class method. Objeto → só ele. `ancestors` da classe não muda.
- Último `include` / `prepend` fica mais perto do lookup. Repetir o mesmo module não reordena.
- Hook `included` + `extend ClassMethods` é o padrão. Concern é açúcar.
- Rails: `prepend` no lugar de `alias_method_chain`. `extend` (via Concern) para class method.
- Na entrevista: três setas de ancestors. Sem desenho, a resposta não fecha.

---

## Exercícios práticos

### Exercício 1: o que imprime?

**Enunciado:** Sem rodar, diga os três primeiros nomes de `ancestors` e o retorno de `hello` em cada classe. Depois uma frase: por que o `extend` não muda o `hello` da instância.

```ruby
module M
  def hello = "m"
end

class A
  include M
  def hello = "a-#{super}"
end

class B
  prepend M
  def hello = "b"
end

class C
  extend M
  def hello = "c"
end
```

<details>
<summary>Solução</summary>

```ruby
A.ancestors.take(3)  # [A, M, Object]
A.new.hello          # "a-m"

B.ancestors.take(3)  # [M, B, Object]
B.new.hello          # "m"  — M não chamou super

C.ancestors.take(3)  # [C, Object, Kernel]
C.new.hello          # "c"
C.hello              # "m"
```

Frase: "extend mexe no singleton da classe. A instância olha a cadeia da classe, onde M não está."

**Pontos-chave:**
- include: classe na frente, `super` cai no module
- prepend sem `super`: module engole a classe
- extend não aparece em `C.ancestors`
</details>

### Exercício 2: wrap com prepend

**Enunciado:** `Notifier#deliver` devolve `:ok`. Logue `"enviado"` **depois** do deliver original, sem editar o corpo de `Notifier#deliver` e sem `alias_method`. Se a assinatura ganhar `to:`, o wrap continua válido.

<details>
<summary>Solução</summary>

```ruby
module LogDelivery
  def deliver(...)
    super.tap { Rails.logger.info("enviado") }
  end
end

class Notifier
  prepend LogDelivery

  def deliver(to: nil)
    :ok
  end
end

Notifier.new.deliver(to: "joao@email.com")  # :ok, e logou
```

`...` encaminha args e keywords. `super` sem lista também encaminha; `...` deixa a intenção óbvia.

**Pontos-chave:**
- prepend, não include — senão o `deliver` da classe ganha e o log não roda
- `super` é o original
- `alias_method_chain` não entra
</details>

### Exercício 3: o search não existe

**Enunciado:** Quebra com `NoMethodError: undefined method 'search' for User:Class`. Por quê? Conserte de dois jeitos: hook + `extend`, e o que o `ActiveSupport::Concern` faria. Não mude `User.search("joão")`.

```ruby
module Searchable
  def search(q)
    where("name ILIKE ?", "%#{q}%")
  end
end

class User < ApplicationRecord
  include Searchable
end

User.search("joão")
```

<details>
<summary>Solução</summary>

`include` põe `search` na **instância**. `User.search` olha o singleton.

Jeito 1 — hook + ClassMethods:

```ruby
module Searchable
  def self.included(base)
    base.extend ClassMethods
  end

  module ClassMethods
    def search(q) = where("name ILIKE ?", "%#{q}%")
  end
end
```

Jeito 2 — Concern: `extend ActiveSupport::Concern` + `class_methods do` com o mesmo `search`. Por baixo é o `extend` do jeito 1.

Atalho se o module **só** tem class method: `class User; extend Searchable; end`.

**Pontos-chave:**
- include ≠ class method
- `User.search` exige extend (na mão, no hook, ou no Concern)
- A chamada não muda — muda o lugar do método
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
