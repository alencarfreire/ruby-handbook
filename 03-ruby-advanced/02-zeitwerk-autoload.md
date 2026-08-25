# 3.2 Zeitwerk e autoload

> **TL;DR**
> Zeitwerk (autoload do Rails) mapeia caminho em constante: `users_controller.rb` → `UsersController`. Sem `require` em `app/`. Dev é lazy e recarrega. Produção faz eager load no boot. Classic autoload saiu no Rails 7. Inflector decide `api` → `Api` ou `API`. `bin/rails zeitwerk:check` quebra quando arquivo e constante não batem.

## Conteúdo

- [Caminho vira constante](#caminho-vira-constante)
- [Rails.autoloaders](#railsautoloaders)
- [Lazy vs eager](#lazy-vs-eager)
- [Classic autoload acabou](#classic-autoload-acabou)
- [Inflector](#inflector)
- [Quando zeitwerk:check falha](#quando-zeitwerkcheck-falha)
- [require vs autoload](#require-vs-autoload)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Caminho vira constante

**O que é:**
Zeitwerk não adivinha a classe. Ele lê o caminho relativo à raiz de autoload, inflete snake_case em CamelCase e espera essa constante no arquivo.

**Como funciona:**
```ruby
# app/models/user.rb              → User
# app/controllers/users_controller.rb → UsersController
# app/models/admin/user.rb        → Admin::User
# app/jobs/billing/invoice_job.rb → Billing::InvoiceJob
```

`app/models` é raiz. Por isso `user.rb` é `User`, não `Models::User`. Pasta vira namespace. Arquivo vira constante.

O arquivo **tem** que definir o que o caminho promete:

```ruby
# app/controllers/users_controller.rb
class UsersController < ApplicationController
end
# User.all no action → Zeitwerk carrega app/models/user.rb
```

`users_controller.rb` com `class UserController` explode. Não é estilo. É contrato.

**Quando usar:**
Sempre que o código mora em `app/`. Você não escolhe Zeitwerk no Rails 7.1+: ele já é o autoload.

**Na entrevista:**
> "Zeitwerk mapeia path em constante. `users_controller.rb` vira `UsersController`. Eu não dou require em app/. Se o nome não bate, o loader recusa."

---

## Rails.autoloaders

**O que é:**
O Rails expõe dois loaders Zeitwerk. `main` recarrega. `once` não recarrega.

**Como funciona:**
```ruby
Rails.autoloaders.main   # app/, reloadable
Rails.autoloaders.once   # autoload_once_paths, carga única
```

`main` cobre os diretórios de `app/` (`models`, `controllers`, `jobs`, `mailers`, …). `app/models/concerns` é collapsed: `app/models/concerns/auditable.rb` vira `Auditable`, não `Concerns::Auditable`.

`lib/` **não** entra sozinho. Rails 7.1+ tem o helper:

```ruby
# config/application.rb
config.autoload_lib(ignore: %w[assets tasks])
```

Isso põe `lib/` no `main` e ignora o que não é constante (`lib/tasks`, `lib/assets`). Sem isso, arquivo em `lib/billing/tax.rb` não vira `Billing::Tax` até você configurar.

**Na entrevista:**
> "Tem dois: `Rails.autoloaders.main` recarrega, `once` não. app/ vai no main. lib/ só entra se eu configurar — no 7.1 uso `autoload_lib`."

---

## Lazy vs eager

**O que é:**
Lazy: carrega na primeira referência à constante. Eager: carrega tudo no boot.

**Como funciona:**
```ruby
# development.rb — Rails 7.1+
config.enable_reloading = true
config.eager_load = false

# production.rb
config.enable_reloading = false
config.eager_load = true
```

Em desenvolvimento você referencia `UsersController` no request. Zeitwerk carrega o arquivo, atende, e no próximo request pode fazer unload e recarregar. Por isso monkey patch e cache em constante de classe em `app/` te pegam: o objeto antigo morreu.

Em produção o boot faz eager load. Falha no deploy, não no primeiro cliente. Threads compartilham constantes já definidas — não tem corrida de `const_missing`.

```ruby
# produção, no boot (simplificado)
Rails.autoloaders.main.eager_load
```

Teste: o default costuma ser lazy. CI que quer pegar constante quebrada cedo liga `eager_load`.

**Quando usar:**
Você não escolhe por arquivo. Ambiente escolhe. Código em `app/` precisa sobreviver a unload em dev — estado vive em Redis, banco, objeto de request. Não em `@@cache` na classe.

**Na entrevista:**
> "Dev é lazy e recarrega. Produção eager loada no boot. Classic autoload não era thread-safe; Zeitwerk + eager load é. Se a constante só quebra em prod, o check não rodou no CI."

---

## Classic autoload acabou

**O que é:**
Antes do Zeitwerk, o Rails usava `ActiveSupport::Dependencies` no modo classic: `const_missing` + `require_dependency`. Rails 6 veio com Zeitwerk default. Rails 7 removeu classic. Não existe mais `config.autoloader = :classic`.

**Como funciona:**
Classic adivinhava o arquivo a partir do nome da constante, era permissivo com plural, não era thread-safe, e o reload era um festival de constantes fantasma. Zeitwerk inverte: o **arquivo** manda. A constante tem que existir onde o path diz.

```ruby
# NÃO existe mais no Rails 7.1+
config.autoloader = :classic
require_dependency "user"  # cheiro de código antigo
```

Se você vê `require_dependency` num app, é legado. Tira. Deixa o loader trabalhar.

**Na entrevista:**
> "Classic morreu no Rails 7. Zeitwerk é o autoload. A diferença: classic ia da constante pro arquivo; Zeitwerk vai do arquivo pra constante. E é thread-safe."

---

## Inflector

**O que é:**
A regra que transforma `html_parser.rb` em constante. Default: camelize. `api` vira `Api`, não `API`. Acrônimo você declara.

**Como funciona:**
```ruby
# config/initializers/inflections.rb
ActiveSupport::Inflector.inflections(:en) do |inflect|
  inflect.acronym "API"
  inflect.acronym "HTML"
  inflect.acronym "CSV"
end
```

Com isso:

```ruby
# app/controllers/api/users_controller.rb → API::UsersController
# app/parsers/html_parser.rb              → HTMLParser
```

Sem o acronym, Zeitwerk espera `Api::UsersController`. Você escreve `module API` e o check falha. É o erro número um de namespace em API.

Inflector pontual no loader, quando não quer bagunçar o ActiveSupport inteiro:

```ruby
# config/initializers/zeitwerk.rb
Rails.autoloaders.main.inflector.inflect(
  "html_parser" => "HTMLParser",
  "graphql" => "GraphQL"
)
```

**Quando usar:**
Sigla que o time escreve em maiúscula no código (`API`, `HTML`, `S3`). Não inflete por gosto. Inflete porque o arquivo e a constante precisam ser a mesma conversa.

**Na entrevista:**
> "Default camelize: `api` é `Api`. Se a classe é `API::UsersController`, ou o arquivo está em `api/` com acronym, ou o inflector do loader mapeia. Sem isso, zeitwerk:check quebra."

---

## Quando zeitwerk:check falha

**O que é:**
`bin/rails zeitwerk:check` percorre as raízes, inflete cada arquivo e confirma que a constante existe. Não sobe o servidor. É o lint do autoload.

**Como funciona:**
```bash
bin/rails zeitwerk:check
# Hold on, I am eager loading the application.
# All is good!
```

Quebra quando o contrato path → constante não vale. Os casos que caem em review:

```ruby
# 1. Nome errado
# app/models/user.rb
class Users  # esperado: User
end

# 2. Namespace errado
# app/models/admin/user.rb
class User   # esperado: Admin::User
end

# 3. Inflection
# app/controllers/api/v1/users_controller.rb
module API          # esperado sem acronym: Api::V1::UsersController
  module V1
    class UsersController; end
  end
end

# 4. Arquivo que não é constante
# app/models/scripts/reindex.rb  → espera Scripts::Reindex
# e o arquivo é um script solto, sem classe
```

`require` explícito de arquivo em `app/` também estraga: o Ruby carrega cedo, Zeitwerk tenta de novo, constante já definida no lugar errado ou o reload não faz unload.

**Exemplo prático:**
```bash
# no CI, depois do setup
bin/rails zeitwerk:check
```

Falha no CI > falha no boot de produção > falha no primeiro request.

**Na entrevista:**
> "zeitwerk:check falha quando o path não produz a constante. Nome, namespace, acronym, arquivo solto em app/. Eu rodo no CI. Não espero o deploy."

---

## require vs autoload

**O que é:**
`require` é Ruby: carrega o arquivo uma vez, entra em `$LOADED_FEATURES`, não faz unload. Autoload do Zeitwerk é o loader: mapeia, carrega na referência (ou no eager), verifica a constante, em dev pode unload.

`Kernel#autoload` é outra coisa: API do Ruby que associa constante a arquivo. Zeitwerk usa isso por baixo. Você não chama `autoload :User, "user"` no Rails.

**Como funciona:**
```ruby
# GEM e stdlib — require
require "json"
require "net/http"

# app/ — NÃO
require_relative "user"           # ruim
require "app/models/user"         # ruim
require_dependency "user"         # legado

# certo: referencie a constante
user = User.find(1)
UsersController  # o request já faz isso pela rota
```

`require` em arquivo autoloadado:

- em dev, o reload não te salva — o arquivo já está em `$LOADED_FEATURES`
- em prod, pode carregar fora de ordem e mascarar constante duplicada
- o check reclama ou você ganha `Zeitwerk::NameError` / already defined

**Quando usar:**
`require` para gem, stdlib, arquivo fora das raízes. Zeitwerk para tudo que está em `app/` (e `lib/` se autoloadou). Nunca misture os dois no mesmo arquivo.

**Exemplo prático:**
```ruby
# lib/ não está no autoload? aí require é honesto
require "billing/legacy_tax"

# depois de config.autoload_lib:
# lib/billing/legacy_tax.rb → Billing::LegacyTax
# some o require
```

**Na entrevista:**
> "require é Ruby, uma vez, sem reload. Autoload é Zeitwerk olhando o path. Em app/ eu não dou require. Kernel#autoload existe, mas no Rails quem manda é o Zeitwerk."

---

## Recapitulando

- Path → constante. `users_controller.rb` é `UsersController`. Sem match, erro.
- `app/` é raiz. Pasta é namespace. `concerns` é collapsed.
- `Rails.autoloaders.main` recarrega. `once` não. `lib/` só com config (`autoload_lib` no 7.1).
- Dev: lazy + reload. Prod: eager load no boot.
- Classic autoload saiu no Rails 7. `require_dependency` é cheiro.
- Inflector: `api` é `Api` até você declarar acronym.
- `bin/rails zeitwerk:check` no CI.
- `require` não é autoload. Gem sim, `app/` não.

---

## Exercícios práticos

### Exercício 1: Qual constante o arquivo define?

**Enunciado:** Para cada path, qual constante o Zeitwerk espera? A raiz é `app/models`.

```text
app/models/user.rb
app/models/admin/user.rb
app/models/concerns/auditable.rb
app/controllers/users_controller.rb
```

<details>
<summary>Solução</summary>

```text
app/models/user.rb                    → User
app/models/admin/user.rb              → Admin::User
app/models/concerns/auditable.rb      → Auditable   # collapsed
app/controllers/users_controller.rb   → UsersController
```

`concerns` não vira `Concerns::`. Controller não está em `models/`, mas a regra é a mesma: raiz `app/controllers`, arquivo infletido.

**Pontos-chave:**
- Raiz some do nome
- Pasta = namespace, exceto collapse
- snake_case → CamelCase
</details>

### Exercício 2: Por que o check quebra nesta API?

**Enunciado:** O arquivo é `app/controllers/api/users_controller.rb`. A classe é `API::UsersController`. `bin/rails zeitwerk:check` falha. Por quê, e o que você muda?

<details>
<summary>Solução</summary>

Sem acronym, camelize de `api` é `Api`. Zeitwerk espera `Api::UsersController`. Você definiu `API`.

Duas saídas honestas:

```ruby
# 1. Inflector — o time quer API maiúsculo
ActiveSupport::Inflector.inflections(:en) do |inflect|
  inflect.acronym "API"
end

# 2. Ou a constante segue o default
module Api
  class UsersController < ApplicationController
  end
end
```

Não “conserte” com `require`. O path e a constante têm que concordar.

**Pontos-chave:**
- Default não é acronym
- Inflector ou nome da constante, um dos dois
- Check existe para pegar isso antes do boot
</details>

### Exercício 3: require no model — o que quebra?

**Enunciado:** Em `app/models/order.rb` alguém colocou `require_relative "user"`. Em desenvolvimento o `User` às vezes não pega mudança de código. Em produção o boot até sobe. Explique. Qual o fix?

<details>
<summary>Solução</summary>

`require_relative` é `require`: o arquivo entra em `$LOADED_FEATURES` e não sai. Zeitwerk em dev faz unload das constantes e recarrega pelo loader. O `user.rb` já foi requerido na mão, então o Ruby recusa recarregar. Você fica com a classe velha.

```ruby
# app/models/order.rb — RUIM
require_relative "user"

class Order < ApplicationRecord
  belongs_to :user
end

# BOM — só referencie
class Order < ApplicationRecord
  belongs_to :user  # User carrega quando a associação precisar
end
```

Produção eager loada tudo no boot, então “funciona” até o dia em que a ordem de load ou constante duplicada aparece. O bug é o `require`, não o ambiente.

**Pontos-chave:**
- `require` não recarrega
- `app/` é território do Zeitwerk
- Sintoma em dev (reload morto) é o sinal
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
