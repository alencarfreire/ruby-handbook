# 7.4 Transactions

> **TL;DR**
> Transaction agrupa comandos em uma unidade: ou todos ficam permanentes com `COMMIT`, ou todos são desfeitos com `ROLLBACK`. ACID significa atomicidade, consistência, isolamento e durabilidade. No PostgreSQL, o padrão é `READ COMMITTED`: ele impede dirty read, mas uma consulta repetida pode enxergar outro valor ou novas linhas. `REPEATABLE READ` fixa o snapshot da transaction. `SERIALIZABLE` também impede anomalias de serialização, mas pode abortar uma transaction concorrente. Quanto maior o isolamento, maior a chance de espera ou retry.

## Conteúdo

- [O que é uma transaction](#o-que-é-uma-transaction)
- [ACID](#acid)
- [BEGIN, COMMIT e ROLLBACK](#begin-commit-e-rollback)
- [Exemplo prático: transferência](#exemplo-prático-transferência)
- [Problemas de concorrência](#problemas-de-concorrência)
- [Níveis de isolamento](#níveis-de-isolamento)
- [Read Committed](#read-committed)
- [Repeatable Read](#repeatable-read)
- [Serializable](#serializable)
- [Como escolher](#como-escolher)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que é uma transaction

**O que é:**
Uma transaction é uma sequência de comandos SQL tratada como uma unidade lógica.

Pense em uma transferência: tirar R$ 100,00 da conta A e colocar R$ 100,00 na conta B. Se o segundo passo falhar, o primeiro não pode ficar gravado sozinho.

**Como funciona:**
Sem `BEGIN`, cada comando executado com sucesso é normalmente uma transaction própria, por causa do autocommit do cliente. Com `BEGIN`, você define a fronteira:

```sql
BEGIN;

UPDATE accounts
SET balance_cents = balance_cents - 10000
WHERE id = 1;

UPDATE accounts
SET balance_cents = balance_cents + 10000
WHERE id = 2;

COMMIT;
```

Outras conexões não enxergam essas alterações como dados confirmados antes do `COMMIT`.

**Na entrevista:**
> "Transaction define a fronteira de tudo ou nada. Eu abro com `BEGIN` e termino com `COMMIT` ou `ROLLBACK`. Ela também define como a operação interage com concorrência."

---

## ACID

### Atomicidade

**O que é:**
Todas as operações confirmam ou todas são desfeitas. Se a segunda atualização da transferência falhar, `ROLLBACK` desfaz a primeira.

Atomicidade não significa que transactions concorrentes nunca se atrapalham. Essa é a parte do isolamento.

### Consistência

**O que é:**
A transaction leva o banco de um estado válido para outro, respeitando regras como constraints, tipos e chaves.

```sql
ALTER TABLE accounts
ADD CONSTRAINT balance_non_negative
CHECK (balance_cents >= 0);
```

O banco impede saldo negativo por essa regra. Mas ACID não inventa uma regra de negócio que você não declarou nem programou.

### Isolamento

**O que é:**
Define quais efeitos de outras transactions uma operação pode observar e quais anomalias o PostgreSQL deve impedir.

Isolamento não é ausência de concorrência. O banco combina snapshots, locks e detecção de conflitos para oferecer garantias conhecidas.

### Durabilidade

**O que é:**
Depois do `COMMIT`, a alteração deve sobreviver a uma falha do processo ou reinício da máquina. O PostgreSQL usa o WAL, o write-ahead log, para registrar mudanças antes de considerá-las persistidas.

Durabilidade não substitui backup. Um `DELETE` confirmado também é durável.

**Na entrevista:**
> "Atomicidade é tudo ou nada. Consistência preserva as invariantes declaradas. Isolamento controla concorrência. Durabilidade mantém o que recebeu `COMMIT`."

---

## BEGIN, COMMIT e ROLLBACK

### BEGIN

`BEGIN` inicia a transaction explícita. `START TRANSACTION` é equivalente.

```sql
BEGIN;
INSERT INTO orders (customer_id, total_cents)
VALUES (42, 15990);
```

Uma conexão que abre uma transaction deve encerrá-la. Deixá-la aberta mantém snapshots antigos, prende recursos e pode segurar locks.

### COMMIT

`COMMIT` confirma as alterações:

```sql
COMMIT;
```

Depois dele, `ROLLBACK` não desfaz aquela transaction. Uma correção exige uma nova transaction compensatória.

### ROLLBACK

`ROLLBACK` descarta as mudanças feitas desde o `BEGIN`:

```sql
ROLLBACK;
```

No PostgreSQL, um erro de comando deixa a transaction em estado abortado. Você precisa executar `ROLLBACK` antes de continuar.

**Importante na entrevista:**
Transaction é por conexão. Um `BEGIN` em uma conexão não engloba SQL executado por outra.

---

## Exemplo prático: transferência

Uma transferência precisa validar o saldo e alterar duas contas na mesma transaction.

```sql
BEGIN;

SELECT id, balance_cents
FROM accounts
WHERE id IN (1, 2)
ORDER BY id
FOR UPDATE;

UPDATE accounts
SET balance_cents = balance_cents - 10000
WHERE id = 1 AND balance_cents >= 10000;

-- A app verifica que exatamente uma linha foi atualizada.
UPDATE accounts
SET balance_cents = balance_cents + 10000
WHERE id = 2;

COMMIT;
```

**Como funciona:**
`FOR UPDATE` bloqueia essas linhas para atualização concorrente até o fim da transaction. O `ORDER BY id` dá uma ordem consistente aos locks e ajuda a reduzir deadlocks.

A retirada é condicional. Se nenhuma linha for atualizada, a app executa `ROLLBACK`. Uma constraint ainda deve proteger a invariante no banco.

**Importante na entrevista:**
A transaction dá atomicidade. O `FOR UPDATE` coordena alterações concorrentes nessas linhas. São responsabilidades diferentes.

---

## Problemas de concorrência

### Dirty read

**O que é:**
Uma transaction lê uma alteração ainda não confirmada por outra.

```text
T1: altera o saldo para 0
T2: lê 0 antes do COMMIT de T1
T1: ROLLBACK
```

T2 tomou uma decisão com um valor que nunca existiu de forma confirmada. O PostgreSQL não permite dirty read. Nele, `READ UNCOMMITTED` se comporta como `READ COMMITTED`.

### Non-repeatable read

**O que é:**
A mesma linha retorna valores diferentes porque outra transaction confirmou uma atualização entre duas leituras.

```text
T1: SELECT balance_cents ...; -- 20000
T2: UPDATE ... SET balance_cents = 15000; COMMIT;
T1: SELECT balance_cents ...; -- 15000
```

Isso pode ocorrer em `READ COMMITTED`, pois cada comando recebe um snapshot novo.

### Phantom read

**O que é:**
A mesma consulta por predicado retorna outro conjunto de linhas após uma alteração concorrente confirmada.

```text
T1: conta pedidos pendentes -- 10
T2: insere um pedido pendente e confirma
T1: conta pedidos pendentes -- 11
```

A nova linha é o phantom. Ele pode aparecer em `READ COMMITTED`.

No PostgreSQL, `REPEATABLE READ` mantém um snapshot e também impede phantom read dentro da transaction. Essa garantia é mais forte que o mínimo exigido pelo padrão SQL para esse nível.

**Na entrevista:**
> "Dirty read lê dado sem commit. Non-repeatable read muda o valor da mesma linha. Phantom muda o conjunto de linhas de um filtro. O PostgreSQL nunca permite dirty read."

---

## Níveis de isolamento

Você define o nível no início da transaction:

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ;
-- consultas e alterações
COMMIT;
```

Ou antes da primeira consulta ou alteração:

```sql
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
```

| Nível no PostgreSQL | Snapshot | Dirty read | Non-repeatable | Phantom |
|---|---|---:|---:|---:|
| `READ COMMITTED` | Um por comando | Não | Sim | Sim |
| `REPEATABLE READ` | Um por transaction | Não | Não | Não |
| `SERIALIZABLE` | Snapshot + detecção | Não | Não | Não |

`READ UNCOMMITTED` é aceito, mas funciona como `READ COMMITTED`.

---

## Read Committed

**O que é:**
É o padrão do PostgreSQL. Cada comando enxerga os dados confirmados antes do início daquele comando. Dois `SELECT`s na mesma transaction podem enxergar estados diferentes.

**Quando usar:**
Operações curtas em que cada comando pode trabalhar com o estado confirmado mais recente e a lógica não depende de várias leituras idênticas.

`UPDATE`, `DELETE` e `SELECT FOR UPDATE` ainda podem esperar por locks concorrentes.

**Na entrevista:**
> "Read Committed é o padrão. Não lê dado sem commit, mas o snapshot vale por comando. Se eu repetir um SELECT, posso receber outro resultado."

---

## Repeatable Read

**O que é:**
Mantém um snapshot consistente durante toda a transaction.

**Quando usar:**
Relatórios ou cálculos que precisam consultar várias vezes uma visão estável.

Snapshot estável não garante que qualquer escrita será aceita. Um conflito concorrente pode causar erro de serialização. A app deve repetir a transaction inteira.

No PostgreSQL, esse nível evita dirty read, non-repeatable read e phantom read. Ainda pode existir uma anomalia que não corresponda a nenhuma ordem serial válida.

**Na entrevista:**
> "Repeatable Read fixa o snapshot e, no PostgreSQL, não vê phantoms. Mas não equivale a Serializable, porque ainda pode permitir uma anomalia de serialização."

---

## Serializable

**O que é:**
É o nível mais forte. O resultado deve ser equivalente a alguma execução em série, mesmo com transactions rodando concorrentemente.

Imagine dois médicos de plantão. Cada transaction vê que existe outro médico e remove o próprio. Em snapshots separados, ambas podem deixar o plantão. O resultado viola a regra de manter alguém disponível.

No PostgreSQL, Serializable Snapshot Isolation detecta dependências perigosas. Quando não consegue garantir uma ordem serial, cancela uma transaction com `serialization_failure`, SQLSTATE `40001`.

**Quando usar:**
Quando uma invariante depende de várias linhas, predicados ou decisões concorrentes e locks explícitos seriam difíceis de coordenar.

O retry repete `BEGIN`, leituras, cálculos, escritas e `COMMIT`. A decisão anterior usou um snapshot antigo. Efeitos externos não idempotentes, como enviar e-mail, devem ocorrer depois do commit ou por um mecanismo seguro.

**Na entrevista:**
> "Serializable não elimina concorrência. O PostgreSQL aborta uma transaction quando o resultado não pode ser serializado. Por isso retry da transaction inteira faz parte do contrato."

---

## Como escolher

**Quando usar:**

- Comece com `READ COMMITTED` para fluxos comuns e curtos.
- Use `REPEATABLE READ` quando várias consultas precisam da mesma fotografia.
- Use `SERIALIZABLE` quando a regra exige resultado equivalente a uma execução em série.
- Use locks explícitos quando você conhece as linhas que precisam ser coordenadas.
- Mantenha constraints como última barreira da integridade.

Transactions longas aumentam contenção, mantêm versões antigas e ampliam conflitos. Não faça chamadas HTTP lentas enquanto segura locks.

**Importante na entrevista:**
Explique a invariante antes de escolher: para debitar uma linha conhecida, uma atualização condicional ou `FOR UPDATE` pode bastar; para uma regra sobre várias linhas, considere `SERIALIZABLE` com retry.

Este capítulo trata de SQL no PostgreSQL. A API de transaction do Active Record fica no capítulo 6.6.

---

## Recapitulando

- `BEGIN` abre, `COMMIT` confirma e `ROLLBACK` desfaz.
- Atomicidade não é isolamento.
- Consistência depende de constraints, modelagem e lógica correta.
- Durabilidade mantém o commit, mas não substitui backup.
- PostgreSQL não permite dirty read.
- `READ COMMITTED` é o padrão e usa um snapshot por comando.
- `REPEATABLE READ` fixa o snapshot e evita phantoms no PostgreSQL.
- `SERIALIZABLE` pode abortar uma transaction para impedir anomalias.
- Erro de serialização exige retry da transaction inteira.
- Transactions devem ser curtas.

---

## Exercícios práticos

### Exercício 1: COMMIT ou ROLLBACK

**Enunciado:** Escreva uma compra que reduz uma unidade do estoque do produto `10` e cria um pedido de R$ 79,90 para o cliente `42`. Só confirme se havia estoque.

<details>
<summary>Solução</summary>

```sql
BEGIN;

UPDATE products
SET stock = stock - 1
WHERE id = 10 AND stock > 0;

-- Se nenhuma linha mudou, a app executa ROLLBACK.
INSERT INTO orders (customer_id, product_id, total_cents)
VALUES (42, 10, 7990);

COMMIT;
```

**Pontos-chave:**
- Estoque e pedido ficam na mesma transaction.
- O número de linhas afetadas decide entre continuar e fazer rollback.
- Uma constraint `CHECK (stock >= 0)` reforça a invariante.
</details>

### Exercício 2: Identifique a anomalia

**Enunciado:** Em `READ COMMITTED`, T1 conta 12 pedidos pendentes. T2 insere outro e confirma. T1 repete a contagem e recebe 13. Qual é a anomalia? Isso ocorre em `REPEATABLE READ` no PostgreSQL?

<details>
<summary>Solução</summary>

É um phantom read: o conjunto que satisfaz o filtro mudou. Em `READ COMMITTED`, cada comando recebe um snapshot novo.

No `REPEATABLE READ` do PostgreSQL, T1 mantém o snapshot e continua vendo 12. A nova linha aparece depois que T1 iniciar outra transaction.

**Pontos-chave:**
- Phantom muda o conjunto de linhas de um predicado.
- Non-repeatable read muda o valor de uma linha já lida.
- `REPEATABLE READ` do PostgreSQL evita ambos.
</details>

### Exercício 3: Retry de serialização

**Enunciado:** Uma transaction `SERIALIZABLE` falhou com SQLSTATE `40001` depois de ler disponibilidade e tentar reservar uma sala. Você repete só o `INSERT`, tenta `COMMIT` novamente ou repete tudo?

<details>
<summary>Solução</summary>

Repita a transaction inteira: `BEGIN`, consulta da disponibilidade, decisão, `INSERT` e `COMMIT`.

O snapshot anterior participou do conflito. Repetir só a escrita reutilizaria uma decisão tomada com dados antigos. O retry deve ter limite e um pequeno backoff.

**Pontos-chave:**
- `40001` é `serialization_failure`.
- Retry inclui leituras e cálculos.
- Efeitos externos não podem ser duplicados durante o retry.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
