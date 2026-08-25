# 8.4 FactoryBot

> **TL;DR**
> FactoryBot monta dados de teste em Ruby. A factory descreve um objeto válido e aceita variações com traits. `build` fica em memória, `create` salva no banco e `build_stubbed` simula um registro persistido sem fazer `INSERT`. Use sequences para valores únicos, associations para relacionamentos e `create_list` para coleções. Fixtures são rápidas e nativas do Rails, mas YAMLs compartilhados ficam difíceis de entender quando os cenários crescem. Em projetos com RSpec, as factories normalmente ficam em `spec/factories`.

## Conteúdo

- [Factory ou fixture](#factory-ou-fixture)
- [Definindo uma factory](#definindo-uma-factory)
- [create, build e build_stubbed](#create-build-e-build_stubbed)
- [Traits](#traits)
- [Sequences](#sequences)
- [Associations](#associations)
- [create_list](#create_list)
- [Por que fixtures ficam confusas](#por-que-fixtures-ficam-confusas)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Factory ou fixture

**O que é:**
Uma factory é uma receita para montar objetos de teste. Você informa o estado importante para o cenário, e ela preenche o restante.

FactoryBot é uma gem. Não faz parte do Rails, embora seja comum em suítes RSpec.

Fixture é dado pré-declarado, normalmente em YAML. O suporte a fixtures vem com o Rails e os arquivos costumam ficar em `test/fixtures`.

```yaml
# test/fixtures/users.yml
joao:
  name: João
  email: joao@example.com
  role: customer
```

```ruby
# spec/factories/users.rb
FactoryBot.define do
  factory :user do
    name { "João" }
    email { "joao@example.com" }
    role { :customer }
  end
end
```

**Como funciona:**
Fixture dá um nome fixo a um registro conhecido. Factory executa Ruby e produz um objeto quando o teste pede.

```ruby
user = users(:joao)                 # fixture
admin = create(:user, role: :admin) # factory
```

**Quando usar:**
Fixtures funcionam bem para um conjunto pequeno, estável e fácil de nomear. Factories ajudam quando cada spec precisa de combinações diferentes de estado.

Factory não é automaticamente melhor. A escolha boa é a que deixa o cenário legível e cria apenas os dados necessários.

**Na entrevista:**
> "Fixture é dado estático, geralmente YAML e nativo do Rails. Factory é uma receita Ruby criada sob demanda. Eu prefiro factory quando há muitas variações, mas controlo os writes no banco."

---

## Definindo uma factory

**Como funciona:**
Em uma app com RSpec, as factories ficam em `spec/factories`. O nome costuma seguir o model, e os blocks dos atributos são avaliados quando o objeto é montado.

```ruby
# spec/factories/users.rb
FactoryBot.define do
  factory :user do
    name { "Pessoa Teste" }
    email { "pessoa@example.com" }
    role { :customer }
    active { true }
  end
end
```

Deixe o padrão válido e mínimo. No spec, sobrescreva só o que interessa:

```ruby
user = build(:user, name: "Marina", active: false)

expect(user.name).to eq("Marina")
expect(user).not_to be_active
```

Assim, o leitor não precisa conhecer todos os campos obrigatórios de `User` para entender o cenário.

**Na entrevista:**
> "Em RSpec, eu procuro e crio a factory em `spec/factories`, por exemplo `spec/factories/users.rb`."

---

## create, build e build_stubbed

Os três usam a mesma factory. A diferença principal é a relação com o banco.

### `build`

`build` instancia o model, mas não salva:

```ruby
user = build(:user)

user.new_record? # true
user.persisted?  # false
user.id           # nil
```

Use para código que depende apenas do estado em memória. Ele não executa `INSERT` nem chama validações sozinho. Para validar, chame `valid?` ou tente salvar.

### `create`

`create` instancia e persiste o objeto:

```ruby
user = create(:user)

user.persisted?       # true
User.exists?(user.id) # true
```

Validações e callbacks de persistência rodam. Use quando o código consulta o banco, precisa de ID real ou depende de uma associação persistida.

```ruby
user = create(:user)

expect(User.find_by(email: user.email)).to eq(user)
```

### `build_stubbed`

`build_stubbed` monta um objeto que parece persistido e recebe ID, mas não grava no banco:

```ruby
user = build_stubbed(:user)

user.persisted?  # true
user.new_record? # false
user.id.nil?     # false
```

Use quando a unidade só precisa de um registro com aparência de persistido. Não use se o código chama `reload`, `save`, `update`, scopes ou consultas que precisam encontrar o registro.

| Método | Faz `INSERT` | Parece persistido | Callbacks de persistência |
|---|---:|---:|---:|
| `build` | Não | Não | Não |
| `create` | Sim | Sim | Sim |
| `build_stubbed` | Não | Sim | Não |

**Na entrevista:**
> "Eu começo com `build` quando o banco não participa. Uso `create` se o código consulta ou persiste. `build_stubbed` parece persistido, mas não existe no banco."

---

## Traits

**O que é:**
Trait é uma variação nomeada e combinável da factory.

```ruby
FactoryBot.define do
  factory :user do
    role { :customer }
    active { true }

    trait :admin do
      role { :admin }
    end

    trait :inactive do
      active { false }
    end
  end
end
```

```ruby
admin = create(:user, :admin)
inactive_admin = create(:user, :admin, :inactive)
```

**Quando usar:**
Use nomes de domínio, como `:admin`, `:paid`, `:cancelled` e `:with_items`. Evite traits técnicos ou contraditórios.

**Na entrevista:**
> "Trait nomeia um estado recorrente. `create(:order, :paid)` explica melhor o cenário que uma lista de atributos."

---

## Sequences

**O que é:**
Sequence gera um valor diferente a cada uso. Ela evita colisões em colunas únicas.

```ruby
FactoryBot.define do
  factory :user do
    name { "Pessoa Teste" }
    sequence(:email) { |number| "pessoa#{number}@example.com" }
  end
end
```

```ruby
create(:user).email # "pessoa1@example.com"
create(:user).email # "pessoa2@example.com"
```

Use sequence para e-mail, username, SKU ou código único. Prefira isso a valores aleatórios: a sequência é previsível e facilita reproduzir uma falha.

---

## Associations

**O que é:**
Association conecta factories relacionadas.

```ruby
# spec/factories/orders.rb
FactoryBot.define do
  factory :order do
    association :user
    status { :pending }
    total_cents { 5_000 }
  end
end
```

```ruby
order = create(:order)

order.persisted?      # true
order.user.persisted? # true
```

Se o cenário já tem a pessoa, passe a instância. Isso evita outro registro:

```ruby
user = create(:user)
order = create(:order, user: user)

expect(order.user).to eq(user)
```

**Importante na entrevista:**
Uma linha `create(:order)` pode gerar várias gravações por causa das associations. Evite uma árvore grande no estado padrão. Dados opcionais podem entrar em um trait, como `:with_items`.

---

## create_list

**Como funciona:**
`create_list` persiste uma quantidade de registros e devolve um Array:

```ruby
users = create_list(:user, 3)

users.size              # 3
users.all?(&:persisted?) # true
```

Combine lista, trait e atributos quando necessário:

```ruby
admins = create_list(:user, 2, :admin, active: true)
```

Para compartilhar uma associação, crie o objeto uma vez:

```ruby
user = create(:user)
orders = create_list(:order, 3, user: user)
```

Se não precisa do banco, use `build_list` ou `build_stubbed_list`. Não crie dez registros quando três demonstram a regra.

---

## Por que fixtures ficam confusas

Fixtures começam simples. O problema aparece quando muitos testes compartilham o mesmo catálogo de dados.

Surgem labels como `joao`, `joao_admin`, `joao_inactive`, `paid_order` e `order_with_coupon`. Um teste passa a depender de registros espalhados por vários YAMLs. Alterar uma fixture para um cenário pode quebrar outros que compartilhavam o mesmo registro.

Os problemas comuns são:

- estado global compartilhado;
- labels que não mostram qual atributo importa;
- relações espalhadas por vários arquivos;
- cópias para pequenas variações;
- manutenção em massa após mudança de schema.

Factory aproxima a variação do teste:

```ruby
user = create(:user, :inactive)
```

Mas também pode ficar confusa. Callbacks escondidos, traits demais e associations profundas criam dados invisíveis e deixam a suíte lenta.

**Na entrevista:**
> "Fixtures ficam difíceis quando viram um catálogo global com muitas relações. Factory aproxima o estado do spec, mas associations podem esconder vários inserts."

---

## Recapitulando

- Fixture é dado pré-declarado, normalmente YAML e nativo do Rails.
- Factory é receita Ruby criada sob demanda pelo FactoryBot.
- Em RSpec, factories normalmente ficam em `spec/factories`.
- `build` cria em memória; `create` salva; `build_stubbed` simula persistência.
- Traits nomeiam variações; sequences geram valores únicos.
- Associations conectam factories, mas podem multiplicar gravações.
- `create_list` persiste uma coleção; `build_list` evita o banco.
- Factory boa é válida, mínima e deixa a intenção do spec clara.

---

## Exercícios práticos

### Exercício 1: Escolha o método

**Enunciado:** Você testa `User#display_name`, que só usa `first_name` e `last_name`. Escolha entre `create`, `build` e `build_stubbed` e escreva o spec.

<details>
<summary>Solução</summary>

Use `build`, pois o banco não participa.

```ruby
user = build(:user, first_name: "Ana", last_name: "Lima")

expect(user.display_name).to eq("Ana Lima")
```

**Pontos-chave:**
- Evita `INSERT`.
- Mostra os atributos relevantes.
</details>

### Exercício 2: Traits e sequence

**Enunciado:** Crie uma factory de `User` com e-mail único e traits `:admin` e `:inactive`. Depois crie duas pessoas com os dois estados.

<details>
<summary>Solução</summary>

```ruby
factory :user do
  sequence(:email) { |number| "pessoa#{number}@example.com" }
  role { :customer }
  active { true }

  trait(:admin) { role { :admin } }
  trait(:inactive) { active { false } }
end

users = create_list(:user, 2, :admin, :inactive)
```

**Pontos-chave:**
- Sequence evita colisão.
- Traits podem ser combinados.
</details>

### Exercício 3: Association compartilhada

**Enunciado:** Crie três pedidos para a mesma pessoa. A factory de `Order` já declara `association :user`.

<details>
<summary>Solução</summary>

```ruby
user = create(:user)
orders = create_list(:order, 3, user: user)

expect(orders.map(&:user).uniq).to eq([user])
```

Sem passar `user`, cada pedido pode criar sua própria pessoa associada.

**Pontos-chave:**
- Compartilhe a associação explicitamente.
- Evite gravações que não fazem parte do cenário.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
