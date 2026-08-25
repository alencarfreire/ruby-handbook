# 3.7 Ruby 3.x

> **TL;DR**
> Ruby 3 é o piso. Rails 7.1+ pede 3.1+. Numbered params `_1`, endless method, pattern matching. `Hash#except` entrou no core; `compact` tira `nil`. Frozen string **não** virou default do interpretador no 3.0 — o default é o magic comment que o Rails já gera. `Data` (3.2) é value object imutável; `with` no 3.3. `it` no 3.4 é o `_1` com nome. Types: RBS oficial, Sorbet na rua; MRI não exige. Fiber scheduler = IO não-bloqueante. YJIT é o JIT — 3.3 liga por padrão nas plataformas suportadas.

## Conteúdo

- [Por que Ruby 3 cai](#por-que-ruby-3-cai)
- [Numbered parameters](#numbered-parameters)
- [Endless method](#endless-method)
- [Pattern matching](#pattern-matching)
- [except e compact no Hash](#except-e-compact-no-hash)
- [Freeze no 3.0](#freeze-no-30)
- [Data](#data)
- [it no 3.4](#it-no-34)
- [RBS e Sorbet](#rbs-e-sorbet)
- [Fiber scheduler](#fiber-scheduler)
- [YJIT](#yjit)
- [Rails 7.1+ assume 3.1+](#rails-71-assume-31)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Por que Ruby 3 cai

**O que é:**
A linha 3.x não é “syntax sugar”. É o runtime que o Rails 7.1+ assume. Entrevista pergunta o que mudou e o que você usa de verdade.

**Como funciona:**
O 3.0 quebrou Hash-como-keyword. Sem `**`, `ArgumentError` — 1.3 e 1.5 cobrem. Aqui o resto: `_1`, endless, `case in`, `except`, `Data`, YJIT.

3.0: Fiber scheduler, RBS, Ractor (Ractor no 3.6). 3.1: piso do Rails 7.1. 3.2: YJIT estável e `Data`. 3.3: YJIT default e `Data#with`. 3.4: `it`. Fale a versão do time, não uma lista.

**Na entrevista:**
> "Rails 7.1+ assume Ruby 3.1+. O 3.0 separou keyword de Hash — eu passo `**attrs`. O que eu uso no dia: `_1` em block curto, `except`/`compact`, `Data` pra value object. YJIT ligado."

---

## Numbered parameters

**O que é:**
No block, `_1` é o primeiro argumento, `_2` o segundo. Veio no 2.7; no 3.x é idioma.

**Como funciona:**
```ruby
users.map { _1.email }
pares.map { _1 + _2 }

# equivalente
users.map { |user| user.email }
pares.map { |a, b| a + b }
```

Não mistura com `|user|`. Se escreveu parâmetro nomeado, `_1` some. Uma linha, um arg óbvio. Três: nomeie. Método de uma palavra: `&:email` ainda ganha.

**Na entrevista:**
> "`_1` é o primeiro arg do block. Eu uso em one-liner. Se o block tem cara, eu nomeio. Não misturo com `|n|`."

---

## Endless method

**O que é:**
`def` de uma expressão. Ruby 3.0. Sem `end`.

**Como funciona:**
```ruby
def total_reais = cents / 100.0
def greet(name) = "Olá, #{name}!"
def self.find_active = where(active: true)
```

Uma expressão. `rescue`/`ensure` ou duas linhas? `def`/`end`. Reader de ivar já tem `attr_reader`.

**Na entrevista:**
> "Endless method é `def nome = expressão`. Uma linha. Corpo de verdade eu abro `end`."

---

## Pattern matching

**O que é:**
`case`/`in` destrói Array e Hash e liga variável. Experimental no 2.7, estável no 3.0.

**Como funciona:**
```ruby
payload = { status: "pago", cents: 1990, currency: "BRL" }

case payload
in { status: "pago", cents:, currency: }
  format("R$ %.2f", cents / 100.0)
in { status: "pendente" }
  "aguardando"
in { status: }
  "status desconhecido: #{status}"
end
```

`cents:` no padrão **liga** `cents`. Pin `^` compara com variável que já existe — não cria outra. `in` sozinho é boolean + bind. `=>` também desestrutura.

```ruby
esperado = "pago"
payload in { status: ^esperado, cents: }  # true, cents = 1990

[1, 2, 3] in [primeiro, *resto]           # resto = [2, 3]
{ name: "João", role: "admin" } => { name:, role: }
```

Webhook, JSON com formatos. `if status ==` resolve o resto.

**Na entrevista:**
> "`case`/`in` casa estrutura e já liga variável. `cents:` no padrão é bind. `^esperado` é pin — compara, não sobrescreve. Não é o `when` do 1.4: `when` usa `===`."

---

## except e compact no Hash

**O que é:**
`except` tira chave e devolve Hash novo — Ruby 3.0, o ActiveSupport já tinha. `compact` tira par cujo valor é `nil` — isso é 2.4, mas cai junto.

**Como funciona:**
```ruby
attrs = { name: "João", email: "joao@email.com", password: "segredo", role: nil }

attrs.except(:password)           # sem password; role continua nil
attrs.compact                     # sem role; password continua
attrs.except(:password).compact   # os dois

attrs.slice(:name, :email)        # o inverso do except: fica só isso
```

Não muta. `compact!` é core. `except!` e `compact_blank` são ActiveSupport — blank tira `""`, `[]`, `false`. Log sem senha, `update` sem apagar coluna com `nil`.

**Na entrevista:**
> "`except` era do Rails, no 3.0 entrou no Hash. `compact` tira nil. `compact_blank` ainda é ActiveSupport."

---

## Freeze no 3.0

**O que é:**
O 3.0 **não** ligou `# frozen_string_literal: true` no interpretador. Quem gera arquivo no Rails já coloca o comment — esse é o default da era 3.x. Mecânica do comment está no 1.7.

**Como funciona:**
```ruby
# frozen_string_literal: true

label = "pago"
label << "!"  # FrozenError
```

Sem o comment, o literal continua mutável. `--enable-frozen-string-literal` existe; ninguém liga em produção sem auditoria. O freeze que o 3.0 empurrou: Ractor só compartilha shareable — na prática, frozen. `Data` já nasce imutável. Arquivo novo: o comment. Mutar literal: `+"texto"` ou `.dup`.

**Na entrevista:**
> "3.0 não tornou string literal frozen por padrão. O default é o comment no topo, que o generator do Rails já bota. Ractor exige shareable — freeze entra aí. `Data` já nasce imutável."

---

## Data

**O que é:**
Value object imutável. Ruby 3.2. Parece Struct, mas não tem setter. 3.3 ganhou `with` — cópia com campo trocado.

**Como funciona:**
```ruby
Money = Data.define(:cents, :currency)

preco = Money.new(1990, "BRL")          # ou Money.new(cents: 1990, currency: "BRL")
preco.cents                             # 1990
preco.cents = 2000                      # NoMethodError — sem setter
preco.with(cents: 2490)                 # outro Money; o original fica
preco in { cents: 1990, currency: "BRL" }  # true — pattern matching
```

Dinheiro, coordenada, intervalo. Mutar no lugar? Struct. Identidade e persistência? Model.

**Na entrevista:**
> "`Data.define` é Struct que não muta. 3.2 nasceu. 3.3 tem `with` pra copiar mudando campo. Eu uso pra value object. Entidade com id continua classe."

---

## it no 3.4

**O que é:**
Parâmetro anônimo do block. Ruby 3.4. Lê melhor que `_1`. É o primeiro (e em geral o único) argumento.

**Como funciona:**
```ruby
users.map { it.email }
[1, 2, 3].map { it * 2 }   # [2, 4, 6]
```

Não mistura com `|user|`. Não tem `it2`. Dois args: nomeie ou `_1` / `_2`. App em 3.1–3.3: `_1`. Falar `it` sem olhar o `.ruby-version` é furada.

**Na entrevista:**
> "`it` é 3.4. Mesma ideia do `_1`, só o primeiro arg. Sem 3.4 na produção eu não uso."

---

## RBS e Sorbet

**O que é:**
Types opcionais. MRI não exige e não recusa. RBS é o formato oficial (3.0): assinatura em arquivo `.rbs`. Sorbet é o checker da Stripe, annotation no próprio Ruby.

**Como funciona:**
```rbs
# user.rbs — RBS, arquivo ao lado
class User
  def initialize: (name: String, email: String) -> void
  def admin?: () -> bool
end
```

```ruby
# Sorbet — no código
sig { params(name: String).returns(String) }
def greet(name)
  "Olá, #{name}!"
end
```

RBS + Steep no oficial. Sorbet em codebase que já nasceu com ele. Gradual: tipa o que dói. App Rails média sem dor de tipo não começa por aqui.

**Na entrevista:**
> "Ruby 3 tem RBS oficial; Sorbet é o outro time. Nenhum dos dois é runtime do MRI. Types são ferramenta, não requisito da linguagem."

---

## Fiber scheduler

**O que é:**
Gancho do 3.0. Com um scheduler registrado, `sleep`, `read`, `write` e wait de IO **cedem** a Fiber em vez de bloquear a thread. Não é thread. Não é Ractor. Detalhe de Fiber/Ractor fica no 3.6.

**Como funciona:**
```ruby
require "async"

# duas IOs “ao mesmo tempo” numa thread — ~1s, não ~2s
Async do
  Async { sleep 1 }
  Async { sleep 1 }
end
```

Quem implementa é gem (`async`, Falcon). MRI só define `Fiber.set_scheduler`. Sem scheduler, IO continua bloqueante. Muita conexão IO na mesma thread: sim. Sidekiq, CPU, request AR: não.

**Na entrevista:**
> "Fiber scheduler do 3.0 deixa IO não-bloquear a thread. A gem `async` implementa. Não substitui Sidekiq e não é thread. Sem scheduler, Fiber não fica mágica."

---

## YJIT

**O que é:**
O JIT do MRI (Shopify). 3.1 experimental (`--yjit`). 3.2 pronto pra produção. 3.3 liga por padrão em x86-64 e ARM64.

**Como funciona:**
```bash
# 3.1 / 3.2, ou 3.3 se alguém desligou
RUBY_YJIT_ENABLE=1 bin/rails server
# ou
ruby --yjit -v
```

Compila bytecode quente. Rails típica sobe ordem de 15–25% de throughput. Não muda seu código. Não é MJIT. 3.3: confira `RubyVM::YJIT.enabled?`. Plataforma sem suporte: não liga sozinho.

**Na entrevista:**
> "YJIT é o JIT do CRuby. 3.2 estável, 3.3 default. Eu ligo com `RUBY_YJIT_ENABLE=1`. Não reescrevo código pra ele."

---

## Rails 7.1+ assume 3.1+

**O que é:**
Rails 7.1 largou 2.7 e 3.0. Piso: Ruby 3.1. É o recorte deste handbook.

**Como funciona:**
| Rails | Ruby mínimo |
|---|---|
| 7.1 / 7.2 | 3.1 |
| 8.0 | 3.2 |

3.1 já tem YJIT opt-in, `_1`, endless, pattern matching, `except`. `Data` pede 3.2. `it` pede 3.4. `Gemfile` e CI na mesma versão. Não prometa `it` em app 3.3.

**Na entrevista:**
> "Rails 7.1+ é Ruby 3.1+. Eu trato 3.1 como piso e cito 3.2/`Data`, 3.3/YJIT default, 3.4/`it` se a versão chegar lá."

---

## Recapitulando

- Rails 7.1+ = Ruby 3.1+. 3.0 quebrou Hash-como-keyword: use `**`.
- `_1` / `_2` no block curto. Não mistura com `|n|`.
- Endless method: uma expressão. Senão, `end`.
- `case`/`in` casa estrutura e liga variável. `^` é pin.
- `except` é 3.0 (antes era Rails). `compact` tira `nil`. `compact_blank` é ActiveSupport.
- 3.0 **não** congelou literal por padrão. Default = magic comment. Ractor pede shareable.
- `Data.define` (3.2) é value imutável. `with` no 3.3.
- `it` é 3.4, só o primeiro arg.
- RBS oficial, Sorbet na rua. MRI não type-checka.
- Fiber scheduler: IO não-bloqueante. Gem implementa. Não é Sidekiq.
- YJIT: JIT do MRI. 3.3 default nas plataformas suportadas.

---

## Exercícios práticos

### Exercício 1: `_1` ou nome?

**Enunciado:** Reescreva com numbered parameters. Depois diga em uma frase se você deixaria assim no review, e por quê.

```ruby
users.select { |user| user.active? }.map { |user| user.email }
points.map { |x, y| x + y }
```

<details>
<summary>Solução</summary>

```ruby
users.select(&:active?).map(&:email)
users.select { _1.active? && _1.confirmed? }.map(&:email)  # quando tem corpo
points.map { _1 + _2 }
```

O primeiro nem precisa de `_1`: `&:metodo` é o idioma. `points` com `_1 + _2` passa; se a dupla tiver nome (`lat`, `lng`), nomeie.

**Pontos-chave:**
- `&:metodo` ainda ganha do `_1.metodo`
- `_2` ok em par anônimo; três args, nomeie
- Não misturar `_1` com `|user|`
</details>

### Exercício 2: casar o payload

**Enunciado:** Escreva um `case`/`in` que, dado o Hash abaixo, devolva o texto de exibição. Pago: `"R$ 19.90"`. Pendente: `"aguardando"`. Outro status: `"status desconhecido: recusado"`. Use bind, não `payload[:cents]`.

```ruby
pago     = { status: "pago", cents: 1990 }
pendente = { status: "pendente" }
outro    = { status: "recusado" }
```

<details>
<summary>Solução</summary>

```ruby
def rotulo(payload)
  case payload
  in { status: "pago", cents: }
    format("R$ %.2f", cents / 100.0)
  in { status: "pendente" }
    "aguardando"
  in { status: }
    "status desconhecido: #{status}"
  end
end
```

`cents:` liga `cents`. O ramo `status:` pega o resto sem `else` + `[]`.

**Pontos-chave:**
- `in` casa estrutura, não `===` de classe
- Bind no padrão, não `fetch` depois
- Ramo aberto no `status:` cobre o desconhecido
</details>

### Exercício 3: limpar attrs e cravar valor

**Enunciado:** Duas partes.

1. De `{ name: "João", password: "x", role: nil }` saia `{ name: "João" }` só com métodos de Hash do core.
2. Modele dinheiro em centavos + moeda com `Data`. Mostre que mudar o valor cria **outra** instância. Qual versão mínima?

<details>
<summary>Solução</summary>

```ruby
attrs = { name: "João", password: "x", role: nil }
attrs.except(:password).compact
# { name: "João" }

Money = Data.define(:cents, :currency)
preco = Money.new(1990, "BRL")
novo  = preco.with(cents: 2490)  # 3.3+

preco.cents  # 1990
novo.cents   # 2490
preco.equal?(novo)  # false
```

Sem 3.3, `Money.new(2490, preco.currency)` copia. `Data` é 3.2; `except` é 3.0 (Rails 7.1 no 3.1 já tem).

**Pontos-chave:**
- `except` + `compact` = tira chave e tira nil
- `Data` não tem setter; `with` copia
- Cite a versão junto da feature
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
