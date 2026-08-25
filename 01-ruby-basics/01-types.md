# 1.1 Tipos em Ruby

> **TL;DR**
> Em Ruby quase tudo é objeto: `1`, `"oi"`, `nil`, `true`. Os tipos que caem em entrevista: Integer, Float, String, Symbol, true/false, nil, Array, Hash. Dinheiro: int em centavos, não Float. Só `false` e `nil` são falsy. Symbol (`:nome`) não é String. Ruby 3 tem types opcionais (RBS / Sorbet); o interpretador não exige.

## Conteúdo

- [Tudo é objeto](#tudo-é-objeto)
- [Integer](#integer)
- [Float](#float)
- [String](#string)
- [Symbol](#symbol)
- [true, false e nil](#true-false-e-nil)
- [Array](#array)
- [Hash](#hash)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Tudo é objeto

**O que é:**
Em Ruby, número, string, `nil` e até a classe são objeto. Você manda mensagem: `1.even?`, `"joão".upcase`, `nil.nil?`.

**Como funciona:**
```ruby
1.class          # Integer
"oi".class       # String
nil.class        # NilClass
true.class       # TrueClass
:nome.class      # Symbol

1.even?          # false
"joão".upcase    # "JOÃO"
```

**Na entrevista:**
> "Em Ruby tudo é objeto. Não tem tipo primitivo separado como no Java. `1` é Integer, responde a método."

---

## Integer

**O que é:**
Número inteiro. Sem limite fixo de 32/64-bit: cresce para BigNum sozinho.

**Como funciona:**
```ruby
idade = 25
temperatura = -10
zero = 0

10**50            # inteiro grande, não vira float
1_000_000         # underscore só para ler
```

**Quando usar:**
Contador, ID, quantidade, idade, paginação, **dinheiro em centavos**.

**Exemplo prático:**
```ruby
page = 1
per_page = 20
offset = (page - 1) * per_page

user_id = User.find(id).id  # Integer
```

**Na entrevista:**
> "Integer não overflowa para float. Para dinheiro eu guardo centavos em Integer."

---

## Float

**O que é:**
Número de ponto flutuante. Mesmo problema de sempre: precisão binária.

**Como funciona:**
```ruby
preco = 99.99
0.1 + 0.2 == 0.3   # false
# 0.30000000000000004
```

**Quando usar:**
Peso, altura, temperatura, cálculo científico.

**Não use para dinheiro.**

**Exemplo prático:**
```ruby
# RUIM
total = 10.1 + 10.2  # 20.299999999999997

# BOM — centavos
total_centavos = 1010 + 1020  # 2030
total_reais = total_centavos / 100.0  # só para exibir

# Ou BigDecimal / money-rails
require "bigdecimal"
BigDecimal("10.10") + BigDecimal("10.20")  # 20.30 exato
```

**Na entrevista:**
> "Float não serve para dinheiro. 0.1 + 0.2 não é 0.3. Eu uso Integer em centavos ou BigDecimal."

---

## String

**O que é:**
Texto mutável por padrão. Interpola com `"#{}"`. Aspas simples não interpolam.

**Como funciona:**
```ruby
nome = "João"
"Olá, #{nome}!"   # "Olá, João!"
'Olá, #{nome}!'   # "Olá, #{nome}!"

nome.upcase!      # muta
nome.upcase       # devolve outra string
```

**Quando usar:**
Nome, e-mail, corpo de e-mail, mensagem de erro. Chave de Hash estável → prefira Symbol.

**Na entrevista:**
> "String é mutável. `upcase!` muda no lugar. Para chave de Hash e nome de método eu uso Symbol."

---

## Symbol

**O que é:**
Identificador imutável. `:nome` é sempre o mesmo objeto. Barato de comparar.

**Como funciona:**
```ruby
:nome.object_id == :nome.object_id  # true
"nome".object_id == "nome".object_id  # em geral false

# Hash de opções — clássico Rails
User.find_by(email: "joao@email.com")
redirect_to root_path, notice: "Criado"
```

**Quando usar:**
Chave de Hash, nome de método (`:create`), status (`:pending`), opção de API.

**Na entrevista:**
> "Symbol é interned. `:admin` e `:admin` são o mesmo objeto. String é conteúdo. Em params do Rails a chave vem string; o `symbolize_names` / `with_indifferent_access` existe por isso."

---

## true, false e nil

**O que é:**
`true` e `false` são objetos (`TrueClass` / `FalseClass`). `nil` é ausência (`NilClass`).

**Como funciona:**
```ruby
# Só false e nil são falsy
if 0        # truthy
if ""       # truthy
if []       # truthy
if false    # falsy
if nil      # falsy

user&.name  # safe navigation — nil se user for nil
```

**Na entrevista:**
> "Só `false` e `nil` são falsy. `0` e string vazia são truthy. Isso pega quem vem de PHP ou JS."

---

## Array

**O que é:**
Lista ordenada, índice começa em 0. Enumerable de graça.

**Como funciona:**
```ruby
nums = [1, 2, 3]
nums << 4
nums[0]           # 1
nums.map { |n| n * 2 }   # [2, 4, 6, 8]
nums.select(&:even?)     # [2, 4]
```

**Quando usar:**
Coleção ordenada, resultado de `where` materializado, lista de IDs.

**Na entrevista:**
> "Array inclui Enumerable. Em entrevista eu falo `map`, `select`, `reduce` e o `&:to_s`."

---

## Hash

**O que é:**
Mapa chave → valor. Em Ruby 1.9+ a ordem de inserção vale.

**Como funciona:**
```ruby
user = { name: "João", email: "joao@email.com" }
user[:name]              # "João"
user.fetch(:role)        # KeyError — melhor que nil silencioso
user.fetch(:role, "user")

# String vs Symbol na chave
params = { "name" => "João" }
params[:name]            # nil
params["name"]           # "João"
```

**Quando usar:**
Opções, params, JSON, config. No Rails, `params` se comporta como os dois (`HashWithIndifferentAccess`).

**Na entrevista:**
> "Hash com símbolo no código. Params HTTP chegam string. Por isso o Rails tem indifferent access. `fetch` em vez de `[]` quando a chave é obrigatória."

---

## Recapitulando

- Tudo é objeto. Não existe primitivo separado.
- Integer para ID, contador e **centavos**.
- Float não é dinheiro.
- String mutável; Symbol interned, para identidade.
- Só `false` e `nil` são falsy. `0` e `""` passam no `if`.
- Array e Hash incluem Enumerable.
- Params: string. Código seu: symbol.

---

## Exercícios práticos

### Exercício 1: Por que `0.1 + 0.2 != 0.3`?

**Enunciado:** Explique e mostre como somar R$ 10,10 + R$ 10,20 sem erro de ponto flutuante.

<details>
<summary>Solução</summary>

Float é binário. `0.1` não tem representação exata.

```ruby
dez_reais_dez = 1010
dez_reais_vinte = 1020
total = dez_reais_dez + dez_reais_vinte  # 2030 centavos

format("R$ %.2f", total / 100.0)  # "R$ 20.30"
```

**Pontos-chave:**
- Guarda em centavos
- Divide só na hora de exibir
</details>

### Exercício 2: String vs Symbol

**Enunciado:** Por que `params[:id]` às vezes é `nil` se o request mandou `id`?

<details>
<summary>Solução</summary>

A chave do Rack/HTTP é `"id"`, não `:id`.

```ruby
params = { "id" => "42" }
params[:id]     # nil
params["id"]    # "42"

# No Rails:
params[:id]     # funciona — HashWithIndifferentAccess
```

**Pontos-chave:**
- Symbol ≠ String
- Rails esconde isso no `params`
- Fora do Rails, use a chave certa ou `symbolize_keys`
</details>

### Exercício 3: O que é falsy?

**Enunciado:** O que imprime cada linha?

```ruby
puts "a" if 0
puts "b" if ""
puts "c" if []
puts "d" if nil
puts "e" if false
```

<details>
<summary>Solução</summary>

Imprime `a`, `b`, `c`. Não imprime `d` nem `e`.

**Pontos-chave:**
- Só `nil` e `false` param o `if`
- Quem veio de PHP espera que `0` e `""` sejam falsy — em Ruby não são
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
