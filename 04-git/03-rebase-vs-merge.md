# 4.3 Rebase vs merge

> **TL;DR**
> Merge junta dois históricos e cria um commit com dois pais. Rebase reescreve: pega seus commits e aplica de novo em cima da base nova — SHA muda. História linear vs história com ramificação. Regra de ouro: nunca rebase o que já está público e outras pessoas usam. `rebase -i` limpa commit local antes do PR. Conflito no rebase é por commit, não um só no fim. Time decide; você explica o trade-off, não torce.

## Conteúdo

- [Merge commit](#merge-commit)
- [Rebase](#rebase)
- [A diferença no grafo](#a-diferença-no-grafo)
- [Nunca rebase histórico público](#nunca-rebase-histórico-público)
- [rebase -i](#rebase--i)
- [Conflito no rebase](#conflito-no-rebase)
- [Quando o time prefere cada](#quando-o-time-prefere-cada)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Merge commit

**O que é:**
`git merge` une a branch atual com outra. Se os históricos divergiram, o Git cria um **merge commit**: um commit com dois pais. O grafo guarda o “quando entrou”.

**Como funciona:**
```bash
# você está em main
git merge feature

# ou, na feature, trazer main:
git checkout feature
git merge main
```

Sem divergência (fast-forward): o ponteiro só anda. Com divergência: commit `M` com pais `C` (main) e `E` (feature).

```
A---B---C           main
     \
      D---E         feature

git checkout main && git merge feature

A---B---C---M       main
     \     /
      D---E         feature
```

`M` não tem diff “seu”. Ele amarra os dois lados. `git log --oneline --graph` mostra o Y.

**Quando usar:**
Branch longa, release, hotfix que precisa deixar explícito “isso entrou aqui”. Histórico compartilhado: merge não reescreve SHA que o colega já puxou.

**Na entrevista:**
> "Merge preserva o histórico real. Cria um commit de dois pais. Ninguém perde SHA. O grafo fica com ramificação — e isso é feature, não bug."

---

## Rebase

**O que é:**
`git rebase` pega os commits que você tem a mais que a base e **reaplica** um a um em cima do commit novo. Não move o commit. Cria **outro** commit, com outro SHA, mesma ideia de patch.

**Como funciona:**
```bash
git checkout feature
git rebase main
```

```
A---B---C           main
     \
      D---E         feature

          ↓ git rebase main

A---B---C           main
         \
          D'--E'    feature
```

`D'` não é `D`. Mensagem pode ser igual. Hash não é. Ancestral agora é `C`, não `B`. O Git faz checkout em `C`, aplica o diff de `D`, commit novo, depois `E`, move `feature`.

**Quando usar:**
Feature **sua**, ainda local ou só você em cima. Atualizar a branch com `main` sem criar “Merge branch 'main' into feature”. Limpar o rascunho antes do review.

**Na entrevista:**
> "Rebase replay. Commits novos, SHA novos, história linear. Eu rebase o que é meu. O que o time já puxou, eu merge."

---

## A diferença no grafo

**O que é:**
A pergunta clássica não é comando. É: o que o histórico conta depois.

**Como funciona:**

|  | Merge | Rebase |
|---|---|---|
| SHA dos seus commits | iguais | novos |
| Merge commit | sim (se divergiu) | não |
| Grafo | ramificado | linear |
| “Quando a feature saiu de main” | visível | some |
| Conflito | uma leva no merge | um por commit replay |
| Seguro em branch compartilhada | sim | não |

Merge fala: “trabalhamos em paralelo, juntamos no dia X”. Rebase fala: “isso sempre nasceu em cima do main atual”. Mentira útil. O código final pode ser o mesmo. O grafo não. `git log` linear lê melhor; squash demais mistura duas bugs num SHA e o `bisect` sofre.

**Na entrevista:**
> "O resultado no working tree pode ser idêntico. A diferença é o grafo e os hashes. Merge adiciona. Rebase reescreve."

---

## Nunca rebase histórico público

**O que é:**
Regra de ouro. Se o commit já está no remoto **e** outra pessoa (ou o CI, ou um deploy) pode ter baseado trabalho nele, você **não** rebase.

**Como funciona:**
Rebase muda SHA. Quem tinha `D` e `E` agora olha o remoto e vê `D'` e `E'`. O Git acha que são commits diferentes. `git pull` gera duplicata ou pede merge dos dois mundos. Caos.

```bash
# RUIM — feature já no origin, colega puxou
git rebase origin/main
git push --force                 # apaga o que o colega tinha

# MENOS RUIM — só se a branch é SÓ sua
git push --force-with-lease      # recusa se alguém empurrou na frente
```

`--force` sem lease pode apagar o commit que o colega acabou de mandar. `--force-with-lease` checa se o remoto ainda é o que você viu.

Público aqui não é “repo open source”. É **compartilhado**. `main`, `develop`, release, branch de par. Até feature com dois devs.

**Quando usar:**
Rebase à vontade: commits que nunca saíram da sua máquina. Ou branch que o time combinou: “é sua, force-with-lease ok”.

**Importante na entrevista:**
Rebase de `main` remoto é sinal vermelho. Entrevistador quer ouvir a regra, não o comando.

**Na entrevista:**
> "Nunca rebase histórico compartilhado. SHA muda, o colega diverge, force push vira recuperação de desastre. Feature só minha, antes do PR: rebase. main: merge ou o botão do GitHub."

---

## rebase -i

**O que é:**
`git rebase -i` (interativo). Você edita a lista de commits que vão ser replay. Limpa o rascunho: squash de “wip”, reword de mensagem ruim, drop do commit que não vale.

**Como funciona:**
```bash
git rebase -i HEAD~3
# ou
git rebase -i origin/main
```

Abre o editor com uma linha por commit, **do mais antigo para o mais novo** — invertido em relação ao `git log`.

```
pick a1b2c3d wip: controller
pick d4e5f6a arruma spec
pick g7h8i9j cria Pedido
```

Comandos que caem:

| Comando | Faz |
|---|---|
| `pick` | mantém |
| `reword` | mantém o diff, pede mensagem nova |
| `squash` | junta este no commit de cima, pede mensagem |
| `fixup` | igual squash, descarta a mensagem deste |
| `drop` | some |
| `edit` | para no commit; você amenda e `git rebase --continue` |

```
pick a1b2c3d cria Pedido
fixup d4e5f6a wip: controller
fixup g7h8i9j arruma spec
```

Três commits viram um. SHA novo. História do PR fica uma frase. Ordem na lista = ordem do replay; trocar linha pode gerar conflito que não existia.

**Quando usar:**
Antes de abrir o PR. Nunca para “organizar” `main`. Nunca depois que o reviewer já comentou commit a commit — você reescreve o review.

**Na entrevista:**
> "`-i` é higiene local. Squash/fixup antes do review. Eu não reescrevo commit que já foi comentado no PR."

---

## Conflito no rebase

**O que é:**
O replay aplica **um commit por vez**. Cada um pode conflitar. Não é o mesmo desenho do merge: lá você resolve uma vez no commit `M`. Aqui você pode resolver N vezes.

**Como funciona:**
```bash
git rebase origin/main
# CONFLICT (content): merge conflict in app/models/order.rb
```

O Git para. `HEAD` está no commit-base daquele passo. Você resolve o arquivo, `git add`, segue.

```bash
# resolveu o arquivo
git add app/models/order.rb
git rebase --continue

# esse commit não vale mais
git rebase --skip

# desiste do rebase inteiro — volta ao estado anterior
git rebase --abort
```

`--abort` é o botão de pânico. Usa. Não inventa `reset --hard` no meio. `git status` diz “rebase in progress”; não comece outro rebase nem troque de branch.

Conflito no commit 2 de 5: você ainda não terminou. `--continue` aplica o 3. Se o 3 conflitar, de novo.

**Quando usar:**
`--continue` quando o arquivo está certo. `--skip` quando o commit inteiro ficou vazio. `--abort` quando você se perdeu ou a base mudou demais — merge seria mais barato. Marcadores `<<<<<<<` e mergetool: capítulo de conflitos. Aqui o que cai é o **ciclo**.

**Na entrevista:**
> "No merge eu resolvo uma vez. No rebase, uma por commit. `--continue`, `--skip`, `--abort`. Abort volta ao começo. Eu não force-push no meio do conflito."

---

## Quando o time prefere cada

**O que é:**
Não existe resposta universal. Existe convenção do repo. Entrevista quer que você **nomeie o trade-off** e diga o que faria no Rails do dia a dia.

**Como funciona:**

Time prefere **merge** quando:

- `main` / `develop` são sagrados — ninguém reescreve
- branch vive dias, várias pessoas
- auditoria quer o merge commit (“entrou no release 2026-08-25”)
- junior no time: merge é mais difícil de explodir o remoto

Time prefere **rebase** quando:

- quer `main` linear
- feature é de uma pessoa
- PR pequeno, review no diff final
- `git pull --rebase` na feature para não poluir com merge de `main`

Terceira via, comum em time Rails no GitHub: **squash merge no botão**. O GitHub esmaga a feature num commit só em `main`. Grafo linear. SHA da feature some. Não é `git rebase`; é política do host.

`git pull` default (merge) na feature cria o commit feio: `Merge branch 'main' into feature`. Por isso:

```bash
git checkout feature
git pull --rebase origin main
# ou: git config pull.rebase true
```

**Quando usar:**
No primeiro dia: CONTRIBUTING e os últimos merges em `main`. Copia o time. Na entrevista: os três (merge commit, rebase, squash) e a regra de ouro.

**Na entrevista:**
> "Eu rebase local, merge no compartilhado. Muitos times Rails fazem squash no GitHub e `main` fica linear sem ninguém rebasear `main`. A regra que não muda: não reescrevo o que os outros já têm."

---

## Recapitulando

- Merge **adiciona** um commit de dois pais. SHA antigo fica.
- Rebase **reaplica** commits. SHA novo. Grafo linear.
- Fast-forward é merge sem merge commit — ninguém divergiu.
- Nunca rebase histórico público. Force push só com `--force-with-lease` e branch só sua.
- `rebase -i`: pick, reword, squash, fixup, drop. Higiene **antes** do PR.
- Conflito no rebase: um por commit. `--continue` / `--skip` / `--abort`.
- Time merge vs rebase vs squash é convenção. Você explica o grafo, não torce por religião.
- `git pull --rebase` na feature evita “Merge branch 'main' into feature”.

---

## Exercícios práticos

### Exercício 1: Desenhe os dois finais

**Enunciado:** `main` tem `A-B-C`. `feature` saiu de `B` e tem `D-E`. Você precisa integrar. Desenhe o grafo depois de `git checkout main && git merge feature` e depois de `git checkout feature && git rebase main`. O que acontece com o hash de `D` em cada caso?

<details>
<summary>Solução</summary>

Merge em `main`:

```
A---B---C---M
     \     /
      D---E
```

`D` e `E` **continuam o mesmo SHA**. `M` é o merge commit (dois pais: `C` e `E`).

Rebase de `feature` em `main`:

```
A---B---C
         \
          D'--E'
```

`D'` e `E'` são commits **novos**. `D` antigo some da branch (ainda pode estar no reflog). `main` não se move até você mergear (fast-forward) `feature` depois.

**Pontos-chave:**
- Merge adiciona. Rebase copia.
- Hash de `D` só sobrevive no merge
- Depois do rebase, fast-forward de `main` em `feature` não cria `M`
</details>

### Exercício 2: O colega já puxou

**Enunciado:** Você pushou `feature` ontem. Ana já deu `git pull` e commitou em cima. Hoje você fez `git rebase origin/main` na `feature` e quer `git push --force`. O que acontece com a máquina da Ana? O que você deveria ter feito?

<details>
<summary>Solução</summary>

O remoto agora tem `D'` e `E'`. Ana ainda tem `D`, `E` e o commit dela `F`. O pull não é fast-forward: históricos que não ancestram um no outro. Ela duplica patch no merge ou rebaseia em SHA que você jogou fora.

O certo: não rebasear branch compartilhada. Trazer `main` com `git merge origin/main`. Se o rebase **já** aconteceu: avisar a Ana, ela backup + reset no remoto novo + `cherry-pick` de `F`. Sem force no escuro.

`--force-with-lease` teria recusado se ela tivesse pushido `F`. Não salva o caso “ela só puxou”.

**Pontos-chave:**
- Público = alguém pode ter baseado nisso
- Force push reescreve o remoto, não a cabeça da Ana
- Depois que quebrou: coordenar, não empilhar outro force
</details>

### Exercício 3: Cinco “wip” e um conflito

**Enunciado:** Sua `feature` tem 5 commits locais (`wip`, `wip`, `spec`, `wip`, `cria checkout`). Ninguém mais usa a branch; já existe no `origin`. Você quer um commit só em cima de `origin/main`. No meio do rebase, o 3º commit conflita em `app/models/order.rb`. Quais comandos, na ordem — inclusive se você desistir?

<details>
<summary>Solução</summary>

```bash
git fetch origin
git rebase -i origin/main
# pick no "cria checkout" (o mais antigo que vale)
# fixup nos quatro wip/spec — ou squash se quiser reeditar a mensagem

# conflito:
# edita app/models/order.rb
git add app/models/order.rb
git rebase --continue

# se a lista ainda tem fixup, o Git segue sozinho até o fim
git push --force-with-lease
```

Desistir no conflito:

```bash
git rebase --abort
# volta para os 5 commits originais, SHA antigo
# a feature no origin não mudou — você ainda não pushou
```

`--skip` aqui seria errado: você perderia o patch daquele commit, não só o conflito.

**Pontos-chave:**
- `-i` + fixup = um SHA no PR
- Conflito: add + `--continue`; pânico: `--abort`
- `--force-with-lease` só porque a branch é sua
- `--skip` não é “ignora o conflito”
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
