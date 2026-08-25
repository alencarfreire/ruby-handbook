# 4.5 Conflitos

> **TL;DR**
> Conflito não é erro do Git. É duas mudanças no mesmo hunk e o Git se recusa a chutar. Marcadores: `<<<<<<<`, `=======`, `>>>>>>>`. Arquivo gerado (`schema.rb`, `structure.sql`, `Gemfile.lock`) você regenera — não costura na mão. Deu ruim: `--abort`. Na entrevista: explique o processo, não o pânico.

## Conteúdo

- [Por que conflito](#por-que-conflito)
- [Marcadores](#marcadores)
- [Resolver na mão](#resolver-na-mão)
- [mergetool](#mergetool)
- [abort](#abort)
- [schema.rb e structure.sql](#schemarb-e-structuresql)
- [Lockfile](#lockfile)
- [Na entrevista](#na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Por que conflito

**O que é:**
O Git aplica mudanças hunk por hunk. Se os dois lados tocam a mesma região (ou uma deleta o que o outro edita), não tem resolução automática. Isso é conflito.

**Como funciona:**
Merge, rebase, cherry-pick e `stash pop` passam pelo mesmo motor. Três pontas: base comum, o seu lado, o lado que está chegando. Diff de cada lado contra a base. Hunks que não se cruzam entram sozinhos. Hunks que se cruzam param o processo e marcam o arquivo.

Não é “o Git quebrou”. É “o Git não vai inventar o código certo”.

**Quando usar:**
Sempre que `git status` disser `both modified` / `unmerged`. Você está no meio de um merge, rebase ou cherry-pick. O HEAD ainda não avançou de verdade até você resolver e concluir.

**Na entrevista:**
> "Conflito é duas pessoas (ou duas branches) editando o mesmo pedaço. O Git para. Eu leio os dois lados, decido o resultado, testo, só então continuo."

---

## Marcadores

**O que é:**
Três linhas que o Git injeta no arquivo. Não são Ruby. Se você commitar isso, a app quebra no load — `schema.rb` vira lixo, YAML explode, Ruby dá `SyntaxError`.

**Como funciona:**
```text
<<<<<<< HEAD
def full_name
  "#{first_name} #{last_name}"
end
=======
def full_name
  [first_name, last_name].compact.join(" ")
end
>>>>>>> feature/nome
```

- `<<<<<<< HEAD` — começa o seu lado (no merge: o que já estava na branch em que você está).
- `=======` — separa os dois lados.
- `>>>>>>> feature/nome` — o lado que está chegando. O nome depois da seta é a outra ponta (branch, commit, `stash`).

Diff de 3 vias (`merge.conflictstyle=diff3` ou `zdiff3`) ainda mostra a base comum entre `|||||||` e `=======`. Útil quando os dois lados divergiram a partir de um terceiro texto.

```text
<<<<<<< HEAD
preco_centavos = 1990
||||||| merged common ancestors
preco_centavos = 1890
=======
preco_centavos = 2090
>>>>>>> feature/preco
```

Aqui você vê o valor antigo. Ajuda a não escolher no chute.

**Quando usar:**
Leitura obrigatória antes de apagar qualquer lado. Se o arquivo está cheio de `<<<<<<<` e você não entende o hunk, não é hora de `git add`.

**Na entrevista:**
> "<<<<<<< é o meu lado no merge. ======= corta. >>>>>>> é o que está entrando. Eu apago os três marcadores. O que sobra tem que ser código válido."

---

## Resolver na mão

**O que é:**
Abrir o arquivo, decidir o texto final, tirar os marcadores, `git add`, concluir o merge ou o rebase.

**Como funciona:**
```bash
git status                  # lista unmerged
# edita app/models/user.rb  # tira <<<<<<< ======= >>>>>>>
git add app/models/user.rb
git commit                  # se era merge — mensagem já vem pronta
# ou
git rebase --continue       # se era rebase
```

`git add` no arquivo em conflito diz: “este conteúdo é o resultado”. Sem o add, o Git não deixa concluir.

Checkout de um lado inteiro, quando um dos lados está certo de ponta a ponta:

```bash
git checkout --ours   app/models/user.rb
git checkout --theirs app/models/user.rb
```

**Importante na entrevista:**
`ours` / `theirs` invertem no rebase. No merge, `ours` é a branch em que você está (em geral `main`). No rebase, você está reaplicando os *seus* commits em cima da outra — então `ours` vira a branch base e `theirs` vira o seu commit. Se você recitar “ours sou eu” sem esse asterisco, o entrevistador puxa o tapete.

**Quando usar:**
Código que você escreveu: model, controller, spec. Aí lê, combina, testa. Arquivo gerado: próxima seção — não é este fluxo.

**Exemplo prático:**
Dois PRs adicionam validação em `User`. Um exige `cpf`, o outro exige `cnpj`. O resultado certo quase nunca é um lado só: são as duas linhas, sem marcador.

```ruby
# resultado
validates :cpf, presence: true, if: :pessoa_fisica?
validates :cnpj, presence: true, if: :pessoa_juridica?
```

**Na entrevista:**
> "Eu não escolho o lado maior. Eu pergunto: as duas mudanças precisam existir juntas? Se sim, eu uno. Depois rodo o spec daquele arquivo."

---

## mergetool

**O que é:**
`git mergetool` abre um programa de 3 vias (base, ours, theirs) e grava o resultado no working tree. É o mesmo conflito — só muda a UI.

**Como funciona:**
```bash
git mergetool
# ou
git mergetool -t vscode
```

Ferramentas comuns: VS Code, `opendiff` (Xcode), Meld, vimdiff. Configura uma vez:

```bash
git config --global merge.tool vscode
git config --global mergetool.keepBackup false
```

O `.orig` que sobra depois do tool é lixo. `keepBackup false` evita commitar backup.

**Quando usar:**
Hunk grande, HTML/ERB, arquivo que você não quer ler com `<<<<<<<` no meio. Não use mergetool em `Gemfile.lock` nem em `schema.rb` — a ferramenta vai te convidar a costurar dump gerado.

**Na entrevista:**
> "mergetool é editor de 3 vias. Eu uso quando o hunk é grande. Em schema e lockfile eu regenero, não abro o tool."

---

## abort

**O que é:**
Desfaz o merge/rebase/cherry-pick inteiro e volta o working tree ao estado de antes do comando. Conflito pela metade some.

**Como funciona:**
```bash
git merge --abort
git rebase --abort
git cherry-pick --abort
git stash show   # se o pop conflitou, o stash ainda está lá
```

`--abort` só existe enquanto a operação está em andamento (existe `MERGE_HEAD`, `rebase-merge/`, etc.). Depois do commit de merge, abort não existe mais: é `git reset` consciente.

Se você já resolveu metade e se perdeu, abort é mais barato que “consertar o conserto”. Você não perde a branch de origem. Perde só o trabalho de resolução que ainda não commitou.

**Quando usar:**
Você puxou a branch errada. O conflito é enorme e o rebase não era o movimento. Você não entende o arquivo e precisa falar com quem escreveu o outro lado.

**Na entrevista:**
> "Se eu comecei o rebase e vi que era merge que o time usa, eu aborto. Não empurro resolução pela metade só para sair do estado vermelho."

---

## schema.rb e structure.sql

**O que é:**
O conflito clássico de Rails. Duas branches, duas migrations. Os dois `db:migrate` reescrevem `db/schema.rb` (ou `db/structure.sql`). O Git vê o dump inteiro mudar e marca conflito. Não é o model que brigou — é o artefato gerado.

**Como funciona:**
`schema.rb` tem um `version:` no topo (timestamp da última migration) e o retrato das tabelas. Cada migrate reescreve os dois. Duas features = dois dumps = conflito garantido, mesmo se as tabelas não se tocam.

```ruby
# típico — só a linha de versão já conflita
<<<<<<< HEAD
ActiveRecord::Schema[7.1].define(version: 2026_08_20_101500) do
=======
ActiveRecord::Schema[7.1].define(version: 2026_08_21_093000) do
>>>>>>> feature/pedidos
```

**Não faça:** escolher um lado no olho e commitar. Você perde tabela, índice ou a entrada em `insert_versions`.

**Faça:**
1. Garanta que as duas migrations estão no working tree (em `db/migrate/` quase nunca conflita — o nome do arquivo é o timestamp).
2. Pegue um dos lados só para destravar o arquivo, ou apague o schema e regenere.
3. Rode as migrations pendentes. O Rails reescreve o schema certo.

```bash
# as migrations das duas branches já estão em db/migrate/
git checkout --ours db/schema.rb   # ou --theirs: só para o arquivo existir
bin/rails db:migrate
git add db/schema.rb
```

`structure.sql` é a mesma história com dump SQL. Depois das migrations:

```bash
bin/rails db:schema:dump
git add db/structure.sql
```

Se a sua base local está suja, `db:migrate` mente. Aí: banco limpo (`db:drop db:create db:migrate`) ou, no time que usa load: `db:schema:load` da versão que você escolheu + migrate das que faltam. O critério é: o schema commitado tem que ser o produto das migrations, não o produto do mergetool.

**Quando usar:**
Todo PR Rails que cria migration em paralelo com outro. É o conflito que o entrevistador espera você citar sem pensar.

**Na entrevista:**
> "schema.rb é gerado. Eu não resolvo na mão. Deixo as duas migrations, rodo db:migrate, commito o schema que o Rails escreveu. version: fica o timestamp mais novo."

---

## Lockfile

**O que é:**
`Gemfile.lock` (e, se o front está no mesmo repo, `yarn.lock` / `package-lock.json`) é resolução de árvore, não texto. Duas pessoas rodaram `bundle install` com `Gemfile` diferente. O lock inteiro mexe. Merge linha a linha inventa grafo que o Bundler nunca gerou.

**Como funciona:**
```bash
# 1. resolva o Gemfile primeiro — esse sim é texto
# 2. aí regenera o lock
git checkout --ours Gemfile.lock   # de novo: só para destravar
bundle install
git add Gemfile.lock
```

Se o conflito é só de lock e o `Gemfile` está igual, alguém gerou o lock em máquina diferente (platform, Bundler velho). `bundle install` de novo costuma bastar.

Não edite `BUNDLED WITH` na mão para “ganhar” o conflito. A versão do Bundler do CI é a que manda.

**Quando usar:**
Qualquer PR que mexeu em gem (ou o colega mexeu). Mesma regra do schema: arquivo gerado se regenera.

**Exemplo prático:**
Você sobe `pundit`. A outra branch sobe `pagy`. Os dois locks listam dezenas de specs transitivos. Costurar `DEPENDENCIES` no olho passa no `git add` e quebra no CI com `Bundler::LockfileError` ou gem fantasma.

**Na entrevista:**
> "Lockfile eu não mergeio. Resolvo o Gemfile, rodo bundle install, commito o lock novo. É o mesmo raciocínio do schema.rb."

---

## Na entrevista

**O que é:**
O tema não é decorar flag. É mostrar que você não trata conflito como acidente vergonhoso e que você distingue código de artefato.

**Como funciona:**
Roteiro curto, falado:

1. Por que parou — mesmo hunk, dois lados.
2. O que eu leio — marcadores; se for `diff3`, a base.
3. O que eu não leio como código — `schema.rb`, `structure.sql`, `Gemfile.lock`.
4. Como eu fecho — add, commit / `--continue`, rodo o spec.
5. Como eu desisto — `--abort`, não force-push da resolução pela metade.

Frase que fecha bem:

> "Conflito é o Git pedindo uma decisão. Em código eu decido. Em arquivo gerado eu deixo a ferramenta decidir de novo."

**Importante na entrevista:**
- Não diga “eu sempre aceito incoming”. Isso apaga o trabalho da branch atual.
- Não diga “eu evito conflito não puxando main”. O contrário: atualizar cedo reduz conflito enorme no fim do PR.
- Se o conflito é de regra de negócio (os dois lados mudam o mesmo preço, o mesmo status), você fala com quem abriu o outro PR. Resolução de Git não substitui alinhamento.

**Quando usar:**
Pergunta clássica: “Como você resolve conflito no Rails?”. Comece por `schema.rb`. Se o entrevistador sorriu, você acertou o alvo.

---

## Recapitulando

- Conflito = mesmo hunk, dois lados. O Git não chuta.
- `<<<<<<<` / `=======` / `>>>>>>>` saem do arquivo antes do commit.
- `ours`/`theirs` invertem no rebase. Confirme com `git status`.
- `git mergetool` é UI. Não resolve schema nem lockfile.
- Deu ruim: `merge --abort` / `rebase --abort`.
- `schema.rb` e `structure.sql`: migrations das duas pontas + `db:migrate` / `db:schema:dump`.
- `Gemfile.lock`: resolve o `Gemfile`, `bundle install`, commita o lock gerado.
- Na entrevista: processo + “arquivo gerado se regenera”. Não recitar flag.

---

## Exercícios práticos

### Exercício 1: Ler o marcador

**Enunciado:** O merge parou neste hunk. Qual é o código final se as duas mudanças são válidas? O que acontece se você commitar o arquivo assim?

```ruby
class Order < ApplicationRecord
<<<<<<< HEAD
  enum :status, { rascunho: 0, pago: 1, cancelado: 2 }
=======
  enum :status, { rascunho: 0, pago: 1, enviado: 2, cancelado: 3 }
>>>>>>> feature/envio
end
```

<details>
<summary>Solução</summary>

Os dois lados querem o enum. O da feature adiciona `enviado` e empurra `cancelado` para `3`. Se produção já tem `cancelado = 2` gravado, aceitar o lado da feature **muda o significado da coluna**. Resolução certa não é “o lado maior”:

```ruby
class Order < ApplicationRecord
  enum :status, { rascunho: 0, pago: 1, cancelado: 2, enviado: 3 }
end
```

`enviado` entra no fim. Inteiros antigos ficam. Você confirma com quem escreveu a outra branch se já rodou migration de dados.

Se commitar com os marcadores: `SyntaxError` no boot. O Git aceita. O Rails não.

**Pontos-chave:**
- Unir != aceitar um lado
- Enum com inteiro é contrato com o banco
- Marcador no commit passa no Git e quebra a app
</details>

### Exercício 2: schema.rb clássico

**Enunciado:** Duas branches. Uma cria `CreateProducts`. Outra cria `CreateOrders`. O merge marca conflito só em `db/schema.rb`. `db/migrate/` está limpo, com os dois arquivos. O que você faz, em ordem? Por que não basta `git checkout --theirs db/schema.rb`?

<details>
<summary>Solução</summary>

1. Confirmar que as duas migrations existem em `db/migrate/`.
2. Destravar o schema (`--ours` ou `--theirs` — tanto faz neste passo).
3. `bin/rails db:migrate` (banco alinhado com as duas).
4. `git add db/schema.rb` e concluir o merge.
5. Olhar o `version:`: tem que ser o timestamp mais novo das duas.

`--theirs` sozinho deixa só as tabelas da outra branch. Você perde `products` (ou `orders`, conforme o lado). O schema tem que ser o retrato das **migrations somadas**, não o retrato de um dump vencedor.

Se `structure.sql`: o mesmo, fechando com `bin/rails db:schema:dump`.

**Pontos-chave:**
- Conflito no dump, não na migration
- Regenera; não costura
- `--theirs` em schema apaga a outra tabela
</details>

### Exercício 3: Falar em 40 segundos

**Enunciado:** O entrevistador pergunta: “Chega conflito no `Gemfile.lock` e no `schema.rb` no mesmo PR. O que você faz?”. Responda como falaria na sala. Inclua o que você **não** faz.

<details>
<summary>Solução</summary>

> "São dois arquivos gerados. No Gemfile eu resolvo o texto — as gems das duas branches. Depois `bundle install` e commito o lock que o Bundler escreveu. No schema eu deixo as duas migrations, rodo `db:migrate` e commito o schema novo. Eu não abro mergetool nesses dois e não escolho ours/theirs como resposta final. Se o Gemfile em si conflitou numa gem com versão incompatível, aí eu falo com o outro PR antes de chutar a versão."

**Pontos-chave:**
- Gemfile é texto; lock é árvore
- schema é dump; migration é a fonte
- mergetool não é a resposta de Rails
- Versão incompatível é conversa, não Git
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
