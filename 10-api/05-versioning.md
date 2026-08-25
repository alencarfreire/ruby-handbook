# 10.5 Versionamento

> **TL;DR**
> Versione o contrato público, não o código interno. Em Rails, o caminho mais comum é `/v1/orders`, com controllers em `V1::`. Usar o header `Accept` mantém a URL estável e é mais puro no modelo HTTP, mas URL é o que muitos times realmente entregam: aparece em logs, documentação, cache e debugging. Abra `v2` para mudanças incompatíveis. Dentro de `v1`, prefira mudanças aditivas. Nunca quebre `v1` no lugar e espere que os clientes acompanhem.

## Conteúdo

- [O contrato versionado](#o-contrato-versionado)
- [Versão na URL](#versão-na-url)
- [Namespace V1 no Rails](#namespace-v1-no-rails)
- [Versão no header Accept](#versão-no-header-accept)
- [URL ou header](#url-ou-header)
- [Quando abrir v2](#quando-abrir-v2)
- [Como evoluir sem quebrar v1](#como-evoluir-sem-quebrar-v1)
- [Convivência e retirada](#convivência-e-retirada)
- [Testando versões](#testando-versões)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O contrato versionado

**O que é:**
Versionamento de API protege o contrato observado pelo cliente.

O contrato inclui:

- URL e verbo HTTP
- nomes, tipos e significado dos campos
- campos obrigatórios
- status HTTP e formato dos erros
- paginação, filtros e ordenação
- efeitos visíveis de uma operação

Refatorar um model, trocar uma query ou adicionar um índice não exige `v2`. Se request, response e comportamento continuam compatíveis, o contrato não mudou.

Já renomear `total_cents` para `total` pode exigir `v2`. O diff no servidor é pequeno, mas o cliente que lê `total_cents` quebra.

Use esta pergunta:

> “Um cliente correto de `v1`, sem novo deploy, continua funcionando e interpretando a resposta do mesmo jeito?”

Se a resposta for não, existe uma quebra de contrato.

**Na entrevista:**
> “Eu versiono a interface externa, não toda mudança interna. Abro uma versão quando preciso fazer uma mudança incompatível para o consumidor.”

---

## Versão na URL

**O que é:**
A versão faz parte do caminho:

```http
GET /v1/orders/42
GET /v2/orders/42
```

Também é comum encontrar `/api/v1/orders`. Se o domínio já é exclusivo da API, `/v1/orders` pode bastar.

**Como funciona:**

```ruby
# config/routes.rb
Rails.application.routes.draw do
  namespace :v1 do
    resources :orders, only: %i[index show create]
  end

  namespace :v2 do
    resources :orders, only: %i[index show create]
  end
end
```

O Rails direciona cada caminho para seu namespace:

```text
GET /v1/orders/:id -> V1::OrdersController#show
GET /v2/orders/:id -> V2::OrdersController#show
```

**Quando usar:**
Use URL quando você quer uma escolha explícita e simples de operar. A versão aparece em logs, traces, métricas, documentação, configuração de gateway e chaves de cache.

**Na entrevista:**
> “Versão na URL não é a opção mais pura em REST, mas é explícita, fácil de depurar e muito comum em produção.”

---

## Namespace V1 no Rails

**O que é:**
O namespace separa a borda HTTP de cada versão. Ele não obriga você a duplicar models e regras de negócio.

```text
app/controllers/v1/base_controller.rb
app/controllers/v1/orders_controller.rb
app/controllers/v2/orders_controller.rb
```

**Exemplo prático:**

```ruby
# app/controllers/v1/orders_controller.rb
module V1
  class OrdersController < ApplicationController
    def show
      order = Order.find(params[:id])

      render json: {
        id: order.id,
        total_cents: order.total_cents,
        status: order.status
      }
    end
  end
end
```

A `v2` pode apresentar o mesmo `Order` com `total: { amount: "25.90", currency: "BRL" }`. Controllers, serializers e strong params podem ser versionados; domínio e casos de uso continuam compartilhados quando a regra é a mesma.

**Importante na entrevista:**
Evite fazer `V2::OrdersController < V1::OrdersController` por padrão. Essa herança acopla contratos: uma alteração em `v1` pode mudar `v2` sem intenção. Compartilhe componentes explícitos, não a versão anterior inteira.

---

## Versão no header Accept

**O que é:**
A URL não muda. O cliente seleciona a representação pelo `Accept`:

```http
GET /orders/42
Accept: application/vnd.store.v1+json
```

Para `v2`:

```http
GET /orders/42
Accept: application/vnd.store.v2+json
```

**Como funciona:**
Uma constraint pode selecionar o module correto:

```ruby
# app/constraints/api_version.rb
class ApiVersion
  VENDOR_PREFIX = "application/vnd.store.v"

  def initialize(version:, default: false)
    @version = version
    @default = default
  end

  def matches?(request)
    accept = request.headers["Accept"].to_s
    expected = "#{VENDOR_PREFIX}#{@version}+json"

    accept.include?(expected) ||
      (@default && !accept.include?(VENDOR_PREFIX))
  end
end
```

```ruby
# config/routes.rb
Rails.application.routes.draw do
  scope module: :v2,
        constraints: ApiVersion.new(version: 2) do
    resources :orders, only: %i[index show create]
  end

  scope module: :v1,
        constraints: ApiVersion.new(version: 1, default: true) do
    resources :orders, only: %i[index show create]
  end
end
```

A ordem importa. O Rails tenta `v2` antes da route padrão de `v1`. Em produção, use parsing rigoroso se você aceita headers complexos; o exemplo só mostra o mecanismo.

Se a resposta varia por `Accept`, sinalize isso ao cache:

```ruby
response.set_header("Vary", "Accept")
response.set_header("Content-Type", "application/vnd.store.v1+json")
```

**Na entrevista:**
> “O header é mais puro porque `/orders/42` continua identificando o recurso e o `Accept` escolhe a representação. O custo é operacional: a versão fica menos visível em logs, browser, cache e debugging.”

---

## URL ou header

As duas estratégias preservam contratos. A escolha é mais operacional do que filosófica. URL dá visibilidade imediata, teste manual simples e separação natural em caches. Header mantém a URI estável, mas exige inspecionar o request e configurar `Vary` corretamente.

Escolha URL se simplicidade, suporte e observabilidade pesam mais. Escolha header se o time domina content negotiation e precisa manter a URI estável.

Não ofereça os dois mecanismos sem necessidade. Isso dobra combinações de documentação e teste.

**Na entrevista:**
> “Header é mais puro no modelo HTTP. Na prática, eu normalmente escolheria `/v1`, porque é explícito e é o que muitos times conseguem operar melhor. Eu decidiria olhando clientes, gateway, cache e observabilidade.”

---

## Quando abrir v2

**Quando usar:**
Abra `v2` quando uma mudança incompatível for necessária:

- remover ou renomear campo
- trocar o tipo de um valor
- mudar o significado de um status
- tornar obrigatório um campo antes opcional
- alterar o formato global de erros
- trocar paginação sem preservar a interface
- mudar o efeito de uma operação existente

Normalmente não abra `v2` para:

- refatoração ou melhoria de performance
- mudança de serializer sem mudar o JSON
- endpoint novo
- filtro opcional
- campo opcional que os clientes toleram

Adicionar campo costuma ser compatível, mas clientes com validação rígida podem rejeitar chaves desconhecidas. Conheça os consumidores e publique sua política de compatibilidade.

Nem toda mudança pede uma versão global. Às vezes um endpoint novo expressa melhor um fluxo novo.

**Na entrevista:**
> “Eu não abro `v2` por refatoração. Abro quando o cliente precisaria mudar junto com o deploy do servidor.”

---

## Como evoluir sem quebrar v1

**Como funciona:**
Depois que clientes usam `v1`, ela é um contrato publicado. Prefira mudanças aditivas: endpoint novo, operação nova, filtro opcional e campo opcional dentro da política da API.

Se `v1` devolve:

```json
{ "id": 42, "total_cents": 2590 }
```

Você pode adicionar o formato novo durante a transição:

```json
{
  "id": 42,
  "total_cents": 2590,
  "total": { "amount": "25.90", "currency": "BRL" }
}
```

Mas não remova `total_cents` da mesma `v1`. Changelog não substitui compatibilidade.

Correção de bug exige julgamento. Se o comportamento contradiz a documentação, corrigir pode ser aceitável. Se clientes dependem dele há anos, o “bug” pode ter virado contrato observado. Meça o uso e comunique antes de mudar.

**Importante na entrevista:**
Nunca quebre `v1` no lugar e espere que consumidores façam deploy ao mesmo tempo.

---

## Convivência e retirada

**Como funciona:**
Mantenha diferenças na borda. Cada versão pode ter controller e serializer próprios, mas chamar o mesmo caso de uso:

```ruby
order = Orders::Create.call(customer: current_customer, params: order_params)
render json: V1::OrderSerializer.new(order).serializable_hash
```

Na `v2`, troque o serializer, não duplique transação, validação e acesso ao banco sem motivo.

Uma retirada saudável publica `v2` e o guia de migração, mantém as versões juntas por um período, mede uso por cliente e comunica a data de encerramento. Headers como `Deprecation`, `Sunset` e `Link` ajudam, mas não substituem e-mail, documentação ou o canal acordado com os consumidores.

**Na entrevista:**
> “Eu publico a política de suporte, meço tráfego por versão e dou uma janela de migração. Não desligo `v1` sem saber quem ainda depende dela.”

---

## Testando versões

**Exemplo prático:**
Request specs protegem cada contrato suportado:

```ruby
RSpec.describe "Versionamento de pedidos", type: :request do
  let!(:order) { Order.create!(total_cents: 2_590, status: "paid") }

  it "preserva v1" do
    get "/v1/orders/#{order.id}"

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body).to include(
      "id" => order.id,
      "total_cents" => 2_590
    )
  end
end
```

Repita o padrão para `v2`. Para header, envie `Accept` e verifique `Vary`. Teste erros, autenticação e media type inválido. Enquanto `v1` for suportada, a suíte dela continua no CI.

**Na entrevista:**
> “A suíte de `v1` impede uma refatoração de quebrar clientes antigos enquanto `v2` evolui.”

---

## Recapitulando

- Versione o contrato público, não a implementação.
- `/v1` é explícito e simples de operar.
- `Accept` é mais puro porque negocia a representação.
- Na prática, URL é o que muitos times entregam.
- Use controllers em `V1::` e `V2::`.
- Abra `v2` para mudanças incompatíveis.
- Nunca quebre `v1` no lugar.
- Compartilhe domínio; versione a borda HTTP.
- Mantenha testes para todas as versões suportadas.
- Depreque com métricas, comunicação e prazo.

---

## Exercícios práticos

### Exercício 1: Classifique as mudanças

**Enunciado:** Diga se você manteria `v1` ou abriria `v2`: adicionar endpoint de cancelamento; renomear `total_cents`; adicionar índice no banco; mudar erro de string para objeto; adicionar filtro opcional.

<details>
<summary>Solução</summary>

- endpoint novo: mantém `v1`; é aditivo
- campo renomeado: abre `v2`; quebra leitores do campo antigo
- índice: mantém `v1`; é interno
- erro string para objeto: abre `v2`; muda o tipo
- filtro opcional: mantém `v1`; clientes antigos o ignoram

**Pontos-chave:**
- Compatibilidade do consumidor define a decisão
- Tamanho do diff no servidor não define a versão
</details>

### Exercício 2: Crie duas routes

**Enunciado:** Configure `/v1/products/:id` e `/v2/products/:id` para os respectivos controllers em `V1::` e `V2::`.

<details>
<summary>Solução</summary>

```ruby
Rails.application.routes.draw do
  namespace :v1 do
    resources :products, only: :show
  end

  namespace :v2 do
    resources :products, only: :show
  end
end
```

Crie `V1::ProductsController` e `V2::ProductsController`. Os dois podem usar o mesmo `Product`.

**Pontos-chave:**
- `namespace` adiciona caminho e module
- A versão fica na borda HTTP
</details>

### Exercício 3: Defenda a estratégia

**Enunciado:** O entrevistador pergunta se header não é mais RESTful. Responda para um time com CDN, clientes mobile e suporte que depura requests por logs.

<details>
<summary>Solução</summary>

> “O `Accept` é mais puro porque mantém a URI e negocia a representação. Para esse time eu escolheria `/v1`: a versão fica visível nos logs, é simples de separar na CDN e facilita o suporte a clientes mobile antigos. O essencial é preservar o contrato e ter política de depreciação.”

**Pontos-chave:**
- Reconhece a vantagem semântica do header
- Decide com base em operação e consumidores
- Escolher URL não autoriza quebrar `v1`
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
