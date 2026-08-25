# 11.5 Deploy

> **TL;DR**
> Deploy Rails não é “subir o git”. É build + assets + migrate + Puma atrás de um proxy, com segredo fora da imagem. Kamal, Capistrano, Heroku e Render são ferramentas. O contrato é o mesmo. `db:migrate` roda **antes** ou **junto** do release, nunca depois do tráfego se a migration quebra o código antigo. `SECRET_KEY_BASE` assina session. `RAILS_MASTER_KEY` abre o credentials. Sem os dois certos, a app não sobe.

## Conteúdo

- [O contrato](#o-contrato)
- [Quatro ferramentas, nenhuma religião](#quatro-ferramentas-nenhuma-religião)
- [Puma](#puma)
- [Assets precompile](#assets-precompile)
- [`db:migrate` no release](#dbmigrate-no-release)
- [Zero-downtime](#zero-downtime)
- [`SECRET_KEY_BASE` e `RAILS_MASTER_KEY`](#secret_key_base-e-rails_master_key)
- [Importante na entrevista](#importante-na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O contrato

**O que é:**
Colocar uma revisão nova em produção sem mentir para o cliente. Código, schema e assets têm que bater. O processo antigo para de receber tráfego só quando o novo responde health check.

**Como funciona:**
Quatro fases, nessa ordem:

1. **Build** — imagem ou slug: gem, JS, `assets:precompile`.
2. **Release** — `db:migrate` (e o que for one-off). Ainda sem tráfego novo.
3. **Boot** — Puma sobe, eager load, health check passa.
4. **Cutover** — o proxy aponta para o processo novo.

Se você inverte 2 e 4, o request novo cai em schema velho. 500. Isso é o que a entrevista quer ouvir.

**Quando usar:**
Sempre. Local com `bin/rails s` não é deploy. Staging que “a gente sobe na mão” também precisa das quatro fases, senão o ensaio mente.

**Na entrevista:**
> "Deploy é build, migrate, boot, cutover. Migration quebra se rodar depois do tráfego. Ferramenta é detalhe."

---

## Quatro ferramentas, nenhuma religião

**O que é:**
Quatro jeitos comuns de cumprir o contrato. Rails 8 gera Kamal. Time antigo fala Capistrano. PaaS fala Heroku ou Render. Nenhum deles é “o jeito Rails”. O jeito Rails é o contrato.

**Como funciona:**

| Ferramenta | Onde roda | Você gerencia | Release típico |
|---|---|---|---|
| **Kamal** | VPS seu, Docker | servidor, proxy, ENV | hook / container one-off antes do proxy virar |
| **Capistrano** | VPS, checkout SSH | servidor, nginx, systemd | `deploy:migrate` e depois restart |
| **Heroku** | dyno gerenciado | quase nada de SO | *release phase* no `Procfile` |
| **Render** | serviço gerenciado | quase nada de SO | *release command* no dashboard / `render.yaml` |

```ruby
# Heroku Procfile — Render é o mesmo contrato no release command
web: bundle exec puma -C config/puma.rb
release: bundle exec rails db:migrate
```

Kamal fala container: build, registry, proxy troca o container. Migration não é mágica — você declara o hook. Esquecer o hook é o bug clássico.

Capistrano fala diretório: `releases/…`, symlink `current`. Assets e migrate rodam no release novo **antes** do restart; o `current` velho ainda atende. Heroku e Render falam slug: sem SSH. Release command roda **antes** do roteamento novo. Sem essa linha, a dyno sobe e o schema fica atrás.

**Quando usar:**
- Quer VPS e Docker, pouco YAML de PaaS → Kamal.
- Já tem nginx + rbenv + Capistrano estável → não reescreve por moda.
- Não quer servidor → Heroku ou Render.
- Entrevista pede “qual você usa?” → descreve o contrato e **um** que você rodou. Não evangeliza.

**Na entrevista:**
> "Rails 8 empurra Kamal, mas eu não trato isso como religião. Capistrano, Heroku e Render fazem o mesmo: build, migrate no release, Puma, proxy. Eu escolho pela ops do time, não pelo tweet."

---

## Puma

**O que é:**
O servidor HTTP default do Rails. Em produção ele é processo longo: workers (processos) × threads. Fica atrás de um proxy (nginx, Kamal Proxy, roteador do PaaS). O proxy termina TLS e manda HTTP interno.

**Como funciona:**
```ruby
# config/puma.rb — Rails 7.1+
threads ENV.fetch("RAILS_MIN_THREADS", 5), ENV.fetch("RAILS_MAX_THREADS", 5)
port ENV.fetch("PORT", 3000)
workers ENV.fetch("WEB_CONCURRENCY", 2) if ENV["RAILS_ENV"] == "production"
preload_app!
```

- **Thread** — request no mesmo processo. Pool do Active Record ≥ threads.
- **Worker** — processo separado. Isola GIL. Custa RAM.
- **`preload_app!`** — carrega o Rails antes do fork (copy-on-write).
- **`PORT`** — PaaS injeta. Você não hardcoda 3000 em produção.

Restart simples mata o processo: 502 se o proxy não tiver outro. Phased (`SIGUSR1`) sobe worker novo e drena o velho. `kill -9` não é deploy. Unicorn/Passenger são legado; entrevista aceita “Puma cluster, thread no pool, atrás do proxy”.

**Quando usar:**
Sempre no `web` do Procfile / container. Job não é Puma — é Sidekiq noutro processo. Misturar web e worker no mesmo dyno é economia que quebra no primeiro pico.

**Exemplo prático:**
```ruby
# database.yml — pool acompanha thread
production:
  url: <%= ENV.fetch("DATABASE_URL") %>
  pool: <%= ENV.fetch("RAILS_MAX_THREADS", 5) %>
```

`WEB_CONCURRENCY=2` e `RAILS_MAX_THREADS=5` → 10 conexões de web **por máquina**, sem contar Sidekiq. Estouro de pool no deploy é isso: thread subiu, pool não.

**Na entrevista:**
> "Puma em cluster. Thread vezes worker. Pool do AR >= RAILS_MAX_THREADS. Em produção fica atrás do proxy. Restart phased se for um host só; no PaaS o roteador troca a dyno."

---

## Assets precompile

**O que é:**
Em produção o Rails **não** compila CSS/JS no request. `config.assets.compile = false`. Você gera arquivo com digest em `public/assets` **no build**. O HTML aponta para `/assets/application-abc123.css`.

**Como funciona:**
```bash
# no build — imagem ou slug
SECRET_KEY_BASE_DUMMY=1 RAILS_ENV=production bundle exec rails assets:precompile
```

Rails 7.1+ tem `SECRET_KEY_BASE_DUMMY`. O precompile **boot** a app. Sem chave, o boot recusa. Dummy existe para o build **não** levar `SECRET_KEY_BASE` de verdade na layer do Docker. Em runtime você injeta a chave real.

Propshaft ou Sprockets mudam o pipeline. O contrato não: build gera digest, produção só serve estático (Puma, nginx ou CDN). `config.assets.compile = false`.

No PaaS o roteador serve `public/`. No VPS, nginx em `public/assets` com cache longo — o nome já tem hash. Sem digest, o cliente fica com CSS velho.

**Quando usar:**
View, mailer com asset, Propshaft. API JSON ainda boot a app no precompile: dummy continua valendo.

Não commite `public/assets`. Não ligue `assets.compile` em produção. Não copie `SECRET_KEY_BASE` real no `Dockerfile`.

**Na entrevista:**
> "Precompile no build. Produção não compila no request. Rails 7.1 tem SECRET_KEY_BASE_DUMMY para o Docker build não engolir a chave real."

---

## `db:migrate` no release

**O que é:**
Rodar as migrations **na janela de release**, com o código **novo** já no disco/imagem, **antes** do proxy mandar tráfego para o processo novo.

**Como funciona:**
```bash
# a linha que falta no script caseiro
RAILS_ENV=production bundle exec rails db:migrate
```

Ordem no quadro: código velho + schema velho → **migrate aditiva** → código velho + schema novo (ainda estável) → cutover → código novo + schema novo.

**Nunca**, se a migration é breaking: código novo + schema velho → 500 (coluna não existe) → migrate “quando estabilizar”. Tarde demais.

Breaking: rename, drop, `NOT NULL` sem default, mudar tipo. Um release só não basta. Expand/contract: adiciona, deploy que lê os dois, backfill, deploy que lê só o novo, remove.

**Quando usar:**
Toda mudança de schema. Dado (`db:seed`) **não** entra no release automático. Seed em produção é one-off consciente, não hábito.

**Exemplo prático:**
```ruby
# RUIM — um release, quebra quem está no meio
class RenameNameOnUsers < ActiveRecord::Migration[7.1]
  def change
    rename_column :users, :name, :full_name
  end
end

# BOM — expand
class AddFullNameToUsers < ActiveRecord::Migration[7.1]
  def change
    add_column :users, :full_name, :string
  end
end
# código novo escreve nos dois, lê full_name || name
# release seguinte remove name
```

**Na entrevista:**
> "Migrate no release, antes do tráfego novo. Se a migration quebra o código velho, eu não faço no mesmo corte: expand, deploy, contract. Nunca migrate depois que o cliente já bateu no código novo."

---

## Zero-downtime

**O que é:**
Deploy em que o cliente não toma 502. Não é “deploy rápido”. É overlap: processo novo saudável **antes** de matar o velho. Schema e asset têm que ser compatíveis com **os dois** códigos no overlap.

**Como funciona:**
- **PaaS** — Heroku/Render sobe dyno nova, health check, vira o roteador, mata a velha.
- **Kamal** — proxy troca o container quando a porta responde.
- **Capistrano + Puma** — phased restart, ou nginx com dois upstreams.
- **Um processo só, `pkill puma`** — downtime. Não chame de zero-downtime.

Health check tem que ser barato e honesto: `GET /up` (Rails 7.1 já gera) bate no rack, não no Postgres se você só quer “o Puma aceita TCP”. Check fundo demais falha no deploy por causa de lock de migrate.

Durante o overlap existem **dois bins**. Por isso:

- Migration aditiva sobrevive.
- Rename no mesmo release não sobrevive.
- Asset novo com digest novo: o HTML velho ainda pede o digest velho. Não apague `public/assets` do release anterior no mesmo segundo do cutover.

**Quando usar:**
App com usuário na frente. Manutenção 3h da manhã ainda precisa do mesmo contrato — o relógio não conserta schema breaking.

**Na entrevista:**
> "Zero-downtime é overlap de processo. Os dois códigos veem o mesmo schema. Por isso migrate breaking e zero-downtime não combinam no mesmo release."

---

## `SECRET_KEY_BASE` e `RAILS_MASTER_KEY`

**O que é:**
Dois segredos que a entrevista mistura. `secret_key_base` assina cookie e session (capítulo 5.8). `RAILS_MASTER_KEY` é a senha do `credentials.yml.enc`. Um não substitui o outro.

**Como funciona:**
```bash
# runtime — PaaS / Kamal secrets / systemd
RAILS_MASTER_KEY=...          # abre credentials
# ou, se você não usa credentials em prod:
SECRET_KEY_BASE=...           # assina direto
```

Boot em produção:

1. Tem `RAILS_MASTER_KEY` (ou `config/master.key`) → abre o `.enc` → lê `secret_key_base`.
2. Tem `SECRET_KEY_BASE` no ENV → o Rails aceita, mesmo sem abrir credentials.
3. Não tem nenhum → **boot recusa**. Melhor que subir com chave vazia.

`master.key` não vai na imagem. `SECRET_KEY_BASE` real não vai no `Dockerfile` nem no log do CI. Build usa dummy; runtime usa a chave de verdade. Trocar `secret_key_base` desloga todo mundo — não é “reinicia o Puma”. Heroku/Render geram `SECRET_KEY_BASE` se você não manda credentials. Kamal/Capistrano não inventam: você injeta.

**Quando usar:**
Credentials + `RAILS_MASTER_KEY` quando o time já vive de `credentials:edit`. `SECRET_KEY_BASE` puro no ENV quando o PaaS já injeta e você não quer o `.enc` no boot. Os dois ao mesmo tempo, com valores diferentes, é confusão: escolha uma fonte e documente.

**Na entrevista:**
> "MASTER_KEY abre o cofre. SECRET_KEY_BASE é o que assina a session. No Docker build eu uso DUMMY. No runtime, ENV. master.key no git ou na layer da imagem é incidente."

---

## Importante na entrevista

Desenhe o overlap. Fale “antes do tráfego”, não “no deploy” — deploy é palavra larga.

Checklist sem brand: build com asset e sem segredo real; `db:migrate` no release **antes** do cutover; breaking = expand/contract; Puma atrás do proxy com pool = thread; chave só no runtime; `/up` antes de matar o processo velho.

“Kamal ou Heroku?” → “depende se a gente quer VPS”. Depois volte para migrate e chave. É aí que júnior erra.

---

## Recapitulando

- Deploy tem contrato: build → migrate → boot → cutover.
- Kamal, Capistrano, Heroku, Render só implementam o contrato. Sem religião.
- Puma: worker × thread, `PORT`, pool do AR junto.
- Asset precompile no build. `SECRET_KEY_BASE_DUMMY` no Docker.
- `db:migrate` no release, nunca depois do tráfego se for breaking.
- Zero-downtime exige schema compatível com os dois códigos.
- `RAILS_MASTER_KEY` abre credentials. `SECRET_KEY_BASE` assina session.

---

## Exercícios práticos

### Exercício 1: migrate antes ou depois?

**Enunciado:** Você mergeou uma branch que adiciona `users.phone` e um `User#phone` obrigatório na tela. O CI passou. O colega quer: “sobe o Puma e a gente roda `db:migrate` quando o New Relic estabilizar”. O que você responde, e em que momento a migrate roda no Heroku / Render / Capistrano / Kamal?

<details>
<summary>Solução</summary>

Recusa o plano. Código novo lê `phone`. Sem coluna, o primeiro request 500. “Estabilizar” é tráfego real.

A migrate roda **no release, antes do cutover**:

- Heroku: `release: bundle exec rails db:migrate` no `Procfile`.
- Render: release command.
- Capistrano: `deploy:migrate` no release novo, **antes** do restart / symlink final.
- Kamal: hook / job one-off na imagem nova, **antes** do proxy virar.

`phone` é aditiva — pode até rodar um pouco antes do código novo. O que não pode é **depois** do tráfego no código novo.

**Pontos-chave:**
- Breaking para o código novo = migrate antes ou com o release
- “Depois que estabilizar” é depois do cliente
- Ferramenta muda o nome do hook, não a ordem
</details>

### Exercício 2: a imagem não pode levar a chave

**Enunciado:** O Dockerfile de build falha em `rails assets:precompile` com erro de `secret_key_base`. Um dev sugere `ENV SECRET_KEY_BASE=o-valor-de-producao` no Dockerfile. Outro sugere commitar `config/master.key`. O que você faz no Rails 7.1+?

<details>
<summary>Solução</summary>

Nenhum dos dois. A chave real não entra na layer nem no git.

```bash
# stage de build
ENV SECRET_KEY_BASE_DUMMY=1
RUN RAILS_ENV=production bundle exec rails assets:precompile
```

No runtime (Kamal secrets, Heroku config, Render env):

```bash
RAILS_MASTER_KEY=...    # se a app abre credentials
# e/ou
SECRET_KEY_BASE=...     # se a fonte da assinatura é o ENV
```

Dummy só vale no precompile. O Puma de produção com dummy assina cookie com chave pública e previsível — não sobe assim.

**Pontos-chave:**
- Precompile boot a app, por isso pede chave
- Rails 7.1: `SECRET_KEY_BASE_DUMMY=1`
- Runtime ≠ build
</details>

### Exercício 3: rename com “zero-downtime”

**Enunciado:** Time quer `rename_column :orders, :total, :total_cents` e deploy Kamal no horário comercial, “porque o proxy é zero-downtime”. Isso funciona? Como você quebra o release?

<details>
<summary>Solução</summary>

Não funciona. Zero-downtime do proxy só overlap de **processo**. No overlap, container velho ainda roda `orders.total`. A migration já renomeou. O processo velho 500. Ou o inverso: você vira o proxy primeiro, código novo busca `total_cents`, coluna ainda é `total`. 500.

Três releases:

1. `add_column :total_cents`. Código escreve nos dois, lê o que existir.
2. Backfill + código só em `total_cents`.
3. `remove_column :total`.

Cada um com migrate no release, **antes** do tráfego daquele código.

**Pontos-chave:**
- Proxy zero-downtime ≠ schema zero-downtime
- Rename é duas colunas por um tempo
- Migrate breaking não acompanha cutover único
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
