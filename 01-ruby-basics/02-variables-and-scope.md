# 1.2 Variáveis e escopo

> **TL;DR**
> Seis lugares: local, `@instância`, `@@classe` (armadilha), `@` na classe (class instance), `$global` (raro), `FOO` constante. Local sem assign: `NameError`. `@` sem valor: `nil`. Block enxerga local de fora; `|x|` é local do block. Método não vê local do caller. `self` decide em quem o `@` mora.

## Conteúdo

- [Os seis escopos](#os-seis-escopos)
- [Local](#local)
- [Instance variable](#instance-variable)
- [Class variable vs class instance](#class-variable-vs-class-instance)
- [Global e constante](#global-e-constante)
- [NameError ou nil](#nameerror-ou-nil)
- [binding](#binding)
- [Block vs método](#block-vs-método)
- [self](#self)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Os seis escopos

**O que é:**
O prefixo diz o escopo. Não existe um único “tipo de variável”.

| Prefixo | Nome | Mora em |
|---|---|---|
| `name` | local | método / block |
| `@name` | instance | o objeto `self` |
| `@@count` | class variable | a hierarquia da classe |
| `@count` na classe | class instance | o objeto Class |
| `$global` | global | o processo |
| `FOO` | constante | classe / module |

**Na entrevista:**
> "Local, instance, class, class-instance, global e constante. O que pega é `@@` compartilhado com subclass e `@` não inicializado virar `nil`."

---

## Local

**O que é:**
Sem prefixo. Vive no método. Some quando o método acaba.

**Como funciona:**
```ruby
def greet
  name = "João"
  "Olá, #{name}!"
end

greet   # "Olá, João!"
# name  # NameError
```

Ruby marca o nome como local **na parse**. Assign no método → o nome já é local antes da linha, `nil` até o assign. Use para argumento, acumulador, temporário.

**Na entrevista:**
> "Local some no fim do método. Quem chama não vê. `local_variable_get` existe no Binding — eu não uso. Se o nome está no método, eu uso o nome."

---

## Instance variable

**O que é:**
`@name` pertence ao `self` atual. Cada instância tem o seu.

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

User.new("João", "joao@email.com").label
# "João <joao@email.com>"
```

No Rails, o controller põe `@user` e a view lê. Mesmo objeto, mesmo `self` no render. Use para estado que sobrevive entre métodos da instância.

**Na entrevista:**
> "`@user` no controller é instance variable. A view enxerga porque o Rails renderiza no mesmo objeto. Não é mágica de template."

---

## Class variable vs class instance

**O que é:**
`@@count` é um slot só: classe **e** subclasses. Class instance variable é um `@` no `self` da classe. A classe também é objeto. `@count` em `Account` não é o de `AdminAccount`.

**Como funciona:**
```ruby
class Account
  @@count = 0
  def self.count = @@count
  def self.inc = @@count += 1
end

class AdminAccount < Account; end

Account.inc
AdminAccount.count  # 1 — compartilhou
```

O que você quer no lugar:

```ruby
class Account
  @count = 0
  def self.count = @count
  def self.inc = @count += 1
end

class AdminAccount < Account
  @count = 0
end

Account.inc
Account.count       # 1
AdminAccount.count  # 0 — cada classe tem o seu
```

No corpo da classe e em `def self.inc`, `self` é a classe — `@count` mora nela. `@@` quase nunca. `@` na classe: estado que **não** deve vazar para subclass.

**Na entrevista:**
> "`@@` é armadilha. Subclass e super compartilham o mesmo slot. Class instance variable é `@` na classe. Subclass não herda o valor."

---

## Global e constante

**O que é:**
`$nome` vale no processo inteiro. Constante começa maiúscula (`FOO`, `User`, `MAX_RETRIES`) e mora na classe ou no module.

**Como funciona:**
```ruby
$email = "joao@email.com"
def notify = $email
notify  # "joao@email.com"

MAX_CENTS = 1_000_000  # R$ 10.000,00 em centavos

module Billing
  TAX_CENTS = 50       # R$ 0,50
end

Billing::TAX_CENTS     # 50
# TAX_CENTS            # NameError
MAX_CENTS = 1          # roda, avisa: already initialized constant
```

Ruby já tem `$stdout`, `$LOAD_PATH`, `$!`. Os seus `$`, não. Classe e module **são** constantes: `User` aponta para a classe. Config por ambiente → ENV / `Rails.application.config`, não constante.

**Na entrevista:**
> "`$` meu é red flag. Constante começa maiúscula. Reassign só avisa. Constante que falta é `NameError`, não `nil`."

---

## NameError ou nil

**O que é:**
O erro depende do prefixo. Essa cai muito.

**Como funciona:**
```ruby
def demo
  # email     # NameError (local / método)
  # MISSING   # NameError (constante)
  @title      # nil — sem erro
  # @@gone    # NameError (class variable)
  $missing    # nil — global “existe” vazia
end

"#{@name} #{@last_nme}"  # "João " — typo em @ vira nil
```

Typo em `user` explode. Typo em `@user` / `@usr` silencia.

**Na entrevista:**
> "Local e constante sem assign: `NameError`. `@` sem assign: `nil`. Bug silencioso clássico."

---

## binding

**O que é:**
Objeto com o contexto daquele ponto: `self` + locais. ERB, debugger e `eval` usam.

**Como funciona:**
```ruby
def invoice_binding
  name = "João"
  total_cents = 1990  # R$ 19,90
  binding
end

ctx = invoice_binding
ctx.eval("name")         # "João"
ctx.eval("total_cents")  # 1990
```

`ERB.new(template).result(binding)` lê as locais do método. `binding.irb` / `binding.pry` também. `local_variable_get` você não precisa.

**Na entrevista:**
> "`binding` é self + locais. ERB roda em cima disso. Eu não recito API de Binding."

---

## Block vs método

**O que é:**
Block **enxerga** local de fora — lê e escreve. `|x|` é local do block: não vaza e não pisa no `x` de fora (Ruby 1.9+). Método começa com locais zeradas. Não herda local de quem chamou.

**Como funciona:**
```ruby
name = "João"
total_cents = 0

["Ana", "João"].each do |name|
  total_cents += 1000  # R$ 10,00 cada — altera o de fora
end

name          # "João" — |name| não vazou
total_cents   # 2000

def greet
  # name  # NameError
  "Olá"
end

def greet_with(name)
  "Olá, #{name}!"
end

greet_with("João")  # "Olá, João!"
```

Local extra só do block: `{ |n; acc| ... }`. Raro. Precisa do valor no método? Passa argumento, ou lê `@` / constante.

**Na entrevista:**
> "Block vê local de fora. `|x|` é block-local. Método não fecha em cima do caller. Valor de fora entra por argumento ou por `@`."

---

## self

**O que é:**
O receptor atual. Só o suficiente para escopo: `@` mora em `self`. Muda o `self`, muda o dono.

**Como funciona:**
```ruby
class User
  @kind = "user"          # self é User

  def initialize(name)
    @name = name          # self é a instância
  end

  def name = @name
  def self.kind = @kind   # self é User de novo
end

user = User.new("João")
user.name    # "João"
User.kind    # "user"
```

Corpo de classe e `def self.x` → `self` é a classe. Método de instância → `self` é o objeto.

**Na entrevista:**
> "`@` é variável do `self` atual. Se `self` é a classe, você tem class instance variable."

---

## Recapitulando

- Local: método. Sem assign → `NameError`. `@`: o `self` atual. Sem assign → `nil`.
- `@@`: hierarquia inteira. Armadilha. `@` na classe: estado por classe, sem vazar.
- `$`: raro. Só os que o Ruby já tem. Constante: maiúscula. Falta → `NameError`.
- Block vê e altera local de fora. `|x|` é local do block. Método não vê o caller.
- `binding` guarda esse contexto. `local_variable_get` você não precisa.

---

## Exercícios práticos

### Exercício 1: NameError ou nil?

**Enunciado:** O que cada linha faz? Por quê?

```ruby
def demo
  p @email
  p email
end

demo
```

<details>
<summary>Solução</summary>

`p @email` imprime `nil`. `p email` levanta `NameError`. Sem assign, `email` é local/método e quebra. `@email` sem assign é `nil`.

**Pontos-chave:** Typo em local explode. Typo em `@email` / `@emial` silencia.
</details>

### Exercício 2: `@@` vs `@` na classe

**Enunciado:** Contadores de `Account` e `AdminAccount` deveriam ser separados. O que esse código faz? Como você corrige?

```ruby
class Account
  @@count = 0
  def self.count = @@count
  def initialize = @@count += 1
end

class AdminAccount < Account; end

Account.new
AdminAccount.new
Account.count  # ?
```

<details>
<summary>Solução</summary>

Os dois devolvem `2`. `@@count` é um slot só.

```ruby
class Account
  @count = 0
  def self.count = @count
  def self.inc = @count += 1
  def initialize = self.class.inc
end

class AdminAccount < Account
  @count = 0
end

Account.new; AdminAccount.new
Account.count; AdminAccount.count  # 1 e 1
```

`self.class.inc` incrementa o `@count` da classe real. Subclass precisa do próprio `@count = 0`.

**Pontos-chave:** `@@` vaza entre super e sub. Class instance variable não.
</details>

### Exercício 3: Block vê, método não

**Enunciado:** O que imprime o block? O que acontece no `greet`? Como cumprimentar o João?

```ruby
name = "João"
total_cents = 0

[1990, 100].each do |cents|
  total_cents += cents
end

def greet
  "Olá, #{name}!"
end

p total_cents
p greet
```

<details>
<summary>Solução</summary>

`total_cents` vira `2090` (R$ 20,90). O block altera a local de fora. `greet` levanta `NameError` — método não vê o `name` do caller.

```ruby
def greet(name)
  "Olá, #{name}!"
end

p greet("João")  # "Olá, João!"
```

Passe argumento. Estado do objeto: `@name`.

**Pontos-chave:** Block fecha nas locais; método começa zerado; `|cents|` é do block.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
