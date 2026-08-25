# 4.4 Git Flow / GitHub Flow

> **TL;DR**
> Git Flow: `main` / `develop` / `feature` / `release` / `hotfix`. GitHub Flow: `main` + PR + deploy. Time Rails de produto (SaaS, CI, Kamal/Heroku) usa GitHub Flow. Git Flow ainda aparece com calendário, SemVer ou hotfix sem levar o que está em `develop`. Descreva os dois, diga o default, não misture.

## Conteúdo

- [A pergunta de verdade](#a-pergunta-de-verdade)
- [Git Flow](#git-flow)
- [Ciclo do Git Flow](#ciclo-do-git-flow)
- [GitHub Flow](#github-flow)
- [Rails no GitHub Flow](#rails-no-github-flow)
- [Quando o Git Flow ainda aparece](#quando-o-git-flow-ainda-aparece)
- [Lado a lado](#lado-a-lado)
- [O que não misturar](#o-que-não-misturar)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## A pergunta de verdade

**O que é:**
O entrevistador não quer o blog de 2010. Quer saber se você sabe de qual branch sai o deploy, de onde nasce a feature e o que acontece quando production quebra na sexta.

**Como funciona:**
Dois modelos caem. Git Flow (Vincent Driessen, 2010): duas branches longas + três temporárias. GitHub Flow (Scott Chacon, 2011): `main` sempre deployável, branch curta, PR, merge, deploy.

O nome “flow” engana. Não é plugin. É acordo do time sobre branch. A CLI `git-flow` existe; time Rails moderno quase não usa. Você fala o modelo e os comandos `git` + PR.

**Na entrevista:**
> "Git Flow e GitHub Flow são modelos de branch, não ferramenta. Rails de produto eu descrevo GitHub Flow. Se o time versiona release, aí entra Git Flow."

---

## Git Flow

**O que é:**
Branching model para release planejado. Duas branches vivem para sempre. Três nascem e morrem.

**Como funciona:**

```
main      — production. Só o que já foi (ou vai ser) tag.
develop   — integração do próximo release.
feature/* — feature nova. Sai de develop, volta para develop.
release/* — congela o que vai sair. Sai de develop, merge em main e develop.
hotfix/*  — production pegando fogo. Sai de main, merge em main e develop.
```

`main` e `master` são o mesmo papel. Hoje você fala `main`.

```
main:     v1.0 ----------- v1.1 -------- v1.1.1
             \            /  \          /
develop:      A--B--C--D-E----F--G-----H
                 \    /         \
feature/pix:      p1-p2          \
release/1.1:               r1-r2  \
hotfix/1.1.1:                      h1
```

**Quando usar:**
Calendário de release. Várias versões vivas. Time que não pode jogar `develop` inteiro em production.

**Na entrevista:**
> "Git Flow: `main` é production, `develop` é o próximo pacote. Feature nasce de `develop`. Release congela. Hotfix nasce de `main` e volta nos dois."

---

## Ciclo do Git Flow

**O que é:**
Três caminhos. Feature entra no próximo release. Release vira tag. Hotfix fura a fila.

**Como funciona:**

Feature:

```bash
git switch develop
git pull
git switch -c feature/pix-checkout

git add app/services/pix_charge.rb
git commit -m "Cobra PIX no checkout"

git switch develop
git merge --no-ff feature/pix-checkout
git branch -d feature/pix-checkout
```

`--no-ff` deixa o merge commit. O histórico mostra “essa feature entrou aqui”. Time que prefere rebase + squash no PR faz o mesmo papel no GitHub.

Release:

```bash
git switch develop
git switch -c release/1.2.0
# bump, changelog, bug de última hora — sem feature nova
git commit -m "Bump 1.2.0"

git switch main
git merge --no-ff release/1.2.0
git tag -a v1.2.0 -m "Release 1.2.0"

git switch develop
git merge --no-ff release/1.2.0
```

Hotfix:

```bash
git switch main
git switch -c hotfix/cobranca-centavos
git commit -m "Corrige arredondamento do PIX"

git switch main
git merge --no-ff hotfix/cobranca-centavos
git tag -a v1.2.1 -m "Hotfix 1.2.1"

git switch develop
git merge --no-ff hotfix/cobranca-centavos
```

O ponto que o entrevistador testa: hotfix **também** entra em `develop`. Senão o próximo release traz o bug de volta.

**Exemplo prático:**
App de pedidos. `develop` já tem cupom de Black Friday. Production cobra R$ 10,10 + R$ 10,20 errado. Você não mergeia `develop` em `main`. Abre `hotfix/` de `main`, corrige centavos, tag `v1.2.1`, depois leva o mesmo commit para `develop`.

**Na entrevista:**
> "Hotfix sai de `main`. Merge nos dois. Se eu só conserto `main`, o próximo release reintroduz o bug."

---

## GitHub Flow

**O que é:**
`main` sempre pode ir para production. Você abre branch, PR, review, CI, merge, deploy. Sem `develop`. Sem `release/*`.

**Como funciona:**

```
main  — o que está (ou pode estar) no ar
  \
   feature/pix-checkout  — branch curta → PR → merge → deploy
```

```bash
git switch main
git pull
git switch -c feature/pix-checkout   # horas ou poucos dias, não semanas
git commit -m "Cobra PIX no checkout"
git push -u origin HEAD
# PR → review + CI → squash/merge (o time decide)
git switch main && git pull          # CI faz deploy: Kamal, Heroku, Render, Fly
```

Production quebrou? Mesma regra. Branch curta a partir de `main`, PR, CI, merge, deploy. Não existe cerimônia de `hotfix/`. O nome da branch pode até ser `hotfix/cobranca-centavos` — o fluxo é o de feature.

**Quando usar:**
SaaS Rails. Deploy contínuo. Um ambiente de production. Feature flag se a coisa é grande demais para um PR.

**Na entrevista:**
> "GitHub Flow: `main` deployável. Branch curta, PR, CI, merge, sobe. Hotfix é o mesmo caminho, só que mais rápido."

---

## Rails no GitHub Flow

**O que é:**
O modelo encaixa no jeito que o Rails já trabalha: migration, `schema.rb`, review app, CI.

**Como funciona:**

- PR roda RSpec + RuboCop + Brakeman. Vermelho não mergeia.
- Review app (Heroku/Render) sobe o PR. QA clica sem puxar a branch.
- `main` protegida: review obrigatório, status check, sem force push.
- Deploy de `main`. Kamal, Heroku pipeline, GitHub Actions — o gatilho é o merge.

Dois PRs no mesmo `schema.rb` → conflito clássico. Você não “escolhe o meu”. Atualiza `main`, roda `rails db:migrate` e commita o schema gerado.

Branch longa no Rails dói mais que em app sem migration. Por isso GitHub Flow pede PR curto. Feature de três semanas? Flag (`Flipper`, `anyway_config`) e fatias que já podem ir para `main`.

**Exemplo prático:**

```bash
# antes do PR, rebase em main atual
git fetch origin
git rebase origin/main
# conflito em db/schema.rb → migrate de novo, não edita na mão
```

**Quando usar:**
Quase todo time Rails de produto. É o default que você descreve se ninguém falou o contrário.

**Na entrevista:**
> "No Rails eu assumo GitHub Flow. CI no PR, `main` protegida, deploy no merge. `schema.rb` eu regenero, não resolvo no olho."

---

## Quando o Git Flow ainda aparece

**O que é:**
Git Flow não morreu. Ficou de nicho. Você precisa saber reconhecer o nicho.

**Como funciona:**
Aparece quando “o que está pronto” ≠ “o que pode ir para o ar agora”.

Sinais:

- Release a cada sprint / mês. Marketing marca data.
- Gem, engine, API versionada com tag SemVer (`v2.4.0`).
- Dois clientes em versões diferentes. Hotfix na `1.8` sem levar a `1.9`.
- Compliance: auditoria quer tag, changelog, branch de release congelada.
- Mobile + API: o app na loja ainda fala com a API antiga.
- Monorepo legado em que `develop` é o ambiente de QA permanente.

Aí `develop` não é frescura. É o próximo pacote. `release/2.4.0` é a geladeira: só bugfix, bump, changelog.

**Quando usar:**
Esses casos. Não use “porque o tutorial ensinou” num time que faz deploy às 16h de `main`.

**Na entrevista:**
> "Git Flow ainda faz sentido com calendário, SemVer ou hotfix de versão antiga. SaaS com deploy contínuo? GitHub Flow. Eu pergunto como o time solta production antes de impor modelo."

---

## Lado a lado

**O que é:**
A tabela que você monta no quadro.

| | Git Flow | GitHub Flow |
|---|---|---|
| Branch longa | `main` + `develop` | só `main` |
| Feature nasce de | `develop` | `main` |
| Release | branch `release/*` + tag | merge em `main` + deploy (tag opcional) |
| Hotfix | sai de `main`, volta nos dois | branch curta + PR + deploy |
| Deploy | evento | consequência do merge |
| Custo | cerimônia | disciplina de PR curto |

**Como funciona:**
Git Flow otimiza “não misturar o que está no forno com o que está no ar”. GitHub Flow otimiza “o que passou no PR já pode ir para o ar”. Feature flag substitui `develop` quando a feature é grande e o deploy é contínuo.

**Exemplo prático:**
Checkout PIX incompleto. No Git Flow, fica em `develop` até o release. No GitHub Flow, ou o PR não mergeia, ou mergeia atrás de flag (`Flipper.enabled?(:pix_checkout, loja)`). Production não mostra o botão.

**Na entrevista:**
> "A diferença é o `develop`. Se todo merge já pode subir, ele é branch a mais. Se o pacote fecha na sexta e sobe na quarta, ele ganha função."

---

## O que não misturar

**O que é:**
O erro de time: fala GitHub Flow e mantém `develop` eterna. Ou fala Git Flow e faz deploy de `develop` direto.

**Como funciona:**

Ruim:

```
main      — ninguém mexe
develop   — “production de verdade”
feature/* — PR para develop, deploy de develop
```

Isso não é nenhum dos dois. É Git Flow sem release e GitHub Flow com uma branch fantasma. Onboarding sofre. Hotfix vira “mergeia develop e reza”.

Também ruim: feature de três semanas em cima de `main` sem rebase. No Rails isso explode em `schema.rb`, `routes.rb`, `Gemfile.lock`.

Bom:

- Um modelo por repo. Escrito no README.
- `main` protegida.
- Nome de branch: `feature/pix-checkout`, `hotfix/cobranca-centavos`. Prefixo é comunicação, não magia.
- Tag quando SemVer importa — gem, mobile, cliente enterprise. SaaS interno pode taguear o SHA do deploy e pronto.

Trunk-based (todo mundo perto de `main`, flag, PR de horas) é primo do GitHub Flow. Se perguntarem, você fala: “é GitHub Flow mais agressivo no tamanho da branch”. GitLab Flow (branch por ambiente) cai pouco; não invente se o time não usa.

**Na entrevista:**
> "Eu não misturo. Ou `main` é a fonte do deploy, ou existe `develop` + release. Os dois ao mesmo tempo é o time sem modelo."

---

## Recapitulando

- Git Flow: `main` / `develop` / `feature` / `release` / `hotfix`.
- Feature → `develop`. Release → `main` + `develop` + tag. Hotfix → os dois.
- GitHub Flow: `main` + branch curta + PR + CI + deploy.
- Time Rails de produto: GitHub Flow. É a resposta default.
- Git Flow ainda aparece: calendário, SemVer, versão antiga viva, auditoria.
- Hotfix sem levar de volta para `develop` reintroduz o bug no próximo release.
- `schema.rb` se regenera. Branch longa no Rails custa caro.
- Não misture os dois modelos no mesmo repo.

---

## Exercícios práticos

### Exercício 1: Qual flow você descreve?

**Enunciado:** Entrevistador: “Como é o Git de vocês?”. Time Rails, SaaS de assinatura, deploy na pipeline quando mergeia em `main`, review app no PR. Sem calendário de release. O que você responde — e o que você **não** desenha no quadro?

<details>
<summary>Solução</summary>

GitHub Flow.

```
main  ← PR de feature/pix-checkout
        CI + review → merge → deploy
```

Você fala: branch de `main`, PR curto, check obrigatório, `main` protegida, pipeline no merge. Hotfix é o mesmo caminho.

Não desenha `develop`, `release/1.4.0` nem `git flow init`. Isso é o modelo do outro caso. Se desenhar, o entrevistador acha que você decorou o blog de 2010.

**Pontos-chave:**
- Default Rails de produto = GitHub Flow
- `develop` só entra se o deploy **não** é o merge
- Ferramenta (`git-flow`) não é o modelo
</details>

### Exercício 2: Production quebrou, `develop` está sujo

**Enunciado:** Tag `v2.3.0` está no ar. `develop` já tem metade do checkout novo, migration pela metade, feature flag quebrada no admin. O PIX cobra R$ 0,01 a menos. Time diz que usa Git Flow. Qual branch você cria, de onde, e para onde o merge vai? Por quê não abrir PR de `develop` para `main`?

<details>
<summary>Solução</summary>

```bash
git switch main                    # v2.3.0
git pull
git switch -c hotfix/pix-centavos
# Integer em centavos — não mexe no checkout novo
git commit -m "Corrige arredondamento do PIX"

git switch main
git merge --no-ff hotfix/pix-centavos
git tag -a v2.3.1 -m "Hotfix PIX"

git switch develop
git merge --no-ff hotfix/pix-centavos
```

PR de `develop` → `main` levaria checkout pela metade e migration incompleta. O bug é de production; a correção nasce de production.

No GitHub Flow a resposta muda: não existe `develop` sujo. Você abre a mesma correção a partir de `main` e faz deploy. Aqui o time falou Git Flow — honre o contrato.

**Pontos-chave:**
- Hotfix nasce de `main`
- Merge nos dois, senão o release seguinte reabre o buraco
- `develop` sujo é exatamente o motivo do hotfix existir
</details>

### Exercício 3: O time tem `develop` e faz deploy dela

**Enunciado:** README diz “Git Flow”. Na prática: ninguém cria `release/*`, `main` está 40 commits atrás, production é deploy de `develop`, hotfix é commit direto em `develop`. O entrevistador pergunta o que está errado e o que você mudaria. Responda em voz de entrevista.

<details>
<summary>Solução</summary>

> "Isso não é Git Flow. É GitHub Flow com uma branch a mais chamada `develop`. `main` parou de significar production. Hotfix em `develop` mistura correção com o que ainda não deveria subir."

Caminho A — o time quer deploy contínuo (caso Rails mais comum):

- `develop` some.
- Feature nasce de `main`.
- PR + CI + deploy de `main`.
- `main` protegida. Tag opcional no deploy.

Caminho B — o time realmente fecha pacote:

- Volta o `release/*`.
- Production só sai de `main` tagueada.
- `develop` deixa de receber deploy.

Os dois funcionam. Os dois ao mesmo tempo não. Você pergunta: “o merge já pode ir para o ar?”. Sim → GitHub Flow. Não → Git Flow de verdade.

**Pontos-chave:**
- Nome no README não vale mais que o caminho do deploy
- Uma fonte da verdade para production
- Escolha pelo processo de release, não pelo hábito
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
