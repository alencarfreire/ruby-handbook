# 8.2 Request spec

> **TL;DR**
> Request spec testa uma requisição passando por route, middleware, controller e renderização. Use `get`, `post` e os outros verbos com helpers de rota. Valide status, headers e corpo em `response`. Use `follow_redirect!` só quando a resposta seguinte importar. Para JSON, prefira `as: :json` e `response.parsed_body`. Controller spec está morto como escolha para código novo. Request spec também não substitui system spec: ele não dirige um navegador.

## Conteúdo

- [O que é](#o-que-é)
- [Request spec vs controller spec](#request-spec-vs-controller-spec)
- [GET e POST](#get-e-post)
- [Lendo response](#lendo-response)
- [Seguindo redirects](#seguindo-redirects)
- [Requisições JSON](#requisições-json)
- [Autenticação com sign_in](#autenticação-com-sign_in)
- [Status codes](#status-codes)
- [O limite do request spec](#o-limite-do-request-spec)
- [Na entrevista](#na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que é

**O que é:**
Um request spec faz uma chamada HTTP contra sua app Rails sem abrir um navegador real.

O caminho é próximo do que acontece em produção:

```text
request → router → middleware → controller → render/redirect → response
```

Você testa o comportamento público do endpoint. Não chama a action diretamente.

**Quando usar:**

- endpoints HTML e JSON;
- criação, alteração e exclusão de recursos;
- autenticação e autorização no nível HTTP;
- status, headers, corpo e redirects;
- integração entre route, controller e banco.

Um request spec responde perguntas como:

- `GET /articles/42` devolve `200`?
- `POST /articles` cria o registro?
- params inválidos devolvem `422`?
- usuário anônimo é redirecionado?
- a API responde JSON e não HTML?

O arquivo costuma ficar em `spec/requests/articles_spec.rb`. `type: :request` ativa os helpers de integração do RSpec Rails.

---

## Request spec vs controller spec

Controller spec foi comum em Rails antigo. Ele usa chamadas como `get :show`, pelo nome da action. Fica acoplado ao controller e não prova que a route pública funciona. Também pode deixar middleware e outras partes da requisição fora do caminho.

O request spec usa a interface que o cliente conhece:

```ruby
RSpec.describe "Articles", type: :request do
  it "mostra o artigo" do
    article = Article.create!(title: "RSpec", body: "Teste")

    get article_path(article)

    expect(response).to have_http_status(:ok)
  end
end
```

**Importante na entrevista:**
Controller spec está morto **como escolha padrão para código novo**. Você pode mantê-lo em uma suíte legada. Para novos testes de endpoint, prefira request spec.

---

## GET e POST

### GET

`get` recebe o caminho. Params de consulta vão em `params:`:

```ruby
RSpec.describe "Articles", type: :request do
  it "filtra artigos publicados" do
    Article.create!(title: "Visível", body: "...", published: true)
    Article.create!(title: "Rascunho", body: "...", published: false)

    get articles_path, params: { status: "published" }

    expect(response).to have_http_status(:ok)
    expect(response.body).to include("Visível")
    expect(response.body).not_to include("Rascunho")
  end
end
```

Use `article_path(article)` em vez de montar `"/articles/#{article.id}"`. O helper deixa a intenção clara e acompanha mudanças na route.

Checar apenas `:ok` costuma ser pouco. Valide uma parte relevante do contrato, sem copiar o HTML inteiro.

### POST

No `post`, envie a estrutura esperada pelos strong params:

```ruby
RSpec.describe "Articles", type: :request do
  it "cria um artigo" do
    expect {
      post articles_path, params: {
        article: {
          title: "Testes rápidos",
          body: "Request spec sem navegador"
        }
      }
    }.to change(Article, :count).by(1)

    article = Article.order(:id).last

    expect(article.title).to eq("Testes rápidos")
    expect(response).to have_http_status(:found)
    expect(response).to redirect_to(article_path(article))
  end
end
```

O teste prova o efeito no banco e o contrato HTTP. No caso inválido, prove que nada mudou:

```ruby
expect {
  post articles_path, params: { article: { title: "", body: "Texto" } }
}.not_to change(Article, :count)

expect(response).to have_http_status(:unprocessable_entity)
```

O mesmo formato vale para `patch`, `put` e `delete`.

---

## Lendo response

Depois da chamada, `response` representa a última resposta:

```ruby
response.status       # 200
response.body         # HTML, JSON ou outro corpo como String
response.headers      # headers da resposta
response.media_type   # "text/html" ou "application/json"
response.location     # URL de um redirect
response.parsed_body  # corpo interpretado pelo parser registrado
```

Prefira matchers que expressem intenção: `have_http_status(:ok)`, `redirect_to(...)` e `include(...)`. `response.status == 200` funciona, mas o matcher comunica melhor e gera uma falha mais útil.

---

## Seguindo redirects

Um redirect entrega status e header `Location`, não o corpo do destino:

```ruby
post articles_path, params: {
  article: { title: "Redirect", body: "Destino" }
}

article = Article.order(:id).last

expect(response).to have_http_status(:found)
expect(response).to redirect_to(article_path(article))
```

Se a página seguinte fizer parte do cenário:

```ruby
follow_redirect!

expect(response).to have_http_status(:ok)
expect(response.body).to include("Artigo criado com sucesso")
```

Depois de `follow_redirect!`, `response` passa a ser a resposta do `GET` seguinte. Valide o redirect original **antes** de segui-lo.

Não siga por reflexo. Se o contrato é apenas “manda para o login”, `redirect_to(new_user_session_path)` basta.

---

## Requisições JSON

`as: :json` serializa os params e configura os headers da requisição:

```ruby
RSpec.describe "Articles API", type: :request do
  it "cria um artigo" do
    post api_articles_path,
      params: {
        article: { title: "API Rails", body: "JSON de verdade" }
      },
      as: :json

    expect(response).to have_http_status(:created)
    expect(response.media_type).to eq("application/json")

    body = response.parsed_body
    expect(body["title"]).to eq("API Rails")
    expect(body["id"]).to be_present
  end
end
```

No Rails 7.1+, prefira `response.parsed_body` a repetir `JSON.parse(response.body)`.

Você também pode passar headers específicos com `headers: { "ACCEPT" => "application/json" }`. Não confunda: `as: :json` define como a **requisição** é enviada; `response.media_type` prova o formato da **resposta**.

---

## Autenticação com sign_in

Se a app usa Devise, o request spec pode usar `sign_in`. Esse helper é do Devise, não do Rails:

```ruby
# spec/rails_helper.rb
RSpec.configure do |config|
  config.include Devise::Test::IntegrationHelpers, type: :request
end
```

```ruby
user = User.create!(
  email: "admin@example.com",
  password: "senha-segura",
  admin: true
)
sign_in user

get admin_articles_path

expect(response).to have_http_status(:ok)
```

Teste também o caso anônimo com `expect(response).to redirect_to(new_user_session_path)`. Isso é só um teaser da integração. Autenticação e autorização completas merecem cenários próprios.

---

## Status codes

Use símbolos no teste e saiba explicar os números:

| Código | Símbolo | Uso comum |
|---:|---|---|
| 200 | `:ok` | GET bem-sucedido |
| 201 | `:created` | recurso criado por API |
| 204 | `:no_content` | sucesso sem corpo |
| 302 | `:found` | redirect comum em HTML |
| 303 | `:see_other` | redirect que deve virar GET |
| 400 | `:bad_request` | requisição malformada |
| 401 | `:unauthorized` | autenticação ausente ou inválida |
| 403 | `:forbidden` | autenticado, mas sem permissão |
| 404 | `:not_found` | recurso não encontrado |
| 422 | `:unprocessable_entity` | dados entendidos, mas inválidos |

Seja específico. `200`, `201` e `204` são sucesso, mas representam contratos diferentes. `401` significa falta de identidade válida; `403`, identidade conhecida sem permissão.

---

## O limite do request spec

Request spec não abre Chrome, não executa JavaScript e não prova interação real no DOM. Clique, formulário no navegador, modal e fluxo com JavaScript pertencem ao system spec.

Não replique aqui a experiência inteira do usuário. Mantenha o teste focado na requisição, na resposta e nos efeitos observáveis.

---

## Na entrevista

> "Eu prefiro request spec para endpoints porque ele passa por route, middleware e controller usando a interface HTTP. Valido efeito no banco, status, redirect e uma parte relevante do corpo. Controller spec ficou legado porque acopla na action e pula partes da stack. Para fluxo real de navegador, uso system spec."

Em um `POST`, organize a resposta em quatro pontos: efeito no banco, status, representação e casos negativos.

---

## Recapitulando

- Request spec testa o endpoint pela interface HTTP.
- Controller spec é legado; para código novo, prefira request spec.
- Use os verbos HTTP com helpers de rota e `params:`.
- Leia status, headers e corpo em `response`.
- Valide o redirect antes de chamar `follow_redirect!`.
- Para JSON, use `as: :json` e `response.parsed_body`.
- `sign_in` é um helper de integração do Devise.
- Status específico comunica melhor que “sucesso”.
- Request spec não substitui system spec.

---

## Exercícios práticos

### Exercício 1: GET inexistente

**Enunciado:** Escreva um request spec para um artigo inexistente. A API deve responder `404` com `{ "error": "Artigo não encontrado" }`.

<details>
<summary>Solução</summary>

```ruby
RSpec.describe "Articles API", type: :request do
  it "responde 404" do
    get api_article_path(id: 999_999), as: :json

    expect(response).to have_http_status(:not_found)
    expect(response.media_type).to eq("application/json")
    expect(response.parsed_body).to eq(
      "error" => "Artigo não encontrado"
    )
  end
end
```

**Pontos-chave:**
- exercita a route pública;
- valida status, media type e contrato JSON.
</details>

### Exercício 2: POST com redirect

**Enunciado:** Teste que `POST /articles` cria o registro, redireciona para o `show` e exibe “Artigo criado com sucesso” no destino.

<details>
<summary>Solução</summary>

```ruby
expect {
  post articles_path, params: {
    article: { title: "Contrato HTTP", body: "Resposta observável" }
  }
}.to change(Article, :count).by(1)

article = Article.order(:id).last
expect(response).to redirect_to(article_path(article))

follow_redirect!

expect(response).to have_http_status(:ok)
expect(response.body).to include("Artigo criado com sucesso")
```

**Pontos-chave:**
- prova a mudança no banco;
- valida o destino antes de segui-lo;
- lembra que `response` muda após `follow_redirect!`.
</details>

### Exercício 3: Endpoint autenticado

**Enunciado:** Uma API aceita criação apenas por usuário autenticado. Teste o caso anônimo com `401` e o autenticado com `201`.

<details>
<summary>Solução</summary>

```ruby
params = { article: { title: "API", body: "Autenticada" } }

post api_articles_path, params: params, as: :json
expect(response).to have_http_status(:unauthorized)

user = User.create!(email: "dev@example.com", password: "senha-segura")
sign_in user

expect {
  post api_articles_path, params: params, as: :json
}.to change(Article, :count).by(1)

expect(response).to have_http_status(:created)
```

**Pontos-chave:**
- separa usuário anônimo de usuário sem permissão;
- lembra que `sign_in` vem do Devise;
- valida efeito e status no caso feliz.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
