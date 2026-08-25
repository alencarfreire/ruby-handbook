# 10.6 CORS

> **TL;DR**
> CORS é uma regra aplicada pelo navegador para requests entre origens diferentes. A API libera uma origem com `Access-Control-Allow-Origin`. Requests não simples costumam gerar um preflight `OPTIONS`. Em Rails, configure `rack-cors` com uma allowlist explícita. Nunca use `*`. Com cookies ou outras credenciais, devolva a origem exata e `Access-Control-Allow-Credentials: true`. CORS não autentica, não autoriza e não bloqueia `curl` ou chamadas entre servidores.

## Conteúdo

- [O que é CORS](#o-que-é-cors)
- [Same-origin policy](#same-origin-policy)
- [Requests simples](#requests-simples)
- [Preflight OPTIONS](#preflight-options)
- [Headers CORS](#headers-cors)
- [Configurando rack-cors](#configurando-rack-cors)
- [Credenciais e origem exata](#credenciais-e-origem-exata)
- [CORS não é autorização](#cors-não-é-autorização)
- [Diagnóstico](#diagnóstico)
- [Na entrevista](#na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que é CORS

**O que é:**
CORS significa Cross-Origin Resource Sharing.
É um protocolo baseado em headers HTTP.
Ele permite que um servidor diga ao navegador quais origens podem ler suas respostas.

Frontend em `https://app.exemplo.com` e API em `https://api.exemplo.com` são origens diferentes.

Quando o JavaScript chama a API, o navegador envia:

```http
Origin: https://app.exemplo.com
```

Se essa origem for permitida, a API responde:

```http
Access-Control-Allow-Origin: https://app.exemplo.com
```

Sem esse header, o navegador não entrega a resposta ao JavaScript.

**Importante na entrevista:**
O navegador aplica CORS.
O Rails apenas publica a política nos headers.

---

## Same-origin policy

**O que é:**
A same-origin policy é uma proteção do navegador.
Por padrão, um script não pode ler livremente dados de outra origem.

Isso dificulta que uma página maliciosa leia respostas privadas de outro site usando a sessão já aberta no navegador.

**Como funciona:**
Uma origem tem três partes:

1. protocolo;
2. host;
3. porta.

Todas precisam ser iguais.

| URL A | URL B | Mesma origem? |
|---|---|---:|
| `https://app.exemplo.com` | `https://app.exemplo.com/perfil` | sim |
| `https://app.exemplo.com` | `http://app.exemplo.com` | não |
| `https://app.exemplo.com` | `https://api.exemplo.com` | não |
| `http://localhost:3000` | `http://localhost:5173` | não |

O path não participa da origem. `/login` e `/pedidos` continuam iguais.
O header `Origin` também não inclui path, query ou fragmento.
A allowlist trabalha com origens, não com páginas.

**Na entrevista:**
> "Same-origin compara protocolo, host e porta. CORS é a forma de o servidor liberar uma chamada cross-origin para o navegador."

---

## Requests simples

**Como funciona:**
Alguns requests cross-origin podem ser enviados sem preflight.
O navegador envia o request e depois verifica os headers CORS da resposta.

Em termos práticos, ele usa `GET`, `HEAD` ou `POST` e apenas headers e content types considerados seguros pelo padrão.
A resposta ainda precisa trazer `Access-Control-Allow-Origin`.

Request simples não significa request confiável.
O backend continua responsável por autenticação, autorização e CSRF.
O navegador pode enviar o request mesmo se o JavaScript não puder ler a resposta.

---

## Preflight OPTIONS

**O que é:**
Preflight é uma consulta feita pelo navegador antes do request real.
Ela usa o método `OPTIONS`.

É comum quando o frontend envia:

- `PUT`, `PATCH` ou `DELETE`;
- `Authorization`;
- `Content-Type: application/json`;
- outro header fora da lista simples.

Antes de um `PATCH`, o navegador pode enviar:

```http
OPTIONS /api/orders/42 HTTP/1.1
Origin: https://app.exemplo.com
Access-Control-Request-Method: PATCH
Access-Control-Request-Headers: authorization,content-type
```

A API responde o que aceita:

```http
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://app.exemplo.com
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Max-Age: 600
Vary: Origin
```

Só depois o navegador envia o `PATCH` real.

O preflight não autoriza o usuário a editar o pedido `42`.
Ele pergunta se aquela origem pode tentar um `PATCH` com aqueles headers.
A policy da aplicação roda no request real.

`Access-Control-Max-Age` reduz preflights repetidos.

---

## Headers CORS

**Como funciona:**
- `Access-Control-Allow-Origin`: libera a origem;
- `Access-Control-Allow-Methods`: libera métodos no preflight;
- `Access-Control-Allow-Headers`: libera headers do request real;
- `Access-Control-Allow-Credentials`: permite resposta com credenciais;
- `Access-Control-Expose-Headers`: expõe headers da resposta ao JavaScript;
- `Access-Control-Max-Age`: define o cache do preflight.

`Access-Control-Allow-Origin` recebe uma origem por resposta, não uma lista separada por vírgulas.
Para atender várias, valide `Origin` contra uma allowlist e devolva apenas a correspondente.
Nunca reflita qualquer origem recebida.
Use `Vary: Origin` para um cache não reaproveitar a variante errada.

**Importante na entrevista:**
Nunca configure `Access-Control-Allow-Origin: *` como atalho.
Use uma allowlist explícita.
O wildcard amplia o acesso e não funciona com credenciais.

---

## Configurando rack-cors

**O que é:**
`rack-cors` é um middleware Rack que trata headers e preflights CORS.

Adicione `gem "rack-cors"` e configure:

```ruby
# config/initializers/cors.rb
allowed_origins = ENV.fetch("CORS_ALLOWED_ORIGINS").split(",").map(&:strip)

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(*allowed_origins)

    resource "/api/*",
      headers: %w[Authorization Content-Type],
      methods: %i[get post patch put delete options],
      credentials: true,
      max_age: 600
  end
end
```

Em produção:

```text
CORS_ALLOWED_ORIGINS=https://app.exemplo.com,https://admin.exemplo.com
```

`insert_before 0` coloca o middleware cedo, antes de autenticação e controllers.

**Quando usar:**
Origens explícitas por ambiente. Restrinja `resource`, métodos e headers.
Não use `origins "*"`. Regex ampla de subdomínio também vaza origem.

---

## Credenciais e origem exata

**O que é:**
Em CORS, credenciais incluem cookies, autenticação HTTP e certificados TLS do cliente.

Para enviar cookies, o frontend pede explicitamente:

```javascript
fetch("https://api.exemplo.com/api/me", {
  credentials: "include"
})
```

A API responde com ambos:

```http
Access-Control-Allow-Origin: https://app.exemplo.com
Access-Control-Allow-Credentials: true
```

A origem deve ser exata.
O navegador rejeita credenciais junto de:

```http
Access-Control-Allow-Origin: *
```

No `rack-cors`, use uma origem explícita com `credentials: true`.

Mesmo com CORS correto, cookies obedecem a `Secure`, `HttpOnly` e `SameSite`.
CORS não sobrescreve essas regras.

Se frontend e API são cross-site, avalie `SameSite=None; Secure` junto com a estratégia de CSRF.

Um Bearer token em `Authorization` costuma gerar preflight.
Ainda assim, o backend deve validar o token em todo request protegido.

---

## CORS não é autorização

**Importante na entrevista:**
CORS é uma política do navegador.
Não substitui autenticação ou autorização no servidor.

`curl`, Postman, apps mobile, scripts e outros servidores chamam a API sem serem bloqueados por CORS.
Logo, permitir apenas seu frontend não impede outros clientes de acessar o servidor.

Separe as responsabilidades:

- CORS decide se o navegador entrega a resposta ao JavaScript;
- autenticação descobre quem fez o request;
- autorização decide se essa identidade pode executar a ação;
- CSRF trata credenciais enviadas automaticamente pelo navegador.

A API ainda devolve `401` sem autenticação válida e `403` quando o usuário não pode executar a ação.

---

## Diagnóstico

**Exemplo prático:**
Se funciona no Postman, mas falha no browser, CORS é um suspeito forte.
Postman não aplica a same-origin policy.

Na aba Network, confira `Origin`, o status do `OPTIONS`, os headers `Access-Control-Allow-*` e o uso de credenciais.

Um erro comum é exigir autenticação no `OPTIONS` e devolver `401` antes do middleware CORS.
Outro é liberar `GET`, mas esquecer `PATCH` ou `Authorization`.
Nos dois casos, o preflight falha e o request real nem é enviado.

---

## Na entrevista

> "CORS é uma política aplicada pelo navegador por causa da same-origin policy. A API responde quais origens, métodos e headers aceita. Em requests não simples, o navegador faz um preflight `OPTIONS`. No Rails eu uso `rack-cors`, com allowlist explícita. Nunca uso wildcard; com credenciais, devolvo a origem exata e `Access-Control-Allow-Credentials: true`. CORS não substitui autenticação nem autorização, porque `curl` e chamadas server-to-server não estão sujeitos a essa proteção do browser."

> "Postman não aplica CORS. Eu verificaria o `Origin`, o preflight `OPTIONS` e os headers `Access-Control-Allow-*`."

> "Ele verifica origem, método e headers. Não autoriza o usuário a alterar o recurso. Isso continua sendo responsabilidade do servidor no request real."

---

## Recapitulando

- Origem é protocolo + host + porta.
- A same-origin policy é aplicada pelo navegador.
- A API libera uma origem com `Access-Control-Allow-Origin`.
- Requests não simples costumam gerar preflight `OPTIONS`.
- O preflight verifica origem, método e headers.
- `rack-cors` centraliza a configuração no Rails.
- Use allowlist explícita e restrinja rotas, métodos e headers.
- Nunca use `*`.
- Credenciais exigem origem exata e `Access-Control-Allow-Credentials: true`.
- Cookies também obedecem a `SameSite`, `Secure` e CSRF.
- CORS não autentica nem autoriza.
- `curl`, Postman e outros servidores não são bloqueados por CORS.

---

## Exercícios práticos

### Exercício 1: Identifique as origens

**Enunciado:** A página está em `https://app.exemplo.com:443/pedidos`. Quais URLs têm a mesma origem?

1. `https://app.exemplo.com/perfil`;
2. `http://app.exemplo.com/perfil`;
3. `https://api.exemplo.com/pedidos`;
4. `https://app.exemplo.com:8443/admin`.

<details>
<summary>Solução</summary>

Apenas a primeira.
Na segunda muda o protocolo; na terceira, o host; na quarta, a porta.
O path não participa da origem.

**Pontos-chave:**
- Origem é protocolo + host + porta
- Subdomínios são hosts diferentes
- Path não define origem
</details>

### Exercício 2: Corrija as credenciais

**Enunciado:** Corrija a configuração:

```ruby
allow do
  origins "*"
  resource "/api/*", headers: :any, methods: :any, credentials: true
end
```

<details>
<summary>Solução</summary>

Use origem, métodos e headers explícitos:

```ruby
allow do
  origins "https://app.exemplo.com"

  resource "/api/*",
    headers: %w[Authorization Content-Type],
    methods: %i[get post patch options],
    credentials: true
end
```

Credenciais não funcionam com wildcard.
O frontend também precisa usar `credentials: "include"` para cookies.

**Pontos-chave:**
- Nunca use `*`
- Credenciais exigem origem exata
- Libere só o necessário
</details>

### Exercício 3: Explique o preflight

**Enunciado:** Um `PATCH` com `Authorization` funciona no Postman, mas o `OPTIONS` recebe `401` no navegador. Explique e corrija.

<details>
<summary>Solução</summary>

O navegador faz preflight porque `PATCH` e `Authorization` não formam um request simples.
A autenticação está barrando o `OPTIONS` cedo demais.

Coloque o `rack-cors` no início da stack com `insert_before 0`.
Permita a origem exata, `PATCH` e `Authorization`.
O request `PATCH` real continua sujeito à autenticação e à autorização.

Postman funciona porque não aplica CORS.

**Pontos-chave:**
- Preflight usa `OPTIONS`
- `401` impede o request real
- CORS deve rodar cedo
- CORS não substitui autorização
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
