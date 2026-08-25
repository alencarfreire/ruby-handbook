# 11.4 CI/CD

> **TL;DR**
> CI roda teste e checagem a cada PR. CD só entrega depois do verde. No Rails, o pipeline típico é RuboCop, Brakeman e RSpec no GitHub Actions, com cache de gems e Postgres como service. Deploy não parte da sua máquina: parte do job que depende dos jobs verdes. Na entrevista: CI é o portão. Vermelho não entra.

## Conteúdo

- [CI vs CD](#ci-vs-cd)
- [CI é o portão](#ci-é-o-portão)
- [GitHub Actions para Rails](#github-actions-para-rails)
- [Cache de gems](#cache-de-gems)
- [Postgres como service](#postgres-como-service)
- [RSpec, RuboCop e Brakeman](#rspec-rubocop-e-brakeman)
- [Deploy depois do verde](#deploy-depois-do-verde)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## CI vs CD

**O que é:**
CI é Continuous Integration. A cada push ou PR, a máquina roda o que você rodaria antes de pedir review: install, lint, segurança, specs.

CD é Continuous Delivery ou Continuous Deployment. Delivery deixa o artefato pronto para ir. Deployment empurra sozinho para o ambiente quando o pipeline está verde.

**Como funciona:**
O fluxo que você descreve na entrevista é linear:

1. Você abre o PR.
2. O CI clona, instala gems, sobe o banco, roda checagens.
3. Reviewer olha o diff com o status na mão.
4. Merge na `main` só com checks obrigatórios.
5. O job de deploy corre **depois** dos jobs de CI, não no lugar deles.

CI responde: “este commit está seguro de integrar?”. CD responde: “este commit verde pode ir para o servidor?”.

**Quando usar:**
CI em todo repositório com mais de uma pessoa — e mesmo no solo, porque você esquece de rodar Brakeman. CD quando o caminho de release é repetível: mesma imagem, mesmo `RAILS_ENV`, mesmos secrets, zero passo mágico no notebook.

**Na entrevista:**
> "CI integra e prova. CD entrega. Eu não misturo os dois no mesmo step. Teste falhou, o deploy nem começa."

---

## CI é o portão

**O que é:**
O portão não é o YAML. É a regra do repositório: branch protegida + status check obrigatório. Sem isso, o workflow é um enfeite verde que dá para ignorar.

**Como funciona:**
No GitHub você marca `ci / test` e `ci / lint` como required. Merge na `main` trava se RuboCop, Brakeman ou RSpec falhar. `admin` ainda consegue forçar — o time combina que não força.

O portão vale para o seu laptop também. “Passou na minha máquina” não é evidência. A evidência é o runner: Ubuntu limpo, Gemfile.lock, schema commitado, Postgres de verdade.

**Quando usar:**
Sempre que o código puder ir para `main`. Feature flag não substitui o portão: flag esconde comportamento, não esconde spec vermelho nem SQL injection que o Brakeman apontou.

**Importante na entrevista:**
Se te perguntarem “como você garante qualidade no merge?”, não comece pelo linter. Comece pelo portão: check obrigatório. Ferramenta sem regra é sugestão.

**Na entrevista:**
> "CI é o portão. O PR não entra vermelho. Review lê o diff; o pipeline lê o comportamento. Os dois."

---

## GitHub Actions para Rails

**O que é:**
GitHub Actions é o CI que a entrevista espera ouvir. Arquivo em `.github/workflows/ci.yml`. Evento dispara workflow. Workflow tem jobs. Job tem steps. Job sem `needs` corre em paralelo.

**Como funciona:**
```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ruby/setup-ruby@v1
        with:
          ruby-version: .ruby-version
          bundler-cache: true
      - run: bundle exec rubocop
      - run: bundle exec brakeman --no-pager

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: app_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd="pg_isready -U postgres"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5
    env:
      RAILS_ENV: test
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/app_test
    steps:
      - uses: actions/checkout@v4
      - uses: ruby/setup-ruby@v1
        with:
          ruby-version: .ruby-version
          bundler-cache: true
      - run: bin/rails db:schema:load
      - run: bundle exec rspec
```

Dois jobs. Lint não espera o RSpec. RSpec não espera o RuboCop. O portão espera os dois.

**Quando usar:**
PR e push na `main`. Não precisa de `workflow_dispatch` para o básico. Matrix de Ruby só se você mantém gem ou ainda está migrando versão — app interna na 3.3 não precisa de teatro de matrix.

**Exemplo prático:**
`ruby-version: .ruby-version` lê o mesmo arquivo da sua máquina. Runner e laptop não divergem de patch. `checkout@v4` vem antes do setup: sem código, não há Gemfile.

**Na entrevista:**
> "Eu separo lint e test. Os dois em paralelo. setup-ruby com bundler-cache. Postgres no services. schema:load, depois rspec."

---

## Cache de gems

**O que é:**
`bundle install` no runner frio baixa a internet. Cache de gems guarda o resultado do lock e reaproveita no próximo job se o `Gemfile.lock` não mudou.

**Como funciona:**
`ruby/setup-ruby` com `bundler-cache: true` faz o trabalho certo: instala Ruby, roda Bundler, chaveia o cache no hash do lock. Você **não** escreve `actions/cache` na mão para vendor/bundle — a action já conhece o layout.

```yaml
- uses: ruby/setup-ruby@v1
  with:
    ruby-version: .ruby-version
    bundler-cache: true
# não precisa de "bundle install" extra
```

Mudou o lock? Cache miss, install de novo, cache novo. Não mudou? Job sobe em segundos, não em minutos.

**Quando usar:**
Sempre. Spec de Rails sem cache vira fila cara e feedback lento. Feedback lento é PR que a gente mergeia “depois eu olho o CI”.

**Exemplo prático:**
Dois jobs (`lint` e `test`) compartilham a mesma chave de cache. O primeiro que terminar o install alimenta o segundo. Por isso o lock vai no git — sem lock, a chave muda o tempo todo e o cache não existe.

**Na entrevista:**
> "Eu cacheio gems pelo Gemfile.lock, com bundler-cache do setup-ruby. Não invento actions/cache. Sem lock commitado, cache não cola."

---

## Postgres como service

**O que é:**
Service no Actions é um container irmão do job. A app no runner fala `localhost:5432`. Não é Docker Compose da sua máquina. É o banco que o spec precisa para não mentir.

**Como funciona:**
O bloco `services.postgres` sobe a imagem, espera o healthcheck e publica a porta. Você passa `DATABASE_URL` apontando para `localhost`. `bin/rails db:schema:load` aplica o `db/schema.rb` — mais rápido e mais estável que rodar 200 migrations no CI.

SQLite no CI e Postgres em produção é a mentira clássica. Array, JSONB, constraint, `FOR UPDATE`: o spec verde no SQLite quebra no primeiro deploy.

Redis entra do mesmo jeito se o spec bate em cache ou Sidekiq. Sem isso, você stubba demais e o job de integração não prova integração.

**Quando usar:**
Todo spec que toca Active Record. Model spec com validação de uniqueness também: a uniqueness de verdade mora no índice único do banco.

**Exemplo prático:**
```yaml
env:
  RAILS_ENV: test
  DATABASE_URL: postgres://postgres:postgres@localhost:5432/app_test
  # RAILS_MASTER_KEY só se o boot de test lê credentials
  # RAILS_MASTER_KEY: ${{ secrets.RAILS_MASTER_KEY }}
```

Senha no service do CI de test pode ser fixa. Secret de produção nunca. `health-cmd` evita o Rails conectar no Postgres ainda subindo — o erro parece “banco recusou”, mas o banco só não tinha nascido.

**Na entrevista:**
> "Eu subo Postgres no services e carrego o schema. CI no SQLite e produção no Postgres eu não aceito. O spec tem que ver o mesmo dialeto."

---

## RSpec, RuboCop e Brakeman

**O que é:**
Três portões diferentes. RuboCop é estilo e algumas bugs triviais. Brakeman é SAST do Rails: SQL cru, render de user input, mass assignment óbvio. RSpec é comportamento. Um não cobre o outro.

**Como funciona:**
```yaml
# job lint — rápido, sem banco
- run: bundle exec rubocop
- run: bundle exec brakeman --no-pager

# job test — precisa do Postgres
- run: bin/rails db:schema:load
- run: bundle exec rspec
```

`--no-pager` no Brakeman importa: no CI não existe terminal para o `less`. Sem a flag, o job trava esperando Enter.

RuboCop falhou? Diff feio ou regra quebrada. Não mergeia. Brakeman falhou? Você ou corrige, ou justifica com warning ignorado **versionado** — não com `--no-exit-on-warn` escondido. RSpec falhou? Comportamento. Aí o reviewer nem discute formatação.

**Quando usar:**
Os três no mesmo workflow, jobs separados. Coverage (capítulo 8.7) pode ser step extra no job de test. Não troque RSpec por coverage: percentual alto com spec inútil passa no portão e mente na entrevista.

**Exemplo prático:**
App de pedidos. RuboCop pega `if` de 40 linhas. Brakeman pega `Order.where("id = #{params[:id]}")`. RSpec pega o estorno que credita duas vezes. Três falhas, três conversas. Sem CI, as duas primeiras só aparecem no code review se o reviewer estiver descansado.

**Na entrevista:**
> "RuboCop é forma. Brakeman é checagem estática de Rails. RSpec é o contrato. Eu rodo os três. CI verde sem spec não é qualidade — é linter."

---

## Deploy depois do verde

**O que é:**
CD no Actions é um job com `needs`. Ele só existe se lint e test passaram. E só na `main`. PR verde não deploya produção. Push na `main` verde deploya — ou deixa o artefato pronto, se o time prefere um clique.

**Como funciona:**
```yaml
  deploy:
    needs: [lint, test]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      # kamal, imagem, ou o script do capítulo 11.5
      - run: echo "só chega aqui com lint e test verdes"
```

`needs` é o portão técnico. `if` é o portão de branch. `environment` é o portão humano: secret de produção e, se quiser, approval.

Continuous Delivery: pipeline verde, humano aperta. Continuous Deployment: pipeline verde, a máquina aperta. Os dois exigem o mesmo CI. A diferença é só quem dispara o último step.

**Quando usar:**
Deploy automático na `main` quando rollback é barato e o spec cobre o caminho crítico. Approval no `environment` quando o deploy mexe em pagamento, migração destrutiva ou horário comercial.

**Não faça:**
- Job de deploy sem `needs`. Um `if: success()` solto no mesmo job que o RSpec é frágil.
- Deploy no `pull_request`. O PR do fork não deve ver secret de produção.
- `bundle exec rspec || true`. Isso desliga o portão e deixa o YAML mentir.

**Na entrevista:**
> "Deploy é um job depois. needs lint e test. Só push na main. CI é o portão; CD é a porta depois do portão. Vermelho não sai do prédio."

---

## Recapitulando

- CI prova o commit. CD entrega o commit verde. Não são o mesmo step.
- O portão de verdade é branch protection + check obrigatório. YAML sozinho não impede merge.
- GitHub Actions: `lint` e `test` em paralelo, `deploy` com `needs`.
- Cache de gems = `setup-ruby` + `bundler-cache: true` + `Gemfile.lock` no git.
- Postgres no `services`, `db:schema:load`, mesmo dialeto da produção. SQLite no CI é mentira.
- RuboCop, Brakeman e RSpec medem coisas diferentes. Os três entram no portão.
- Deploy só na `main`, só depois do verde. Secret de produção não roda em PR.

---

## Exercícios práticos

### Exercício 1: O que é o portão?

**Enunciado:** O time tem `.github/workflows/ci.yml` com RSpec verde na maioria dos PRs. Mesmo assim um commit quebrou produção: o autor mergeou com o X vermelho. O que faltou — CI ou o portão? O que você responde na entrevista?

<details>
<summary>Solução</summary>

Faltou o portão. O workflow existia; a regra do repositório não.

CI rodou e ficou vermelho. Sem required status check, o GitHub deixa mergear. O YAML avisou. Ninguém foi obrigado a ouvir.

Na entrevista:

> "CI sem branch protection é farol. O portão é o check obrigatório na main. Vermelho não entra — não é um acordo de Slack, é configuração do repo."

**Pontos-chave:**
- Ferramenta ≠ regra
- “Passou na minha máquina” não conta
- CD nenhum salva merge vermelho
</details>

### Exercício 2: O job de test não acha o banco

**Enunciado:** O workflow tem `bundle exec rspec` logo depois do `setup-ruby`. Falha com conexão recusada em `localhost:5432`. Você não quer SQLite. O que falta no YAML e por que `db:schema:load` vem antes do RSpec?

<details>
<summary>Solução</summary>

Falta o service Postgres, o healthcheck, o `DATABASE_URL` e o load do schema.

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: app_test
    ports:
      - 5432:5432
    options: >-
      --health-cmd="pg_isready -U postgres"
      --health-interval=10s
      --health-timeout=5s
      --health-retries=5
env:
  RAILS_ENV: test
  DATABASE_URL: postgres://postgres:postgres@localhost:5432/app_test
steps:
  # checkout + setup-ruby...
  - run: bin/rails db:schema:load
  - run: bundle exec rspec
```

`schema:load` materializa tabelas a partir do `schema.rb` commitado. Sem isso o spec fala com um banco vazio. Rodar a fila toda de migration no CI é mais lento e quebra se alguém editou migration antiga.

**Pontos-chave:**
- Service ≠ Compose local
- Healthcheck evita corrida com o boot do Postgres
- Schema no git é o contrato do banco no CI
</details>

### Exercício 3: Deploy no PR

**Enunciado:** Um colega cola o step de deploy no final do job `test`, sem `needs`, sem `if` de branch. O PR de um fork dispara o workflow. Quais dois riscos você aponta e como redesenha os jobs?

<details>
<summary>Solução</summary>

Risco 1: deploy de código que ainda não passou em lint — ou pior, de um job que nem chegou a falhar o RSpec se o step estiver com `continue-on-error`.

Risco 2: secret de produção exposto a PR, inclusive de fork. O Actions bloqueia alguns secrets em fork, mas o desenho já está errado: produção não é palco de branch.

Redesenho:

```yaml
jobs:
  lint: { /* rubocop + brakeman */ }
  test: { /* postgres + rspec */ }
  deploy:
    needs: [lint, test]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment: production
    steps:
      - uses: actions/checkout@v4
      - run: echo "deploy"
```

Três jobs. Dois no portão. Um atrás da porta.

**Pontos-chave:**
- `needs` é o portão entre CI e CD
- PR não deploya
- `environment` guarda secret e, se preciso, approval
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
