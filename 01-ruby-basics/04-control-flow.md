# 1.4 Controle de fluxo

> **TL;DR**
> `if` / `elsif` / `else` e `unless`. Forma modificadora (`return if`) para guard clause. `case`/`when` usa `===`, não `==`. `while` / `until` / `loop do`. Iteração idiomática: `times` e `each`; `for` é raro e vaza variável. `break` / `next` / `redo`. Só `false` e `nil` são falsy. `if user&.admin?` combina safe navigation com o `if`. `begin`/`end` para fluxo quase não se usa.

## Conteúdo

- [if, elsif, else e unless](#if-elsif-else-e-unless)
- [Forma modificadora](#forma-modificadora)
- [case e when](#case-e-when)
- [while, until e loop](#while-until-e-loop)
- [times, each vs for](#times-each-vs-for)
- [break, next, redo](#break-next-redo)
- [begin/end](#beginend)
- [Truthiness e safe navigation](#truthiness-e-safe-navigation)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## if, elsif, else e unless

**O que é:**
Desvio condicional. O `if` é expressão: devolve o último valor do ramo que rodou. A grafia é `elsif`, sem o segundo `e`. `unless` é o `if` invertido — entra quando a condição é falsy.

**Como funciona:**
```ruby
role = if user.admin?
  :admin
elsif user.moderator?
  :moderator
else
  :user
end

unless user.banned?
  grant_access!(user)
end
```

**Quando usar:**
Dois ou três ramos → `if`. Valores discretos demais → `case`. Uma negativa só, sem `else` → `unless`. `unless` + `else` ninguém lê — vira `if`.

**Na entrevista:**
> "É `elsif`, não `elseif`. O `if` devolve valor. `unless` só com um ramo; se aparece `else`, eu troco para `if`."

---

## Forma modificadora

**O que é:**
`if` / `unless` no fim da linha. Idioma de guard clause. Sem `elsif`, sem `else`.

**Como funciona:**
```ruby
return if user.nil?
return unless user.active?
redirect_to login_path unless current_user
next if item.blank?
```

**Quando usar:**
Saída cedo. Uma ação, uma condição. Linha longa ou `&&` / `||` demais → vira `if` em bloco.

**Exemplo prático:**
```ruby
def charge!(user, amount_centavos)
  return if amount_centavos <= 0
  return unless user.billable?

  Payment.create!(user:, amount_centavos:)
end
```

**Na entrevista:**
> "Guard clause no topo. `return if` deixa o caminho feliz sem indentar o método inteiro."

---

## case e when

**O que é:**
Escolha por valor ou por tipo. O `when` não chama `==`. Chama `===` no objeto do `when`, com o valor do `case` à direita.

**Como funciona:**
```ruby
case status
when :paid, :refunded then "já passou pelo caixa"
when :pending         then "espera"
else                       "desconhecido"
end

(1..10) === 7              # true — Range
Integer === 7              # true — classe
/joão/i === "João"         # true — Regexp
->(n) { n.even? } === 4    # true — Proc

case value
when Integer then value * 2
when String  then value.to_i
when Range   then value.begin
else 0
end

# case sem valor = if/elsif mais limpo
case
when user.admin? then :admin
when user.moderator? then :moderator
else :user
end
```

**Quando usar:**
Status, tipo, faixa, vários literais no mesmo ramo. Dois ramos simples ficam no `if`.

**Na entrevista:**
> "`case`/`when` usa `===`. Range, classe e regex entram de graça. Se eu comparar com `==` na cabeça, erro a pergunta."

---

## while, until e loop

**O que é:**
Repetição por condição. `while` enquanto truthy. `until` enquanto falsy. `loop do` é infinito até o `break`.

**Como funciona:**
```ruby
n = 3
while n > 0
  n -= 1
end

n = 0
until n == 3
  n += 1
end

loop do
  item = queue.pop
  break if item.nil?
  process(item)
end
```

**Quando usar:**
Não tem coleção pronta — retry, drain de fila, ler até EOF. Array, Hash ou Relation → `each`. `loop do` em app web é raro; aparece em worker e script.

**Na entrevista:**
> "`while`/`until` quando a parada é condição, não coleção. `loop do` + `break` quando eu não quero testar no topo."

---

## times, each vs for

**O que é:**
Três jeitos de repetir. Em Rails restam dois: `times` e `each`. `for` existe e quase ninguém usa.

**Como funciona:**
```ruby
5.times { |i| puts i }           # 0 até 4
users.each { |user| notify(user) }

for user in users                # mesmo efeito aparente
  notify(user)
end
```

A diferença que cai em entrevista: `for` **não cria escopo novo**. A variável vaza.

```ruby
users = ["Ana", "Bia"]

users.each { |name| }
defined?(name)   # nil

for name in users
end
name             # "Bia" — vazou
```

**Quando usar:**
`Integer#times` para N fixo. `each` para coleção. `for` só se o entrevistador perguntar por que você não usa.

**Na entrevista:**
> "`for` vaza variável. Eu uso `each`. Em Rails você quase não vê `for` em production."

---

## break, next, redo

**O que é:**
Controle fino da iteração. `break` sai. `next` vai para o próximo (o `continue` de outras linguagens). `redo` repete a **mesma** volta, sem avançar.

**Como funciona:**
```ruby
result = [1, 2, 3].each { |n| break n if n.even? }
# 2

[1, nil, 3].map { |n| next 0 if n.nil?; n * 2 }
# [2, 0, 6]

# redo — rara: reprocessa o mesmo elemento. Errar a condição trava.
```

**Quando usar:**
`next` para pular item. `break` para achar o primeiro e sair. `redo` quase nunca — e fácil virar loop infinito.

**Na entrevista:**
> "`next` é continue. `break` pode devolver valor do bloco. `redo` existe, é raro, e se eu errar a condição trava."

---

## begin/end

**O que é:**
Bloco genérico. Para fluxo, quase não se usa. O `begin` que você vai ver de verdade é o de `rescue` — outro capítulo.

**Como funciona:**
```ruby
# do-while antigo — roda pelo menos uma vez. Relíquia.
n = 0
begin
  n += 1
end while n < 3

# hoje: loop + break. Sem begin em volta de if — Ruby não é Pascal.
```

**Quando usar:**
Fluxo: quase nunca. Exceção (`begin`/`rescue`/`ensure`): quando o `def` inteiro não é o `rescue` — aí o próprio `def` já serve de `begin`.

**Na entrevista:**
> "`begin`/`end` para controlar loop é relíquia. Eu uso `loop` + `break`. `begin` eu reservo para `rescue`."

---

## Truthiness e safe navigation

**O que é:**
Recap do 1.1, agora no `if`. Só `false` e `nil` são falsy. `0`, `""`, `[]`, `{}` passam. `&.` devolve `nil` se o receptor for `nil` — e `nil` não entra no `if`.

**Como funciona:**
```ruby
if 0       # entra
if ""      # entra
if []      # entra
if false   # não entra
if nil     # não entra

# user nil → nil&.admin? é nil → não entra
if user&.admin?
  open_panel
end

# equivalente
if user && user.admin?
  open_panel
end
```

`&.` só protege o receptor. Método que devolve `false` continua `false`.

**Quando usar:**
`if user&.admin?` onde o objeto pode não existir. Não escreva `== true`: é ruído e quebra duck typing.

**Exemplo prático:**
```ruby
def approve!(order, user)
  return unless user&.admin?
  return if order.blank?

  order.update!(status: :approved, approved_by: user)
end
```

**Na entrevista:**
> "Só `false` e `nil` são falsy. `if user&.admin?`: sem user, `nil`; user comum, `false`; admin, entra. Quem veio de PHP espera que `0` e `''` parem o `if`. Aqui não param."

---

## Recapitulando

- `if` é expressão. A grafia é `elsif`.
- `unless` só com um ramo. Com `else`, vira `if`.
- `return if` / `return unless` são guard clause.
- `case`/`when` chama `===` (Range, classe, Regexp, Proc).
- `while` / `until` / `loop do` para condição; coleção é `each`.
- `for` vaza variável. Em Rails você usa `each` e `times`.
- `break` e `next` devolvem valor. `redo` é raro.
- `begin`/`end` para fluxo é relíquia; `rescue` é outro assunto.
- Só `false` e `nil` são falsy. `if user&.admin?` combina os dois fatos.

---

## Exercícios práticos

### Exercício 1: O que o `when` compara?

**Enunciado:** O que imprime o código? Por quê? Reescreva o `case` usando `===` na mão.

```ruby
value = 7
result = case value
when 1..5    then "baixo"
when 6..10   then "médio"
when Integer then "outro inteiro"
else "resto"
end
puts result
```

<details>
<summary>Solução</summary>

Imprime `médio`. `when 6..10` vira `(6..10) === 7`. O `when Integer` nem roda.

```ruby
if (1..5) === value
  "baixo"
elsif (6..10) === value
  "médio"
elsif Integer === value
  "outro inteiro"
else
  "resto"
end
```

**Pontos-chave:**
- `when` usa `===`, não `==`
- A ordem dos `when` importa
</details>

### Exercício 2: Por que não usar `for`?

**Enunciado:** Mostre um caso em que `for` e `each` não se comportam igual depois do loop.

<details>
<summary>Solução</summary>

`each` cria bloco: a variável morre no `end`. `for` reusa o escopo de fora.

```ruby
names = ["Ana", "Bia"]

names.each { |name| }
defined?(name)  # nil

for name in names
end
name            # "Bia" — vazou

name = "backup"
for name in names
end
name            # "Bia" — sobrescreveu
```

**Pontos-chave:**
- O vazamento é motivo técnico, não só estilo
- Em entrevista, fale `each` e cite o escopo
</details>

### Exercício 3: `if user&.admin?`

**Enunciado:** Para cada valor de `user`, o corpo do `if` roda?

```ruby
if user&.admin?
  :ok
end
```

1. `user` é `nil`
2. existe e `admin?` devolve `false`
3. existe e `admin?` devolve `true`
4. existe e `admin?` devolve `nil`

<details>
<summary>Solução</summary>

1. Não — `nil&.admin?` é `nil`.
2. Não — `false` é falsy.
3. Sim — `true` é truthy.
4. Não — `nil` é falsy; “sem resposta” se comporta como não-admin.

**Pontos-chave:**
- Só `false` e `nil` param o `if`
- `&.` não transforma `false` em outra coisa
- Não compare com `== true`
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
