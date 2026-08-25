# 11.1 Docker

> **TL;DR**
> Imagem é o pacote. Container é o processo rodando essa imagem. Time Rails usa Docker para o mesmo Ruby e o mesmo Postgres no laptop, no CI e no review app. `docker build` gera a imagem. `docker run` sobe o processo. Volume nomeado o Docker gerencia. Bind mount aponta para pasta do host. `-p 3000:3000` publica porta. Na entrevista: container não é VM — é processo + filesystem isolado.

## Conteúdo

- [Imagem vs container](#imagem-vs-container)
- [Container não é VM](#container-não-é-vm)
- [Por que time Rails usa Docker](#por-que-time-rails-usa-docker)
- [docker build vs docker run](#docker-build-vs-docker-run)
- [Volumes vs bind mount](#volumes-vs-bind-mount)
- [Portas](#portas)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Imagem vs container

**O que é:**
Imagem é o artefato: camadas com Ruby, gems, código. Imutável. Tem nome e tag (`ruby:3.3`, `loja:dev`).

Container é uma instância da imagem: um processo (ou árvore de processos) com aquele filesystem. Você sobe, para, apaga. A imagem continua.

**Como funciona:**
```bash
docker pull ruby:3.3
docker run --rm ruby:3.3 ruby -e 'puts "Olá, João!"'
```

`pull` baixa a imagem. `run` cria o container, executa, some com `--rm`. Dez containers podem nascer da mesma imagem. Apagar um não apaga a imagem nem os outros.

Analogia que cola e mente um pouco: imagem é classe, container é objeto. Na entrevista prefira processo + filesystem. Classe/objeto é metáfora de OOP, não o mecanismo.

**Quando usar:**
Imagem quando você quer repetir o ambiente. Container quando você quer rodar um comando ou um servidor.

**Na entrevista:**
> "Imagem é o artefato. Container é o processo usando aquele filesystem. Eu posso ter dez containers da mesma imagem. Apagar o container não apaga a imagem."

---

## Container não é VM

**O que é:**
VM emula máquina: kernel próprio, boot, hypervisor. Container compartilha o kernel do host. Isolamento é namespace, cgroup e filesystem em camadas.

**Como funciona:**
O Puma no container é um processo no host, com PID diferente *dentro* do namespace. Não tem BIOS. Não "liga". Sobe em milissegundos.

Se o host é Linux, o container é Linux. Docker Desktop no Mac sobe uma VM *embaixo* para ter kernel Linux. O container em si continua não sendo VM. Confundir as duas camadas é resposta de tutorial, não de entrevista.

**Exemplo prático:**
```bash
docker run --rm ruby:3.3 ps aux
# PID 1 é o processo que você mandou. Não tem systemd. Não tem kernel próprio.
```

**Na entrevista:**
> "Container não é VM. É um processo com filesystem próprio. Isola PID, rede, mount. O kernel é o do host."

**Importante na entrevista:**
Quem diz "é uma VM leve" perde ponto. Corrija: isolamento de processo, não máquina virtual.

---

## Por que time Rails usa Docker

**O que é:**
"Funciona na minha máquina" com Ruby 3.2, o colega tem 3.3, o CI tem 3.1, Postgres 14 contra 16. Docker congela a combinação.

**Como funciona:**
App Rails 7.1+ pede Ruby, Postgres, quase sempre Redis. Sem Docker: rbenv/asdf + Postgres do Homebrew + Redis, cada um numa versão. Com Docker: a mesma imagem no laptop, no CI, no review app.

Não é só deploy. O ganho do dia a dia é o Postgres da mesma major e o `bundle` no mesmo Ruby. Migration que passa no CI passa no laptop do João.

**Quando usar:**
Onboarding. CI. Paridade com produção. App com Postgres + Redis + Sidekiq. Não precisa Docker para um script de vinte linhas.

**Exemplo prático:**
João clona o repo. Sobe Postgres 16 e a app. Não instala Postgres no Mac. Cria o user `joao@email.com` no mesmo schema que o CI vai migrar.

```bash
docker run -d --name loja-db \
  -e POSTGRES_USER=loja \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=loja_development \
  postgres:16

# database.yml aponta para host `db` ou `localhost`, conforme a rede
```

**Na entrevista:**
> "A gente usa Docker para o mesmo Ruby e o mesmo Postgres em todo lugar. Não é moda. É parar de debugar versão."

---

## docker build vs docker run

**O que é:**
`build` lê o Dockerfile, empilha layers, gera imagem. `run` instancia a imagem: processo, rede, volume.

**Como funciona:**
```bash
docker build -t loja:dev .
docker run --rm -p 3000:3000 loja:dev
docker run --rm loja:dev bin/rails runner 'puts User.count'
```

`build` é a compilação do ambiente. `run` é a execução. Mudou Gemfile ou Dockerfile → rebuild. Só quer outro comando na mesma imagem → `run` de novo.

`docker start` liga de novo um container que já existia. `run` cria outro. `exec` entra num container que já está vivo.

Você não "dá run no Dockerfile". Você builda a imagem e depois run.

**Quando usar:**
`build` no CI e no laptop quando Dockerfile, Gemfile ou código copiado para a imagem mudou. `run` para web, worker, console, spec.

**Na entrevista:**
> "build produz a imagem. run sobe o container. Eu não run o Dockerfile. Eu buildo e depois run."

---

## Volumes vs bind mount

**O que é:**
Os dois tiram dado do ciclo de vida do container. A diferença é quem manda no path.

Volume nomeado: o Docker cria e gerencia. Bom para Postgres — o dado sobrevive a `docker rm`.

Bind mount: você mapeia pasta do host. Bom para código em development — edita no editor, o Puma vê.

**Como funciona:**
```bash
# volume nomeado — dado do Postgres
docker run -d --name db \
  -e POSTGRES_PASSWORD=secret \
  -v loja_pgdata:/var/lib/postgresql/data \
  postgres:16

# bind — código da app no laptop
docker run --rm \
  -v "$PWD":/rails \
  -w /rails \
  -e RAILS_ENV=test \
  ruby:3.3 bundle exec rspec
```

Filesystem gravável do container (a layer de cima da imagem) morre com o container. Volume e bind existem por isso.

Em produção a imagem já leva o código. Bind da pasta do laptop não existe no servidor.

**Quando usar:**
Volume: banco, cache de bundle, uploads. Bind: source em development. Não bind de `tmp/` e `log/` se você só quer barulho no host — volume resolve.

**Na entrevista:**
> "Volume o Docker gerencia. Bind é pasta do host. Postgres eu ponho em volume. Código em dev eu monto bind. Confundir os dois é perder dado ou achar que produção edita arquivo no container."

---

## Portas

**O que é:**
O processo no container escuta numa porta *dentro* da rede do container. O host não vê até você publicar.

`-p 3000:3000` é host:container. Esquerda é o que você abre no browser. Direita é onde o Puma escuta.

**Como funciona:**
```bash
docker run --rm -p 3000:3000 loja:dev
# http://localhost:3000 → Puma em :3000 no container

docker run --rm -p 3001:3000 loja:dev
# laptop na 3001, Puma continua na 3000
```

Postgres típico: `-p 5432:5432`. Se o Mac já tem Postgres no 5432, colisão. Mude a esquerda: `-p 5433:5432`. A app no container ainda fala com `5432` *dentro* da rede Docker. O `5433` é só para o `psql` do host.

Sem `-p`, containers na mesma rede Docker se falam pelo nome. O browser do Mac não entra.

**Quando usar:**
Publicar o que o desenvolvedor ou o load balancer precisa. Em produção, não publicar Redis e Postgres para o mundo.

**Exemplo prático:**
```bash
# web visível no laptop; Postgres só na rede Docker
docker run -d --name db postgres:16
docker run --rm --link db:db -p 3000:3000 loja:dev
```

`--link` é legado. Em time de verdade você põe os dois na mesma rede (`docker network`). O ponto da entrevista é o mesmo: publique só o que precisa.

**Na entrevista:**
> "Porta do container não é porta do host. -p 3000:3000 publica. A ordem é host:container. Se o Mac já usa 5432, eu publico 5433:5432."

---

## Recapitulando

- Imagem = artefato. Container = processo + filesystem.
- Não é VM. Kernel do host. Namespace, não hypervisor.
- Rails: mesmo Ruby, mesmo Postgres, laptop e CI.
- `build` empacota. `run` executa.
- Volume nomeado para dado. Bind para código em dev.
- `-p` é host:container. Sem publish, localhost não vê.

---

## Exercícios práticos

### Exercício 1: Imagem vs container

**Enunciado:** João fez `docker build -t loja:dev .`, depois `docker run -d --name web1 loja:dev` e `docker run -d --name web2 loja:dev`. Apagou só o `web1` com `docker rm -f web1`. O que sobra? A tag `loja:dev` some?

<details>
<summary>Solução</summary>

Sobram a imagem `loja:dev` e o container `web2`. `docker rm` apaga o container, não a imagem.

```bash
docker images    # loja:dev ainda está
docker ps -a     # web2; web1 não
docker run -d --name web3 loja:dev  # sobe outro, mesma imagem
```

**Pontos-chave:**
- Imagem é o pacote. Container é instância.
- Vários containers, uma imagem.
- `rm` no container não é `rmi` na imagem.
</details>

### Exercício 2: Volume ou bind?

**Enunciado:** Você sobe Postgres e a app Rails 7.1 no Docker. Onde vai `/var/lib/postgresql/data`? Onde vai o código que o João edita em `app/models/user.rb`? Por quê?

<details>
<summary>Solução</summary>

Postgres: volume nomeado. Código em development: bind mount.

```bash
docker run -d --name db \
  -e POSTGRES_PASSWORD=secret \
  -v loja_pgdata:/var/lib/postgresql/data \
  postgres:16

docker run --rm \
  -v "$PWD":/rails \
  -w /rails \
  -p 3000:3000 \
  loja:dev
```

Se o dado do Postgres estiver só na layer gravável do container, `docker rm db` apaga a loja. Bind no data dir do Postgres no Mac até funciona, mas permissão e path do Linux vs Mac viram drama. Volume o Docker gerencia.

Código: bind, senão cada `save` no editor pede rebuild. Em produção o código já está na imagem — sem bind do laptop.

**Pontos-chave:**
- Volume = dado que tem que sobreviver ao container.
- Bind = pasta do host, para editar em dev.
- Produção não monta o home do João.
</details>

### Exercício 3: Porta ocupada

**Enunciado:** O Mac do João já tem Postgres no `5432`. Ele sobe `postgres:16` no Docker e a app Rails escuta `3000` no container. Como mapear as portas para o browser abrir `http://localhost:3000` e o `psql` do host falar com o banco do Docker sem matar o Postgres local?

<details>
<summary>Solução</summary>

Publique o Postgres numa porta livre no host. A app no browser usa `3000:3000`. A ordem é sempre host:container.

```bash
docker run -d --name db \
  -e POSTGRES_PASSWORD=secret \
  -p 5433:5432 \
  postgres:16

docker run --rm -p 3000:3000 loja:dev
```

No host:

```bash
psql -h 127.0.0.1 -p 5433 -U postgres
# browser → http://localhost:3000
```

Dentro da rede Docker, o container da app ainda conecta em `db:5432`. O `5433` é só a janela no Mac. Se a app também roda *no host* (não no Docker) e aponta para o Postgres do Docker, aí sim `localhost:5433`.

**Pontos-chave:**
- `-p` é host:container, não o contrário.
- Colisão é na esquerda (host).
- Container fala com container pela rede Docker, na porta interna.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
