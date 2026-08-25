# 1.7 Strings, symbols e regex

> **TL;DR**
> Aspas duplas interpolam; simples não. Heredoc `<<~` para bloco. `# frozen_string_literal: true` congela literal do arquivo. UTF-8: `size` é caractere, `bytesize` é byte. Symbol é identidade — converta na borda, não o input cru. Regex `/ /`; `=~` devolve índice ou `nil`; o match mora em `MatchData`. Named capture vira chave. `gsub` substitui. Slug no Rails: `parameterize`.

## Conteúdo

- [Interpolação vs aspas simples](#interpolação-vs-aspas-simples)
- [Heredoc](#heredoc)
- [Frozen string literal](#frozen-string-literal)
- [Encoding UTF-8](#encoding-utf-8)
- [Symbol: recap e conversão](#symbol-recap-e-conversão)
- [Regex](#regex)
- [MatchData](#matchdata)
- [Named captures](#named-captures)
- [gsub](#gsub)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Interpolação vs aspas simples

**O que é:**
Duas formas de escrever string. A diferença que cai: quem avalia `#{ }` e quem trata isso como texto.

**Como funciona:**
```ruby
nome = "João"

"Olá, #{nome}!"     # "Olá, João!"
'Olá, #{nome}!'     # "Olá, #{nome}!"

"2 + 2 = #{2 + 2}"  # "2 + 2 = 4"
"linha\nseguinte"   # quebra de verdade
'linha\nseguinte'   # as letras \ e n

%Q(Olá, #{nome}!)   # interpola — outro delimitador
%q(Olá, #{nome}!)   # não interpola
```

Simples só escapam `\\` e `\'`. Duplas interpolam e honram `\n`, `\t`, `\"`.

**Quando usar:**
Texto fixo (`'joao@email.com'`, path) → simples. Entra valor → duplas.

**Na entrevista:**
> "Duplas interpolam e interpretam escape. Simples não. Eu escolho pela regra, não pelo gosto."

---

## Heredoc

**O que é:**
String de várias linhas. O delimitador você escolhe: `SQL`, `HTML`, `TEXT`.

**Como funciona:**
```ruby
mail_body = <<~TEXT
  Olá, #{user.name}!

  Seu pedido ##{order.id} saiu para entrega.
TEXT

# <<- mantém o espaço da esquerda
# <<~'TEXT' — aspas no identificador = sem interpolação
aviso = <<~'TEXT'
  Olá, #{nome}!
  Isso não interpola.
TEXT
```

O fecha fica sozinho na linha. `<<~` (squiggly) tira a indentação comum — é o que o Rails usa.

**Quando usar:**
E-mail, SQL longo, fixture de texto. Uma linha? Aspas bastam. Dado de usuário no SQL não vai interpolado: bind é outra história.

**Na entrevista:**
> "`<<~` tira indentação. Identificador entre aspas vira aspas simples: não interpola."

---

## Frozen string literal

**O que é:**
Comentário mágico no topo. Todo literal `"..."` daquele arquivo nasce frozen. Mutar levanta `FrozenError`.

**Como funciona:**
```ruby
# frozen_string_literal: true

nome = "João"
nome.upcase!        # FrozenError
nome << " Silva"    # FrozenError

nome = +"João"      # cópia mutável
nome = "João".dup   # idem
nome << " Silva"    # "João Silva"
```

Vale só para literal. `gets`, `to_s`, concatenação em runtime não congelam sozinhos. O comentário é por arquivo.

**Quando usar:**
Arquivo novo, coloque. Geradores do Rails já botam. Pega mutação acidental cedo.

**Na entrevista:**
> "`# frozen_string_literal: true` congela o literal daquele arquivo. Pra mutar: `+\"texto\"` ou `.dup`. Não é `freeze` em toda String do processo."

---

## Encoding UTF-8

**O que é:**
Ruby 3 assume UTF-8. `"João"` tem 4 caracteres e 5 bytes: `ã` ocupa dois.

**Como funciona:**
```ruby
nome = "João"
nome.encoding       # #<Encoding:UTF-8>
nome.size           # 4
nome.length         # 4 — alias
nome.bytesize       # 5

# encode converte; force_encoding só troca a etiqueta
bytes = nome.encode("ISO-8859-1")
bytes.force_encoding("UTF-8")  # mentira: os bytes não são UTF-8
bytes.valid_encoding?          # false

nome.upcase         # "JOÃO" — Unicode, não só A–Z
```

`size` conta caractere do encoding. `bytesize` conta byte. Quem veio de PHP lembra `strlen` vs `mb_strlen` — aqui a API padrão já é de caractere.

**Quando usar:**
Nome, e-mail, texto de usuário. IO com encoding errado: `encode`. Não `force_encoding` no escuro.

**Na entrevista:**
> "`size` é caractere, `bytesize` é byte. `\"João\".size` é 4. Default é UTF-8. `force_encoding` não converte — só muda o rótulo."

---

## Symbol: recap e conversão

**O que é:**
Identificador interned. Tipos já cobriu o “por quê”. Aqui é a borda: quando vira string, quando vira symbol.

**Como funciona:**
```ruby
:pending.to_s           # "pending"
"pending".to_sym        # :pending
"pending".intern        # igual

:pending == "pending"   # false — nunca são iguais

user = { name: "João", email: "joao@email.com" }
user[:email]

payload = { "email" => "joao@email.com" }
payload[:email]         # nil
payload["email"]        # "joao@email.com"
```

**Quando usar:**
Symbol na chave que *você* escreveu, nome de método, estado (`:paid`). String no texto: e-mail, slug, o que o usuário digitou.

Não faça `params[:status].to_sym` em valor aberto. Ruby 2.2+ coleta symbol dinâmico; a lista de estados válidos ainda é sua.

**Exemplo prático:**
```ruby
ALLOWED = %w[pending paid canceled].freeze

def parse_status(raw)
  return unless ALLOWED.include?(raw)
  raw.to_sym
end

parse_status("paid")       # :paid
parse_status("drop_table") # nil
```

**Na entrevista:**
> "Symbol é identidade, String é conteúdo. Converto na borda, com whitelist. `to_sym` em input cru é cheiro. Params finge os dois na *chave* — o *valor* continua string."

---

## Regex

**O que é:**
Padrão entre `/ /` (ou `%r{}` quando tem barra no meio). Objeto `Regexp`.

**Como funciona:**
```ruby
/\d+/
%r{https?://\S+}

/joão/i     # ignore case
/linha.+/m  # ponto atravessa \n
```

Classes que você usa: `\d` `\w` `\s`, `[a-z]`. Âncoras `\A` `\z` (string inteira) vs `^` `$` (linha). Em Ruby `^` e `$` são de linha — para validar o valor todo, `\A` e `\z`.

**Quando usar:**
Extrair, validar formato simples, substituir. E-mail de verdade? Validação do Rails. CPF? Algoritmo, não regex heróica.

**Na entrevista:**
> "Regex é `/padrão/`. Flag `i` é a que mais aparece. Âncora de string: `\\A` e `\\z`, não `^` e `$`."

---

## MatchData

**O que é:**
`=~` pergunta “onde casou?”. Devolve índice ou `nil`. O detalhe fica num `MatchData`: `$~`, ou o retorno de `.match`.

**Como funciona:**
```ruby
email = "joao@email.com"

email =~ /@/            # 4
/@/ =~ email            # 4 — os dois lados aceitam
email =~ /#/            # nil

$~                      # #<MatchData "@">

m = /(\w+)@(\w+\.\w+)/.match(email)
m[0]                    # "joao@email.com"
m[1]                    # "joao"
$1                      # "joao" — mesmo match

email.match?(/@/)       # true — não preenche $~
```

`=~` é truthy no índice `0`. Por isso `if email =~ /@/` funciona mesmo casando no começo. `match?` não mexe em `$~`.

**Quando usar:**
`match?` para boolean. `.match` quando vai ler grupo. `=~` quando o índice importa. `$1` três linhas abaixo some no próximo match.

**Na entrevista:**
> "`=~` devolve índice ou nil, não true/false. O match fica no MatchData. `$1` é o primeiro grupo do último match. Pra if eu prefiro `match?`."

---

## Named captures

**O que é:**
Grupo com nome. Você lê `m[:local]` em vez de `m[1]`.

**Como funciona:**
```ruby
pattern = /\A(?<local>[^@]+)@(?<domain>[^@]+)\z/
m = pattern.match("joao@email.com")

m[:local]     # "joao"
m[:domain]    # "email.com"

# atalho: locais só se o regexp for literal à esquerda de =~
if /\A(?<local>[^@]+)@(?<domain>[^@]+)\z/ =~ email
  local       # "joao"
end
```

Regex em variável não cria local. Em app, prefira o `MatchData` nomeado.

**Quando usar:**
Dois grupos ou mais. `m[3]` em entrevista é convite pra erro.

**Na entrevista:**
> "Named capture: `(?<year>\\d{4})`. Eu leio `m[:year]`. Grupo numerado fica pra uma captura só."

---

## gsub

**O que é:**
Substitui toda ocorrência. `sub` substitui a primeira. Bang muta (e respeita frozen).

**Como funciona:**
```ruby
"João João".sub("João", "Maria")    # "Maria João"
"João João".gsub("João", "Maria")   # "Maria Maria"

"preco 12".gsub(/\d+/) { |n| n.to_i * 100 }  # "preco 1200"

"joao@email.com".gsub(/(?<local>[^@]+)@(?<dom>.+)/, '\k<dom>')
# "email.com"
```

O bloco recebe o pedaço casado. Backref `'\1'` / `'\k<nome>'` vai em aspas simples — em duplas o `\` some.

**Quando usar:**
Normalizar espaço, mascarar, trocar token. Slug no Rails não é `gsub` na mão: `parameterize` tira acento e põe hífen (`"Olá, João!".parameterize` → `"ola-joao"`). Mencione e siga.

**Na entrevista:**
> "`sub` é a primeira, `gsub` é todas. Block quando a reposição calcula. Slug: `parameterize`, não regex de acento."

---

## Recapitulando

- Duplas interpolam; simples não. `<<~` tira indentação do heredoc.
- `# frozen_string_literal: true` congela literal do arquivo. `+"x"` ou `.dup` pra mutar.
- UTF-8. `size` ≠ `bytesize`. `force_encoding` não converte.
- Symbol na identidade; String no conteúdo. `to_sym` só com whitelist.
- `/padrão/`, `=~` → índice ou `nil`, detalhe no `MatchData`. Named capture em vez de `m[2]`.
- `gsub` substitui tudo. `match?` para boolean. Slug: `parameterize`.

---

## Exercícios práticos

### Exercício 1: Aspas e frozen

**Enunciado:** Com o comentário no topo, o que cada linha faz?

```ruby
# frozen_string_literal: true

nome = "João"
puts 'Olá, #{nome}!'
puts "Olá, #{nome}!"
nome << " Silva"
```

<details>
<summary>Solução</summary>

A primeira imprime `Olá, #{nome}!` — simples não interpola.

A segunda imprime `Olá, João!`.

A terceira levanta `FrozenError`: o literal `"João"` nasceu frozen.

```ruby
nome = +"João"
nome << " Silva"  # "João Silva"
```

**Pontos-chave:**
- Interpolação é das aspas, não do `#{}` em si
- Frozen vale pro literal daquele arquivo
- Mutação pede cópia (`+` / `dup`)
</details>

### Exercício 2: `to_sym` na borda

**Enunciado:** O client manda `status=paid`. Por que `params[:status].to_sym` é cheiro? Como você converteria?

<details>
<summary>Solução</summary>

A *chave* `:status` o Rails resolve. O *valor* `"paid"` é string aberta. `to_sym` em qualquer texto cria symbol com dado de fora.

```ruby
ALLOWED = %w[pending paid canceled].to_h { |s| [s, s.to_sym] }.freeze

def status_from(params)
  ALLOWED[params[:status]]
end

status_from({ status: "paid" })        # :paid
status_from({ status: "drop_table" })  # nil
```

Pode comparar string o caminho todo. Symbol só entra se a API interna exige.

**Pontos-chave:**
- Chave de params ≠ valor de params
- Whitelist antes de `to_sym`
- Ruby moderno coleta symbol dinâmico — o cheiro continua
</details>

### Exercício 3: Named capture e gsub

**Enunciado:** De `"João <joao@email.com>"`, extraia nome e e-mail com named captures. Depois mascare o local: `j***@email.com`.

<details>
<summary>Solução</summary>

```ruby
raw = "João <joao@email.com>"
m = /\A(?<name>.+?)\s+<(?<email>(?<local>[^@]+)@(?<domain>[^@]+))>\z/.match(raw)

m[:name]    # "João"
m[:email]   # "joao@email.com"
m[:local]   # "joao"
m[:domain]  # "email.com"

masked = "#{m[:local][0]}***@#{m[:domain]}"
# "j***@email.com"
```

**Pontos-chave:**
- Nome no grupo > `m[1]`, `m[2]`
- `gsub` com backref quando a troca é no lugar
- `parameterize` não entra aqui — isso não é slug
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
