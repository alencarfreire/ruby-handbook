# 10.1 REST

> **TL;DR**
> REST modela a API como recursos identificados por URLs. O verbo HTTP diz a operação: GET lê, POST cria, PUT substitui, PATCH altera parcialmente e DELETE remove. Em Rails, uma API pode herdar de `ActionController::API` e responder com `render json:`. Use `200` para sucesso com corpo, `201` para criação, `204` para sucesso sem corpo, `404` quando o recurso não existe e `422` quando os dados são inválidos. GET e PUT são idempotentes: repetir a mesma requisição mantém o mesmo efeito esperado no servidor.

## Conteúdo

- [Recursos e verbos](#recursos-e-verbos)
- [Rotas REST](#rotas-rest)
- [ActionController::API](#actioncontrollerapi)
- [JSON](#json)
- [Status HTTP essenciais](#status-http-essenciais)
- [Idempotência de GET e PUT](#idempotência-de-get-e-put)
- [Exemplo prático](#exemplo-prático)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Recursos e verbos

**O que é:**
REST é um estilo de arquitetura para sistemas HTTP. A ideia central é expor recursos, não chamar métodos remotos pela URL.

Um artigo é um recurso. A coleção de artigos também é.

```text
/articles       # coleção
/articles/42    # um artigo
```

A URL identifica o recurso. O verbo informa o que você quer fazer com ele.

| Verbo | Intenção | Exemplo |
|---|---|---|
| GET | Ler | `GET /articles/42` |
| POST | Criar | `POST /articles` |
| PUT | Substituir | `PUT /articles/42` |
| PATCH | Alterar parte | `PATCH /articles/42` |
| DELETE | Remover | `DELETE /articles/42` |

**Como funciona:**
Prefira substantivos no plural:

```text
# Evite
POST /create_article
GET  /get_article?id=42
POST /delete_article/42

# Prefira
POST   /articles
GET    /articles/42
DELETE /articles/42
```

GET não deve mudar estado de negócio. Abrir uma URL não pode publicar um artigo, cobrar um cartão ou excluir um usuário.

POST normalmente atua na coleção porque o servidor ainda vai definir a identidade do recurso. PUT e PATCH atuam em um recurso conhecido. Pela semântica HTTP, PUT envia uma substituição completa; PATCH, uma alteração parcial.

**Na entrevista:**
> "Em REST, a URL identifica o recurso e o verbo representa a operação. GET lê, POST cria, PUT substitui, PATCH altera parcialmente e DELETE remove."

---

## Rotas REST

**O que é:**
As rotas ligam verbo e path a uma action do controller.

```ruby
# config/routes.rb
Rails.application.routes.draw do
  resources :articles, only: %i[index show create update destroy]
end
```

| Verbo | Path | Action |
|---|---|---|
| GET | `/articles` | `index` |
| GET | `/articles/:id` | `show` |
| POST | `/articles` | `create` |
| PATCH/PUT | `/articles/:id` | `update` |
| DELETE | `/articles/:id` | `destroy` |

API não costuma precisar de `new` e `edit`, pois essas actions entregam formulários HTML. O detalhamento de `resources` e das sete actions está no [capítulo 5.2, Rotas](../05-rails-basics/02-routes.md).

---

## ActionController::API

**O que é:**
`ActionController::API` é a base enxuta para controllers de API. Ela mantém o necessário para requests, `params` e respostas, mas deixa de fora vários recursos voltados a páginas HTML.

Em uma app criada com `rails new minha_api --api`:

```ruby
# app/controllers/application_controller.rb
class ApplicationController < ActionController::API
end
```

```ruby
class ArticlesController < ApplicationController
  def index
    render json: Article.all
  end
end
```

**Como funciona:**
Uma action precisa encerrar com uma resposta. Em API, estas formas são comuns:

```ruby
render json: article
render json: article, status: :created
head :no_content
```

`render json:` escreve JSON no corpo. `head` devolve só headers e status.

**Na entrevista:**
> "`ActionController::API` é uma base menor para APIs. Ela preserva params e resposta, mas não carrega por padrão toda a parte orientada a HTML."

---

## JSON

**O que é:**
REST não obriga JSON, mas ele é a representação mais comum em APIs Rails.

```http
POST /articles
Content-Type: application/json

{
  "article": {
    "title": "REST no Rails",
    "body": "Verbo e recurso formam o contrato."
  }
}
```

O Rails interpreta o corpo e disponibiliza os valores em `params`. Strong params continuam necessários:

```ruby
def article_params
  params.require(:article).permit(:title, :body)
end
```

O fato de o cliente enviar JSON não torna os campos confiáveis.

**Como funciona:**

```ruby
render json: article, status: :ok
render json: { errors: article.errors }, status: :unprocessable_entity
```

Mantenha o formato previsível. Se erros usam a chave `errors`, não alterne sem motivo entre `error`, `message` e uma string solta.

Aqui o foco é transporte HTTP. A camada de serializers e a definição detalhada das representações ficam fora deste capítulo.

---

## Status HTTP essenciais

**O que é:**
O status resume o resultado. O cliente não deve analisar uma mensagem em português para descobrir se funcionou.

### 200 OK

Operação concluída com corpo de resposta. É comum em GET e update.

```ruby
render json: article, status: :ok
```

### 201 Created

Novo recurso criado.

```ruby
render json: article, status: :created, location: article
```

### 204 No Content

Operação concluída sem corpo de resposta. É comum em DELETE.

```ruby
article.destroy!
head :no_content
```

Uma resposta `204` não deve levar JSON no corpo.

### 404 Not Found

O recurso pedido não existe. `find` levanta `ActiveRecord::RecordNotFound`, que o Rails pode transformar em `404`.

```ruby
article = Article.find(params[:id])
```

Não devolva `200` com `{ "error": "não encontrado" }`.

### 422 Unprocessable Entity

O JSON foi entendido, mas os dados não passam nas validações.

```ruby
render json: { errors: article.errors }, status: :unprocessable_entity
```

Título obrigatório ausente é `422`. Artigo inexistente é `404`.

**Na entrevista:**
> "Uso 200 com corpo, 201 na criação, 204 sem corpo, 404 para recurso ausente e 422 para falha de validação. Status faz parte do contrato."

---

## Idempotência de GET e PUT

**O que é:**
Uma operação é idempotente quando repetir a mesma requisição produz o mesmo efeito esperado no estado do servidor que executá-la uma vez.

Idempotência fala de efeito, não de respostas byte a byte idênticas. Horário, log, cache e headers podem variar.

### GET é idempotente

```text
GET /articles/42
GET /articles/42
GET /articles/42
```

As repetições apenas leem. Elas não devem aumentar saldo, publicar conteúdo nem mudar o artigo.

```ruby
# Ruim: cada GET altera o recurso
def show
  article = Article.find(params[:id])
  article.increment!(:views_count)
  render json: article
end
```

### PUT é idempotente

```http
PUT /articles/42
Content-Type: application/json

{
  "article": {
    "title": "REST no Rails",
    "body": "Representação completa"
  }
}
```

Enviar essa representação uma ou cinco vezes deve deixar o artigo no mesmo estado pretendido. Um PUT que incrementa um contador não é idempotente.

POST, em geral, não é idempotente. Repetir `POST /articles` pode criar vários artigos. Essa diferença importa quando há timeout e o cliente avalia se pode repetir o request.

**Importante na entrevista:**
O Rails não garante idempotência pelo nome da action. Seu código precisa respeitar a semântica do verbo.

**Na entrevista:**
> "GET e PUT são idempotentes. Repetir GET não muda o recurso; repetir o mesmo PUT mantém a representação pretendida."

---

## Exemplo prático

```ruby
class ArticlesController < ApplicationController
  before_action :set_article, only: %i[show update destroy]

  def index
    render json: Article.order(created_at: :desc), status: :ok
  end

  def show
    render json: @article, status: :ok
  end

  def create
    article = Article.new(article_params)

    if article.save
      render json: article, status: :created, location: article
    else
      render json: { errors: article.errors }, status: :unprocessable_entity
    end
  end

  def update
    if @article.update(article_params)
      render json: @article, status: :ok
    else
      render json: { errors: @article.errors }, status: :unprocessable_entity
    end
  end

  def destroy
    @article.destroy!
    head :no_content
  end

  private

  def set_article
    @article = Article.find(params[:id])
  end

  def article_params
    params.require(:article).permit(:title, :body)
  end
end
```

O exemplo assume que `ActiveRecord::RecordNotFound` vira `404` pelo tratamento de exceções do Rails.

---

## Recapitulando

- REST organiza a API em recursos identificados por URLs.
- A URL é substantivo; o verbo comunica a operação.
- GET lê, POST cria, PUT substitui, PATCH altera parcialmente e DELETE remove.
- `ActionController::API` é uma base enxuta para APIs.
- `render json:` envia JSON; `head :no_content` envia resposta sem corpo.
- `200` é sucesso com corpo; `201`, criação; `204`, sucesso sem corpo.
- `404` indica recurso inexistente; `422`, dados inválidos.
- GET e PUT são idempotentes pelo contrato HTTP.
- Idempotência depende da implementação.

---

## Exercícios práticos

### Exercício 1: Modele o recurso

**Enunciado:** Modele endpoints para listar, mostrar, criar, atualizar parcialmente e remover pedidos. Informe verbo, path e status de sucesso.

<details>
<summary>Solução</summary>

| Operação | Verbo e path | Status |
|---|---|---|
| Listar | `GET /orders` | `200` |
| Mostrar | `GET /orders/:id` | `200` |
| Criar | `POST /orders` | `201` |
| Atualizar | `PATCH /orders/:id` | `200` |
| Remover | `DELETE /orders/:id` | `204` |

**Pontos-chave:**
- Paths usam substantivos
- PATCH comunica alteração parcial
- Status muda conforme o resultado
</details>

### Exercício 2: 404 ou 422?

**Enunciado:** Um cliente envia `PATCH /articles/99` sem título. Qual é o status se o artigo não existe? E se existe, mas o model exige título?

<details>
<summary>Solução</summary>

Artigo inexistente: `404 Not Found`. Artigo existente com dados inválidos: `422 Unprocessable Entity` e erros em JSON.

**Pontos-chave:**
- `404` fala da identidade do recurso
- `422` fala dos dados entendidos, mas inválidos
- Não esconda os casos em `200`
</details>

### Exercício 3: Idempotência

**Enunciado:** Por que incrementar `views_count` dentro de `show` quebra a semântica de GET? Proponha uma alternativa.

<details>
<summary>Solução</summary>

Cada repetição altera o recurso. Um retry, crawler ou prefetch passa a mudar estado de negócio. Mantenha GET como leitura. Se uma visualização for uma operação explícita do domínio, modele uma escrita separada, como `POST /articles/42/views`.

**Pontos-chave:**
- GET deve ser seguro e idempotente
- Repetição automática acontece na prática
- O código preserva ou quebra a semântica
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
