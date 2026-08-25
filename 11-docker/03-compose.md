# 11.3 Compose

> **TL;DR**
> Compose descreve vários containers num YAML. Rails local típico: `web` + `db` + `redis`. Hostname do outro service é o nome dele, não `localhost`. `depends_on` só espera o container subir — Postgres ainda pode estar no `initdb`. Healthcheck diz “aceita conexão”. Volume nomeado guarda o data dir do Postgres. `DATABASE_URL` e `REDIS_URL` apontam para `db` e `redis`. `docker compose up` sobe o stack. Worker/Sidekiq não entra aqui.

## Conteúdo

- [O que é Compose](#o-que-é-compose)
- [services: web, db e redis](#services-web-db-e-redis)
- [Rede: o nome do service é o host](#rede-o-nome-do-service-é-o-host)
- [depends_on vs healthcheck](#depends_on-vs-healthcheck)
- [ENV, DATABASE_URL e REDIS_URL](#env-database_url-e-redis_url)
- [Volume do Postgres](#volume-do-postgres)
- [docker compose up](#docker-compose-up)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que é Compose

**O que é:**
Compose lê um YAML e sobe um conjunto de containers como um projeto. Um arquivo, uma rede, um `up`. Você não cola três `docker run` e reza para a ordem bater.

O arquivo se chama `compose.yaml` ou `docker-compose.yml`. Em entrevista os dois passam. Compose V2 é o plugin: `docker compose`, com espaço. O binário antigo com hífen (`docker-compose`) é o V1. Hoje você fala o V2.

A chave `version:` no topo do YAML morreu no spec. Não coloque.

**Como funciona:**
Você declara `services`, `volumes` e, se precisar, `networks`. Compose cria uma rede default. Todo service nessa rede resolve o outro pelo nome.

**Quando usar:**
Dev local com Rails + Postgres + Redis. CI que sobe o mesmo stack. Não é orquestrador de produção — isso é Kubernetes, ECS, o PaaS. Compose em prod existe; em entrevista você separa “sobe o time” de “orquestra cluster”.

**Na entrevista:**
> "Compose é o YAML do stack. Um `docker compose up` sobe web, Postgres e Redis na mesma rede. Não substitui Kubernetes."

---

## services: web, db e redis

**O que é:**
Service é o processo que você quer rodando. Não é “um Dockerfile”. Pode ser `build: .` (sua imagem) ou `image:` (oficial).

Stack mínimo de Rails neste capítulo:

| Service | Papel |
|---|---|
| `web` | Puma / `bin/rails server` |
| `db` | Postgres |
| `redis` | cache, session, Action Cable |

Fila e worker ficam no capítulo 12. Aqui o Redis é store, não Sidekiq.

**Exemplo prático:**
```yaml
services:
  web:
    build: .
    command: bin/rails server -b 0.0.0.0 -p 3000
    ports:
      - "3000:3000"
    environment:
      RAILS_ENV: development
      DATABASE_URL: postgres://loja:loja@db:5432/loja_development
      REDIS_URL: redis://redis:6379/0
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - .:/rails

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: loja
      POSTGRES_PASSWORD: loja
      POSTGRES_DB: loja_development
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U loja -d loja_development"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
```

`web` faz `build`. `db` e `redis` puxam imagem oficial. Bind mount `.:/rails` é dev: você edita no host, o container vê. Em produção você não monta o código assim — a imagem já tem o release.

`-b 0.0.0.0` importa. Puma em `127.0.0.1` só escuta o próprio container. O `ports: "3000:3000"` publica no host; se o processo não escuta `0.0.0.0`, o browser no laptop não entra.

**Na entrevista:**
> "Três services: web com build da app, Postgres e Redis oficiais. Hostname é o nome do service. Worker eu não coloco nesse YAML de intro — é outro processo, outro capítulo."

---

## Rede: o nome do service é o host

**O que é:**
Compose cria uma bridge network para o projeto. DNS interno: `db` resolve o container do Postgres. `redis` resolve o Redis.

**Como funciona:**
```text
laptop:3000  -->  web:3000  -->  db:5432
                            -->  redis:6379
```

`localhost` **dentro** do `web` é o próprio `web`. Não é o Postgres. Não é o seu Mac. `DATABASE_URL` com `localhost:5432` falha, ou pior: acerta um Postgres que não é o do Compose.

Porta publicada (`"5432:5432"`) é para o host. Container fala com container pela rede interna, na porta **do container**, sem mapear.

**Quando usar:**
Sempre o hostname do service na URL. Publique porta só o que o humano no laptop precisa: `3000` do Rails. Postgres e Redis podem ficar sem `ports` se ninguém no host conecta.

**Na entrevista:**
> "localhost no container é o container. DATABASE_URL usa o host `db`. Publicar 5432 é conveniência do host, não é o que o Rails dentro da rede usa."

---

## depends_on vs healthcheck

**O que é:**
`depends_on` ordena o start. Sem condição, espera o container **existir**. Postgres existe no segundo 1 e só aceita conexão no segundo 8, no meio do `initdb`.

Healthcheck é um comando periódico. `healthy` quer dizer: o processo respondeu. `pg_isready` para Postgres. `redis-cli ping` para Redis.

**Como funciona:**
```yaml
# RUIM — web sobe quando o processo do Postgres existe
depends_on:
  - db

# BOM — web espera o healthcheck passar
depends_on:
  db:
    condition: service_healthy
```

Sintoma clássico: `ActiveRecord::ConnectionNotEstablished` / `could not connect to server` no primeiro boot. Você corre `docker compose restart web` e “funciona”. Não funcionou. Você ganhou a corrida na segunda tentativa.

`condition: service_started` é o default antigo com outro nome. `service_healthy` exige o bloco `healthcheck` no service alvo. Sem healthcheck, o Compose não tem o que esperar.

`service_completed_successfully` é para one-shot (migrate, seed). Não é o caso do Postgres.

**Quando usar:**
Healthcheck em banco e Redis. `depends_on` com `service_healthy` no `web`. Não use `sleep 10` no entrypoint como “solução”.

**Exemplo prático:**
```yaml
db:
  image: postgres:16
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U loja -d loja_development"]
    interval: 5s
    timeout: 5s
    retries: 5
    start_period: 10s
```

`start_period` dá folga no primeiro `initdb`. Falha ali não conta como retry. Depois, falha repetida marca `unhealthy`.

**Na entrevista:**
> "depends_on sozinho não espera o Postgres aceitar conexão. Healthcheck com pg_isready e condition service_healthy. Sleep no entrypoint é gambiarra."

---

## ENV, DATABASE_URL e REDIS_URL

**O que é:**
O Rails não adivinha o host do Compose. Você passa URL. Active Record lê `DATABASE_URL` sozinho e sobrescreve o `config/database.yml` daquele environment. Redis não tem esse mágico universal: você aponta `REDIS_URL` no cache, no Cable, no que for.

**Como funciona:**
```yaml
web:
  environment:
    DATABASE_URL: postgres://loja:loja@db:5432/loja_development
    REDIS_URL: redis://redis:6379/0
    RAILS_ENV: development
  env_file:
    - .env
```

`environment` no YAML ganha do `env_file` na mesma chave. Segredo que não pode ir pro git fica no `.env` (e no `.gitignore`). URL de dev com senha `loja` no YAML de exemplo passa; senha de produção no repositório não passa.

```ruby
# Active Record — já lê ENV["DATABASE_URL"]
# config/database.yml ainda existe para quem roda sem Compose

# cache — você liga
# config/environments/development.rb
config.cache_store = :redis_cache_store, { url: ENV.fetch("REDIS_URL") }
```

```yaml
# config/cable.yml
development:
  adapter: redis
  url: <%= ENV.fetch("REDIS_URL", "redis://localhost:6379/1") %>
```

Formato da URL:

```text
postgres://USER:PASSWORD@HOST:5432/DB_NAME
redis://HOST:6379/DB_INDEX
```

`HOST` = nome do service. `DB_INDEX` do Redis é o número lógico (`0`, `1`), não um database SQL. Default `localhost` no `fetch` é para quem roda Rails no host, sem Compose. Dentro do `web`, tire o default ou use o host `redis`.

**Quando usar:**
Uma URL por dependência. Não espalhe `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER` no Rails se a URL resolve. Imagem oficial do Postgres ainda precisa de `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` — isso é o **servidor** criando o role e o database, não o client Rails.

**Na entrevista:**
> "DATABASE_URL o Active Record já honra. Host é `db`, não localhost. REDIS_URL eu passo pro cache store e pro cable.yml. Não misturo a URL do Rails com as ENV que só o container do Postgres entende."

---

## Volume do Postgres

**O que é:**
Container é efêmero. Sem volume, `docker compose down` e o `initdb` recomeça: usuário some, tabela some, seed some.

O data dir do Postgres 16 é `/var/lib/postgresql/data`. Você monta um **named volume** aí. Compose cria e gerencia. Não é a pasta do projeto.

**Como funciona:**
```yaml
db:
  volumes:
    - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

Dois tipos que caem em pergunta:

| Tipo | Exemplo | Uso |
|---|---|---|
| Named volume | `postgres_data:/var/lib/postgresql/data` | dado do banco |
| Bind mount | `.:/rails` | código em dev |

Named volume sobrevive a `compose down`. Morre com `compose down -v`. Bind mount é o diretório real no disco do host.

Não bind-monte o data dir do Postgres numa pasta do repo. Permissão, fs do Mac, performance e um `git clean` doido. Volume nomeado.

**Quando usar:**
Sempre no Postgres de dev. Redis de cache pode viver sem persistir — perde chave, recalcula. Se o Redis for session que você não quer perder a cada `down`, aí volume. Default deste capítulo: volume no `db`, Redis efêmero.

**Na entrevista:**
> "Volume nomeado no data dir do Postgres. down sem -v mantém o dado. down -v zera o banco. Código da app é bind mount em dev, não o PGDATA."

---

## docker compose up

**O que é:**
`docker compose up` lê o YAML, cria rede e volume, builda o que tem `build`, puxa imagem, sobe na ordem do `depends_on`. Foreground: log de todo mundo no terminal. Ctrl+C manda parar.

**Como funciona:**
```bash
docker compose up
docker compose up -d          # detached
docker compose up --build     # rebuild da imagem do web
docker compose ps
docker compose logs -f web
docker compose exec web bin/rails db:prepare
docker compose stop
docker compose down           # container e rede; volume fica
docker compose down -v        # apaga o volume do Postgres
```

`up` não é migrate. Postgres healthy ≠ schema no ar. Depois do up: `exec web bin/rails db:prepare`. `db:prepare` cria o database se faltar e roda migration. Em dev é o comando certo; `db:setup` ainda dropa se existir — não é o hábito do dia a dia.

`exec` entra num container **já up**. `run` cria um container avulso. Para `rails c` e `db:prepare`, `exec`.

Vários arquivos: `docker compose -f compose.yaml -f compose.override.yaml up`. Override de dev (bind mount, porta) não precisa ir pro YAML de CI. Só fale se perguntarem.

**Quando usar:**
`up --build` quando o Dockerfile ou o Gemfile mudou. `up` puro quando só o código Ruby mudou e você já tem bind mount. `down -v` quando o schema local está irrecuperável e você aceita perder o dado.

**Na entrevista:**
> "compose up sobe o stack. Healthcheck segura o web. Migration é exec depois, não mágica do up. down tira container; down -v tira o Postgres."

---

## Recapitulando

- Compose V2: `docker compose`, YAML sem `version:`.
- Três services: `web` (build), `db` (Postgres), `redis` (store). Sem worker neste capítulo.
- Hostname = nome do service. `localhost` no `web` é o `web`.
- `depends_on` sem healthcheck só espera o processo existir.
- `pg_isready` + `condition: service_healthy` espera o banco aceitar conexão.
- `DATABASE_URL` o Active Record lê. Host `db`.
- `REDIS_URL` você liga no cache e no Cable.
- Named volume no PGDATA. Bind mount no código, em dev.
- `up` sobe. `db:prepare` via `exec`. `down -v` apaga dado.

---

## Exercícios práticos

### Exercício 1: Connection refused no primeiro boot

**Enunciado:** O YAML tem `depends_on: [db]`. Sem healthcheck. `docker compose up` sobe o `web` e o Rails explode com connection refused no Postgres. No segundo `restart` passa. Por quê? Como você corrige no Compose?

<details>
<summary>Solução</summary>

`depends_on` sem condição espera o container do Postgres **iniciar**. O processo `postgres` já existe; o `initdb` e o listen em `5432` ainda não. O Puma corre na frente.

```yaml
db:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U loja -d loja_development"]
    interval: 5s
    timeout: 5s
    retries: 5

web:
  depends_on:
    db:
      condition: service_healthy
```

**Pontos-chave:**
- Container up ≠ porta aceitando
- Healthcheck é o sinal
- `sleep` no entrypoint não é a resposta de entrevista
</details>

### Exercício 2: Monte as URLs

**Enunciado:** Services se chamam `web`, `db` e `redis`. User/senha/db do Postgres: `loja` / `loja` / `loja_development`. Redis no índice `0`. O candidato colou `DATABASE_URL=postgres://loja:loja@localhost:5432/loja_development` no service `web`. O que está errado? Escreva as duas URLs certas.

<details>
<summary>Solução</summary>

`localhost` dentro do `web` não é o service `db`.

```text
DATABASE_URL=postgres://loja:loja@db:5432/loja_development
REDIS_URL=redis://redis:6379/0
```

**Pontos-chave:**
- Host = nome do service na rede do Compose
- Porta é a do container (5432, 6379), não a publicada no laptop
- Active Record honra `DATABASE_URL`; Redis precisa de config que leia `REDIS_URL`
</details>

### Exercício 3: O dado sumiu

**Enunciado:** Dev rodou `docker compose down -v` porque o `web` não subia. No `up` seguinte o Postgres estava vazio. Explique o que o `-v` fez e por que o bind mount `.:/rails` não salvou as tabelas. O que você monta para o dado sobreviver a um `down` sem `-v`?

<details>
<summary>Solução</summary>

`-v` remove os named volumes do projeto. O data dir do Postgres vivia em `postgres_data`. Volume sumiu, próximo start faz `initdb` do zero.

`.:/rails` é o código da app no host. Schema real está nos arquivos de `db/migrate`. Dado (linhas da tabela) estava no volume, não no repo.

```yaml
db:
  volumes:
    - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

`docker compose down` (sem `-v`) tira container e rede. Volume fica. `db:prepare` no próximo up só aplica o que faltar.

**Pontos-chave:**
- Dado do Postgres ≠ código da app
- Named volume no PGDATA
- `-v` é destrutivo; não é “force restart”
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
