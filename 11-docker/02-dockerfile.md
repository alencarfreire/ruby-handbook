# 11.2 Dockerfile

> **TL;DR**
> Dockerfile é a receita da imagem. Base: `ruby:3.3-slim`, não Alpine. Copie `Gemfile` e `Gemfile.lock` primeiro, rode `bundle install`, só depois copie o resto — cache de camada. Multi-stage: compilador no stage de build, runtime magro no final. Node entra no build se você empacota JS/CSS; some na imagem final. Não rode como root. `.dockerignore` impede copiar `.git`, `log`, `tmp`. `ENTRYPOINT` prepara o processo; `CMD` é o comando padrão. Rails 7.1+ gera Dockerfile, `.dockerignore` e `bin/docker-entrypoint`.

## Conteúdo

- [O que é um Dockerfile](#o-que-é-um-dockerfile)
- [FROM ruby slim](#from-ruby-slim)
- [Cache de camadas](#cache-de-camadas)
- [Multi-stage](#multi-stage)
- [Node e assets](#node-e-assets)
- [Não rode como root](#não-rode-como-root)
- [.dockerignore](#dockerignore)
- [CMD vs ENTRYPOINT](#cmd-vs-entrypoint)
- [Dockerfile padrão do Rails 7.1](#dockerfile-padrão-do-rails-71)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que é um Dockerfile

**O que é:**
Arquivo de texto com instruções para o Docker montar uma imagem. Cada instrução vira uma camada. A imagem é imutável; o container é uma instância rodando.

**Como funciona:**
Você descreve o ambiente: base, pacotes, gems, código, usuário, comando de start.

```dockerfile
FROM ruby:3.3-slim
WORKDIR /rails
COPY Gemfile Gemfile.lock ./
RUN bundle install
COPY . .
CMD ["./bin/rails", "server", "-b", "0.0.0.0"]
```

Esboço. Produção pede slim de verdade, cache, multi-stage e usuário sem root. `docker build -t loja:latest .`

**Na entrevista:**
> "Dockerfile é a receita. Imagem é o resultado. Container é o processo. Eu não copio a pasta inteira e rezo — eu ordeno as camadas pelo que muda menos."

---

## FROM ruby slim

**O que é:**
`FROM` escolhe a imagem base. Tudo que vem depois empilha em cima dela.

`ruby:3.3-slim` é Debian enxuto com MRI. É a linha que o Rails 7.1 gera. Combine a tag com `.ruby-version` e o `Gemfile`.

**Como funciona:**
```dockerfile
ARG RUBY_VERSION=3.3.6
FROM ruby:$RUBY_VERSION-slim AS base

WORKDIR /rails
```

Três famílias que caem em pergunta:

| Base | Quando | Cuidado |
|---|---|---|
| `ruby:3.3-slim` | Padrão Rails | glibc, gems nativas ok |
| `ruby:3.3` | Debug rápido | imagem gorda, não é deploy |
| `ruby:3.3-alpine` | Quase nunca | musl; `nokogiri`, `pg`, `psych` sofrem |

Alpine economiza megabytes e custa horas. Compilar gem nativa em musl não é o mesmo que em Debian.

No stage final você instala só o que o processo precisa em runtime: cliente do Postgres, `libvips` se usa Active Storage, curl para healthcheck. Compilador (`build-essential`, `libpq-dev`) fica no stage de build.

**Quando usar:**
Sempre pin a versão. `ruby:latest` hoje não é a mesma imagem daqui a seis meses.

**Na entrevista:**
> "Eu parto de `ruby:3.3-slim`. Alpine parece esperto e quebra gem nativa. A tag segue o `.ruby-version`."

---

## Cache de camadas

**O que é:**
O Docker reutiliza uma camada se a instrução e o contexto não mudaram. A primeira linha que muda invalida tudo abaixo.

Gems mudam pouco. Código muda o tempo todo. Se você `COPY . .` antes do `bundle install`, cada commit reinstalando `rails` e `pg`.

**Como funciona:**
```dockerfile
# Muda raro — cache vive
COPY Gemfile Gemfile.lock ./
RUN bundle install --jobs 4 --retry 3

# Muda sempre — fica por último
COPY . .
```

Ordem que vale a pena decorar:

1. Pacotes do sistema (`apt-get`) — quase nunca mudam.
2. `Gemfile` + `Gemfile.lock` + `bundle install`.
3. `package.json` + lock + install de JS, se existir.
4. O resto da app.
5. `assets:precompile`, se o build precisa.

`apt-get update` e `install` na mesma linha. `RUN` separado deixa cache podre.

**Exemplo prático:**
```dockerfile
ENV RAILS_ENV=production \
    BUNDLE_DEPLOYMENT=1 \
    BUNDLE_WITHOUT=development:test \
    BUNDLE_PATH=/usr/local/bundle

COPY Gemfile Gemfile.lock ./
RUN bundle install && rm -rf ~/.bundle "${BUNDLE_PATH}"/ruby/*/cache
COPY . .
```

Sem `Gemfile.lock` no COPY, o bundle não é reproduzível.

**Na entrevista:**
> "Copio Gemfile e lock, instalo gems, copio o código. Cache de camada. COPY . no começo é o jeito de tornar o build lento de propósito."

---

## Multi-stage

**O que é:**
Vários `FROM` no mesmo Dockerfile. Um stage compila. Outro só roda. Você copia artefato, não ferramenta.

**Como funciona:**
O stage `build` tem compilador, headers, Node. O stage final parte de `base` de novo: sem `gcc`, sem `yarn`, sem cache de gem.

```dockerfile
FROM ruby:3.3-slim AS base
WORKDIR /rails

FROM base AS build
# build-essential, libpq-dev, Node, bundle, assets

FROM base
COPY --from=build /usr/local/bundle /usr/local/bundle
COPY --from=build /rails /rails
```

A imagem publicada é o último stage, salvo `--target`.

**Quando usar:**
Produção e CI. Gem nativa. Compose de desenvolvimento com volume não precisa disso — próximo capítulo.

**Na entrevista:**
> "Multi-stage: build gordo, runtime magro. Compilador não vai para produção. Copio bundle e app com COPY --from."

---

## Node e assets

**O que é:**
Sprockets clássico e Importmap não precisam de Node na imagem final. `jsbundling-rails` / `cssbundling-rails` precisam de Node **no build** para gerar `public/assets`.

**Como funciona:**
No stage `build`, se a app tem `package.json`:

```dockerfile
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile
```

`SECRET_KEY_BASE_DUMMY=1` existe no Rails 7.1+ para precompile sem `RAILS_MASTER_KEY` no CI. Você não vaza a master key no `docker build`.

Na imagem final: arquivos já compilados em `public/assets`. Sem `node_modules`. Sem Node.

API-only sem asset pipeline: pule o bloco inteiro. Não instale Node “porque Rails”.

**Na entrevista:**
> "Node é ferramenta de build, não runtime da API. Importmap não precisa. Se eu empacoto JS, Node fica no stage de build e some no final."

---

## Não rode como root

**O que é:**
Container como root é processo como root no kernel do host, com namespaces. RCE vira problema maior. Imagem de produção cria um usuário e troca com `USER`.

**Como funciona:**
```dockerfile
RUN useradd rails --create-home --shell /bin/bash && \
    chown -R rails:rails db log storage tmp
USER rails
```

O processo precisa escrever em `tmp`, `log`, `storage` e às vezes `db` (SQLite). O resto da app pode ser só leitura.

Não use `USER root` no final “só para o entrypoint criar pasta”. Ajuste o `chown` no build.

**Na entrevista:**
> "Não rodo como root. useradd, chown em tmp/log/storage, USER rails. É a primeira coisa que eu olho num Dockerfile de candidato."

---

## .dockerignore

**O que é:**
Lista o que **não** entra no contexto do build. Sem ele, `COPY . .` manda `.git`, `log`, `tmp`, `node_modules` local, `.env`.

Contexto grande: build lento. `.env` no contexto: risco de secret na imagem.

**Exemplo prático:**
```gitignore
.git
log
tmp
node_modules
vendor/bundle
storage
.env
.env.*
/public/assets
```

O template do Rails 7.1 já traz um `.dockerignore`. Leia antes de copiar o da internet.

**Na entrevista:**
> ".dockerignore é o .gitignore do build. Sem ele eu copio .git e .env para a imagem. Secret no layer não some com um rm depois — a camada anterior continua lá."

---

## CMD vs ENTRYPOINT

**O que é:**
Os dois definem o que o container executa. A diferença é quem é o processo e o que o `docker run` substitui.

| Instrução | Papel |
|---|---|
| `ENTRYPOINT` | Processo fixo. Argumentos extra entram como args. |
| `CMD` | Comando padrão. `docker run imagem bash` substitui o CMD. |

Juntos: `ENTRYPOINT` é o wrapper; `CMD` é o default que o wrapper recebe.

**Como funciona:**
Forma exec (JSON). PID 1 recebe o binário de verdade. Sinal de stop chega no Puma, não num `sh -c`.

```dockerfile
ENTRYPOINT ["/rails/bin/docker-entrypoint"]
EXPOSE 3000
CMD ["./bin/rails", "server"]
```

`bin/docker-entrypoint` no Rails 7.1 tipicamente:

- remove `tmp/pids/server.pid` velho;
- se o comando é o server, pode rodar `db:prepare`;
- termina em `exec` no comando — não deixa shell zumbi.

```bash
# substitui só o CMD; o entrypoint continua
docker run loja ./bin/jobs

# CI / debug
docker run --rm loja ./bin/rails runner "puts User.count"
```

Forma shell (`CMD rails server`) envolve `/bin/sh -c`. `docker stop` não mata o Puma direito. Evite.

**Na entrevista:**
> "ENTRYPOINT prepara. CMD é o default. Forma exec, não shell. docker run troca o CMD; o entrypoint fica. exec no wrapper para o Rails ser PID 1."

---

## Dockerfile padrão do Rails 7.1

**O que é:**
A partir do Rails 7.1, `rails new` gera Docker de produção. Não é Compose de desenvolvimento. É imagem para Kamal / qualquer host que rode `docker run`.

Arquivos gerados:

- `Dockerfile` — multi-stage, `ruby:*-slim`, non-root, entrypoint.
- `.dockerignore` — contexto limpo.
- `bin/docker-entrypoint` — pid e prepare.

**Como funciona:**
O template faz o que este capítulo descreveu, na ordem certa:

1. `ARG RUBY_VERSION` alinhado ao projeto.
2. Stage `base` com env de production e `BUNDLE_PATH`.
3. Stage `build` com toolchain, `bundle install`, bootsnap, assets.
4. Stage final copia bundle + app, cria usuário `rails`, `USER`.
5. `ENTRYPOINT` no script, `CMD` no `rails server`.

Não decore linha a linha. Explique cada bloco. API-only: tire Node/assets. Postgres: client no runtime, `libpq-dev` no build. Rails 8 muda o `CMD` (Thruster); a entrevista cobra o modelo.

**Na entrevista:**
> "Rails 7.1 passou a gerar Dockerfile de produção. Multi-stage, slim, bundle cacheado, usuário rails, entrypoint. Eu parto dele e corto o que a app não usa."

---

## Recapitulando

- Dockerfile descreve camadas. Ordem é cache.
- Base: `ruby:X-slim` pinada. Alpine só se você topa musl.
- `COPY Gemfile Gemfile.lock` → `bundle install` → `COPY . .`
- Multi-stage: compilador no build, runtime magro.
- Node e `assets:precompile` no build; imagem final sem Node.
- `SECRET_KEY_BASE_DUMMY=1` no precompile. Master key não entra no build.
- Usuário não-root. `chown` em `tmp` / `log` / `storage`.
- `.dockerignore` fora `.git`, logs, `.env`.
- `ENTRYPOINT` wrapper + `CMD` default, ambos em forma exec.
- Rails 7.1+ já gera esse esqueleto. Leia antes de reescrever.

---

## Exercícios práticos

### Exercício 1: O build reinstala gems a cada commit

**Enunciado:** O Dockerfile começa com `COPY . .` e depois `RUN bundle install`. Cada mudança em `app/models/user.rb` reinstala todas as gems. Reescreva a ordem e explique o cache.

<details>
<summary>Solução</summary>

```dockerfile
COPY Gemfile Gemfile.lock ./
RUN bundle install
COPY . .
```

A camada do `bundle install` só invalida quando Gemfile ou lock mudam. Código da app fica nas camadas de baixo.

**Pontos-chave:**
- Primeira instrução que muda quebra o cache abaixo
- Lockfile entra no COPY — build reproduzível
- Pacotes apt ainda acima do Gemfile, se existirem
</details>

### Exercício 2: Por que não `USER root`?

**Enunciado:** Um Dockerfile de produção termina com `USER root` porque o entrypoint precisa gravar em `tmp/pids`. O que você muda e o que responde na entrevista?

<details>
<summary>Solução</summary>

Cria o usuário no build, dá dono só nos diretórios graváveis, troca o usuário **antes** do processo subir.

```dockerfile
RUN useradd rails --create-home --shell /bin/bash && \
    chown -R rails:rails db log storage tmp
USER rails
ENTRYPOINT ["/rails/bin/docker-entrypoint"]
CMD ["./bin/rails", "server"]
```

O entrypoint já roda como `rails`. Não precisa de root para apagar um pid.

**Pontos-chave:**
- Root no container amplia o impacto de um RCE
- `chown` no build, não no start
- `tmp`, `log`, `storage` (e `db` se SQLite) são o que o processo escreve
</details>

### Exercício 3: CMD, ENTRYPOINT e `docker run`

**Enunciado:** A imagem tem `ENTRYPOINT ["/rails/bin/docker-entrypoint"]` e `CMD ["./bin/rails", "server"]`. O que acontece em cada comando? Por que a forma shell é ruim?

```bash
docker run loja
docker run loja ./bin/jobs
docker run --entrypoint bash loja
```

<details>
<summary>Solução</summary>

1. `docker run loja` — entrypoint recebe `./bin/rails server`. Sobe o Puma (depois do prepare).
2. `docker run loja ./bin/jobs` — entrypoint continua; CMD é substituído. Sobe o worker.
3. `docker run --entrypoint bash loja` — ignora o ENTRYPOINT. Abre shell. Útil para debug, não para produção.

Forma shell (`CMD ./bin/rails server`) usa `sh -c`. O Ruby não é PID 1. `SIGTERM` do `docker stop` não chega limpo no Puma.

**Pontos-chave:**
- `docker run imagem args` troca o CMD
- `--entrypoint` troca o ENTRYPOINT
- Forma exec + `exec` no wrapper = sinal no processo certo
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
