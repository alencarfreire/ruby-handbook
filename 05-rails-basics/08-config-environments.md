# 5.8 Config e environments

> **TL;DR**
> Três environments: development, test, production. `RAILS_ENV` escolhe o arquivo em `config/environments/`. Comportamento da app vai em `Rails.application.config`. Segredo e valor de deploy vão em credentials ou `ENV`. `config_for` lê YAML por environment. Dev recarrega (`cache_classes` off, `eager_load` off). Produção eager loada e congela classe. `secret_key_base` assina cookie e session. `master.key` nunca entra no git.

## Conteúdo

- [Os três environments](#os-três-environments)
- [config/environments](#configenvironments)
- [ENV vs Rails.application.config](#env-vs-railsapplicationconfig)
- [config_for](#config_for)
- [eager_load e cache_classes](#eager_load-e-cache_classes)
- [credentials e master.key](#credentials-e-masterkey)
- [secret_key_base](#secret_key_base)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Os três environments

**O que é:**
O Rails sobe em um environment. Default local é `development`. Spec roda em `test`. Servidor de verdade é `production`. O nome não é enfeite: cada um carrega um arquivo, liga flag diferente e espera um tipo de falha.

**Como funciona:**
```ruby
Rails.env                # #<ActiveSupport::EnvironmentInquirer>
Rails.env.development?   # true no seu laptop
Rails.env.test?
Rails.env.production?

ENV.fetch("RAILS_ENV", "development")
```

`RAILS_ENV` manda. `RACK_ENV` é o Rack; o Rails 7.1+ lê `RAILS_ENV` primeiro. Sem os dois, é development.

Não invente `staging` no código se o deploy de staging sobe com `RAILS_ENV=production` e config extra. Environment novo só vale se você cria `config/environments/staging.rb` e assume o custo: credencial, cache, eager load, mailer.

**Quando usar:**
`Rails.env.production?` para coisa que muda de mundo: host do mailer, nível de log, `force_ssl`. Não para feature flag de cliente. Feature é dado, não environment.

**Na entrevista:**
> "Tem três de fábrica: development, test, production. RAILS_ENV escolhe o arquivo. Staging costuma ser production com ENV diferente, não um quarto environment, a menos que o time queira manter o arquivo."

---

## config/environments

**O que é:**
`config/application.rb` é o comum. `config/environments/development.rb`, `test.rb` e `production.rb` sobrescrevem. Boot: application primeiro, environment depois, initializer por último.

**Como funciona:**
```ruby
# config/application.rb
module Loja
  class Application < Rails::Application
    config.load_defaults 7.1
    config.time_zone = "America/Sao_Paulo"
  end
end

# config/environments/production.rb
Rails.application.configure do
  config.eager_load = true
  config.consider_all_requests_local = false
  config.force_ssl = true
end
```

O bloco `configure` do environment ganha do `application.rb`. Initializer ganha dos dois se setar de novo — por isso config de gem barulhenta mora no initializer, não espalhada.

O que cai em review:

| Arquivo | Papel |
|---|---|
| `application.rb` | default da app, `load_defaults` |
| `development.rb` | reload, erro na cara, mailer :test ou letter_opener |
| `test.rb` | isolamento, cache de classe, mailer :test |
| `production.rb` | eager load, SSL, cache, log mais seco |

**Quando usar:**
Flag que é do processo inteiro (`eager_load`, `force_ssl`, `cache_store`). Host e senha não ficam hardcoded aqui — apontam para credentials ou `ENV`.

**Na entrevista:**
> "application.rb é a base. environments/*.rb sobrescreve. Initializer roda depois. Se a flag só vale em produção, ela não entra no application.rb."

---

## ENV vs Rails.application.config

**O que é:**
`ENV` é o processo: string, vem de fora, 12-factor. `Rails.application.config` é o objeto de boot da app: você seta em Ruby, lê tipado, o environment arquivo manda.

**Como funciona:**
```ruby
# ENV — ops e deploy
ENV.fetch("DATABASE_URL")
ENV.fetch("RAILS_MASTER_KEY")
ENV["PORT"]  # nil se faltar — fetch é mais honesto

# config — comportamento
Rails.application.config.time_zone
Rails.application.config.force_ssl
config.cache_store = :solid_cache_store
```

Os dois se encontram no boot. Você lê `ENV` **uma vez** e grava no config:

```ruby
# config/application.rb ou environments/production.rb
config.x.billing_api_host = ENV.fetch("BILLING_API_HOST")

# depois, em qualquer lugar
Rails.configuration.x.billing_api_host
```

`config.x` é o canto custom. Melhor que `ENV["BILLING_API_HOST"]` no model: o model não precisa saber de process env, e o boot falha cedo se a chave falta.

**Quando usar:**
`ENV` para o que muda entre máquina e deploy: URL de banco, chave, host. `config` para o que é regra da app: timezone, SSL, store de cache, se recarrega código. Segredo estável da app → credentials. Segredo que o PaaS injeta → `ENV`.

**Exemplo prático:**
```ruby
# RUIM — ENV no model
class Invoice < ApplicationRecord
  def sync
    Faraday.get(ENV["BILLING_API_HOST"])
  end
end

# BOM — config no boot, model consome
class Invoice < ApplicationRecord
  def sync
    Faraday.get(Rails.configuration.x.billing_api_host)
  end
end
```

**Na entrevista:**
> "ENV é string do processo. config é o boot da app. Eu não espalho ENV no model. Leio no boot, jogo em config.x, falho cedo com fetch."

---

## config_for

**O que é:**
Helper do Rails que lê um YAML em `config/`, escolhe a chave do environment e devolve Hash com indifferent access. ERB vale.

**Como funciona:**
```yaml
# config/redis.yml
default: &default
  timeout: 1
  pool: 5

development:
  <<: *default
  url: redis://localhost:6379/0

test:
  <<: *default
  url: redis://localhost:6379/1

production:
  <<: *default
  url: <%= ENV.fetch("REDIS_URL") %>
```

```ruby
# config/application.rb
config.redis = config_for(:redis)

# uso
Rails.configuration.redis[:url]
Rails.configuration.redis.fetch("pool")
```

`config_for(:redis)` procura `config/redis.yml` (ou `.yaml`). Sem a chave do environment atual, levanta erro. Por isso test e production precisam existir no arquivo, mesmo que herdem do `default`.

**Quando usar:**
Várias chaves do mesmo serviço (host, pool, timeout). `storage.yml` e `cable.yml` já nascem assim. Uma string só? `ENV.fetch` resolve. Não use `config_for` para senha se credentials já cobrem.

**Na entrevista:**
> "config_for lê config/nome.yml na chave do Rails.env. Dá para ERB e âncora YAML. É config estruturada, não credencial."

---

## eager_load e cache_classes

**O que é:**
Duas flags de boot que a entrevista mistura. `cache_classes` (no 7.1 o par visível é `enable_reloading`) decide se o código recarrega entre requests. `eager_load` decide se o boot carrega **tudo** ou só o que a constante pediu.

**Como funciona:**
```ruby
# development.rb — Rails 7.1+
config.enable_reloading = true
config.eager_load = false
# cache_classes fica false — é o inverso do reload

# production.rb
config.enable_reloading = false
config.eager_load = true

# test.rb — default gerado
config.enable_reloading = false
config.eager_load = ENV["CI"].present?
```

| | development | test (local) | production |
|---|---|---|---|
| recarrega código | sim | não | não |
| `eager_load` | não | não (sim no CI) | sim |
| falha de constante | no request | no exemplo | no boot / deploy |

`cache_classes = true` significa: não descarrega constante. Sem reload, o request seguinte usa a mesma classe. Dev precisa do contrário — você salva o arquivo e o próximo request pega a classe nova.

`eager_load = true` significa: no boot, Zeitwerk carrega `app/`. Constante quebrada, inflection errada, typo em `has_many` que referencia classe morta — explode antes do primeiro cliente. Em dev isso atrasaria o boot e brigaria com o reload. Por isso fica off.

As duas **não** são a mesma coisa. Dá para ter `cache_classes` true e `eager_load` false: é o test local. Classe não recarrega, mas o boot não carrega o app inteiro. Mais rápido. CI liga `eager_load` para pegar o que produção pegaria.

**Quando usar:**
Você não escolhe por feature. Environment escolhe. Código em `app/` tem que sobreviver a unload em dev: estado não mora em `@@cache` na classe.

**Na entrevista:**
> "cache_classes é reload: em dev off, em prod on. eager_load é carregar tudo no boot: em prod on, em dev off. Test local costuma cachear classe sem eager load. CI liga eager_load. Rails 7.1 fala enable_reloading, que é o nome honesto do inverso de cache_classes."

---

## credentials e master.key

**O que é:**
`config/credentials.yml.enc` é o YAML criptografado da app. `config/master.key` é a chave que abre. O `.enc` vai no git. O `.key` **não vai**. Sem a chave, o arquivo é pedra.

**Como funciona:**
```bash
bin/rails credentials:show
EDITOR="code --wait" bin/rails credentials:edit
```

```yaml
# o que o editor abre (não é o que o git vê)
secret_key_base: abc123...
aws:
  access_key_id: AKI...
  secret_access_key: ...
```

```ruby
Rails.application.credentials.secret_key_base
Rails.application.credentials.dig(:aws, :access_key_id)
```

Rails 7.1+ também tem credencial por environment: `config/credentials/production.yml.enc` + `config/credentials/production.key`. Edit: `bin/rails credentials:edit --environment production`. Produção no PaaS quase nunca lê o arquivo `master.key`: recebe `RAILS_MASTER_KEY` no ENV.

Perdeu a chave? O `.enc` não se adivinha. Gera de novo, preenche de novo, rotaciona o que vazou. Não commita “só desta vez”. `master.key` no git é incidente: rotaciona `secret_key_base`, token de API, tudo que o arquivo tinha.

**Quando usar:**
Segredo da app que o time compartilha: `secret_key_base`, chave da AWS da conta da empresa, token de um SaaS. Valor que o deploy gera por máquina (`DATABASE_URL`, chave do Heroku/Render) fica no `ENV`. Os dois convivem.

**Na entrevista:**
> "credentials.yml.enc vai no repo. master.key não. Quem commita master.key vaza a caixa inteira. Em produção eu injeto RAILS_MASTER_KEY. Se a chave some, o enc não abre — não tem recover, só rotacionar."

---

## secret_key_base

**O que é:**
Segredo longo que o Rails usa para assinar e (quando cabe) criptografar o que o cliente não pode forjar: cookie de session, `MessageVerifier`, `signed` cookie.

**Como funciona:**
```ruby
Rails.application.secret_key_base
# em geral vem de credentials.secret_key_base
# ou de ENV["SECRET_KEY_BASE"] se você setar
```

Muda a chave → session de todo mundo morre. Cookie assinado antigo vira lixo. Não é “reinicia o Puma”. É outro segredo.

Não hardcode no `application.rb`. Não copie o de development para production. Test tem o dele (o helper de test gera um). Produção lê credentials ou `SECRET_KEY_BASE`.

**Quando usar:**
Você não “usa” no controller. O framework usa. Você garante: existe, é longo, é diferente por environment, não está no git em texto.

**Exemplo prático:**
```ruby
# RUIM
config.secret_key_base = "123456"  # previsível, compartilhado, no git

# BOM — gerado e guardado
# bin/rails secret
# cola no credentials:edit, environment production
```

**Na entrevista:**
> "secret_key_base assina session e cookie. Se vaza, alguém forja session. Se muda, todo mundo desloga. Mora no credentials, nunca no código. master.key no git entrega essa chave de graça."

---

## Recapitulando

- Três environments. `RAILS_ENV` escolhe o arquivo.
- `application.rb` base, `config/environments/*` sobrescreve, initializer por último.
- `ENV` é processo. `Rails.application.config` é boot. `config.x` para o seu.
- `config_for` lê YAML por environment. Não é o lugar da senha.
- `cache_classes` / `enable_reloading` = recarrega ou não. `eager_load` = carrega tudo no boot.
- Dev: reload on, eager off. Prod: reload off, eager on. Test local: cache on, eager off (CI liga).
- `.enc` no git. `master.key` fora. Produção: `RAILS_MASTER_KEY`.
- `secret_key_base` assina cookie. Vaza = incidente. Muda = session morre.

---

## Exercícios práticos

### Exercício 1: Onde cada valor mora?

**Enunciado:** Classifique cada item: `config` (arquivo de environment), `config_for`, credentials ou `ENV`. Justifique em uma linha.

1. `force_ssl`
2. URL do Redis em produção (o PaaS injeta)
3. pool e timeout do Redis, iguais no time
4. access key da AWS da conta da empresa
5. `secret_key_base`
6. `eager_load`

<details>
<summary>Solução</summary>

1. **config** — regra da app, `production.rb`.
2. **ENV** — o PaaS gera, muda por app, `ENV.fetch("REDIS_URL")`. Pode entrar no YAML via ERB.
3. **config_for** — estrutura em `config/redis.yml`, chave por environment.
4. **credentials** — segredo compartilhado do time, não é do processo do dyno.
5. **credentials** (ou `SECRET_KEY_BASE` no ENV se o host exigir). Nunca no código.
6. **config** — flag de boot em `production.rb` / `development.rb`.

**Pontos-chave:**
- Comportamento → config
- Estrutura por env → `config_for`
- Segredo da app → credentials
- Valor do deploy → ENV
</details>

### Exercício 2: Por que o test passou e a produção não subiu?

**Enunciado:** `app/services/billing/tax.rb` define `class Tax` (sem namespace). `bin/rails test` no laptop passa. Deploy em produção quebra no boot. Qual flag explica, e o que você fala na entrevista?

<details>
<summary>Solução</summary>

Produção tem `config.eager_load = true`. O boot pede toda constante de `app/`. Zeitwerk espera `Billing::Tax` e acha `Tax` — explode antes de atender request.

Test local, no gerador 7.1, tem `eager_load` false a menos que `CI` esteja setado. O exemplo não referencia `Billing::Tax`, então o arquivo morto nem carrega. Por isso o verde é mentira.

```ruby
# test.rb — o default já faz isso
config.eager_load = ENV["CI"].present?

# CI
# CI=true bin/rails test
# e/ou bin/rails zeitwerk:check
```

**Pontos-chave:**
- eager_load pega constante quebrada no boot
- test local preguiçoso esconde
- CI liga eager_load ou roda `zeitwerk:check`
</details>

### Exercício 3: master.key no PR

**Enunciado:** Junior abriu PR com `config/master.key`. O app já está em produção com esse arquivo. O que você faz agora — não “da próxima vez”?

<details>
<summary>Solução</summary>

Trata como vazamento. Quem clonou o repo tem a caixa.

1. Não mergeia. Tira o arquivo do PR e do histórico se já foi commitado (`git filter-repo` / suporte do GitHub, não um commit que só dá `rm`).
2. Gera **nova** master key e reescreve o `credentials.yml.enc`. O `.enc` antigo com a chave velha é lixo.
3. Rotaciona **tudo** que estava dentro: `secret_key_base`, token de API, chave AWS. Session de produção morre quando `secret_key_base` muda — é o preço.
4. Atualiza `RAILS_MASTER_KEY` no host. Confirma que `.gitignore` tem `master.key` e `config/credentials/*.key`.
5. Avisa o time: a chave velha é pública.

“Coloca no gitignore e era” deixa o blob no histórico. Isso não fecha o incidente.

**Pontos-chave:**
- master.key no git = todas as credentials vazaram
- rotaciona o conteúdo, não só some o arquivo
- produção usa ENV, não o arquivo no disco do dyno
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
