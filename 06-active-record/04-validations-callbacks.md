# 6.4 Validations e callbacks

> **TL;DR**
> Validations protegem o estado do model antes da persistência. `valid?` executa as regras e preenche `errors`; `save` valida e retorna `false` quando falha; `save!` levanta exceção. `uniqueness` não substitui índice único no banco. Callbacks vão de `before_validation` a `after_commit`. Para efeitos externos, prefira `after_commit`: `after_save` ainda roda dentro da transação. Callback curto para uma invariante local é útil; callback que esconde um fluxo inteiro é cheiro de design. Jobs entram depois.

## Conteúdo

- [O que validations protegem](#o-que-validations-protegem)
- [Presence](#presence)
- [Uniqueness](#uniqueness)
- [Numericality](#numericality)
- [Validation customizada](#validation-customizada)
- [Lendo errors](#lendo-errors)
- [valid?, save e save!](#valid-save-e-save)
- [Ordem dos callbacks](#ordem-dos-callbacks)
- [after_commit vs after_save](#after_commit-vs-after_save)
- [Por que callbacks grandes são um cheiro](#por-que-callbacks-grandes-são-um-cheiro)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que validations protegem

**O que é:**
Uma validation declara quando um model pode ser considerado válido. Ela roda no Ruby antes do `INSERT` ou `UPDATE` normal do Active Record.

```ruby
class Product < ApplicationRecord
  validates :name, presence: true
end

product = Product.new(name: "")
product.valid?       # false
product.persisted?   # false
product.errors.any?  # true
```

**Como funciona:**
Validation não é constraint do banco. SQL direto, `insert_all`, `update_column` e `save(validate: false)` podem ignorá-la.

Para uma invariante crítica, use as duas camadas:

- validation no model para regra e feedback;
- constraint no banco para integridade definitiva.

Campo obrigatório costuma ter `presence: true` e `null: false`. Valor único costuma ter `uniqueness` e índice único.

**Na entrevista:**
> "Validation melhora o fluxo da aplicação, mas a última barreira é o banco. Para invariantes críticas eu também crio constraints."

---

## Presence

**O que é:**
`presence` rejeita valores blank: `nil`, string vazia, string só com espaços e coleção vazia.

```ruby
User.validates :name, :email, presence: true
User.new(name: "   ", email: nil).valid?  # false
```

**Importante na entrevista:**
`presence` usa `blank?`. Como `false.blank?` é `true`, não use presence para um boolean que aceita os dois valores.

```ruby
class Contract < ApplicationRecord
  validates :accepted, inclusion: { in: [true, false] }
end
```

Se apenas `true` for válido, use uma regra que expresse isso, como `acceptance`.

---

## Uniqueness

**O que é:**
`uniqueness` consulta se outro registro já tem o mesmo valor.

```ruby
class User < ApplicationRecord
  validates :email,
            presence: true,
            uniqueness: { case_sensitive: false }
end
```

Ela também aceita escopo:

```ruby
class Membership < ApplicationRecord
  validates :user_id, uniqueness: { scope: :organization_id }
end
```

O usuário pode aparecer em organizações diferentes, mas não duas vezes na mesma organização.

**Como funciona:**
Duas requisições concorrentes podem consultar ao mesmo tempo, ambas enxergarem o valor como livre e tentarem inserir. A garantia real vem do banco.

```ruby
add_index :memberships,
          %i[organization_id user_id],
          unique: true
```

Para e-mail case-insensitive, normalization, validation e índice precisam adotar a mesma estratégia. O formato do índice funcional depende do banco.

Mesmo com a validation, uma corrida pode chegar ao índice e levantar `ActiveRecord::RecordNotUnique`. Quando a concorrência faz parte do fluxo, trate essa exceção ou use uma operação atômica adequada.

**Na entrevista:**
> "`validates uniqueness` faz uma consulta e tem race condition. Eu sempre combino com unique index."

---

## Numericality

**O que é:**
`numericality` verifica se o valor é numérico e aceita comparações declarativas.

```ruby
class Product < ApplicationRecord
  validates :price_cents,
            numericality: { only_integer: true, greater_than: 0 }
end
```

Comparações como `greater_than_or_equal_to` e `less_than_or_equal_to` limitam uma faixa:

```ruby
validates :discount_percentage,
          numericality: { in: 0..100 }
```

Por padrão, `nil` falha. Para campo opcional, use `allow_nil: true`. `allow_nil` ignora apenas `nil`; `allow_blank` também ignora outros valores blank. Para dinheiro, ainda escolha Integer em centavos ou uma coluna decimal adequada. A validation não corrige a imprecisão de Float.

**Na entrevista:**
> "Numericality expressa faixa e tipo esperado, mas não substitui a escolha correta da coluna."

---

## Validation customizada

**Quando usar:**
Use `validate` quando a regra envolve mais de um atributo ou não cabe claramente nos validators declarativos.

```ruby
class Booking < ApplicationRecord
  validate :ends_after_start

  private

  def ends_after_start
    return if starts_at.blank? || ends_at.blank?
    return if ends_at > starts_at

    errors.add(:ends_at, "deve ser posterior ao início")
  end
end
```

O retorno `false` não invalida o model sozinho. A regra falha quando adiciona um erro. Para um problema do objeto inteiro, use `errors.add(:base, "operação inválida")`.

As opções `if`, `unless` e `on` controlam quando validar. Um contexto customizado roda com `valid?(:account_setup)`.

```ruby
validates :cancellation_reason, presence: true, if: :cancelled?
validates :email, presence: true, on: :account_setup
```

Não chame API externa numa validation. Ela deve ser rápida, previsível e sem efeito colateral.

**Na entrevista:**
> "Numa custom validation eu adiciono o erro em `errors`; só retornar false não basta."

---

## Lendo errors

**Como funciona:**
Depois das validations, `errors` é um `ActiveModel::Errors`.

```ruby
user = User.new
user.valid?

user.errors.any?                       # true
user.errors[:email]                    # mensagens do atributo
user.errors.full_messages              # mensagens para exibição
user.errors.of_kind?(:email, :blank)   # true ou false
```

Em código e testes, o tipo `:blank` costuma ser mais estável que uma frase traduzida. `full_messages` é bom para interface; `details`, `added?` e `of_kind?` são úteis para decisões no código. Por exemplo, `errors.details` pode retornar `{ email: [{ error: :blank }] }`.

**Importante na entrevista:**
> "`errors` reflete a última execução das validations. Primeiro eu chamo `valid?` ou tento salvar."

---

## valid?, save e save!

**Como funciona:**
`valid?` executa validations e preenche `errors`, mas não persiste.

```ruby
user.valid?       # false
user.new_record?  # true
```

`save` executa validations e callbacks. Se a validation falhar, retorna `false`, permitindo renderizar o formulário com `errors`.

`save!` levanta `ActiveRecord::RecordInvalid` se o model for inválido. O mesmo contraste existe entre `create` e `create!`, `update` e `update!`.

Sem `!` é útil quando a invalidez é esperada e você vai exibir `errors`. Com `!` é útil quando a falha deve interromper o fluxo, como numa transação.

`save(validate: false)` pula validations, mas ainda roda callbacks de persistência. Use só em caso excepcional.

Um callback também pode interromper o fluxo com `throw :abort`. Nesse caso, `save` retorna `false`, enquanto `save!` levanta `ActiveRecord::RecordNotSaved`, não `RecordInvalid`.

**Na entrevista:**
> "`valid?` não salva. `save` retorna status; `save!` levanta exceção. Em transações eu normalmente prefiro bang."

---

## Ordem dos callbacks

**O que é:**
Num `create`, a sequência principal é:

1. `before_validation`
2. validations
3. `after_validation`
4. `before_save`
5. `around_save` abre o bloco
6. `before_create`
7. `around_create` abre o bloco
8. `INSERT`
9. `around_create` fecha o bloco
10. `after_create`
11. `around_save` fecha o bloco
12. `after_save`
13. commit da transação
14. `after_commit`

Num update, entram `before_update`, `around_update` e `after_update` no lugar dos callbacks de create. No destroy, entram `before_destroy`, `around_destroy`, `after_destroy` e, depois da confirmação, `after_commit`.

Callbacks `around_*` envolvem a operação com `yield`; por isso têm uma parte antes e outra depois. Sem chamar `yield`, o callback interrompe a operação envolvida.

Há atalhos específicos: `after_create_commit`, `after_update_commit` e `after_destroy_commit`. Se ocorrer rollback, `after_commit` não roda; existe `after_rollback`.

**Na entrevista:**
> "O ciclo começa em before_validation, passa pela escrita e só chega ao after_commit após o commit real."

---

## after_commit vs after_save

**O que é:**
`after_save` roda depois do `INSERT` ou `UPDATE`, mas ainda dentro da transação. Uma etapa posterior pode causar rollback.

`after_commit` roda quando a transação terminou com sucesso. Outra conexão já pode enxergar o dado confirmado.

```ruby
after_create_commit :enqueue_confirmation

def enqueue_confirmation
  OrderConfirmationJob.perform_later(id)
end
```

Prefira `after_commit` para enfileirar job, publicar evento, invalidar cache externo ou iniciar integração. Em `after_save`, um worker rápido pode não encontrar o registro, ou a transação pode voltar depois que o efeito externo já aconteceu.

Isso não torna banco e serviço externo atômicos. Se a publicação não puder ser perdida, você pode precisar de uma estratégia como transactional outbox.

Use `after_save` quando a lógica realmente pertence à transação e deve participar do rollback. Mesmo assim, mantenha-a curta e sem I/O externo.

**Na entrevista:**
> "Para efeito externo eu prefiro after_commit. After_save significa escrito, não confirmado."

---

## Por que callbacks grandes são um cheiro

**O que é:**
Callback esconde execução. Você lê `order.save!`, mas a chamada pode cobrar cartão, reservar estoque, enviar e-mail e notificar analytics sem mostrar nada disso.

Problemas comuns são acoplamento com a persistência, ordem difícil de entender, efeito repetido a cada `save`, testes frágeis, transações longas por I/O e recursão ao salvar dentro do callback. Além disso, algumas operações de escrita pulam callbacks.

Callbacks são adequados para invariantes locais, curtas e idempotentes.

```ruby
before_validation :normalize_email

def normalize_email
  self.email = email.to_s.strip.downcase
end
```

Um fluxo com cobrança, estoque e notificação merece um objeto explícito, como `Checkout`. Trabalho lento ou externo pode ser enfileirado depois do commit. A implementação de jobs fica para outro capítulo.

**Na entrevista:**
> "Callback não é sempre ruim. Eu uso para invariante local e pequena. Orquestração e integração ficam explícitas; se for assíncrono, enfileiro após o commit."

---

## Recapitulando

- Validations cuidam do model; constraints garantem integridade no banco.
- `presence` usa `blank?`; cuidado com boolean `false`.
- `uniqueness` precisa de índice único contra concorrência.
- `numericality` expressa tipo e faixa, mas não corrige a coluna errada.
- Custom validation invalida ao adicionar itens em `errors`.
- `valid?` não salva; `save` retorna status; `save!` levanta exceção.
- O ciclo vai de `before_validation` até `after_commit`.
- `after_save` ainda está na transação; `after_commit` vem após confirmação.
- Callback pequeno pode proteger invariante; callback grande esconde orquestração.

---

## Exercícios práticos

### Exercício 1: Unicidade sob concorrência

**Enunciado:** Um model tem `validates :email, uniqueness: true`. Explique por que ainda podem surgir duplicatas e escreva a proteção que falta.

<details>
<summary>Solução</summary>

Duas requisições podem consultar antes de qualquer insert. Ambas passam pela validation. O banco precisa fechar a corrida:

```ruby
add_index :users, :email, unique: true
```

Normalization, validation e índice devem usar a mesma estratégia de maiúsculas e minúsculas.

**Pontos-chave:**
- Validation dá feedback
- Índice único garante integridade
- A corrida pode levantar `ActiveRecord::RecordNotUnique`
</details>

### Exercício 2: Validation de período

**Enunciado:** Garanta que `ends_at` seja posterior a `starts_at`. Se algum valor estiver ausente, deixe `presence` cuidar do erro.

<details>
<summary>Solução</summary>

```ruby
validates :starts_at, :ends_at, presence: true
validate :ends_after_start

def ends_after_start
  return if starts_at.blank? || ends_at.blank?
  return if ends_at > starts_at

  errors.add(:ends_at, "deve ser posterior ao início")
end
```

**Pontos-chave:**
- `validate` registra o método
- Guard clause evita comparar `nil`
- `errors.add` invalida o model
</details>

### Exercício 3: Escolha do callback

**Enunciado:** Um `Invoice` enfileira a geração de PDF em `after_save`. Explique o risco e faça o job rodar somente após a criação ser confirmada.

<details>
<summary>Solução</summary>

`after_save` ainda está na transação. O job pode começar antes do commit ou a transação pode sofrer rollback.

```ruby
class Invoice < ApplicationRecord
  after_create_commit :enqueue_pdf

  private

  def enqueue_pdf
    GenerateInvoicePdfJob.perform_later(id)
  end
end
```

**Pontos-chave:**
- `after_create_commit` não roda em rollback
- O callback só enfileira
- Trabalho pesado fica no job
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
