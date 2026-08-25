# 2.8 method_missing

> **TL;DR**
> Chamou um método que ninguém tem: Ruby sobe a cadeia e cai em `method_missing`. O default levanta `NoMethodError`. Se você sobrescreve, **obriga** `respond_to_missing?` e `super` no que não for seu. Sem o par, `respond_to?` e `method` mentem. Cada miss paga a lookup inteira — no hot path, defina o método na primeira vez. Active Record ainda aceita `find_by_email`; o código novo usa `find_by(email:)`. OpenStruct é o exemplo didático. Na app, quase sempre é smell.

## Conteúdo

- [method_missing](#method_missing)
- [respond_to_missing?](#respond_to_missing)
- [super](#super)
- [Custo](#custo)
- [find_by_* no Active Record](#find_by_-no-active-record)
- [OpenStruct](#openstruct)
- [Quando é smell](#quando-é-smell)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## method_missing

**O que é:**
Última parada da lookup. Você mandou `user.foo`. Ruby procura `foo` no singleton, na classe, nos modules, na superclasse, até `BasicObject`. Ninguém tem → chama `method_missing(:foo, *args, &block)`.

**Como funciona:**
```ruby
class Cart
  def method_missing(name, *args, &block)
    if name.to_s.start_with?("add_")
      item = name.to_s.delete_prefix("add_")
      "colocou #{item} no carrinho"
    else
      super
    end
  end
end

cart = Cart.new
cart.add_coffee   # "colocou coffee no carrinho"
cart.checkout     # NoMethodError — caiu no super
```

O default de `BasicObject#method_missing` levanta `NoMethodError`. Sem o seu `super`, um typo vira `nil` silencioso.

**Quando usar:**
Nome do método **é dado**, não API fechada. Proxy, builder, DSL. Conjunto finito e conhecido → `define_method` no load, não miss.

**Na entrevista:**
> "method_missing não é o primeiro lugar da lookup. É o último. Eu só uso quando o nome chega em runtime e não dá para listar na classe."

---

## respond_to_missing?

**O que é:**
O par obrigatório. `respond_to?(:add_coffee)` **não** passa por `method_missing`. Passa por `respond_to_missing?` se o método não existe de verdade. Sem o override, a pergunta mente.

**Como funciona:**
```ruby
class Cart
  def method_missing(name, *args, &block)
    return "colocou #{item_from(name)} no carrinho" if add?(name)
    super
  end

  def respond_to_missing?(name, include_private = false)
    add?(name) || super
  end

  private

  def add?(name)
    name.to_s.start_with?("add_")
  end

  def item_from(name)
    name.to_s.delete_prefix("add_")
  end
end

cart = Cart.new
cart.respond_to?(:add_coffee)  # true  — por causa do par
cart.method(:add_coffee)       # BoundMethod, não NameError
cart.respond_to?(:checkout)    # false — super disse não
```

Assinatura: `respond_to_missing?(name, include_private = false)`. Encaminhe o segundo arg no `super`. Não sobrescreva `respond_to?` — isso era Ruby velho.

**O que quebra sem o par:**
- `respond_to?` devolve `false` e o `send` funciona — duck typing mente
- `method` / `public_method` levantam `NameError`
- RSpec `allow(obj).to receive(:add_coffee)` e qualquer double que checa a API

**Na entrevista:**
> "Se eu implemento method_missing, implemento respond_to_missing?. Sem o par, respond_to? mente e method estoura. É a primeira coisa que o entrevistador testa."

---

## super

**O que é:**
O que você não reivindica, devolve para a cadeia. Sem `super`, você come o `NoMethodError` e esconde typo.

**Como funciona:**
```ruby
# RUIM — tudo "funciona"
def method_missing(name, *)
  nil
end

cart.chekcout  # nil. O bug some.

# BOM — só o prefixo é seu
def method_missing(name, *args, &block)
  return handle_add(name) if add?(name)
  super
end

def respond_to_missing?(name, include_private = false)
  add?(name) || super
end
```

O `super` do `respond_to_missing?` é o mesmo contrato: o que não é seu, pergunta para cima. Sempre. Mesmo quando o objeto "aceita qualquer mensagem".

**Na entrevista:**
> "super no que não for meu. Senão eu engulo typo e o stack some. method_missing sem super é bug disfarçado de flexibilidade."

---

## Custo

**O que é:**
Miss não é barato. Ruby esgota a cadeia **antes** de te entregar o nome. Depois você parseia string. No loop, isso soma.

**Como funciona:**
Conjunto fechado (`name`, `email`, `total_cents`) não precisa de miss. Defina no load:

```ruby
class Report
  COLUMNS = %i[name email total_cents].freeze

  COLUMNS.each do |column|
    define_method(column) { rows.fetch(column) }
  end
end
```

Se o nome só aparece em runtime, defina na **primeira** miss e chame de novo. A segunda bate no method cache:

```ruby
def method_missing(name, *args, &block)
  if add?(name)
    self.class.define_method(name) do
      "colocou #{name.to_s.delete_prefix("add_")} no carrinho"
    end
    send(name, *args, &block)
  else
    super
  end
end
```

**Quando usar:**
Miss puro em script, DSL, irb. Hot path (request, job, loop) → método de verdade depois do primeiro hit.

**Na entrevista:**
> "Não é o primeiro lugar que eu otimizo. Mas eu não deixo method_missing no meio de um each. Ou define_method no load, ou define na primeira miss e send."

---

## find_by_* no Active Record

**O que é:**
O exemplo que o entrevistador espera. `User.find_by_email("joao@email.com")` não está escrito no model. O Rails casa o nome, monta o `WHERE` e — na primeira vez — **define** o método. A próxima chamada já é método real.

**Como funciona:**
```ruby
# ainda funciona — dynamic finder
User.find_by_email("joao@email.com")
User.find_by_email_and_name("joao@email.com", "João")
User.find_by_email!("joao@email.com")  # RecordNotFound se faltar

# o que você escreve hoje
User.find_by(email: "joao@email.com")
User.find_by(email: "joao@email.com", name: "João")
User.find_by!(email: "joao@email.com")

User.respond_to?(:find_by_email)  # true — o par existe
```

Por baixo: `method_missing` + `respond_to_missing?`. O matcher lê `find_by_email_and_name`, quebra em colunas, confere no schema. Nome válido → `class_eval` define e chama. Nome inválido → `super` → `NoMethodError`.

**Quando usar:**
Código novo: `find_by(email:)`. Dynamic finder só em legado, e você sabe o caminho.

**Na entrevista:**
> "find_by_email passa por method_missing, o Rails define o método e segue. Eu não escrevo isso em código novo. find_by com hash é explícito, aceita mais de uma coluna sem inventar nome, e o grep acha."

---

## OpenStruct

**O que é:**
Hash que responde como objeto. `o.name` em vez de `o[:name]`. Internamente: `method_missing` + `define_singleton_method` no primeiro acesso.

**Como funciona:**
```ruby
require "ostruct"

user = OpenStruct.new(name: "João", email: "joao@email.com")
user.name          # "João"
user.role = "admin"
user.respond_to?(:name)  # true

# o que você fala no lugar
User = Struct.new(:name, :email, keyword_init: true)
User = Data.define(:name, :email)  # Ruby 3.2+, imutável
```

Ruby 3 não carrega `ostruct` sozinho. Tem aviso de performance. Cada instância ganha singleton methods. Milhares num request doem mais que milhares de Hash.

**Quando usar:**
Console, fixture rápida, irb. App de verdade: `Struct`, `Data.define`, PORO ou Hash.

**Na entrevista:**
> "OpenStruct é o exemplo de livro. Em produção eu não uso. É lento, a forma é aberta demais e o typo vira setter novo. Struct ou Data."

---

## Quando é smell

**O que é:**
`method_missing` é metaprogramming caro e opaco. A maioria dos usos na app é preguiça de escrever o método, não necessidade.

**Cheiro:** conjunto fechado e mesmo assim miss; sem `respond_to_missing?`; sem `super` (tudo vira `nil`); DSL que o time não greppa; proxy que reimplementa `Forwardable` na mão.

**O que usar no lugar:**
```ruby
%i[pending paid canceled].each do |status|
  define_method(:"#{status}?") { self.status == status.to_s }
end

class UserPresenter
  extend Forwardable
  def_delegators :@user, :name, :email
end

config.fetch(:timeout)  # dado, não mensagem
```

**Quando não é smell:** proxy para API que você não controla; builder em que o nome **é** o dado (`xml.user { xml.name "João" }`); compatibilidade (`find_by_*`); primeira miss define o método e some.

**Na entrevista:**
> "Eu trato method_missing como smell até provar o contrário. Se eu sei os nomes, define_method. Se eu delego, Forwardable. Se o nome é dado de verdade, aí sim, com o par e com super."

---

## Recapitulando

- `method_missing` é o fim da lookup, não um atalho para definir API.
- Override sem `respond_to_missing?` é bug: `respond_to?` e `method` mentem.
- O que não for seu: `super`. Senão o typo some.
- Miss custa a cadeia inteira. Hot path: `define_method` no load ou na primeira chamada.
- `find_by_email` ainda existe. Código novo: `find_by(email:)`.
- OpenStruct ensina o padrão. Produção: `Struct` / `Data`.
- Conjunto fechado + miss = smell.

---

## Exercícios práticos

### Exercício 1: O par obrigatório

**Enunciado:** `Settings` guarda um Hash. `settings.timeout` devolve o valor se a chave existir. Faça `respond_to?(:timeout)` ser `true` e `settings.missing` levantar `NoMethodError`. Não engula o miss.

<details>
<summary>Solução</summary>

```ruby
class Settings
  def initialize(attrs)
    @attrs = attrs
  end

  def method_missing(name, *args, &block)
    @attrs.key?(name) ? @attrs.fetch(name) : super
  end

  def respond_to_missing?(name, include_private = false)
    @attrs.key?(name) || super
  end
end

settings = Settings.new(timeout: 30)
settings.timeout               # 30
settings.respond_to?(:timeout) # true
settings.missing               # NoMethodError
```

**Pontos-chave:**
- Os dois hooks usam a **mesma** regra
- `super` no que não é chave
- Sem o par, `respond_to?(:timeout)` seria `false` e o `send` funcionaria
</details>

### Exercício 2: Por que isso é lento — e o que você troca

**Enunciado:** Um presenter chama `row.col_0` … `row.col_99` dentro de um `map` de 10_000 linhas. Hoje tudo cai em `method_missing`. O que você fala na entrevista e como reescreve?

<details>
<summary>Solução</summary>

Cada célula paga lookup completa + parse do nome. 10_000 × 100 misses. Conjunto fechado → `define_method` no load:

```ruby
class Row
  100.times do |i|
    define_method(:"col_#{i}") { @values.fetch(i) }
  end

  def initialize(values)
    @values = values
  end
end
```

Se o índice só aparece em runtime, defina na primeira miss e `send`. `respond_to_missing?` continua obrigatório.

**Pontos-chave:**
- Conjunto fechado → `define_method` no load
- Nome aberto → define uma vez, depois é método
</details>

### Exercício 3: `find_by_email` vs `find_by`

**Enunciado:** O entrevistador pergunta: "`User.find_by_email` existe no model? `User.respond_to?(:find_by_email)` é true? Por que o time prefere `find_by(email:)`?"

<details>
<summary>Solução</summary>

Não está escrito no `user.rb`. Active Record implementa dynamic finder com `method_missing` + `respond_to_missing?`. Casa `find_by_email` com a coluna, define o método na classe e chama. Por isso `respond_to?(:find_by_email)` é `true`.

```ruby
User.find_by_email("joao@email.com")              # legado
User.find_by(email: "joao@email.com", name: "João")  # código novo
```

O hash ganha: grep acha `find_by`; duas colunas não viram `find_by_email_and_name_and_role`; typo na coluna falha no Hash, não num método "que deveria existir".

**Pontos-chave:**
- O método nasce na primeira chamada, não no arquivo do model
- O par existe: `respond_to?` não mente
- API nova é `find_by` / `find_by!`
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
