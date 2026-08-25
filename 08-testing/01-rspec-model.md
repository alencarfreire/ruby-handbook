# 8.1 RSpec — model spec

> **TL;DR**
> Model spec verifica regras do model: validações, cálculos e métodos de instância. `describe` organiza, `it` declara o exemplo e `expect` verifica o resultado. `let` é lazy; `let!` roda antes do exemplo. `subject` nomeia o objeto testado. Model Active Record usa `rails_helper`; Ruby puro pode usar `spec_helper`. Não teste se o Active Record sabe salvar ou buscar: teste o comportamento que é seu.

## Conteúdo

- [Estrutura do model spec](#estrutura-do-model-spec)
- [describe, it e expect](#describe-it-e-expect)
- [describe Model](#describe-model)
- [let vs let!](#let-vs-let)
- [subject](#subject)
- [Testando validações](#testando-validações)
- [Testando métodos de instância](#testando-métodos-de-instância)
- [shoulda-matchers](#shoulda-matchers)
- [rails_helper vs spec_helper](#rails_helper-vs-spec_helper)
- [Por que não testar o Active Record](#por-que-não-testar-o-active-record)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Estrutura do model spec

**O que é:**
É um spec focado no comportamento de um model. Para `User`, a convenção é `spec/models/user_spec.rb`.

Considere este model em Rails 7.1+:

```ruby
# app/models/user.rb
class User < ApplicationRecord
  validates :name, presence: true
  validates :email, presence: true, uniqueness: true
  validates :monthly_fee_cents,
            numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  def contact_label
    "#{name} <#{email}>"
  end

  def annual_fee_cents
    monthly_fee_cents * 12
  end
end
```

O spec começa assim:

```ruby
# spec/models/user_spec.rb
require "rails_helper"

RSpec.describe User, type: :model do
  it "é válido com atributos válidos" do
    user = described_class.new(name: "João", email: "joao@email.com", monthly_fee_cents: 1_990)
    expect(user).to be_valid
  end
end
```

**Na entrevista:**
> "No model spec eu preparo um cenário, executo o comportamento e verifico o resultado. O foco são as regras do model."

---

## describe, it e expect

**O que é:**

- `describe` agrupa comportamentos relacionados.
- `it` descreve um exemplo observável.
- `expect` declara o resultado esperado.

```ruby
describe "#contact_label" do
  it "junta nome e e-mail" do
    user = described_class.new(name: "João", email: "joao@email.com")
    expect(user.contact_label).to eq("João <joao@email.com>")
  end
end
```

**Como funciona:**
`expect(valor).to matcher` faz a asserção. `eq` compara por valor. Predicados viram matchers: `valid?` pode ser escrito como `be_valid`.

```ruby
expect(user.contact_label).to eq("João <joao@email.com>")
expect(user).to be_valid
expect(user.errors[:email]).not_to be_empty
```

Nomeie o `it` pelo contrato. “Calcula o valor anual em centavos” é melhor do que “chama multiplicação”.

---

## describe Model

**Como funciona:**
No topo, passe a constante do model:

```ruby
RSpec.describe User, type: :model do
end
```

`type: :model` ativa o suporte do `rspec-rails`. Ele pode ser inferido pela pasta quando essa configuração está habilitada, mas escrevê-lo deixa a intenção explícita.

Dentro do grupo, organize por contrato: `describe "validations"`, `describe "#contact_label"`. `#` indica método de instância; `.find_active` indicaria método de classe.

**Na entrevista:**
> "Eu descrevo a classe no topo e agrupo validações e métodos públicos. Assim a falha aponta qual contrato quebrou."

---

## let vs let!

**O que é:**
`let` é lazy e memoizado: cria o valor no primeiro acesso de cada exemplo.

```ruby
let(:user) { described_class.new(name: "João", email: "joao@email.com", monthly_fee_cents: 1_990) }

it("é válido") { expect(user).to be_valid }
```

`let!` é eager: roda antes de cada exemplo, mesmo sem acesso pelo nome.

```ruby
let!(:existing_user) do
  described_class.create!(name: "João", email: "joao@email.com", monthly_fee_cents: 1_990)
end
```

**Quando usar:**
Prefira `let`. Use `let!` quando uma pré-condição precisa existir antes da ação. Um valor usado uma vez pode ficar local; nem tudo precisa virar `let`.

**Na entrevista:**
> "`let` executa no primeiro acesso. `let!` executa antes do exemplo. Eu evito `let!` sem necessidade porque ele cria estado e pode deixar o spec mais lento."

---

## subject

**O que é:**
`subject` identifica o objeto principal. Também é lazy e memoizado.

```ruby
subject(:user) { described_class.new(name: "João", email: "joao@email.com", monthly_fee_cents: 1_990) }

it("é válido") { expect(user).to be_valid }
```

O subject implícito permite `is_expected`:

```ruby
subject { described_class.new(name: nil) }

it { is_expected.not_to be_valid }
```

**Quando usar:**
Use `subject(:user)` quando vários exemplos exercitam o mesmo objeto. O nome explícito costuma ser mais claro. Não esconda uma preparação enorme no `subject`.

---

## Testando validações

**O que é:**
Validação é regra configurada pela sua app. Prove um cenário válido e os inválidos relevantes.

```ruby
subject(:user) { described_class.new(name: "João", email: "joao@email.com", monthly_fee_cents: 1_990) }

describe "validations" do
  it("é válido com os atributos obrigatórios") { expect(user).to be_valid }

  it "exige nome" do
    user.name = nil
    expect(user).not_to be_valid
    expect(user.errors[:name]).not_to be_empty
  end

  it "rejeita mensalidade negativa" do
    user.monthly_fee_cents = -1
    expect(user).not_to be_valid
  end
end
```

`be_valid` chama `valid?`, que popula `errors`. Se o contrato é só haver erro, evite depender do texto traduzido da mensagem.

Unicidade exige estado persistido:

```ruby
described_class.create!(name: "João", email: "joao@email.com", monthly_fee_cents: 1_990)
duplicate = described_class.new(name: "Maria", email: "joao@email.com", monthly_fee_cents: 2_500)

expect(duplicate).not_to be_valid
expect(duplicate.errors[:email]).not_to be_empty
```

**Importante na entrevista:**
Validação de unicidade não elimina condição de corrida. Garanta a regra também com índice `UNIQUE` no banco.

---

## Testando métodos de instância

**O que é:**
Teste entrada, saída e casos de borda do comportamento público.

```ruby
subject(:user) { described_class.new(name: "João", email: "joao@email.com", monthly_fee_cents: 1_990) }

describe "#contact_label" do
  it "formata nome e e-mail" do
    expect(user.contact_label).to eq("João <joao@email.com>")
  end
end

describe "#annual_fee_cents" do
  it "calcula doze mensalidades em centavos" do
    expect(user.annual_fee_cents).to eq(23_880)
  end
end
```

**Como funciona:**
O spec verifica a interface pública. Não importa se o método usa `* 12`, uma constante ou outro objeto. Se a implementação mudar e o contrato continuar, o teste passa.

`1_990` representa R$ 19,90. O model mantém o cálculo em Integer. Formatar reais costuma ser responsabilidade da apresentação.

**Na entrevista:**
> "Eu testo resultado observável, não linha interna. Isso permite refatorar sem reescrever o spec."

---

## shoulda-matchers

**O que é:**
`shoulda-matchers` é uma gem com matchers curtos para validações e associações Rails.

```ruby
it { is_expected.to validate_presence_of(:name) }
it { is_expected.to validate_presence_of(:email) }
it { is_expected.to validate_uniqueness_of(:email) }
```

**Quando usar:**
Use para regras declarativas simples. Alguns matchers exigem subject válido ou estado persistido. Para regra de negócio e métodos, prefira exemplos explícitos.

**Na entrevista:**
> "Shoulda reduz repetição em validações simples. Não substitui teste de comportamento do domínio."

---

## rails_helper vs spec_helper

**O que é:**

- `spec_helper` configura o RSpec sem carregar toda a app Rails.
- `rails_helper` carrega Rails e normalmente também o `spec_helper`.

Model Active Record depende do ambiente, conexão de teste e schema. Use `require "rails_helper"`. Uma classe Ruby isolada pode usar `require "spec_helper"`.

**Na entrevista:**
> "Model Active Record usa `rails_helper`. Objeto Ruby puro pode usar só `spec_helper`, sem o custo de subir Rails."

---

## Por que não testar o Active Record

**O que é:**
Rails já testa que `save!` persiste, `find` busca pela chave e uma coluna recebe valor. Este exemplo repete o framework:

```ruby
user = User.create!(name: "João", email: "joao@email.com")
expect(User.find(user.id)).to eq(user)
```

**Quando usar:**
Teste persistência quando existe comportamento seu: restrição importante do banco, escopo customizado, transação ou regra dependente do estado persistido. Não teste método privado diretamente; exercite-o pela interface pública.

**Na entrevista:**
> "Eu não testo `save` e `find` por si só. Testo minhas validações, consultas customizadas e regras de domínio."

---

## Recapitulando

- `RSpec.describe User, type: :model` define o grupo do model.
- `describe` organiza, `it` descreve e `expect` verifica.
- `let` é lazy; `let!` executa antes do exemplo.
- `subject(:user)` nomeia o objeto principal.
- Teste cenários relevantes e métodos públicos.
- Unicidade pede validação e índice único no banco.
- `shoulda-matchers` ajuda no declarativo, não na regra de negócio.
- Active Record usa `rails_helper`; Ruby puro pode usar `spec_helper`.
- Não teste o Active Record por ele mesmo.

---

## Exercícios práticos

### Exercício 1: Validação de mensalidade

**Enunciado:** Garanta que `monthly_fee_cents` aceita `0` e rejeita `-1`. Use `subject(:user)` válido.

<details>
<summary>Solução</summary>

```ruby
subject(:user) { described_class.new(name: "João", email: "joao@email.com", monthly_fee_cents: 1_990) }

it "aceita zero" do
  user.monthly_fee_cents = 0
  expect(user).to be_valid
end

it "rejeita valor negativo" do
  user.monthly_fee_cents = -1
  expect(user).not_to be_valid
end
```

**Pontos-chave:**
- O subject começa válido.
- Cada exemplo muda só o dado relevante.
- Dinheiro fica em centavos.
</details>

### Exercício 2: let ou let!?

**Enunciado:** Teste a unicidade de `email` com um usuário já persistido. Explique a escolha de `let!`.

<details>
<summary>Solução</summary>

```ruby
let!(:existing_user) do
  described_class.create!(name: "João", email: "joao@email.com", monthly_fee_cents: 1_990)
end

it "rejeita e-mail duplicado" do
  duplicate = described_class.new(name: "Maria", email: existing_user.email, monthly_fee_cents: 2_990)
  expect(duplicate).not_to be_valid
end
```

`let!` cria a pré-condição antes do exemplo. Como o exemplo acessa `existing_user`, `let` também funcionaria. `let!` é necessário quando o registro precisa existir sem acesso pelo nome.

**Pontos-chave:**
- `let` cria no primeiro acesso.
- `let!` cria antes do exemplo.
- A validação não substitui índice único.
</details>

### Exercício 3: Método de instância

**Enunciado:** Teste `annual_fee_cents` para mensalidade de R$ 29,90, armazenada como `2_990` centavos. Não teste a implementação interna.

<details>
<summary>Solução</summary>

```ruby
subject(:user) { described_class.new(name: "João", email: "joao@email.com", monthly_fee_cents: 2_990) }

it "calcula doze meses em centavos" do
  expect(user.annual_fee_cents).to eq(35_880)
end
```

**Pontos-chave:**
- Teste a saída pública.
- Não verifique o operador chamado.
- R$ 29,90 entra como `2_990` centavos.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
