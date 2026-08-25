# 5.6 Concerns

> **TL;DR**
> Concern é module. `ActiveSupport::Concern` é açúcar: `included` roda no host, `class_methods` vira `extend`, e `include` de outro concern cola na classe, não no module. Mixin e ancestors: [2.3](/02-oop/03-modules-mixins) e [2.5](/02-oop/05-include-prepend-extend). Pasta: `app/models/concerns` ou `app/controllers/concerns` — Zeitwerk colapsa. Um verbo, duas classes. `Shared` / `Userable` é gaveta. Concern de **rota** é o [5.2](/05-rails-basics/02-routes).

## Conteúdo

- [ActiveSupport::Concern](#activesupportconcern)
- [included](#included)
- [class_methods](#class_methods)
- [Dependência entre concerns](#dependência-entre-concerns)
- [models/concerns vs controllers/concerns](#modelsconcerns-vs-controllersconcerns)
- [Bom vs gaveta](#bom-vs-gaveta)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## ActiveSupport::Concern

**O que é:**
O mixin do 2.3 com três ganchos que o Ruby puro cobra na mão. Você escreve `extend ActiveSupport::Concern`. `include Archivable` continua `include`.

**Como funciona:**
```ruby
# app/models/concerns/archivable.rb
module Archivable
  extend ActiveSupport::Concern

  included do
    scope :archived, -> { where.not(archived_at: nil) }
  end

  class_methods do
    def archive_all! = find_each(&:archive!)
  end

  def archive! = update!(archived_at: Time.current)
end

class Document < ApplicationRecord
  include Archivable
end

Document.archived          # scope — included
Document.archive_all!      # class method — class_methods
Document.find(1).archive!  # instância — corpo do module
```

Sem Concern, `scope` no corpo do module não cola em `Document`. O 2.5 já mostrou o hook: `def self.included(base); base.extend ClassMethods; end`. O Rails escreve isso por você.

Não é tipo novo. Não muda lookup. `Document.ancestors` traz `Archivable` no mesmo lugar que um `include` comum.

**Quando usar:**
DSL de classe no mixin (`scope`, `has_many`, `validates`, `before_action`) mais class method. Module só de instância: `include` puro, sem Concern.

**Na entrevista:**
> "Concern é module. O ActiveSupport facilita o hook de classe e o extend de ClassMethods. include continua include. Ancestors eu desenho como no 2.5."

---

## included

**O que é:**
Block que o Concern avalia **na classe** no `include`. `self` é o host. Macro do Active Record e do Action Controller entra aqui.

**Como funciona:**
```ruby
module Publishable
  extend ActiveSupport::Concern

  included do
    scope :published, -> { where.not(published_at: nil) }
    after_save :touch_feed, if: :published?
  end

  def published? = published_at.present?
  def publish! = update!(published_at: Time.current)
  private def touch_feed = feed&.touch
end
```

Método de instância fica **fora** do block. `def foo` **dentro** do `included` nasce na classe, some do module, some dos `ancestors` do concern. `super` no host não acha o mixin.

`included` do Concern **não** é o `def self.included(base)` do Ruby. Os dois juntos brigam. Escolha o do Concern. `prepended do` existe — wrap é o 2.5. Macro (`scope`, `has_many`, `before_action`) entra no block.

**Na entrevista:**
> "included é class_eval no host. Scope e has_many entram aí. Método de instância eu deixo no corpo do module, senão some da cadeia."

---

## class_methods

**O que é:**
Açúcar do `extend ClassMethods` do 2.5. O block vira método de classe no host.

**Como funciona:**
```ruby
module Tokenable
  extend ActiveSupport::Concern

  class_methods do
    def by_token(token) = find_by!(token:)
  end

  def assign_token = self.token ||= SecureRandom.hex(16)
end

class ApiKey < ApplicationRecord
  include Tokenable
end

ApiKey.by_token("ab12")
```

`module ClassMethods` aninhado ainda funciona. No Rails 7.1+ você escreve `class_methods do`. Module **só** de class method e zero DSL: `extend Tokenable` na classe, sem Concern — o 2.5 já fechou.

**Na entrevista:**
> "class_methods é extend. Por baixo o Concern faz base.extend ClassMethods. Eu não fingo que include sozinho cria class method."

---

## Dependência entre concerns

**O que é:**
O motivo do Concern existir além de açúcar. `include` de um concern **dentro** de outro precisa colar no host, não no module do meio.

**Como funciona:**
```ruby
module Visible
  extend ActiveSupport::Concern

  included do
    scope :visible, -> { where(visible: true) }
  end
end

module Publishable
  extend ActiveSupport::Concern
  include Visible

  included do
    scope :listed, -> { visible.where.not(published_at: nil) }
  end
end

class Post < ApplicationRecord
  include Publishable
end

Post.visible  # Visible colou em Post
Post.listed
```

Sem Concern, `include Visible` dentro de `Publishable` dispara o hook **uma vez**, com `base = Publishable`. `Post` inclui `Publishable` depois. `scope :visible` nunca chega em `Post`. Instância até anda nos ancestors. Macro de classe não.

O Concern guarda a dependência e inclui `Visible` no host. Ordem: dependência primeiro. Dois níveis já pede desenho. Três é cheiro.

**Na entrevista:**
> "O pulo do Concern é a dependência. include de concern em concern sem ActiveSupport cola o hook no module do meio. O host fica sem o scope."

---

## models/concerns vs controllers/concerns

**O que é:**
Duas pastas. Dois mundos. Zeitwerk (autoload do Rails) **colapsa** `concerns`: o arquivo vira `Auditable`, não `Concerns::Auditable`. Path é o [3.2](/03-ruby-advanced/02-zeitwerk-autoload).

**Como funciona:**
```text
app/models/concerns/archivable.rb           → Archivable
app/controllers/concerns/authenticatable.rb → Authenticatable
```

```ruby
# app/controllers/concerns/authenticatable.rb
module Authenticatable
  extend ActiveSupport::Concern

  included do
    before_action :require_login
    helper_method :current_user
  end

  private

  def current_user = @current_user ||= User.find_by(id: session[:user_id])

  def require_login
    redirect_to login_path, alert: "Faça login." unless current_user
  end
end

class PostsController < ApplicationController
  include Authenticatable
end
```

Não cruze. `has_many` não mora em controller. `before_action` não mora em model. Dois `searchable.rb` nas duas pastas: colisão — as duas raízes collapsed querem `Searchable`.

Um host só (`ApplicationController`): fica na classe. Dois bases (`Api::BaseController` e `Web::BaseController`) ou um verbo (`Paginatable`): concern. `bin/rails generate concern Archivable` cai em models. Sem `Concerns::`.

**Na entrevista:**
> "Model concern e controller concern são pastas diferentes. Zeitwerk colapsa o concerns. Eu não ponho has_many no controller e não reuso o mesmo module nos dois lados."

---

## Bom vs gaveta

**O que é:**
Bom: nome, fronteira e **dois** hosts. Verbo ou adjetivo — `Archivable`, `Publishable`, `Tokenable`, `Paginatable`. Gaveta: pasta `concerns` virando `utils`. O arquivo emagrece. O domínio some. Red flag, não “organização”.

**Como funciona:**
Checklist: dá para explicar sem listar o resto do model; a coluna / o callback pertencem ao verbo; duas classes incluem de verdade; o host não expõe meia API privada; `ancestors` continua legível.

```ruby
# BOM — um recorte, dois models
module SoftDeletable
  extend ActiveSupport::Concern

  included do
    scope :kept, -> { where(deleted_at: nil) }
  end

  def soft_delete! = update!(deleted_at: Time.current)
end

class Comment < ApplicationRecord
  include SoftDeletable
end

class Review < ApplicationRecord
  include SoftDeletable
end

# RUIM — Userable não é comportamento, é o User
module Userable
  extend ActiveSupport::Concern

  included do
    has_many :orders
    validates :email, presence: true
  end

  def full_name = "#{first_name} #{last_name}"
  def vip? = orders.sum(:total_cents) > 100_000
  def reset_password!; end
end
```

Cheiros: `shared.rb` / `common.rb` / `utils.rb`. Dois verbos no mesmo module. Helper de view no concern de model. Doze `include` só no `User`. Extração “para o arquivo ficar menor”. Concern que chama 8 métodos do host (`charge!`, `notify!`, `stock`) — isso é roteiro, vai para objeto. Service Object: [16.3](/16-principles/03-service-object).

DHH usa concern. A crítica é da **gaveta**, não do `extend ActiveSupport::Concern`. Você defende o recorte, não a pasta. Um host só: fica na classe.

**Na entrevista:**
> "Eu extraio verbo reusado — Archivable sim. Shared, Userable, fatiar o User em doze modules: gaveta. Se é o próprio model, fica no model."

---

## Recapitulando

- Concern é module. `ActiveSupport::Concern` é hook + `class_methods` + dependência. [2.3](/02-oop/03-modules-mixins) e [2.5](/02-oop/05-include-prepend-extend). Rota: [5.2](/05-rails-basics/02-routes).
- `included` é class_eval no host. Instância fica no corpo do module.
- `class_methods do` é `extend`. `include` sozinho não cria class method.
- `include` de concern em concern sem Concern cola o hook no module do meio.
- `app/models/concerns` ≠ `app/controllers/concerns`. Zeitwerk colapsa. Sem cruzar DSL.
- Bom: um verbo, dois hosts. Gaveta: `Shared`, `Userable`, emagrecer arquivo.

---

## Exercícios práticos

### Exercício 1: o scope não existe

**Enunciado:** `Document.archived` explode com `NoMethodError`. Por quê? Conserte com Concern. Não mude a chamada.

```ruby
module Archivable
  scope :archived, -> { where.not(archived_at: nil) }
  def archive! = update!(archived_at: Time.current)
end

class Document < ApplicationRecord
  include Archivable
end

Document.archived
```

<details>
<summary>Solução</summary>

`scope` é class method do Active Record. No corpo do module ele roda na carga, com `self` = `Archivable`, não `Document`. `include` só leva o `archive!`.

```ruby
module Archivable
  extend ActiveSupport::Concern

  included do
    scope :archived, -> { where.not(archived_at: nil) }
  end

  def archive! = update!(archived_at: Time.current)
end
```

Sem Concern: `def self.included(base); base.scope :archived, -> { ... }; end` — o 2.5. No app, Concern.

**Pontos-chave:**
- Macro de classe não “pinga” com include puro
- `included` avalia no host
- Instância já estava certa
</details>

### Exercício 2: Visible some no Post

**Enunciado:** `Post.listed` quebra: `undefined method 'visible'`. `Post.ancestors` inclui `Visible`. Explique o buraco. Conserte sem copiar o scope para `Publishable`.

```ruby
module Visible
  def self.included(base)
    base.scope :visible, -> { where(visible: true) }
  end
end

module Publishable
  include Visible

  def self.included(base)
    base.scope :listed, -> { visible.where.not(published_at: nil) }
  end
end

class Post < ApplicationRecord
  include Publishable
end

Post.listed
```

<details>
<summary>Solução</summary>

`Publishable` inclui `Visible` primeiro. O hook roda com `base = Publishable`. Quando `Post` inclui `Publishable`, `Visible.included` **não** roda de novo. `Visible` está nos ancestors; `Post.visible` não existe. `listed` cai.

```ruby
module Visible
  extend ActiveSupport::Concern

  included do
    scope :visible, -> { where(visible: true) }
  end
end

module Publishable
  extend ActiveSupport::Concern
  include Visible

  included do
    scope :listed, -> { visible.where.not(published_at: nil) }
  end
end
```

O Concern inclui `Visible` em `Post`. Aí `visible` e `listed` existem na classe.

**Pontos-chave:**
- Ancestors ≠ macro de classe
- Hook de `included` dispara no include imediato
- Dependência é o caso que o Concern resolve de verdade
</details>

### Exercício 3: concern ou gaveta?

**Enunciado:** Para cada um: concern bom, gaveta, ou “fica na classe”? Uma frase. Sem código.

1. `archive!` + `scope :archived` em `Document` e `Upload`
2. `full_name`, `vip?`, `reset_password!`, `has_many :orders` extraídos de `User` para `Userable`
3. `before_action :require_login` só no `ApplicationController`
4. `paginate` em `PostsController` e `Api::CommentsController`
5. `module Shared` com `format_cents`, `current_season` e `slugify`

<details>
<summary>Solução</summary>

1. **Concern bom.** Um verbo, dois models, coluna óbvia.
2. **Gaveta.** É o `User`. Nome em `-able` não transforma fat model em composição.
3. **Fica na classe.** Um host. Extração não adiciona fronteira.
4. **Concern de controller.** Dois bases, um recorte (`Paginatable`). Pasta: `app/controllers/concerns`.
5. **Gaveta.** Três assuntos. Helper / PORO / método no lugar certo — não um mixin.

**Pontos-chave:**
- Nome + dois hosts
- Um host só fica onde está
- `Shared` é o anti-exemplo da entrevista
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
