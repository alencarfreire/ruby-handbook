# 10.3 OpenAPI

> **TL;DR**
> OpenAPI é um contrato legível por pessoas e ferramentas para descrever uma API HTTP. Swagger é o ecossistema de ferramentas que popularizou esse formato. Em Rails, `rswag` aproxima request specs da documentação; `committee` valida requests e responses contra o contrato; `olive_branch` ajuda no versionamento negociado por header, mas não substitui OpenAPI. Prefira contrato primeiro quando existem vários consumidores ou times: você combina endpoint, payload, autenticação e erros antes de implementar. Documente também falhas reais, principalmente `401 Unauthorized` e `422 Unprocessable Content`.

## Conteúdo

- [OpenAPI e Swagger](#openapi-e-swagger)
- [Por que contrato primeiro](#por-que-contrato-primeiro)
- [Documentando autenticação e erros](#documentando-autenticação-e-erros)
- [rswag, committee e olive_branch](#rswag-committee-e-olive_branch)
- [Na entrevista](#na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## OpenAPI e Swagger

**O que é:**
OpenAPI é uma especificação para descrever APIs HTTP. O documento costuma ser YAML ou JSON e informa quais operações existem, o que entra e o que sai.

Ele pode registrar:

- paths e métodos HTTP;
- parâmetros de path, query e header;
- corpo do request;
- status e corpo de cada response;
- autenticação;
- schemas reutilizáveis;
- exemplos.

O contrato é independente de Rails. Um app Rails, um serviço Go e um cliente mobile podem compartilhar o mesmo documento.

**Como funciona:**
Uma ferramenta lê o documento e consegue gerar documentação navegável, validar tráfego, criar mocks ou gerar um cliente.

O trecho abaixo só mostra a estrutura. Não é uma especificação completa:

```yaml
openapi: 3.1.0
info:
  title: API de pedidos
  version: 1.0.0
paths:
  /orders/{id}:
    get:
      summary: Busca um pedido
      responses:
        "200":
          description: Pedido encontrado
        "401":
          description: Token ausente ou inválido
```

**Importante na entrevista:**
OpenAPI e Swagger não são exatamente sinônimos.

- **OpenAPI** é a especificação.
- **Swagger UI** renderiza documentação interativa.
- **Swagger Editor** ajuda a editar e visualizar o contrato.
- **Swagger Codegen** e ferramentas parecidas geram código.

Você ainda vai ouvir “o Swagger da API”. Em geral, a pessoa está falando do documento OpenAPI ou da interface Swagger UI.

**Na entrevista:**
> "OpenAPI é o contrato. Swagger é um conjunto de ferramentas em volta dele. Eu uso o contrato para alinhar e validar a integração, não só para produzir uma página bonita."

---

## Por que contrato primeiro

**O que é:**
Contrato primeiro significa discutir e aprovar a interface antes de terminar a implementação.

Não significa escrever centenas de linhas de YAML antes de entender o problema. Significa tomar decisões de integração cedo.

**Como funciona:**
Um fluxo enxuto pode ser:

1. consumidor e time da API propõem a operação;
2. definem exemplos de request e response;
3. registram schemas, status e autenticação;
4. revisam o contrato;
5. desenvolvem cliente e servidor em paralelo;
6. validam a implementação no CI.

**Por que usar:**

- reduz suposição entre frontend, mobile e backend;
- expõe nomes ruins e estados ausentes antes do código;
- permite mock do servidor para o consumidor;
- deixa mudanças incompatíveis visíveis no diff;
- cria uma base para testes de contrato;
- torna erros parte da interface pública.

Sem contrato, é comum o frontend descobrir tarde que o backend devolve `200` em uma criação, que o erro muda de array para objeto ou que um campo aceita `null` sem ninguém ter combinado.

**Importante na entrevista:**
Contrato primeiro não elimina conversa. O YAML não decide sozinho idempotência, paginação ou semântica de negócio.

Também não garante compatibilidade. Você ainda precisa revisar mudanças como:

- remover campo;
- tornar campo opcional em obrigatório;
- alterar tipo;
- retirar status documentado;
- mudar regra de autenticação.

Adicionar campo opcional costuma ser compatível, mas pode quebrar consumidores que rejeitam propriedades desconhecidas. Compatibilidade depende das regras combinadas.

**Quando usar:**
O ganho é maior quando:

- vários times consomem a API;
- o cliente é publicado separadamente;
- existe integração com parceiros;
- frontend e backend trabalham em paralelo;
- a API tem compromisso público de estabilidade.

Para uma API interna pequena, você pode começar com request specs e extrair um contrato. O ponto é manter uma fonte confiável, não seguir um ritual.

**Na entrevista:**
> "Eu prefiro contrato primeiro quando cliente e servidor evoluem separados. A revisão acontece antes da implementação, e o CI verifica se o Rails continua entregando o que foi combinado."

---

## Documentando autenticação e erros

**O que é:**
Uma documentação que mostra apenas `200` e `201` está incompleta. Para o consumidor, falha também é comportamento normal da API.

### `401 Unauthorized`

Use quando a credencial está ausente, expirada ou inválida. Apesar do nome histórico, `401` fala de autenticação.

Um contrato pode declarar Bearer token e a response de falha:

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    AuthenticationError:
      type: object
      required: [error]
      properties:
        error:
          type: string

paths:
  /orders:
    post:
      security:
        - bearerAuth: []
      responses:
        "401":
          description: Token ausente, expirado ou inválido
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AuthenticationError"
```

Exemplo de corpo:

```json
{
  "error": "token inválido"
}
```

`403 Forbidden` é diferente: a identidade é conhecida, mas não tem permissão para aquela ação.

### `422 Unprocessable Content`

Use quando o JSON foi entendido, mas os dados não passam pelas regras da operação. Em APIs Rails, é comum para falhas de validation do Active Record.

```yaml
"422":
  description: Pedido inválido
  content:
    application/json:
      schema:
        $ref: "#/components/schemas/ValidationError"
      example:
        errors:
          items:
            - não pode ficar vazio
```

Documente a estrutura, não todas as frases possíveis. Mensagens podem variar por locale ou regra. Se o cliente toma decisão programática, considere códigos estáveis:

```json
{
  "errors": [
    {
      "code": "items_required",
      "field": "items",
      "message": "não pode ficar vazio"
    }
  ]
}
```

**Importante na entrevista:**
Combine um formato de erro consistente. Não devolva `{ "error": "..." }` em um endpoint, `{ "errors": [...] }` em outro e uma página HTML em um terceiro.

Também não confunda:

- `400 Bad Request`: request malformado ou impossível de interpretar;
- `401 Unauthorized`: autenticação ausente ou inválida;
- `403 Forbidden`: autenticado, sem autorização;
- `404 Not Found`: recurso não encontrado;
- `422 Unprocessable Content`: formato entendido, dados inválidos.

**Na entrevista:**
> "Eu documento sucesso e falha. Para uma rota autenticada, `401` faz parte do contrato. Para validation, documento `422` com um envelope de erros estável, porque o consumidor precisa implementar esses fluxos."

---

## rswag, committee e olive_branch

**O que é:**
Essas gems atuam em pontos diferentes. Você não precisa instalar as três por padrão.

### rswag

`rswag` integra RSpec, geração de OpenAPI e uma interface de documentação para apps Rails.

Você descreve metadata da operação em uma request spec, executa o request e verifica a response. Depois, a ferramenta gera o documento usado pela UI.

É útil quando o time quer specs executáveis próximas da documentação.

Cuidados:

- declarar uma response não garante que todos os cenários foram exercitados;
- exemplos muito acoplados ao DSL podem ficar difíceis de ler;
- o arquivo gerado precisa refletir o que roda no CI.

### committee

`committee` usa um schema OpenAPI para validar requests e responses. Pode entrar como middleware ou apoio de teste.

É útil quando o arquivo OpenAPI já é a fonte do contrato e você quer detectar divergência no Rails.

Cuidados:

- validação de response em produção tem custo;
- schemas vagos, com muitos campos livres, dão falsa segurança;
- rollout precisa considerar tráfego antigo e endpoints ainda não cobertos.

Uma estratégia comum é validar tudo no CI e habilitar validação controlada em ambientes de teste.

### olive_branch

`olive_branch` trata versionamento de API por negociação, normalmente lendo a versão de headers e expondo essa informação ao app.

Ele ajuda quando a versão não está no path, por exemplo:

```http
Accept: application/vnd.example.v2+json
```

Mas ele não descreve endpoints nem valida schemas. OpenAPI continua sendo o contrato de cada versão.

Se houver duas versões ativas, deixe explícito qual documento representa cada uma. Não esconda diferenças incompatíveis atrás do mesmo schema.

**Quando usar:**

| Ferramenta | Problema principal |
|---|---|
| `rswag` | documentar e exercitar operações com RSpec |
| `committee` | validar requests e responses contra OpenAPI |
| `olive_branch` | negociar versão da API por header |

**Na entrevista:**
> "Eu escolho a gem pelo papel. rswag aproxima documentação e request spec. committee fiscaliza o contrato existente. olive_branch resolve negociação de versão; não é uma ferramenta de OpenAPI."

---

## Na entrevista

Uma resposta forte e curta:

> "OpenAPI descreve a interface HTTP de forma independente do Rails. Eu prefiro combinar o contrato antes quando há consumidores separados, incluindo autenticação, schemas e erros. No Rails posso usar rswag para aproximar request specs da documentação ou committee para validar uma especificação existente. Também documento `401` e `422`, porque integração não vive só no caminho feliz."

Perguntas que podem vir depois:

**"OpenAPI substitui request spec?"**

Não. O documento descreve. A spec executa comportamento. Uma ferramenta pode ligar os dois, mas ainda existem responsabilidades diferentes.

**"Você gera o contrato do código ou o código do contrato?"**

Depende do time. Para API pública ou vários consumidores, prefiro contrato revisado antes e validação da implementação. Em app interno, specs podem ser a fonte se o CI gerar e conferir o artefato.

**"Como impede documentação desatualizada?"**

Validação automática, exemplos executáveis e diff do contrato no pull request. Publicação manual sem teste tende a gerar drift.

**"Por que documentar `401`?"**

Porque token ausente, expirado ou inválido é um fluxo esperado. O cliente precisa saber status, formato e como reagir.

**"Por que `422`?"**

Porque o consumidor precisa exibir ou tratar erros de dados válidos em JSON, mas inválidos para a regra da operação. O envelope deve ser consistente.

---

## Recapitulando

- OpenAPI é a especificação; Swagger é um ecossistema de ferramentas.
- O contrato descreve a borda HTTP, não detalhes internos do Rails.
- Contrato primeiro antecipa decisões e permite trabalho em paralelo.
- Design first e specs como fonte são opções; ambas precisam de validação.
- `401` e `422` fazem parte da interface e devem estar documentados.
- `401` é falha de autenticação; `403` é falta de autorização.
- `422` comunica dados entendidos, mas inválidos para a operação.
- `rswag` liga RSpec, OpenAPI e documentação.
- `committee` valida tráfego contra o schema.
- `olive_branch` negocia versão; não substitui OpenAPI.
- Schema não substitui teste de regra de negócio.
- CI e revisão do diff evitam drift.

---

## Exercícios práticos

### Exercício 1: Caminho feliz não basta

**Enunciado:** Você recebeu uma documentação de `POST /orders` que mostra apenas `201 Created`. Liste duas responses que faltam e explique o formato mínimo de cada uma.

<details>
<summary>Solução</summary>

Inclua pelo menos:

- `401 Unauthorized` com um envelope estável, como `{ "error": "token inválido" }`;
- `422 Unprocessable Content` com erros de validation por campo ou com códigos estáveis.

Também declare Bearer token no `securitySchemes` e associe a operação a esse esquema.

**Pontos-chave:**
- Falha é parte do contrato
- `401` cobre autenticação ausente ou inválida
- `422` cobre dados entendidos, mas rejeitados
- Cliente não deve adivinhar o formato do erro
</details>

### Exercício 2: Escolha da ferramenta

**Enunciado:** O time já mantém `openapi.yaml` como fonte principal e quer falhar o CI quando uma response Rails não bate com o schema. Você escolheria `rswag`, `committee` ou `olive_branch` como peça principal? Justifique.

<details>
<summary>Solução</summary>

`committee` é a escolha mais direta para validar requests e responses contra um contrato OpenAPI existente.

`rswag` seria uma opção se o time quisesse descrever e gerar a documentação a partir de specs. `olive_branch` trata negociação de versão, não validação de schema.

**Pontos-chave:**
- A ferramenta deve seguir a fonte escolhida
- `committee` fiscaliza um contrato existente
- `rswag` aproxima contrato e RSpec
- `olive_branch` resolve outro problema
</details>

### Exercício 3: Mudança incompatível

**Enunciado:** A response de pedido tinha `total_cents` como Integer obrigatório. Uma alteração passa a devolver `total` como String e remove `total_cents`. O que você faria antes do deploy?

<details>
<summary>Solução</summary>

Trate como breaking change. Não altere silenciosamente a mesma versão.

Uma saída é manter `total_cents` durante uma transição e adicionar o novo campo como opcional. Se a remoção for necessária, publique uma nova versão do contrato e combine a migração dos consumidores.

No CI, execute testes de contrato para as versões suportadas. Se a versão for negociada por header com `olive_branch`, mantenha o documento correspondente a cada comportamento.

**Pontos-chave:**
- Remover ou trocar tipo quebra consumidores
- Versão e contrato precisam evoluir juntos
- Transição explícita é melhor que quebra silenciosa
- Validação automática protege as duas versões
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
