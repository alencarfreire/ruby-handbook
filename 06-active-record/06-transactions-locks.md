# 6.6 Transactions e locks

> **TL;DR**
> `ActiveRecord::Base.transaction` agrupa escritas: ou todas fazem commit, ou todas voltam. Use métodos com `!` para não deixar validação falhar em silêncio. `ActiveRecord::Rollback` desfaz e é consumida pelo Rails; outras exceções desfazem e sobem. `after_commit` serve para efeitos que dependem do dado confirmado. `lock!`, `with_lock` e `.lock` usam lock pessimista com `SELECT ... FOR UPDATE`; `lock_version` habilita lock otimista. Deadlock é esperado sob concorrência: trave recursos na mesma ordem e, quando for seguro, repita a transaction inteira com limite.

## Conteúdo

- [Transaction: tudo ou nada](#transaction-tudo-ou-nada)
- [Rollback e exceções](#rollback-e-exceções)
- [after_commit](#after_commit)
- [Lock pessimista e SELECT FOR UPDATE](#lock-pessimista-e-select-for-update)
- [Lock otimista com lock_version](#lock-otimista-com-lock_version)
- [Deadlock e retry](#deadlock-e-retry)
- [Isolation level: só o limite](#isolation-level-só-o-limite)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Transaction: tudo ou nada

**O que é:**
Uma transaction define uma unidade atômica no banco. Se o bloco termina normalmente, o banco faz commit. Se uma exceção escapa, faz rollback.

```ruby
ActiveRecord::Base.transaction do
  order.update!(status: "paid")
  payment.update!(status: "captured")
end
```

Ou as duas mudanças ficam, ou nenhuma fica.

**Como funciona:**
A transaction vale para a conexão de banco usada pelo bloco. HTTP, Redis e outro banco não entram no mesmo commit.
Se um evento externo for enviado e uma escrita seguinte falhar, o banco volta. O evento não volta.

Use métodos que levantam exceção quando a operação precisa acontecer:

```ruby
ActiveRecord::Base.transaction do
  order.update(status: "paid") # pode retornar false
  payment.update!(status: "captured")
end
```

O primeiro `update` pode falhar por validação sem interromper o bloco. Em uma unidade atômica, `save!`, `update!`, `create!` e `destroy!` deixam a intenção clara.

**Exemplo prático:**
Uma transferência guarda dinheiro em centavos e trava as contas antes de alterar os saldos:

```ruby
def transfer(from_id:, to_id:, amount_cents:)
  raise ArgumentError, "Valor deve ser positivo" unless amount_cents.positive?

  ActiveRecord::Base.transaction do
    accounts = Account.where(id: [from_id, to_id])
      .order(:id).lock.index_by(&:id)
    from = accounts.fetch(from_id)
    to = accounts.fetch(to_id)

    raise InsufficientFunds if from.balance_cents < amount_cents

    from.update!(balance_cents: from.balance_cents - amount_cents)
    to.update!(balance_cents: to.balance_cents + amount_cents)
  end
end
```

O `.order(:id)` não é estética. Toda transferência trava contas na mesma ordem, o que reduz deadlocks.

**Na entrevista:**
> "Transaction protege a unidade de escrita no banco. Eu uso métodos bang para a falha não virar commit parcial. Serviço externo não participa do rollback."

---

## Rollback e exceções

Uma exceção comum causa rollback e continua subindo:

```ruby
ActiveRecord::Base.transaction do
  order.update!(status: "paid")
  raise "Falha inesperada"
end

# status volta; RuntimeError chega ao chamador
```

`ActiveRecord::Rollback` é especial: causa rollback, mas o Rails não a relança depois do bloco.

```ruby
ActiveRecord::Base.transaction do
  order.update!(status: "cancelled")
  raise ActiveRecord::Rollback
end

# order não foi cancelada; a execução continua
```

Use-a quando abortar for um resultado controlado. Se o chamador precisa do motivo, devolva um resultado explícito ou use uma exceção de domínio.

Não capture o erro dentro da transaction só para continuar:

```ruby
# RUIM: o bloco pode terminar normalmente e fazer commit parcial
ActiveRecord::Base.transaction do
  begin
    order.update!(status: "paid")
    payment.capture!
  rescue StandardError => error
    Rails.logger.error(error.message)
  end
end
```

Capture fora. No PostgreSQL, certos erros SQL ainda deixam a transaction inválida até o rollback. Transactions aninhadas participam da transaction aberta por padrão; `requires_new: true` cria uma subtransaction, normalmente com savepoint.

**Na entrevista:**
> "Exceção normal faz rollback e sobe. `ActiveRecord::Rollback` faz rollback e é consumida. Eu evito rescue dentro do bloco e sei que `requires_new` costuma usar savepoint."

---

## after_commit

**O que é:**
`after_commit` roda depois que o banco confirmou a transaction. Outro processo já pode enxergar os dados.

```ruby
class Order < ApplicationRecord
  after_update_commit :enqueue_receipt, if: :paid?

  private

  def enqueue_receipt
    SendReceiptJob.perform_later(id)
  end
end
```

Prefira variantes como `after_create_commit`, `after_update_commit` e `after_destroy_commit` quando o evento importa.

**Quando usar:**
- Enfileirar processamento que depende do registro persistido.
- Invalidar cache depois da confirmação.
- Iniciar integração externa depois do commit.

`after_save` ainda roda dentro da transaction. Um worker rápido pode buscar o registro antes do commit e não encontrá-lo.

O callback não estende a atomicidade. Se `enqueue_receipt` falhar, a order já foi persistida. Para entrega confiável, o padrão outbox persiste um evento na mesma transaction e o publica depois. Jobs e integrações também devem ser idempotentes.

**Importante na entrevista:**
> "Eu uso `after_commit` quando o efeito depende de dado confirmado. Se o callback falhar, o commit não volta. Para garantia forte de publicação, considero outbox."

---

## Lock pessimista e SELECT FOR UPDATE

**O que é:**
Lock pessimista assume que a disputa pode acontecer. A transaction trava a linha antes de ler, decidir e escrever.

```ruby
Account.transaction do
  account = Account.lock.find(account_id)
  raise InsufficientFunds if account.balance_cents < amount_cents

  account.update!(balance_cents: account.balance_cents - amount_cents)
end
```

No PostgreSQL, `.lock` gera `SELECT ... FOR UPDATE`:

```sql
SELECT "accounts".* FROM "accounts"
WHERE "accounts"."id" = 42
FOR UPDATE;
```

Outra transaction que pedir um lock conflitante espera commit ou rollback. Uma leitura comum pode ler a versão confirmada anterior por causa do MVCC.

`lock!` trava e recarrega uma instância:

```ruby
Account.transaction do
  account = Account.find(account_id)
  account.lock!
  account.update!(balance_cents: account.balance_cents - 2_500)
end
```

Não altere o objeto antes de `lock!`. O Rails rejeita lock em registro com mudanças locais não persistidas, pois o reload as descartaria.

`with_lock` abre uma transaction, trava o registro e executa o bloco:

```ruby
product.with_lock do
  raise OutOfStock unless product.stock.positive?
  product.update!(stock: product.stock - 1)
end
```

Para várias linhas, use `.lock` e uma ordem estável:

```ruby
Account.transaction do
  accounts = Account.where(id: account_ids).order(:id).lock.load
  # altera as contas já travadas
end
```

O lock vive até commit ou rollback. Não faça HTTP, e-mail ou trabalho pesado no bloco. Busque dados externos antes quando a regra permitir; dentro do lock, releia, valide e escreva rápido. Lock também não substitui índice único, `NOT NULL` ou `CHECK`.

**Na entrevista:**
> "`lock!` trava e recarrega uma instância. `with_lock` envolve o bloco em transaction e lock. Para várias linhas, eu ordeno os IDs antes de travar."

---

## Lock otimista com lock_version

**O que é:**
Lock otimista não bloqueia durante a leitura. Ele detecta que outra escrita venceu.

```ruby
class AddLockVersionToProducts < ActiveRecord::Migration[7.1]
  def change
    add_column :products, :lock_version, :integer, null: false, default: 0
  end
end
```

O Active Record usa essa coluna automaticamente. Cada update compara a versão conhecida no `WHERE` e incrementa `lock_version`.

Se outra request já mudou a linha, zero linhas são atualizadas e o Rails levanta `ActiveRecord::StaleObjectError`.

```ruby
first = Product.find(7)
second = Product.find(7)

first.update!(price_cents: 12_900)
second.update!(price_cents: 11_900) # StaleObjectError
```

Use em edições de formulário com conflitos raros. O formulário precisa transportar a versão editada:

```erb
<%= form.hidden_field :lock_version %>
```

Não faça retry cego de uma edição humana. Reaplicar parâmetros antigos pode apagar a mudança da outra pessoa. Recarregue, faça merge quando a regra for segura ou apresente o conflito.

**Na entrevista:**
> "Pessimista evita concorrência com `FOR UPDATE`. Otimista deixa concorrer e detecta conflito com `lock_version`, levantando `StaleObjectError`."

---

## Deadlock e retry

Deadlock ocorre quando transactions esperam locks umas das outras. A trava conta 1 e quer a 2; B trava a 2 e quer a 1. O PostgreSQL detecta o ciclo e aborta uma vítima.

Reduza a chance:
- Trave recursos na mesma ordem, como `order(:id)`.
- Mantenha transactions curtas e sem chamadas externas.
- Tenha índices para a busca não tocar mais linhas que o necessário.

O Rails expõe `ActiveRecord::Deadlocked`. Faça retry da transaction inteira, fora do bloco e com limite:

```ruby
MAX_DEADLOCK_RETRIES = 3
attempts = 0

begin
  ActiveRecord::Base.transaction do
    # releia, trave e refaça toda a operação
  end
rescue ActiveRecord::Deadlocked
  attempts += 1
  raise if attempts > MAX_DEADLOCK_RETRIES

  sleep(rand * 0.05 * attempts)
  retry
end
```

O retry deve reconstruir o estado. Não repita só uma subtransaction dentro de uma transaction externa abortada.

Só repita operações seguras. Uma chamada externa no bloco pode duplicar cobrança ou mensagem. Retire o efeito externo da transaction, torne-o idempotente e dispare depois do commit. Registre retries e falhas finais; retry infinito só esconde contenção.

**Importante na entrevista:**
> "O banco escolhe uma vítima para quebrar o deadlock. Eu padronizo a ordem dos locks e, se a operação for segura, repito a transaction inteira com backoff e limite."

---

## Isolation level: só o limite

Isolation level define quais efeitos concorrentes uma transaction pode observar. O Active Record permite pedir níveis suportados pelo adapter, por exemplo `transaction(isolation: :serializable)`.

`serializable` não significa "nunca falha": o PostgreSQL pode abortar uma transaction concorrente. Aqui, separe as ideias: transaction dá atomicidade; lock coordena acesso; isolation controla fenômenos de leitura. Os detalhes de SQL ficam no capítulo 7.4.

---

## Recapitulando

- `transaction` faz commit ao terminar e rollback quando uma exceção escapa.
- Métodos bang impedem que falha de validação vire commit parcial.
- `ActiveRecord::Rollback` volta mudanças, mas não sobe ao chamador.
- `after_commit` roda após a confirmação; uma falha nele não desfaz o commit.
- `lock!`, `with_lock` e `.lock` aplicam lock pessimista.
- No PostgreSQL, o padrão é `SELECT ... FOR UPDATE`.
- `lock_version` detecta escrita concorrente com `StaleObjectError`.
- Deadlock pede ordem estável e, quando seguro, retry limitado da transaction inteira.
- Dinheiro fica em centavos, nunca em Float.

---

## Exercícios práticos

### Exercício 1: Reserva de estoque

**Enunciado:** Implemente `reserve(product_id:, quantity:)`. Duas requests não podem vender mais unidades do que existem. Use lock pessimista e retorne `false` sem estoque.

<details>
<summary>Solução</summary>

```ruby
def reserve(product_id:, quantity:)
  raise ArgumentError unless quantity.positive?

  Product.transaction do
    product = Product.lock.find(product_id)
    raise ActiveRecord::Rollback if product.stock < quantity

    product.update!(stock: product.stock - quantity)
    return true
  end

  false
end
```

**Pontos-chave:**
- A checagem e a escrita usam a linha travada.
- `update!` aborta em falha de validação.
- `ActiveRecord::Rollback` representa falta de estoque sem erro técnico.
</details>

### Exercício 2: Conflito de edição

**Enunciado:** Dois atendentes editam o mesmo produto. Configure lock otimista e explique o tratamento do segundo envio.

<details>
<summary>Solução</summary>

```ruby
add_column :products, :lock_version, :integer, null: false, default: 0
```

Inclua `<%= form.hidden_field :lock_version %>` no formulário. O segundo update levanta `ActiveRecord::StaleObjectError`. Recarregue o produto e peça ao atendente para revisar os dados. Retry cego poderia sobrescrever o preço do primeiro.

**Pontos-chave:**
- O Rails compara e incrementa `lock_version`.
- O conflito deve ficar visível para quem editou.
- Preço continua em `price_cents`.
</details>

### Exercício 3: Retry de deadlock

**Enunciado:** Um serviço captura `ActiveRecord::Deadlocked` dentro da transaction e repete só o último update. Corrija a estratégia e cite duas prevenções.

<details>
<summary>Solução</summary>

```ruby
attempts = 0

begin
  ActiveRecord::Base.transaction do
    accounts = Account.where(id: account_ids).order(:id).lock.load
    apply_entries!(accounts)
  end
rescue ActiveRecord::Deadlocked
  attempts += 1
  raise if attempts > 3
  sleep(rand * 0.05 * attempts)
  retry
end
```

**Pontos-chave:**
- Capture fora e repita a transaction inteira.
- Trave recursos sempre na mesma ordem.
- Mantenha o bloco curto, idempotente e sem chamadas externas.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
