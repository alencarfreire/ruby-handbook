# 6.2 Associations

> **TL;DR**
> Association é a API que liga models por chaves no banco. `belongs_to` fica no lado que guarda a foreign key; `has_many` e `has_one`, no outro. Para muitos-para-muitos, prefira `has_many :through` quando a ligação tem vida própria; HABTM só cabe na junção realmente vazia. Em Rails 7.1, `belongs_to` é obrigatório por padrão, salvo `optional: true`. `inverse_of` mantém os dois lados coerentes em memória. `dependent: :destroy` roda callbacks; `:delete_all` apaga direto no banco. `foreign_key` muda a coluna usada pela associação, não cria constraint nem índice.

## Conteúdo

- [`belongs_to`](#belongs_to)
- [`has_many`](#has_many)
- [`has_one`](#has_one)
- [`has_many :through`](#has_many-through)
- [`has_and_belongs_to_many`](#has_and_belongs_to_many)
- [`optional: true`](#optional-true)
- [`inverse_of`](#inverse_of)
- [`dependent: :destroy` vs `:delete_all`](#dependent-destroy-vs-delete_all)
- [`foreign_key`](#foreign_key)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## `belongs_to`

**O que é:**
Representa o lado que referencia uma linha. A tabela desse model guarda a foreign key.

**Como funciona:**
```ruby
class Comment < ApplicationRecord
  belongs_to :post
end

comment.post
comment.post = post
```

Por convenção, `belongs_to :post` procura `post_id` e a classe `Post`. Também adiciona validação de presença da associação por padrão em uma app Rails 7.1.

Não confunda a direção da frase com a posição da coluna:

```text
comments.post_id → posts.id
```

`Post` não precisa guardar uma lista de IDs. Quem aponta é `Comment`.

**Na entrevista:**
> "`belongs_to` é o lado da foreign key. Se `comments` tem `post_id`, `Comment` pertence a `Post`. No Rails atual essa associação é obrigatória por padrão."

---

## `has_many`

**O que é:**
Representa uma coleção de registros que apontam para o dono.

**Como funciona:**
```ruby
class Post < ApplicationRecord
  has_many :comments
end

post.comments
post.comments.create!(body: "Boa explicação")
```

O Rails procura `comments.post_id`. O retorno é uma coleção do Active Record, não um Array comum. Se você quer `comment.post` e `post.comments`, declare os dois lados.

**Na entrevista:**
> "`has_many` aponta para uma foreign key na tabela dos filhos. `Post has_many :comments` espera `comments.post_id`; não existe `comment_ids` salvo em `posts`."

---

## `has_one`

**O que é:**
Representa no máximo um registro no outro lado, mas a foreign key continua na tabela associada.

**Como funciona:**
```ruby
class User < ApplicationRecord
  has_one :profile
end

class Profile < ApplicationRecord
  belongs_to :user
end
```

Só escrever `has_one` não impede dois profiles para o mesmo user. Garanta a cardinalidade no banco:

```ruby
create_table :profiles do |t|
  t.references :user, null: false, foreign_key: true, index: { unique: true }
  t.string :bio
  t.timestamps
end
```

**Na entrevista:**
> "`has_one` não garante unicidade. Eu coloco índice unique na foreign key. Sem isso, o model promete um-para-um e o banco aceita um-para-muitos."

---

## `has_many :through`

**O que é:**
Modela muitos-para-muitos por meio de um model de junção explícito. Você ganha um lugar para atributos, validações e comportamento da relação.

**Como funciona:**
```ruby
class Physician < ApplicationRecord
  has_many :appointments, dependent: :destroy
  has_many :patients, through: :appointments
end

class Appointment < ApplicationRecord
  belongs_to :physician
  belongs_to :patient

  validates :starts_at, presence: true
end

class Patient < ApplicationRecord
  has_many :appointments, dependent: :destroy
  has_many :physicians, through: :appointments
end
```

O registro importante é `Appointment`. Ele diz não só **quem** se relaciona, mas quando e em qual estado. `physician.patients` é o atalho. É o default seguro quando a junção tem ou pode ganhar atributos, validações ou callbacks.

**Na entrevista:**
> "Eu prefiro `has_many :through` porque a relação vira um model. Em médico e paciente, `Appointment` tem horário e status; não é só uma tabela escondida."

---

## `has_and_belongs_to_many`

**O que é:**
HABTM é muitos-para-muitos com tabela de junção, mas sem model intermediário.

**Como funciona:**
```ruby
class Article < ApplicationRecord
  has_and_belongs_to_many :tags
end

class Tag < ApplicationRecord
  has_and_belongs_to_many :articles
end
```

```ruby
create_join_table :articles, :tags do |t|
  t.index %i[article_id tag_id], unique: true
end
```

Por convenção, a tabela se chama `articles_tags`, com os nomes em ordem lexical. Ela guarda `article_id` e `tag_id`; não precisa de model `ArticlesTag`.

**Quando usar:**
Só quando a junção é estruturalmente vazia e deve continuar assim. Tags simples podem caber.

**Quando não usar:**
Não use se precisa de `created_at`, ordem, autor da ligação, status, soft delete, validações ou callbacks. Migrar HABTM depois que a relação ganha significado custa mais do que começar com um model de junção.

**Na entrevista:**
> "HABTM só para junção sem comportamento e sem atributos. Se a relação pode ter estado ou auditoria, eu começo com `has_many :through`."

---

## `optional: true`

**O que é:**
Desliga a obrigatoriedade padrão de um `belongs_to`.

**Como funciona:**
```ruby
class Ticket < ApplicationRecord
  belongs_to :assignee, class_name: "User", optional: true
end
```

Um ticket pode nascer sem responsável. Para isso ser verdade no banco, a coluna também aceita `NULL`:

```ruby
t.references :assignee, null: true, foreign_key: { to_table: :users }
```

`optional: true` mexe na validação do Active Record. Não altera uma coluna já criada com `null: false`. O contrário também importa: deixar a coluna nullable enquanto o model exige associação permite inconsistência por SQL, import ou outro serviço.

Use porque o domínio permite ausência, não para calar `must exist`. Se o ID recebido aponta para uma linha inexistente, descubra a causa; não torne tudo opcional.

**Na entrevista:**
> "`belongs_to` é obrigatório por padrão. `optional: true` só quando ausência faz parte do domínio, e eu alinho isso com `NULL` no banco. A opção não remove constraint da migration."

---

## `inverse_of`

**O que é:**
Indica que duas associations são os dois lados da mesma relação em memória.

**Como funciona:**
```ruby
class Order < ApplicationRecord
  has_many :items, inverse_of: :order
end

class Item < ApplicationRecord
  belongs_to :order, inverse_of: :items

  validates :order, presence: true
end
```

```ruby
order = Order.new
item = order.items.build

item.order.equal?(order) # true
item.valid?              # enxerga o order ainda não salvo
```

Sem um inverse reconhecido, cada lado pode virar uma instância Ruby diferente da mesma linha. Alterar uma delas em memória não atualiza automaticamente a outra.

O Rails detecta inverses em várias associations convencionais. Declare `inverse_of` quando nomes customizados, opções ou uma relação mais complexa impedem a inferência, e quando a identidade em memória é relevante para validação ou construção aninhada.

**Na entrevista:**
> "`inverse_of` preserva a identidade do objeto nos dois lados em memória. O Rails infere muitos casos simples; eu explicito quando a relação customizada não é inferida ou quando valido filhos antes de salvar o pai."

---

## `dependent: :destroy` vs `:delete_all`

**O que é:**
Define o que o Rails faz com os filhos quando o dono é destruído.

**Como funciona:**
```ruby
class Order < ApplicationRecord
  has_many :items, dependent: :destroy
end
```

`order.destroy` chama `destroy` em cada item. Isso instancia os registros e roda callbacks de destruição, além das regras `dependent` dos filhos. É a escolha quando o callback faz parte da correção do domínio.

```ruby
class ImportBatch < ApplicationRecord
  has_many :rows, dependent: :delete_all
end
```

`batch.destroy` remove as rows com `DELETE` direto, sem instanciar cada objeto e sem callbacks `before_destroy`/`after_destroy` dos filhos. É mais barato, mas qualquer limpeza escondida nesses callbacks não acontece.

Nem toda relação deve apagar. Histórico financeiro pode pedir `:restrict_with_exception`, arquivamento ou anonimização. `dependent` é decisão de domínio.

Também existe cascade no banco, como `on_delete: :cascade`. Não misture estratégias sem entender quem executa a exclusão. Uma constraint continua protegendo caminhos que não passam pelo Rails; callbacks Ruby só rodam quando o Rails chama `destroy`.

**Na entrevista:**
> "`:destroy` instancia filhos e roda callbacks; `:delete_all` faz exclusão direta e pula callbacks. Eu escolho pela regra de negócio. Para dado financeiro, muitas vezes eu nem apago: restrinjo."

---

## `foreign_key`

**O que é:**
Configura qual coluna a association usa quando a convenção `nome_id` não serve.

**Como funciona:**
```ruby
class Post < ApplicationRecord
  belongs_to :author,
             class_name: "User",
             foreign_key: :author_id,
             inverse_of: :authored_posts
end

class User < ApplicationRecord
  has_many :authored_posts,
           class_name: "Post",
           foreign_key: :author_id,
           inverse_of: :author
end
```

Você configura os dois lados porque `authored_posts` não permite ao Rails deduzir `author_id` sozinho. `class_name` resolve a classe; `foreign_key` resolve a coluna.

`foreign_key: :author_id` no model **não** cria foreign key no banco. Apesar do mesmo nome, são níveis diferentes:

- association: `foreign_key:` escolhe a coluna usada pelo Active Record;
- migration: `foreign_key: true` ou `add_foreign_key` cria a constraint;
- índice: acelera busca e pode impor unicidade, mas não substitui a constraint.

**Na entrevista:**
> "`belongs_to :author, class_name: 'User', foreign_key: :author_id` separa nome da associação, classe e coluna. Depois eu crio índice e constraint na migration; a opção do model não faz isso."

---

## Recapitulando

- A foreign key fica no lado do `belongs_to`.
- `has_many` retorna coleção; `has_one` retorna um registro, mas precisa de índice unique para garantir um-para-um.
- `has_many :through` dá um model à junção. É o default quando a relação tem significado.
- HABTM só combina com tabela de junção sem atributos nem comportamento.
- Em Rails 7.1, `belongs_to` é obrigatório por padrão. `optional: true` precisa concordar com a nulabilidade da coluna.
- `inverse_of` mantém a mesma relação coerente em memória; o Rails infere muitos casos simples.
- `dependent: :destroy` roda callbacks. `dependent: :delete_all` apaga direto e não roda callbacks dos filhos.
- `foreign_key` no model escolhe coluna. Constraint e índice pertencem à migration.
- Association não substitui integridade no banco.

---

## Exercícios práticos

### Exercício 1: Onde fica a foreign key?

**Enunciado:** Modele `Company`, `Employee` e `Badge`. Uma company tem muitos employees. Cada employee pertence a uma company e pode ter um único badge. Mostre models e migrations importantes, garantindo um badge por employee.

<details>
<summary>Solução</summary>

```ruby
class Company < ApplicationRecord
  has_many :employees, dependent: :restrict_with_exception
end

class Employee < ApplicationRecord
  belongs_to :company
  has_one :badge, dependent: :destroy
end

class Badge < ApplicationRecord
  belongs_to :employee
end
```

Na migration, `employees` recebe `t.references :company, null: false, foreign_key: true`. `badges` recebe `t.references :employee, null: false, foreign_key: true, index: { unique: true }`.

**Pontos-chave:**
- As foreign keys ficam em `employees` e `badges`
- O índice unique impede dois badges para o mesmo employee
</details>

### Exercício 2: HABTM ou `through`?

**Enunciado:** Um aluno participa de cursos. A relação guarda data de matrícula, status e nota final. Escolha a association e escreva os três models. Explique por que a alternativa perde.

<details>
<summary>Solução</summary>

```ruby
class Student < ApplicationRecord
  has_many :enrollments, dependent: :destroy
  has_many :courses, through: :enrollments
end

class Enrollment < ApplicationRecord
  belongs_to :student
  belongs_to :course

  validates :enrolled_at, :status, presence: true
end

class Course < ApplicationRecord
  has_many :enrollments, dependent: :restrict_with_exception
  has_many :students, through: :enrollments
end
```

`Enrollment` é entidade do domínio. HABTM esconderia justamente o lugar de `enrolled_at`, `status`, `final_grade` e suas validações.

**Pontos-chave:**
- Relação com atributos pede model de junção
- `has_many :through` fornece `student.courses`
</details>

### Exercício 3: Review da exclusão

**Enunciado:** Um PR troca `has_many :documents, dependent: :destroy` por `dependent: :delete_all`. `Document` tem um `after_destroy` que remove um arquivo externo. O autor diz que “o resultado é igual, só mais rápido”. O que você responde? Inclua uma alternativa se o callback não for necessário.

<details>
<summary>Solução</summary>

O resultado não é igual. `:delete_all` remove linhas sem instanciar `Document` e sem executar `after_destroy`. Os arquivos externos ficam órfãos.

Se o arquivo faz parte da regra, mantenha `:destroy`. Se o callback não é necessário, retire essa responsabilidade primeiro; depois `:delete_all` pode ser coerente. Cascade no banco também não roda callback Ruby.

**Pontos-chave:**
- `:destroy` preserva callbacks dos filhos
- `:delete_all` prioriza exclusão direta
- Performance não autoriza mudar semântica
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
