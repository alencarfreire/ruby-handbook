# 3.1 Gems e Bundler

> **TL;DR**
> Gem é pacote Ruby. Gemfile é a faixa que você aceita; Gemfile.lock é a foto do que instalou. `bundle install` respeita o lock; `bundle update` resolve de novo. `~>` libera só o último dígito que você escreveu. App commita o lock. `require` carrega um arquivo; `Bundler.require` carrega o group. Production não instala `:development` / `:test`.

## Conteúdo

- [O que é uma gem](#o-que-é-uma-gem)
- [Gemfile](#gemfile)
- [Gemfile.lock](#gemfilelock)
- [bundle install vs bundle update](#bundle-install-vs-bundle-update)
- [Groups](#groups)
- [require vs Bundler.require](#require-vs-bundlerrequire)
- [Versionamento semântico](#versionamento-semântico)
- [Operador pessimista ~>](#operador-pessimista-)
- [Por que o lockfile vai no git](#por-que-o-lockfile-vai-no-git)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que é uma gem

**O que é:**
Pacote Ruby versionado: código + `.gemspec` (nome, versão, dependências). Vem do [RubyGems](https://rubygems.org), de git ou de path.

**Como funciona:**
```ruby
# fora do app — quase nunca
# gem install rails

# no app: Bundler monta o load path
require "bundler/setup"
require "rails"
```

Uma linha no Gemfile é uma árvore. `rails` puxa Action Pack, Active Record, etc.

**Quando usar:**
Lib compartilhada (Faraday, Sidekiq). Código só da app não vira gem.

**Na entrevista:**
> "Gem é o pacote. Bundler resolve a árvore e trava versão. No app eu não faço `gem install` — eu coloco no Gemfile."

---

## Gemfile

**O que é:**
O que a app aceita. Constraint, não foto. Fonte, Ruby, gems, groups.

**Como funciona:**
```ruby
source "https://rubygems.org"

ruby "3.3.5"

gem "rails", "~> 7.1.0"
gem "pg"
gem "puma"

group :development, :test do
  gem "debug"
  gem "rspec-rails"
end

gem "rubocop", require: false
```

Sem versão, Bundler pega a mais nova que casar com o resto. Folga demais para gem de produção.

**Na entrevista:**
> "Gemfile é intenção. `~> 7.1.0` é a faixa. O patch exato está no lock."

---

## Gemfile.lock

**O que é:**
Grafo resolvido. Versão exata de cada gem — inclusive transitiva. Checksum. Plataforma.

**Como funciona:**
```text
GEM
  specs:
    rails (7.1.5)
      actionpack (= 7.1.5)
      activerecord (= 7.1.5)

DEPENDENCIES
  rails (~> 7.1.0)

BUNDLED WITH
   2.5.23
```

`BUNDLED WITH` pede o mesmo Bundler 2 no CI e na produção. Lock 2.5 com máquina 2.3: o `install` avisa ou recusa.

**Quando usar:**
Sempre que existe Gemfile. Você não edita na mão.

**Na entrevista:**
> "Lock é a foto. Mesmo lock, mesmo grafo. Sem lock, cada `bundle install` pode puxar patch novo."

---

## bundle install vs bundle update

**O que é:**
`install` materializa o lock. `update` reabre a resolução dentro das constraints do Gemfile.

**Como funciona:**
```bash
bundle install
# lock ok → instala o lock
# sem lock → resolve, escreve lock, instala

bundle update            # reescreve TUDO. Perigoso no sprint.
bundle update rails      # só rails e o que ela arrasta
```

Bundler 2: `bundle install --without` está deprecated.

```bash
bundle config set --local without "development test"
bundle install
```

`bundle exec rspec` usa o binário do lock, não a gem solta no sistema.

**Quando usar:**
`install` no clone, CI, deploy. `update gem` quando você **quer** o patch. `update` solto só com motivo.

**Exemplo prático:**
```bash
# CI / produção — se Gemfile e lock divergem, falha
bundle config set --local frozen true
bundle install
```

**Na entrevista:**
> "`install` não é `update`. Deploy não roda `bundle update`. Patch do Rails: `bundle update rails`, diff do lock, teste, commit."

---

## Groups

**O que é:**
Caixa no Gemfile. `:development`, `:test`, `:production`. Bundler decide o que instala; `Bundler.require` decide o que carrega.

**Como funciona:**
```ruby
group :development, :test do
  gem "rspec-rails"
  gem "factory_bot_rails"
end

group :test do
  gem "capybara"
end

gem "web-console", group: :development
```

```bash
bundle config set --local without "development test"
bundle install
```

`RAILS_ENV=production` **não** corta install. Quem corta é `without` / `BUNDLE_WITHOUT`. O Rails só escolhe o require: `Rails.groups`.

**Quando usar:**
Ferramenta de dev/teste fora da imagem de produção. Gem da app em todo ambiente fica fora de group.

**Na entrevista:**
> "Group não é mágica de env. `without` no deploy. No boot, `Bundler.require(*Rails.groups)` — production não pede `:development`."

---

## require vs Bundler.require

**O que é:**
`require "foo"` carrega um arquivo. `Bundler.require` percorre as gems do group e dá require no nome padrão.

**Como funciona:**
```ruby
# config/boot.rb — só o load path
require "bundler/setup"

# config/application.rb
Bundler.require(*Rails.groups)
# development → default + :development
# test        → default + :test
# production  → default
```

```ruby
gem "bootsnap", require: false
gem "rubocop", require: false
```

`require: false`: instala, não carrega. Você faz `require "bootsnap/setup"` no ponto certo.

**Quando usar:**
Rails: `Bundler.require` no boot. `require: false` em CLI ou gem que você carrega cedo. Script sem Rails: `require` explícito.

**Na entrevista:**
> "`bundler/setup` põe no path. `Bundler.require` carrega. RuboCop no boot da app é desperdício. Bootsnap você exige no `boot.rb`."

---

## Versionamento semântico

**O que é:**
`MAJOR.MINOR.PATCH`. Contrato social. Bundler só compara número.

**Como funciona:**
```text
7.1.5
│ │ └─ PATCH — bugfix, compatível
│ └─── MINOR — feature, compatível (major > 0)
└───── MAJOR — quebra API
```

`0.y.z` não promete estabilidade. Pré-release: `7.2.0.beta1` < `7.2.0`. Bundler não sobe para beta se você não pediu.

**Quando usar:**
Changelog antes de aceitar major. Gem sua: quebrou API pública → major.

**Na entrevista:**
> "Semver é combinado. `~> 7.1` confia que 7.2 não quebra. Se a gem mente, o lock te segura até o update na mão."

---

## Operador pessimista ~>

**O que é:**
`~>` (twiddle-wakka). Sobe o **último** segmento que você escreveu. Os da esquerda viram teto.

**Como funciona:**
```ruby
gem "rails", "~> 7.1"     # >= 7.1   e < 8.0    — minor e patch
gem "rails", "~> 7.1.0"   # >= 7.1.0 e < 7.2.0  — só patch
gem "rails", "~> 7.1.5"   # >= 7.1.5 e < 7.2.0

gem "rails", ">= 7.1"     # 8, 9... sem teto
```

Dois números = pode minor. Três = só patch. Essa é a pergunta.

**Quando usar:**
`~> x.y.z` em gem sensível (Rails, Sidekiq). Dois dígitos quando você acompanha minor. Produção sem constraint é folga.

**Na entrevista:**
> "`~> 2.1` é `< 3`. `~> 2.1.0` é `< 2.2`. Eu conto os segmentos. Equivalente: `>=` e `<`."

---

## Por que o lockfile vai no git

**O que é:**
No **app**, Gemfile.lock é artefato de build. Entra no repositório. Sem ele, cada máquina resolve de novo.

**Como funciona:**
```text
clone → bundle install → versões do lock
      ↘ sem lock → o que estiver no ar
                   CI verde, produção com o patch de terça
```

Exceção: **gem** (biblioteca). Quem instala a gem resolve o grafo. O lock da lib não é contrato com o consumidor. App Rails commita. Sem discussão.

**Quando usar:**
Sempre no app. Deploy com `frozen` para o servidor não “consertar” o lock.

**Importante na entrevista:**
> "App commita o lock. João e o Heroku/K8s rodam o mesmo Puma. Gemfile sozinho não reproduz build. Lib: o lock não vale para quem deu `gem install`."

---

## Recapitulando

- Gem = pacote. Bundler = resolvedor + lock.
- Gemfile é faixa. Lock é foto. App commita a foto.
- `bundle install` lê o lock. `bundle update` reescreve.
- `~>` olha o último dígito que você escreveu.
- `without` corta install. `Rails.groups` corta require.
- `require: false` = instalada, não bootada.
- Production com `frozen` não atualiza gem no servidor.

---

## Exercícios práticos

### Exercício 1: O que o `~>` deixa passar?

**Enunciado:** Para cada linha, `bundle update rails` pode ir para `7.1.9`, `7.2.0` e `8.0.0`?

```ruby
gem "rails", "~> 7.1"
gem "rails", "~> 7.1.0"
gem "rails", ">= 7.1"
```

<details>
<summary>Solução</summary>

| Constraint | 7.1.9 | 7.2.0 | 8.0.0 |
|---|---|---|---|
| `~> 7.1` | sim | sim | não (`< 8.0`) |
| `~> 7.1.0` | sim | não (`< 7.2`) | não |
| `>= 7.1` | sim | sim | sim |

`~> 7.1` = `>= 7.1`, `< 8.0`. `~> 7.1.0` = `>= 7.1.0`, `< 7.2.0`.

**Pontos-chave:**
- Conte os segmentos
- `>=` sozinho não tem teto
- O lock segura até alguém rodar `update`
</details>

### Exercício 2: install ou update?

**Enunciado:** Gemfile tem `gem "puma", "~> 6.4.0"`. Lock está em `6.4.2`. Saiu `6.4.3` (patch) e `6.5.0` (minor). O que cada comando faz?

```bash
bundle install
bundle update puma
```

<details>
<summary>Solução</summary>

`bundle install` — fica `6.4.2`. O lock já satisfaz a constraint.

`bundle update puma` — sobe para `6.4.3` (`>= 6.4.0` e `< 6.5.0`). Não vai para `6.5.0`.

Para `6.5.0` você muda o Gemfile (`~> 6.4` ou `~> 6.5.0`) e atualiza.

**Pontos-chave:**
- install lê o lock
- update lê o Gemfile e reescreve o lock
- constraint é o teto; o comando decide se reabre
</details>

### Exercício 3: Production carregou o RSpec?

**Enunciado:** Deploy com `RAILS_ENV=production`, **sem** `bundle config without`. O `install` baixou `rspec-rails`. O boot com `Bundler.require(*Rails.groups)` carrega RSpec? O que você corrige?

```ruby
gem "rails", "~> 7.1.0"

group :development, :test do
  gem "rspec-rails"
end
```

<details>
<summary>Solução</summary>

Instalou: sim. Sem `without`, Bundler baixa todos os groups.

Carregou no boot: **não**. Em production, `Rails.groups` é `[:default]`. `:development` / `:test` ficam de fora do require.

Ainda está errado: disco, imagem, CVE. Correção:

```bash
bundle config set --local without "development test"
bundle install
```

`Bundler.require(:default, :development)` em production carregaria. O group sozinho não impede require explícito.

**Pontos-chave:**
- env ≠ group instalado
- `without` corta install
- `Rails.groups` corta require
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
