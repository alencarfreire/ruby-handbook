# 10.2 Serializers

> **TL;DR**
> Serializer define o JSON público da API. Evite `render json: @user.to_json`: o model conhece o banco, não o contrato HTTP, e pode expor colunas internas ou deixar de fora campos calculados. Jbuilder monta JSON em templates e funciona bem para respostas específicas do endpoint. Alba declara resources reutilizáveis, modernos e rápidos. ActiveModelSerializers aparece em legado. Na entrevista: serializer é o contrato da API; controller busca os dados, serializer decide a representação.

## Conteúdo

- [Serializer é contrato](#serializer-é-contrato)
- [Por que não usar `to_json` direto](#por-que-não-usar-to_json-direto)
- [Jbuilder](#jbuilder)
- [Alba](#alba)
- [Associações e N+1](#associações-e-n1)
- [Autorização e campos sensíveis](#autorização-e-campos-sensíveis)
- [Evolução do contrato](#evolução-do-contrato)
- [ActiveModelSerializers](#activemodelserializers)
- [Como escolher](#como-escolher)
- [Na entrevista](#na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Serializer é contrato

**O que é:**
Serializer transforma um objeto do domínio em uma representação pública. Em JSON, ele decide nomes, tipos, formatos, objetos aninhados e campos ausentes.

```text
Active Record -> serializer -> JSON -> cliente
```

O model pode ter `first_name`, `last_name`, `password_digest` e `discarded_at`. A API pode publicar só `id`, `name` e `active`.

**Como funciona:**
O controller busca dados. A Policy autoriza. O serializer monta a representação. O renderer envia JSON e status. Banco e API podem evoluir em ritmos diferentes: renomear uma coluna não deveria obrigar o cliente a mudar.

**Importante na entrevista:**
> "Eu trato o serializer como contrato. O banco pode mudar sem mudar o JSON, e o JSON não expõe detalhes internos do model."

---

## Por que não usar `to_json` direto

**O que é:**
Este código delega o contrato ao estado atual do model:

```ruby
def show
  user = User.find(params[:id])
  render json: user.to_json
end
```

Se `users` tem `password_digest`, `admin`, `reset_password_token` e `internal_notes`, serializar todos os atributos pode **expor demais**: digest, token, flags internas, dados pessoais desnecessários e colunas futuras das quais o cliente passa a depender.

Também pode **expor de menos**: nome calculado, URL do avatar, estado derivado como `can_edit`, metadados de paginação e relacionamentos exigidos pelo contrato.

Isto limita campos, mas espalha a representação pelo controller:

```ruby
render json: user.as_json(
  only: [:id, :name, :email],
  methods: [:avatar_url],
  include: :profile
)
```

Quando vários endpoints repetem esse Hash, as respostas divergem. Prefira uma definição explícita e testável.

**Quando usar:**
`to_json` direto pode servir em script local ou protótipo descartável. Em endpoint consumido por outra equipe ou app, declare o contrato.

**Na entrevista:**
> "`to_json` acopla o schema da API ao schema do banco. Posso vazar dados e ainda não entregar campos derivados ou uma estrutura estável."

---

## Jbuilder

**O que é:**
Jbuilder é uma gem de templates JSON integrada ao fluxo de views do Rails. Você usa uma DSL Ruby para montar objetos e arrays.

**Como funciona:**
O controller carrega os dados. Pela convenção, a action renderiza `show.json.jbuilder`.

```ruby
class Api::V1::UsersController < Api::V1::BaseController
  def show
    @user = User.find(params[:id])
  end
end
```

```ruby
# app/views/api/v1/users/show.json.jbuilder
json.data do
  json.id @user.id
  json.name @user.name
  json.email @user.email
  json.created_at @user.created_at.iso8601
end
```

Para coleções, use o block de `json.data`. Extraia partial quando a representação se repete:

```ruby
# _user.json.jbuilder
json.id user.id
json.name user.name
json.email user.email
```

**Quando usar:**
Jbuilder funciona bem quando o payload pertence à action, combina vários objetos ou precisa de envelope e metadados específicos. A equipe Rails reconhece o modelo de views e partials.

O custo é executar Ruby campo a campo. Partials demais escondem a resposta final. Para coleções grandes, meça tempo e alocações.

**Na entrevista:**
> "Jbuilder é flexível e orientado ao endpoint. Para payload composto ele é natural. Em alto volume, eu meço o custo."

---

## Alba

**O que é:**
Alba é uma gem moderna de serialização para Ruby. Ela declara atributos e associações em resources, com API pequena e baixo overhead.

```ruby
class UserResource
  include Alba::Resource

  attributes :id, :name, :email

  attribute :created_at do |user|
    user.created_at.iso8601
  end
end
```

**Como funciona:**
Entregue um objeto ou coleção ao resource. `serialize` retorna JSON.

```ruby
def show
  user = User.find(params[:id])
  render json: UserResource.new(user).serialize
end
```

Resources podem compor associações:

```ruby
class UserResource
  include Alba::Resource
  attributes :id, :name
  one :profile, resource: ProfileResource
end
```

`ProfileResource` declara os campos públicos do perfil. Não coloque regra de negócio complexa no resource. O domínio calcula total, desconto ou permissão; o serializer representa o resultado.

**Quando usar:**
Use Alba quando quer resources reutilizáveis, independentes de templates e com baixo overhead. É uma opção forte para coleções grandes, mas "rápido" não elimina benchmark.

**Na entrevista:**
> "Alba oferece resources explícitos e reutilizáveis com baixo overhead. Mas gem rápida não corrige query ruim nem payload gigante."

---

## Associações e N+1

**O que é:**
Serializer acessa métodos. Se um método é uma associação não carregada, o Active Record pode disparar query durante a serialização.

```ruby
class UserResource
  include Alba::Resource
  attributes :id, :name
  many :posts, resource: PostResource
end
```

Isto pode fazer uma query para usuários e uma para os posts de cada usuário:

```ruby
users = User.limit(50)
render json: UserResource.new(users).serialize
```

Prepare a consulta para o payload:

```ruby
users = User.includes(:posts).order(:name).limit(50)
render json: UserResource.new(users).serialize
```

A regra vale para Alba, Jbuilder e qualquer solução. Quem monta a query precisa conhecer as associações que a resposta acessa.

**Importante na entrevista:**
> "N+1 pode nascer no serializer. Eu verifico os campos acessados e preparo `includes` ou `preload`; serializer não torna lazy loading barato."

---

## Autorização e campos sensíveis

**O que é:**
Serializer controla exposição, mas não substitui autorização. Primeiro decida se o usuário pode acessar o recurso. Depois monte a forma permitida.

```ruby
def show
  user = User.find(params[:id])
  authorize user, :show?
  render json: PublicUserResource.new(user).serialize
end
```

Não publique um campo e espere que o frontend o esconda. Quando o JSON sai do servidor, o dado já foi exposto. Se administradores recebem mais dados, prefira contratos nomeados, como `PublicUserResource` e `AdminUserResource`, em vez de condições espalhadas.

**Importante na entrevista:**
> "Serializer é allowlist de saída, não Policy. A Policy autoriza; o serializer limita os campos. Eu não mando segredo para o cliente filtrar."

---

## Evolução do contrato

**O que é:**
Clientes dependem de nomes, tipos, nulabilidade e estrutura. Trocar `name` por `full_name`, número por string ou objeto por array pode quebrar o cliente.

Mudança aditiva costuma ser mais segura. Para mudanças incompatíveis, separe resources por namespace, como `Api::V1::UserResource` e `Api::V2::UserResource`.

Teste o contrato no nível HTTP:

```ruby
get "/api/v1/users/#{user.id}"

body = response.parsed_body.fetch("data")
expect(body).to include("id" => user.id, "name" => "João")
expect(body).not_to have_key("password_digest")
```

Request spec protege route, controller, serializer e envelope vistos pelo cliente.

---

## ActiveModelSerializers

**O que é:**
ActiveModelSerializers, ou AMS, aparece em muitas bases Rails antigas:

```ruby
class UserSerializer < ActiveModel::Serializer
  attributes :id, :name, :email
  has_one :profile
end
```

Você precisa saber manter essa DSL. Em sistema existente, não reescreva tudo por preferência. Meça o problema e migre incrementalmente se houver ganho.

Para projeto novo, AMS é uma escolha legada, não o default automático. Avalie manutenção, compatibilidade e performance. Jbuilder e Alba costumam ser candidatas mais atuais.

---

## Como escolher

**Quando usar:**
Jbuilder favorece payload específico da action, envelope e composição livre. Alba favorece representação reutilizada e baixo overhead. Em uma base com AMS, mantenha ou migre com evidência. Um Hash explícito também pode bastar em endpoint minúsculo. O problema não é "JSON sem gem"; é representação implícita, espalhada ou acoplada ao banco.

---

## Na entrevista

> "Serializer é o contrato da API. Evito `@user.to_json` porque ele acopla o JSON ao model: pode expor token ou flag interna e não entrega bem campos derivados. O controller busca e autoriza; o serializer escolhe e formata. Jbuilder serve bem a payload específico. Alba dá resources reutilizáveis e rápidos. AMS é comum em legado. Também preparo associações contra N+1 e cubro o formato com request spec."

---

## Recapitulando

- Serializer é o contrato público da API.
- `to_json` direto pode expor demais ou de menos.
- Jbuilder é flexível e orientado ao endpoint.
- Alba oferece resources reutilizáveis e baixo overhead.
- AMS é relevante em legado, não escolha automática para código novo.
- Serializer não substitui Policy.
- Associação acessada na serialização pode criar N+1.
- Mudanças de nome, tipo e estrutura podem quebrar clientes.
- Request specs protegem o contrato HTTP.

---

## Exercícios práticos

### Exercício 1: Remova o `to_json` inseguro

**Enunciado:** Reescreva com Jbuilder um endpoint que publica o model inteiro. Retorne apenas `id`, `name`, `email` e `created_at` em ISO 8601, dentro de `data`.

<details>
<summary>Solução</summary>

```ruby
# show.json.jbuilder
json.data do
  json.id @user.id
  json.name @user.name
  json.email @user.email
  json.created_at @user.created_at.iso8601
end
```

**Pontos-chave:**
- A resposta usa allowlist.
- Coluna nova não aparece automaticamente.
- O formato da data faz parte do contrato.
</details>

### Exercício 2: Evite N+1 com Alba

**Enunciado:** Crie `ArticleResource` com `id`, `title` e um `author` contendo `id` e `name`. Mostre a query para uma coleção sem N+1.

<details>
<summary>Solução</summary>

```ruby
class AuthorResource
  include Alba::Resource
  attributes :id, :name
end

class ArticleResource
  include Alba::Resource
  attributes :id, :title
  one :author, resource: AuthorResource
end
```

```ruby
articles = Article.includes(:author).order(created_at: :desc)
render json: ArticleResource.new(articles).serialize
```

**Pontos-chave:**
- Resources publicam poucos campos.
- `includes(:author)` evita uma query por artigo.
- O controller prepara dados; o serializer representa.
</details>

### Exercício 3: Evolua sem quebrar a v1

**Enunciado:** A v1 retorna `{"name":"João Silva"}`. O banco agora separa `first_name` e `last_name`. Como publicar os novos campos sem quebrar o app mobile?

<details>
<summary>Solução</summary>

Mantenha `name` calculado no resource v1 e crie um resource v2 com os novos campos.

```ruby
module Api::V1
  class UserResource
    include Alba::Resource
    attribute(:name) { |user| "#{user.first_name} #{user.last_name}" }
  end
end

module Api::V2
  class UserResource
    include Alba::Resource
    attributes :first_name, :last_name
  end
end
```

**Pontos-chave:**
- Banco e API evoluem separadamente.
- Remover `name` quebraria a v1.
- Request specs devem cobrir os dois contratos.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
