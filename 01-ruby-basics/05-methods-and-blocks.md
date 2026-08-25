# 1.5 Métodos e blocks

> **TL;DR**
> Última expressão é o retorno. Default avalia na chamada. Keyword obrigatório: `name:`. Splat: `*args`, `**kwargs`, `&block`. Block entra com `yield` / `block_given?` / `&block`. `{ }` cola na direita; `do/end` na esquerda. `&:to_s` é `Symbol#to_proc`. `return` no block sai do método; no block use `next`. `private` chama com self implícito. `protected` é raro. `define_method` só na lista mecânica.

## Conteúdo

- [def](#def)
- [Argumentos padrão](#argumentos-padrão)
- [Keyword arguments](#keyword-arguments)
- [Splat](#splat)
- [Block, yield e &block](#block-yield-e-block)
- [Chaves vs do/end](#chaves-vs-doend)
- [Symbol to proc](#symbol-to-proc)
- [return vs next](#return-vs-next)
- [public, private e protected](#public-private-e-protected)
- [define_method](#define_method)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## def

**O que é:**
Você define método com `def`. A última expressão é o retorno. `return` só quando corta o fluxo.

**Como funciona:**
```ruby
def greet(name)
  "Olá, #{name}!"
end

greet("João")  # "Olá, João!"

def discount(cents, percent)
  return 0 if percent <= 0
  cents - (cents * percent / 100)
end
```

Instância: `def checkout`. Classe: `def self.find_active`.

**Na entrevista:**
> "Return é opcional. Eu uso quando saio no meio. O resto deixa a última linha falar."

---

## Argumentos padrão

**O que é:**
Valor se o caller omitiu o arg. A expressão do default roda **na chamada**, não na definição.

**Como funciona:**
```ruby
def greet(name = "mundo")
  "Olá, #{name}!"
end

greet         # "Olá, mundo!"
greet("Ana")  # "Olá, Ana!"
```

Diferente de Python: `list = []` no default **não** compartilha o array. Cada chamada cria outro.

```ruby
def append(item, list = [])
  list << item
end

append(1)  # [1]
append(2)  # [2]
```

**Quando usar:**
Paginação, role, timeout. Default pode depender de outro arg: `def window(start, finish = start + 1.day)`.

**Na entrevista:**
> "Default avalia na chamada. O `[]` no default não é a armadilha do Python."

---

## Keyword arguments

**O que é:**
Arg pelo nome. Obrigatório: `name:`. Opcional: `role: "user"`. Ruby 3 não mistura Hash e kwargs sozinho.

**Como funciona:**
```ruby
def create_user(name:, email:, role: "user")
  { name: name, email: email, role: role }
end

create_user(name: "João", email: "joao@email.com")

# Hash solto não vira kwargs
attrs = { name: "João", email: "joao@email.com" }
create_user(**attrs)
```

No Rails: `redirect_to root_path, notice: "Criado"`, `find_by(email:)`, `render json: user, status: :created`.

**Quando usar:**
Três args ou dois em que a ordem mente (`notify(user, true)` — true de quê?).

**Na entrevista:**
> "Ruby 3 separou Hash de keyword. Tenho um Hash? Passo `**attrs`. Sem o splat, ArgumentError."

---

## Splat

**O que é:**
`*args` junta (ou espalha) posicionais. `**kwargs` faz o mesmo com keywords. `&block` captura o block como Proc.

**Como funciona:**
```ruby
def log(level, *messages)
  messages.each { |msg| puts "[#{level}] #{msg}" }
end

log(:info, "ok", "feito")

ids = [1, 2, 3]
sum(*ids)  # espalha na chamada
```

Ordem: posicionais, `*rest`, keywords, `**kwargs`, `&block`. Wrapper e `super` usam. Não use `*args` para esconder assinatura.

**Na entrevista:**
> "`*` é lista. `**` é Hash de keywords. `&` é o block. Os três valem na definição e na chamada."

---

## Block, yield e &block

**O que é:**
Pedaço de código que você passa ao método. Não entra na lista de args. O método chama com `yield` ou guarda em `&block`.

**Como funciona:**
```ruby
def with_timing
  started = Time.now
  result = yield
  puts "levou #{Time.now - started}s"
  result
end

with_timing { User.count }

def greet
  block_given? ? yield("João") : "Olá"
end

def each_active(&block)
  User.active.find_each(&block)
end
```

`yield` não cria Proc. Sem block, vira `LocalJumpError` — daí `block_given?`. `&block` vira Proc: use quando vai **guardar** ou **passar adiante**.

**Na entrevista:**
> "Block não é argumento. Entra no `yield`. Preciso do Proc? `&block` na assinatura. `block_given?` evita o LocalJumpError."

---

## Chaves vs do/end

**O que é:**
Dois jeitos do mesmo block. A diferença que cai em entrevista é **precedência**. `{ }` cola no método da **direita**. `do/end` cola no da **esquerda**.

**Como funciona:**
```ruby
puts [1, 2, 3].map { |n| n * 2 }
# [2, 4, 6] — { } vai para map

puts [1, 2, 3].map do |n|
  n * 2
end
# #<Enumerator: ...> — do/end vai para puts; map sem block
```

```ruby
foo bar { |x| x }     # block de bar
foo bar do |x| x end  # block de foo
```

Convenção: `{ }` numa linha; `do/end` em várias. Precedência manda mais. Ambíguo? `puts(nums.map do ... end)`.

**Na entrevista:**
> "`{ }` tem precedência maior. `puts array.map { }` imprime o array. `puts array.map do` passa o block ao `puts` e você vê Enumerator."

---

## Symbol to proc

**O que é:**
`&:to_s` pede `to_proc` no Symbol. Vira `{ |obj| obj.to_s }`.

**Como funciona:**
```ruby
[1, 2, 3].map(&:to_s)  # ["1", "2", "3"]
users.map(&:email)
orders.select(&:paid?)
```

Não cabe arg extra. `map { |u| u.discount(10) }` não vira `&:discount`. Um método, sem arg, em `map` / `select`. No Rails, `pluck(:id)` às vezes substitui `map(&:id)`.

**Na entrevista:**
> "`&:to_s` é `Symbol#to_proc`. Se o método precisa de argumento, eu volto para o block."

---

## return vs next

**O que é:**
No block, `return` sai do **método** que envolve o block. Valor do block + seguir o iterator: `next`. `break` para o iterator. (Loop em si: 1.4.)

**Como funciona:**
```ruby
def first_admin(users)
  users.each do |user|
    return user if user.admin?
  end
  nil
end
# return sai de first_admin — é o que você quer

[1, 2, 3].map do |n|
  next 0 if n.even?
  n
end
# [1, 0, 3]
```

Se o Proc sobrevive ao método e alguém dá `return` lá dentro: `LocalJumpError`. Não tem para onde voltar.

**Na entrevista:**
> "`return` no block é return do método. Quem quer só pular o item usa `next`. Isso pega quem veio de JS."

---

## public, private e protected

**O que é:**
Visibilidade. Default: `public`. `private` chama **sem receptor explícito**. `protected` deixa outro objeto da mesma classe chamar — e quase ninguém usa.

**Como funciona:**
```ruby
class Order
  def checkout
    charge!       # ok — self implícito
    send_receipt
  end

  private

  def send_receipt; end
end

order.checkout        # ok
order.send_receipt    # NoMethodError (private)
```

Ruby 2.7+: `self.send_receipt` **pode**. Continua proibido receptor **outro**: `other.send_receipt`. Writer privado sempre aceitou `self.password =` — senão vira local.

`protected` serve para comparar dois da mesma família:

```ruby
class Account
  def bigger_than?(other)
    balance_cents > other.balance_cents
  end

  protected
  attr_reader :balance_cents
end
```

Se fosse `private`, `other.balance_cents` quebrava. `private` no detalhe; `public` na API; `protected` só nesse “outro eu”. Em Rails, callback e `before_action` costumam ser `private`.

**Na entrevista:**
> "Private em Ruby não é o do Java. Chama com self implícito. No 2.7+, `self.foo` também vale. Protected existe para `other.foo` na mesma classe. Eu quase não escrevo protected."

---

## define_method

**O que é:**
Cria método em runtime. Metaprogramming. Menção curta: cai em entrevista, não é o dia a dia.

**Como funciona:**
```ruby
class Order
  %i[pending paid canceled].each do |status|
    define_method("#{status}?") { self.status.to_sym == status }
  end
end

order.paid?  # true se status == "paid"
```

Família mecânica, ok. Três métodos claros? Escreva os três. Stacktrace é pior.

**Na entrevista:**
> "`define_method` monta método na hora. Lista gerada, ok. Se são três, eu escrevo três `def`."

---

## Recapitulando

- Última expressão é o retorno. `return` corta o método.
- Default avalia na chamada. Keyword obrigatório: `name:`. Ruby 3 quer `**hash`.
- `*args`, `**kwargs`, `&block` — lista, keywords, block.
- Block entra com `yield`. `&block` quando o Proc viaja. `block_given?` se for opcional.
- `{ }` cola na direita; `do/end` na esquerda.
- `&:to_s` é `Symbol#to_proc`. Sem argumento extra.
- `return` no block sai do método. No block, valor + continuar = `next`.
- `private` chama com self implícito. `protected` é raro. `define_method` só na lista mecânica.

---

## Exercícios práticos

### Exercício 1: O que o `puts` imprime?

**Enunciado:** O que cada chamada imprime, e por quê?

```ruby
nums = [1, 2, 3]

puts nums.map { |n| n * 2 }

puts nums.map do |n|
  n * 2
end
```

<details>
<summary>Solução</summary>

A primeira imprime `[2, 4, 6]`. `{ }` vai para `map`. `puts` recebe o Array.

A segunda imprime um Enumerator. `do/end` vai para `puts`. `map` roda sem block.

```ruby
puts(nums.map do |n|
  n * 2
end)
# [2, 4, 6] — parênteses forçam o block no map
```

**Pontos-chave:**
- `{ }` tem precedência maior
- `do/end` se associa ao método da esquerda
- Parênteses resolvem a ambiguidade
</details>

### Exercício 2: `return` ou `next`?

**Enunciado:** O método deveria devolver os IDs pares. O que acontece? Como corrige?

```ruby
def even_ids(users)
  users.map do |user|
    return user.id if user.id.even?
    user.id
  end
end
```

<details>
<summary>Solução</summary>

`return` sai de `even_ids` no primeiro par. A chamada devolve um Integer, não um Array.

```ruby
def even_ids(users)
  users.filter_map { |user| user.id if user.id.even? }
end
```

`next user.id if user.id.even?` devolve o id no par e `nil` no ímpar — ainda não é a lista de pares. `return` no `map` não escolhe o item: abandona o método.

**Pontos-chave:**
- `return` no block = return do método
- `next valor` devolve no block e o `map` segue
- Para filtrar, `select` / `filter_map`
</details>

### Exercício 3: private com receptor

**Enunciado:** Por que `other.credit` quebra e `other.balance_cents` passa?

```ruby
class Account
  def transfer_to(other, cents)
    debit(cents)
    other.credit(cents)
  end

  def bigger_than?(other)
    balance_cents > other.balance_cents
  end

  protected
  attr_reader :balance_cents

  private
  def debit(cents); end
  def credit(cents); end
end
```

<details>
<summary>Solução</summary>

`debit(cents)` é private com self implícito — ok.

`other.credit(cents)` é private com **outro** receptor — `NoMethodError`. Mesma classe não libera private.

`other.balance_cents` passa porque está `protected`. Se fosse `private`, quebrava igual. O desenho certo: `credit` (ou `receive`) público; detalhe interno privado.

**Pontos-chave:**
- Private: self implícito (no 2.7+, `self.foo`)
- Outro objeto + private = erro
- Protected existe para `other.foo` na mesma classe
- Em Rails você quase não escreve protected
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
