# 4.1 Git básico

> **TL;DR**
> Git é histórico local. Três lugares: working tree, staging, repositório. `add` escolhe; `commit` grava. `status` / `diff` / `log` leem. `clone` copia; `remote` aponta; `push` sobe; `pull` baixa e integra. `.gitignore` esconde o que não é código. Mensagem: o *porquê*, imperativo, um assunto.

## Conteúdo

- [Repositório](#repositório)
- [Os três lugares](#os-três-lugares)
- [status](#status)
- [add](#add)
- [commit](#commit)
- [Mensagem de commit](#mensagem-de-commit)
- [log](#log)
- [diff](#diff)
- [clone](#clone)
- [remote](#remote)
- [push e pull](#push-e-pull)
- [.gitignore](#gitignore)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Repositório

**O que é:**
Pasta com `.git`. Aí mora o histórico. Sem `.git` é só diretório.

**Como funciona:**
```bash
cd ~/Work/loja
git init          # criou .git/ — agora é repositório
```

`init` não sobe nada e não cria remote. `rails new` já roda `init` e deixa um `.gitignore`.

**Na entrevista:**
> "Repositório é a pasta com `.git`. `init` é local. Remote é outro passo."

---

## Os três lugares

**O que é:**
Toda mudança passa por três estados. Quem mistura isso erra `add` e `commit`.

| Lugar | O que é | Quem mexe |
|---|---|---|
| working tree | arquivo no disco | o editor |
| staging (index) | o que entra no *próximo* commit | `git add` |
| repositório | histórico gravado | `git commit` |

**Como funciona:**
Você altera `app/models/user.rb`. O disco mudou. Git ainda não sabe o que gravar. `add` copia o recorte para o staging. `commit` pega o staging e cria um snapshot.

**Na entrevista:**
> "Working tree é o disco. Staging é o rascunho do próximo commit. Repositório é o histórico. `add` não commita."

---

## status

**O que é:**
O mapa: modificado, staged, untracked.

**Como funciona:**
```bash
git status
# modified:   app/models/user.rb
# Untracked:  app/services/invoice.rb

git status -sb    # a versão curta do dia a dia
```

*untracked* = arquivo novo. *not staged* = mudou no disco. *staged* = entra no próximo commit. Rode antes de `add` e de `commit`.

**Na entrevista:**
> "`status` é o primeiro comando. Untracked, not staged e staged são três coisas."

---

## add

**O que é:**
Copia o estado atual do arquivo para o staging. O disco não muda.

**Como funciona:**
```bash
git add app/models/user.rb
git add app/models/          # a pasta
git add -p                   # hunk por hunk
git restore --staged user.rb # sai do staging, fica no disco
```

`git add .` pega tudo que o `.gitignore` não cobriu — inclusive `binding.pry`, `.env` e `tmp/cache`.

`add` de novo depois de editar: o staging tinha a versão *antiga*. `status` mostra os dois.

**Na entrevista:**
> "`add` escolhe o snapshot. Eu não faço `add .` no automático. `-p` quando misturei dois assuntos no arquivo."

---

## commit

**O que é:**
Snapshot do staging. Hash, autor, data, mensagem, pai. Isso é o histórico.

**Como funciona:**
```bash
git diff --staged
git commit -m "Valida e-mail único no User"
```

`git commit -am "msg"` faz add + commit dos *já rastreados*. Untracked fica de fora.

Commit é local. Até o `push`, só a sua máquina tem o snapshot.

**Na entrevista:**
> "Commit é local. Eu olho `diff --staged` antes. `-am` não pega untracked."

---

## Mensagem de commit

**O que é:**
O contrato com quem lê o `log` daqui a seis meses.

**Como funciona:**
```bash
# RUIM
git commit -m "ajuste"
git commit -m "fix"
git commit -m "Alterado user.rb"

# BOM — imperativo, um assunto, o porquê
git commit -m "Rejeita e-mail duplicado no cadastro"
```

Entra:

- assunto curto, imperativo (`Valida`, `Remove`), sem ponto final
- o *porquê* — o diff já é o *quê*
- um assunto: e-mail *ou* frete, não os dois

Não entra: "ajuste", "WIP", lista de arquivos, o *como* linha a linha, ticket sozinho (`#4821`).

Conventional Commits (`feat:`, `fix:`) o time pode exigir. Não é lei do Git. Em entrevista pesa intenção, não o prefixo.

**Na entrevista:**
> "Mensagem diz o porquê. O diff diz o quê. Imperativo, um assunto. 'ajuste' não passa. Conventional Commit é convenção do time, não do Git."

---

## log

**O que é:**
O histórico. Hash, autor, data, assunto.

**Como funciona:**
```bash
git log --oneline
# a1b2c3d Rejeita e-mail duplicado no cadastro

git log --oneline -- app/models/user.rb
git show a1b2c3d     # mensagem + diff daquele commit
```

`log` só lê. `show` abre o commit.

**Na entrevista:**
> "`log --oneline` é o que eu abro. `show` no hash quando preciso do diff."

---

## diff

**O que é:**
O delta, linha a linha.

**Como funciona:**
```bash
git diff             # working tree vs staging
git diff --staged    # staging vs último commit
git diff HEAD        # tudo vs HEAD
```

Três perguntas:

- o que editei e ainda não separei? → `git diff`
- o que entra neste commit? → `git diff --staged`
- o que aquele commit antigo fez? → `git show <hash>`

**Na entrevista:**
> "`diff` é working vs staging. `diff --staged` é o que o commit grava. Eu não commito sem olhar o staged."

---

## clone

**O que é:**
Cópia do histórico + working tree. Não é baixar o ZIP.

**Como funciona:**
```bash
git clone git@github.com:acme/loja.git
cd loja
# origin já aponta para o GitHub
```

Primeiro dia no repo. Atualizar depois é `pull`, não clonar de novo.

**Na entrevista:**
> "`clone` traz o histórico, não só o HEAD. Já deixa `origin`. Atualizar é `pull`."

---

## remote

**O que é:**
Apelido para outro repositório. Em geral `origin` = GitHub do time. É ponteiro + URL, não backup mágico.

**Como funciona:**
```bash
git remote -v
git remote add origin git@github.com:acme/loja.git
```

`clone` já cria `origin`. `init` não — você adiciona na mão, antes do primeiro `push`.

**Na entrevista:**
> "`origin` é só um nome. O remote é a URL. `clone` já cria. `init` não."

---

## push e pull

**O que é:**
`push` envia commits locais que o remote ainda não tem. `pull` busca os de lá e integra.

**Como funciona:**
```bash
git push -u origin main   # primeiro push desta branch
git push
git pull
```

`push` recusa se o remote andou e você não tem esses commits. Aí `pull` (merge/rebase fica no 4.3). `--force` neste capítulo não existe.

`pull` = `fetch` + integrar. `fetch` só atualiza os refs, sem mexer no working tree.

**Na entrevista:**
> "`push` sobe commit. `pull` baixa e integra. `fetch` só atualiza o mapa. Force push em main eu não faço."

---

## .gitignore

**O que é:**
Lista do que o Git finge que não existe. Untracked some do `status`. Já commitado *não* some.

**Como funciona:**
```gitignore
# app Rails — rails new já gera a base
/log/*
/tmp/*
/storage/*
/vendor/bundle
.env
/config/master.key
```

Não entra: segredo (`.env`, `master.key`), gerado (`log/`, `tmp/`, `vendor/bundle`), lixo do editor.

Entra: `Gemfile.lock`, o `.gitignore`, e o schema que o time versiona.

Já commitado e agora ignorado:

```bash
git rm --cached config/master.key   # some do índice, fica no disco
```

**Na entrevista:**
> "`.gitignore` esconde untracked. Não apaga histórico. `master.key` e `.env` não sobem. `git rm --cached` tira do índice."

---

## Recapitulando

- `.git` na pasta = repositório. `init` é local.
- Três lugares: working tree, staging, histórico.
- `status` primeiro. `diff --staged` antes do commit.
- `add` escolhe. `commit` grava. Commit é local.
- Mensagem: porquê, imperativo, um assunto.
- `log` lê. `show` abre um commit.
- `clone` copia e cria `origin`. `remote` é apelido + URL.
- `push` sobe. `pull` baixa e integra. `fetch` só atualiza o mapa.
- `.gitignore` para segredo e gerado. Não reescreve o passado.

---

## Exercícios práticos

### Exercício 1: Por que existe o `add`?

**Enunciado:** Você editou `user.rb` (e-mail) e `order.rb` (frete). Quer dois commits. O que você roda, e por que `git commit -am "wip"` quebra isso?

<details>
<summary>Solução</summary>

Staging fatia. Sem ele, os dois arquivos sujos iam no mesmo snapshot.

```bash
git add app/models/user.rb
git diff --staged
git commit -m "Rejeita e-mail duplicado no cadastro"

git add app/models/order.rb
git commit -m "Cobra frete só em pedido interestadual"
```

`-am "wip"` faz add de **todo** rastreado e grava os dois assuntos juntos. Não dá para reverter só o frete.

**Pontos-chave:**
- Um commit, uma ideia
- `-am` não escolhe arquivo
- `diff --staged` confirma o recorte
</details>

### Exercício 2: Reescreva a mensagem

**Enunciado:** O commit está `"ajuste user e order"`. O diff exige CPF no checkout e não toca `order`. Escreva a mensagem e diga o que saiu.

<details>
<summary>Solução</summary>

```text
Exige CPF no checkout

Pedido sem CPF quebrava a nota. O documento é da conta, não da Order.
```

Saiu: "ajuste", a lista falsa de arquivos. Entrou: o porquê e o escopo real.

**Pontos-chave:**
- Diff conta o quê; mensagem conta o porquê
- Imperativo no assunto
- Citar arquivo errado mente
</details>

### Exercício 3: O `status` encheu de lixo

**Enunciado:** Depois de `rails s`, o `status` lista `log/development.log`, `tmp/cache/...`, `.env` e `app/models/user.rb`. O que entra no commit? O que vai para o `.gitignore`? E se o `.env` já foi commitado ontem?

<details>
<summary>Solução</summary>

Entra no commit: só `user.rb`.

```gitignore
/log/*
/tmp/*
.env
```

`.env` já commitado: ignore sozinho não tira. Tira do índice — e **roda as credenciais**, o histórico ainda tem o arquivo.

```bash
git rm --cached .env
git add .gitignore
git commit -m "Para de versionar .env e artefato de log"
```

**Pontos-chave:**
- Log, tmp e segredo não são código
- `.gitignore` não apaga o passado
- Segredo que vazou troca de valor, não só de pasta
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
