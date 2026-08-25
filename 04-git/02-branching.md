# 4.2 Branching

> **TL;DR**
> Branch é um ponteiro barato para um commit. `main` é a sua cópia local; `origin/main` é o último estado que o `fetch` viu no remote. `HEAD` aponta para o branch em que você está. `switch` troca de branch; `checkout` ainda funciona, mas faz demais. Feature isolada → branch curto → PR → merge → apaga o branch. Não commita em `main` no time.

## Conteúdo

- [O que é um branch](#o-que-é-um-branch)
- [HEAD](#head)
- [checkout vs switch](#checkout-vs-switch)
- [main vs origin/main](#main-vs-originmain)
- [Quando criar branch](#quando-criar-branch)
- [Merge](#merge)
- [Pull Request](#pull-request)
- [Apagar branch](#apagar-branch)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que é um branch

**O que é:**
Um branch é um nome que aponta para um commit. Não é cópia do repositório. Não é pasta. É um ponteiro. Criar branch é barato: o Git escreve um hash num arquivo.

**Como funciona:**
```bash
git branch                  # lista locais; o atual tem *
git branch feature/login    # cria, não troca
git log --oneline --decorate --graph --all
```

`feature/login` e `main` podem apontar para o **mesmo** commit. Enquanto você não commita, os dois são o mesmo lugar. O próximo commit move só o branch em que `HEAD` está.

**Quando usar:**
Uma ideia, um PR. Feature, bugfix, hotfix, spike. Nome curto e honesto: `feature/checkout-pix`, `fix/n-plus-one-orders`, `chore/bump-rails`.

**Na entrevista:**
> "Branch é um ponteiro móvel para um commit. Não duplica o projeto. Por isso o time cria branch à vontade."

---

## HEAD

**O que é:**
`HEAD` é "onde você está". Quase sempre aponta para um branch. O branch aponta para o commit. Commitar avança o branch; `HEAD` vai junto.

**Como funciona:**
```bash
git rev-parse --abbrev-ref HEAD   # main
git rev-parse HEAD                # hash do commit atual
cat .git/HEAD                     # ref: refs/heads/main
```

**Detached HEAD:** você fez checkout de um commit, não de um branch. `HEAD` aponta direto para o hash. Commitar aqui é fácil de perder: não tem nome apontando para esse commit.

```bash
git switch --detach abc1234
# commitar aqui fica órfão quando você volta
git switch -c rescue/wip          # dá um nome antes de perder
```

**Na entrevista:**
> "HEAD é o ponteiro do lugar atual. Normalmente aponta para o branch. Detached HEAD é quando você está num commit solto — eu crio um branch se for guardar o trabalho."

---

## checkout vs switch

**O que é:**
Os dois trocam de branch. `checkout` é o comando antigo e faz três coisas: troca branch, restaura arquivo, cria branch. `switch` (Git 2.23) só troca de branch. `restore` ficou com o arquivo.

**Como funciona:**
```bash
# Preferido hoje
git switch main
git switch -c feature/login      # cria e já entra

# Ainda funciona — entrevista cobra os dois
git checkout main
git checkout -b feature/login
```

Trocar de branch com arquivo sujo: o Git recusa se o outro branch sobrescreve essas linhas. Commit, stash ou leve o arquivo.

```bash
git status                       # olha antes de trocar
git switch main                  # falha se o working tree conflita
```

**Quando usar:**
`switch` no dia a dia. `checkout` se o time ainda fala assim ou se o Git do CI é velho. Não misture `checkout -- arquivo` com troca de branch na mesma explicação — são jobs diferentes.

**Na entrevista:**
> "`checkout` faz demais. Eu uso `git switch` para branch e `git restore` para arquivo. `checkout -b` eu conheço porque cai em prova e em repo antigo."

---

## main vs origin/main

**O que é:**
`main` é o branch **local**. `origin/main` é um remote-tracking branch: um cache do que o remote tinha na última vez que você falou com ele. Não são o mesmo ponteiro.

**Como funciona:**
```bash
git fetch origin                 # atualiza origin/main; não mexe no main
git log main..origin/main        # commits que o remote tem e você não
git log origin/main..main        # commits seus que o remote ainda não viu

git status
# Your branch is behind 'origin/main' by 3 commits
```

`origin` é o apelido do remote (quase sempre o GitHub do time). `origin/main` só muda com `fetch`, `pull` ou `push` bem-sucedido. Abrir o editor e commitar atualiza **só** `main`.

```bash
# RUIM — achar que main local é a verdade do time
git switch main
git merge feature/login          # main local avançou; origin/main não

# BOM — atualiza o olho no remote antes
git fetch origin
git switch main
git merge --ff-only origin/main  # fast-forward se der
git merge feature/login
git push origin main
```

`git pull` = `fetch` + `merge` (ou rebase, se você configurou). Em entrevista, separe os dois. `fetch` é seguro: só atualiza o cache. `merge`/`rebase` mexe no seu branch.

**Quando usar:**
Antes de abrir PR, `fetch` e compare com `origin/main`. Antes de mergear na sua máquina, traga `origin/main`. Nunca assuma que o `main` de ontem ainda é o do time.

**Na entrevista:**
> "`main` é local. `origin/main` é o último snapshot do remote. Eles divergem. `fetch` atualiza o snapshot. `pull` já tenta juntar. Eu falo os dois nomes, não 'o main do GitHub' genérico."

---

## Quando criar branch

**O que é:**
A regra do time Rails: `main` protegida, trabalho numa branch curta, um PR por ideia. Branch não é medalha — é isolamento.

**Quando usar:**

| Situação | Branch? |
|---|---|
| Feature nova (`checkout` PIX, tela de pedido) | Sim |
| Bug em produção | Sim — curto, a partir de `main` atual |
| Spike / POC | Sim — prefixo `spike/`, sem promessa de merge |
| Typo de uma linha no README, sozinho no repo | Pode ir em `main` se o time aceitar |
| Dois assuntos no mesmo card | Dois branches. Não misture |

**Como funciona:**
```bash
git fetch origin
git switch main
git merge --ff-only origin/main
git switch -c feature/checkout-pix
# ... commits pequenos ...
git push -u origin HEAD
```

`-u origin HEAD` publica o branch atual e grava o upstream. Daí `git push` / `git pull` sem repetir o nome.

Branch **curto**. Dias, não semanas. Branch longo diverge de `main`, o PR vira novela e o rebase/merge do capítulo seguinte vira o problema. Integre cedo. Se a feature é grande, fatie: model + migration num PR, tela no outro.

Não crie branch de outro feature branch sem motivo. A base é `main` (ou `origin/main`). Branch em cima de branch só quando o segundo PR **depende** do primeiro — e o time precisa saber.

**Na entrevista:**
> "Eu não commito em `main` no time. Uma ideia, um branch, um PR. Branch longo é cheiro: ou a tarefa é grande demais, ou eu não integrei."

---

## Merge

**O que é:**
Juntar o histórico de um branch no outro. Você está **no branch destino** e pede o origem. `git merge feature/login` com `HEAD` em `main` traz o login para `main`.

**Como funciona:**
```bash
git switch main
git merge feature/login
```

Dois finais comuns:

1. **Fast-forward.** `main` não andou. O Git só empurra o ponteiro. Sem commit extra.
2. **Merge commit.** Os dois andaram. O Git cria um commit com dois pais. O grafo mostra a junção.

```bash
git merge --ff-only feature/login   # falha se precisar de merge commit
git merge --no-ff feature/login     # força merge commit mesmo no fast-forward
```

`--no-ff` deixa o PR visível no grafo. Time que gosta de histórico linear prefere rebase e fast-forward — isso é o [4.3](/04-git/03-rebase-vs-merge). Aqui o ponto é: merge não apaga o outro branch, só move ponteiro e, às vezes, cria um commit.

Conflito: os dois mexeram na mesma região. O Git para, marca o arquivo, você resolve. Capítulo [4.5](/04-git/05-conflicts). Não force merge no escuro.

**Exemplo prático:**
```bash
# no laptop, depois do review do PR
git fetch origin
git switch main
git merge --ff-only origin/main
git merge --no-ff feature/login
git push origin main
```

No GitHub, o botão do PR faz esse merge no remote. Você depois `fetch` e atualiza o `main` local.

**Na entrevista:**
> "Eu estou no destino e mergeio a origem. Fast-forward só anda o ponteiro. Se os dois avançaram, nasce um merge commit. Rebase vs merge eu separo — são estratégias, não o mesmo comando."

---

## Pull Request

**O que é:**
PR (Pull Request; no GitLab, Merge Request) **não é comando Git**. É o fluxo da plataforma: você empurra o branch, pede para o time puxar para `main`. Review, CI, conversa, depois o merge.

**Como funciona:**
```bash
git push -u origin HEAD
# abre o PR no GitHub: base main ← compare feature/login
```

O PR compara o seu branch com a base (`main`). Cada push novo atualiza o PR. CI roda no **head do branch**, não no seu laptop.

O que o reviewer olha: diff, mensagem de commit, se o branch está atualizado com `origin/main`, se o CI passou, se a feature cabe num PR só.

```bash
# atualizar o PR com o main do time
git fetch origin
git switch feature/login
git merge origin/main
# resolve conflito se aparecer
git push
```

Draft PR: ainda não é para mergear. Útil quando você quer CI e olho cedo, sem pressionar review.

**Quando usar:**
Sempre que o time tem `main` protegida. Hotfix também passa por PR — o atalho é o review rápido, não pular o branch.

**Na entrevista:**
> "PR é o GitHub, não o Git. Eu push o branch e peço merge para `main`. O valor é review + CI. Branch sem PR no time é trabalho invisível."

---

## Apagar branch

**O que é:**
Depois do merge, o ponteiro local e o remoto sobram. Não servem mais. Apagar não apaga os commits que já estão em `main`.

**Como funciona:**
```bash
git switch main
git branch -d feature/login          # recusa se não mergeou
git branch -D feature/login          # força — branch abandonado

git push origin --delete feature/login
# ou
git push origin :feature/login       # forma antiga, mesma coisa

git fetch --prune                    # some origin/feature morto
git remote prune origin
```

`-d` é o default seguro: o Git recusa se o branch não foi mergeado. `-D` é "eu sei, joga fora". Use `-D` em spike que não vai entrar, não no feature que só está desatualizado.

No GitHub, "Delete branch" depois do merge some com o remoto. O local continua até você apagar. `git branch -vv` mostra quem já sumiu no remote (`gone`).

```bash
git branch -vv
# feature/login  abc1234 [origin/feature/login: gone] adiciona PIX
```

**Quando usar:**
Assim que o PR mergeou. Branch morto polui `git branch` e o autocomplete. Não apague o remoto se alguém ainda está em cima dele — avise.

**Na entrevista:**
> "`-d` é seguro, `-D` é force. Apagar o branch não apaga o que já está em `main`. `fetch --prune` limpa o `origin/feature` que o GitHub já matou."

---

## Recapitulando

- Branch é ponteiro, não cópia.
- `HEAD` é onde você está; detached HEAD não tem nome.
- `switch` troca de branch; `checkout` ainda aparece em prova e repo antigo.
- `main` é local; `origin/main` é cache do remote. `fetch` atualiza o cache.
- Uma ideia, um branch curto, um PR. Base em `main` atual.
- Merge no destino. Fast-forward vs merge commit. Rebase fica no próximo capítulo.
- PR é da plataforma: review + CI. Não é `git pr`.
- Depois do merge: `-d` local, `--delete` no remote, `fetch --prune`.

---

## Exercícios práticos

### Exercício 1: Onde está o HEAD?

**Enunciado:** Você rodou `git switch --detach 9f3a1c2` para inspecionar um commit antigo, mudou um arquivo e commitou. `git status` fala *detached HEAD*. O que aconteceu e como você não perde o commit?

<details>
<summary>Solução</summary>

`HEAD` apontou para o hash, não para um branch. O commit novo existe, mas nenhum nome aponta para ele. Se você `git switch main`, o commit fica órfão e o garbage collector pode levar depois.

```bash
git switch -c rescue/investigacao
# agora o branch aponta para o commit
git switch main
# o trabalho continua em rescue/investigacao
```

**Pontos-chave:**
- Detached HEAD = commit sem branch
- Dê um nome (`switch -c`) **antes** de sair
- Não é bug do Git — é ponteiro sem etiqueta
</details>

### Exercício 2: main atrasado, origin/main na frente

**Enunciado:** `git status` em `main` diz *behind 'origin/main' by 4 commits*. Um colega já mergeou um PR. Você quer criar `feature/export-csv` a partir do `main` do time, não do seu local velho. Qual a sequência?

<details>
<summary>Solução</summary>

O seu `main` local não andou. `origin/main` já tem os 4 commits — se o `fetch` foi recente.

```bash
git fetch origin
git switch main
git merge --ff-only origin/main
git switch -c feature/export-csv
```

`--ff-only` falha se você commitou em `main` local. Aí você não força: tira esses commits para um branch, ou descarta se for lixo.

Não faça `git switch -c feature/export-csv` em cima de um `main` atrasado. O PR nasce sem os 4 commits e o CI/review reclama.

**Pontos-chave:**
- `main` ≠ `origin/main`
- `fetch` primeiro, depois fast-forward
- Branch novo sai do `main` atualizado
</details>

### Exercício 3: apagar depois do PR

**Enunciado:** O PR de `feature/login` mergeou no GitHub e você clicou *Delete branch*. No laptop, `git branch` ainda lista `feature/login` e `git branch -vv` mostra `origin/feature/login: gone`. Como limpar sem apagar commit que já está em `main`?

<details>
<summary>Solução</summary>

O remoto já morreu. O local é só um ponteiro velho. Os commits estão em `main` (e em `origin/main` depois do `fetch`).

```bash
git fetch --prune
git switch main
git merge --ff-only origin/main
git branch -d feature/login
```

`-d` passa porque o Git vê o merge. Se reclamar, você não atualizou o `main` local — faça o `fetch` + fast-forward e tente de novo. `-D` só se o branch foi abandonado de verdade.

**Pontos-chave:**
- Delete no GitHub ≠ delete local
- `gone` = tracking morto; `fetch --prune` limpa a ref remota
- `-d` depois de atualizar `main`; `-D` não é o default
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
