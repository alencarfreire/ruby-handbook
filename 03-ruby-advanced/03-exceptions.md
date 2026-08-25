# 3.3 Exceções

> **TL;DR**
> `begin` / `rescue` / `else` / `ensure`. `raise` lança; sem argumento relança a atual. `rescue` sem classe pega `StandardError`, não `Exception`. Não resgate `Exception`: você engole `Ctrl-C` e `exit`. Erro seu herda `StandardError`. `$!.message` e `error.backtrace`. No Rails, `rescue_from` no controller — teaser; o resto fica no capítulo de controllers.

## Conteúdo

- [begin, rescue, else e ensure](#begin-rescue-else-e-ensure)
- [raise](#raise)
- [StandardError vs Exception](#standarderror-vs-exception)
- [Exceções customizadas](#exceções-customizadas)
- [$! e backtrace](#-e-backtrace)
- [rescue_from no Rails](#rescue_from-no-rails)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## begin, rescue, else e ensure

**O que é:**
Fluxo de erro. Você tenta, resgata o que espera, limpa no `ensure`. `else` roda só se ninguém levantou exceção. Não é o `begin`/`end` de agrupamento do capítulo 1.4 — aqui o `begin` existe por causa do `rescue`.

**Como funciona:**
```ruby
begin
  charge!(user, amount_centavos)
rescue InsufficientFundsError => e
  notify_broke(user, e)
else
  send_receipt(user)
ensure
  release_lock!(user)
end
```

Ordem: corpo → (`rescue` se deu erro, `else` se não deu) → `ensure` sempre. Vários `rescue`, o mais específico em cima.

```ruby
begin
  User.find(params[:id])
rescue ActiveRecord::RecordNotFound
  nil
rescue ActiveRecord::StatementInvalid
  raise
end
```

Num método você dispensa o `begin`. `rescue` e `ensure` grudam no `def`:

```ruby
def charge!(user, amount_centavos)
  Payment.create!(user:, amount_centavos:)
rescue ActiveRecord::RecordInvalid
  raise ChargeFailed, "pagamento recusado"
ensure
  audit!(user)
end
```

`retry` volta ao começo do `begin`. Sem contador vira loop. Forma modificadora (`value = parse(raw) rescue nil`) esconde o tipo — use quando `nil` é mesmo o plano B.

**Quando usar:**
Fronteira: HTTP, disco, gateway, parse. Não no meio do model para fluxo feliz. Validação de input é `if` / `raise` cedo, não `rescue` de `NoMethodError`.

**Na entrevista:**
> "`ensure` roda sempre, até com `return` no `rescue`. `else` não é o `else` do `if` — só entra se o `begin` passou limpo. No método eu pulo o `begin`."

---

## raise

**O que é:**
Lança a exceção. `fail` é alias; na prosa da entrevista ninguém usa `fail`. Sem argumento, relança a que está no ar — o `rescue` não some com ela, só olha e devolve.

**Como funciona:**
```ruby
raise "saldo insuficiente"                    # RuntimeError
raise ArgumentError, "amount_centavos <= 0"

begin
  gateway.charge!(amount_centavos)
rescue GatewayTimeout => e
  logger.warn(e.message)
  raise                                    # relança o mesmo GatewayTimeout
end
```

**Quando usar:**
Contrato quebrado (`ArgumentError`), regra de negócio que o caller tem que ver (`InsufficientFundsError`), relançar depois de logar. Não use `raise` no lugar de `return`.

**Exemplo prático:**
```ruby
def charge!(user, amount_centavos)
  raise ArgumentError, "amount_centavos deve ser positivo" if amount_centavos <= 0
  raise InsufficientFundsError if user.balance_centavos < amount_centavos

  user.balance_centavos -= amount_centavos
  Payment.create!(user:, amount_centavos:)
end
```

**Na entrevista:**
> "`raise 'texto'` é `RuntimeError`. Eu relanço com `raise` nu depois de logar. `fail` é a mesma coisa — eu falo `raise`."

---

## StandardError vs Exception

**O que é:**
`Exception` é a raiz. `StandardError` é o galho das falhas da sua app. `rescue` sem classe resgata `StandardError` e filhos. Não resgata `Interrupt`, `SystemExit`, `NoMemoryError`, `SignalException`, `ScriptError` (`LoadError`, `SyntaxError`, `NotImplementedError`).

**Como funciona:**
```ruby
Exception
├── ScriptError          # LoadError, SyntaxError…
├── SignalException      # Interrupt = Ctrl-C
├── SystemExit           # exit / abort
├── NoMemoryError
└── StandardError        # o que o rescue pelado pega
    ├── ArgumentError
    ├── RuntimeError     # raise "texto"
    ├── NoMethodError
    └── ZeroDivisionError
```

```ruby
# RUIM — o processo não morre, Ctrl-C some, exit não sai
begin
  exit
rescue Exception
  puts "engoliu o SystemExit"
end

# BOM — falha da app
begin
  JSON.parse(payload)
rescue JSON::ParserError => e
  logger.error(e.message)
end
```

`rescue => e` é `rescue StandardError => e`. `rescue Exception` só em framework, e mesmo assim você relança o que não é seu.

**Quando usar:**
Resgate a classe concreta. `StandardError` quando a borda é genérica (job, middleware). `Exception` quase nunca.

**Na entrevista:**
> "Eu não faço `rescue Exception`. Isso come `Ctrl-C` e `SystemExit`. O `rescue` vazio já pega `StandardError`. Erro meu herda `StandardError`, não `Exception`."

---

## Exceções customizadas

**O que é:**
Classe sua, filha de `StandardError`. Nome termina em `Error`. O caller resgata o tipo, não a string da mensagem.

**Como funciona:**
```ruby
class InsufficientFundsError < StandardError
  attr_reader :available_centavos, :requested_centavos

  def initialize(available_centavos:, requested_centavos:)
    @available_centavos = available_centavos
    @requested_centavos = requested_centavos
    super("Saldo insuficiente")
  end
end

raise InsufficientFundsError.new(available_centavos: 500, requested_centavos: 1990)
```

Vazia também vale: `class ChargeFailed < StandardError; end`. Dado extra só quando o `rescue` vai ler. Namespace no domínio: `Payments::InsufficientFundsError`. Não herde `Exception` — o `rescue` pelado não pega.

**Quando usar:**
Falha que o caller trata diferente (saldo, estoque, gateway fora). Um tipo por decisão. Dez subclasses iguais e um `case` na mensagem é cheiro.

**Exemplo prático:**
```ruby
module Payments
  class Error < StandardError; end
  class InsufficientFundsError < Error; end
  class GatewayTimeout < Error; end
end

def charge!(user, amount_centavos)
  raise Payments::InsufficientFundsError if user.balance_centavos < amount_centavos
  gateway.charge!(amount_centavos)
rescue Net::OpenTimeout
  raise Payments::GatewayTimeout, "adquirente não respondeu"
end
```

**Na entrevista:**
> "Custom herda `StandardError`. Se herdar `Exception`, o `rescue` pelado não pega — e o bug some em produção sem log."

---

## $! e backtrace

**O que é:**
`$!` é a exceção atual (`nil` fora do `rescue`). `$@` é o array de strings do stack. Os dois são globais de thread. No código novo você usa a variável do `rescue` e `error.backtrace`.

**Como funciona:**
```ruby
begin
  1 / 0
rescue ZeroDivisionError => error
  $!.equal?(error)          # true
  $!.message                # "divided by 0"
  error.backtrace.first     # "app/services/charge.rb:12:in `charge!'"
  error.backtrace_locations # arquivo, linha, label
  error.cause               # exceção anterior, se houve
end

$!  # nil — já saiu do rescue
```

`full_message` junta classe, mensagem e stack — bom no log. Não imprima `$@` na response HTTP. `require "english"` libera `$ERROR_INFO` (`$!`); pouca gente exige isso.

**Quando usar:**
`rescue => error` no código. `$!` em one-liner ou no `ensure` quando você quer saber se houve erro (`if $!`).

**Na entrevista:**
> "`$!` é a atual, `$@` o backtrace. Eu resgato em variável. Relançar com `raise` nu mantém o stack."

---

## rescue_from no Rails

**O que é:**
Gancho do Action Controller. Você declara no controller (em geral `ApplicationController`) qual exceção vira qual resposta. Não substitui `rescue` no Service Object. Aqui é teaser: request, status e `exceptions_app` ficam na seção 5.

**Como funciona:**
```ruby
class ApplicationController < ActionController::Base
  rescue_from ActiveRecord::RecordNotFound, with: :not_found
  rescue_from Pundit::NotAuthorizedError, with: :forbidden

  private

  def not_found
    render file: Rails.public_path.join("404.html"), status: :not_found, layout: false
  end

  def forbidden
    redirect_to root_path, alert: "Sem permissão"
  end
end
```

Também aceita block. Filho herda o `rescue_from` do pai. Mais específico no controller da resource, genérico no `ApplicationController`.

**Quando usar:**
Erro que atravessa vários controllers (`RecordNotFound`, autorização). Erro de um caso de uso fica no service, com classe sua.

**Na entrevista:**
> "`rescue_from` é do controller. Eu não resgato `StandardError` ali — vira 200 mentiroso. `RecordNotFound` e policy, sim. O resto sobe e o Rails devolve 500."

---

## Recapitulando

- `begin` / `rescue` / `else` / `ensure`. No `def`, o `begin` é opcional.
- `ensure` sempre. `else` só se o corpo passou.
- `raise "texto"` → `RuntimeError`. `raise` nu relança.
- `rescue` pelado = `StandardError`. Não resgate `Exception`.
- Custom herda `StandardError`. Nome em `Error`.
- `$!` é a atual; `$@` o stack. Use `error.backtrace`.
- Rails: `rescue_from` no controller. Teaser. Sem `exceptions_app` aqui.

---

## Exercícios práticos

### Exercício 1: Por que não `rescue Exception`?

**Enunciado:** O que acontece neste script se alguém manda `Ctrl-C`? Reescreva para só tratar falha da app e ainda deixar o processo morrer no sinal.

```ruby
loop do
  JSON.parse(gets)
rescue Exception => e
  puts e.message
end
```

<details>
<summary>Solução</summary>

`Interrupt` (`Ctrl-C`) herda `Exception`, não `StandardError`. O `rescue Exception` engole o sinal e o loop continua. `SystemExit` também ficaria preso.

```ruby
loop do
  JSON.parse(gets)
rescue JSON::ParserError => e
  puts e.message
end
```

**Pontos-chave:**
- `rescue` pelado já pega `StandardError`
- `Exception` come `Interrupt` e `SystemExit`
- Resgate a classe concreta
</details>

### Exercício 2: Erro custom e `raise`

**Enunciado:** Escreva `Wallet#debit!(amount_centavos)` que recusa valor `<= 0` com `ArgumentError` e saldo baixo com `InsufficientFundsError` (incluindo os dois saldos). Mostre o `rescue` que só trata falta de saldo.

<details>
<summary>Solução</summary>

```ruby
class InsufficientFundsError < StandardError
  attr_reader :available_centavos, :requested_centavos

  def initialize(available_centavos:, requested_centavos:)
    @available_centavos = available_centavos
    @requested_centavos = requested_centavos
    super("Saldo insuficiente")
  end
end

class Wallet
  attr_reader :balance_centavos

  def initialize(balance_centavos)
    @balance_centavos = balance_centavos
  end

  def debit!(amount_centavos)
    raise ArgumentError, "amount_centavos deve ser positivo" if amount_centavos <= 0
    if balance_centavos < amount_centavos
      raise InsufficientFundsError.new(
        available_centavos: balance_centavos,
        requested_centavos: amount_centavos
      )
    end
    @balance_centavos -= amount_centavos
  end
end

begin
  Wallet.new(500).debit!(1990)
rescue InsufficientFundsError => e
  format("faltam %d centavos", e.requested_centavos - e.available_centavos)
end
```

**Pontos-chave:**
- `ArgumentError` para contrato; classe sua para regra de negócio
- Herda `StandardError`
- O `rescue` decide pelo tipo, não pelo texto
</details>

### Exercício 3: Ordem de `else`, `ensure` e `$!`

**Enunciado:** O que imprime cada bloco? Em qual deles `$!.nil?` é `false` dentro do `ensure`?

```ruby
# A
begin
  puts "corpo"
rescue StandardError
  puts "rescue"
else
  puts "else"
ensure
  puts "ensure"
end

# B
begin
  raise "boom"
rescue StandardError
  puts "rescue"
else
  puts "else"
ensure
  puts "ensure"
end
```

<details>
<summary>Solução</summary>

A imprime `corpo`, `else`, `ensure`. B imprime `rescue`, `ensure`. O `else` não roda se houve exceção.

No `ensure` do B, `$!` ainda aponta para o `RuntimeError`. No A, `$!.nil?` é `true`. Fora do `begin`, `$!` volta a `nil` nos dois.

**Pontos-chave:**
- `else` ≠ `ensure`
- `ensure` roda nos dois caminhos
- `$!` só vale enquanto a exceção está viva
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
