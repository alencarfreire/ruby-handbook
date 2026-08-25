# 9.2 CSRF

> **TL;DR**
> CSRF faz o navegador autenticado disparar uma ação que o usuário não pediu. O cookie pode ir junto automaticamente; por isso, a sessão sozinha não prova intenção. Em controllers web, o Rails valida um `authenticity_token` nos requests que alteram estado. `SameSite` ajuda, mas é defesa adicional. API com Bearer token normalmente não precisa de CSRF; API autenticada por cookie precisa. Turbo usa a mesma proteção dos forms Rails.

## Conteúdo

- [O que é CSRF](#o-que-é-csrf)
- [Como o Rails protege](#como-o-rails-protege)
- [authenticity_token](#authenticity_token)
- [protect_from_forgery](#protect_from_forgery)
- [Cookies SameSite](#cookies-samesite)
- [API e JSON](#api-e-json)
- [Turbo forms](#turbo-forms)
- [Importante na entrevista](#importante-na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que é CSRF

**O que é:**
CSRF significa *Cross-Site Request Forgery*. É a falsificação de um request entre sites.

O atacante não precisa roubar senha nem cookie. Ele induz o navegador da vítima a enviar um request para uma app em que ela já está autenticada.

```html
<form action="https://banco.example/transfers" method="post">
  <input type="hidden" name="amount_cents" value="50000">
  <input type="hidden" name="pix_key" value="atacante@example.com">
</form>

<script>
  document.querySelector("form").submit()
</script>
```

Se as regras do cookie permitirem, o browser anexa a sessão de `banco.example`. Para o servidor, o request parece autenticado.

A política de mesma origem normalmente impede o site malicioso de **ler** a resposta. Ela não impede todo **envio** de request. Para criar a transferência, o atacante nem precisa da resposta.

O ataque clássico depende de três pontos:

1. o usuário está autenticado;
2. o browser envia a credencial automaticamente, como um cookie;
3. o endpoint muda estado sem exigir uma prova que o atacante não possui.

### GET não altera estado

`GET` deve consultar. Não deve criar, editar nem excluir.

```ruby
# RUIM: link, imagem, crawler ou prefetch pode apagar
get "/users/:id/delete", to: "users#destroy"

# BOM
delete "/users/:id", to: "users#destroy"
```

O Rails verifica CSRF nos requests que não são `GET` ou `HEAD`. Se um `GET` apaga dados, você contornou a proteção pelo desenho da route.

**Na entrevista:**
> "CSRF explora a credencial que o navegador anexa automaticamente. O atacante força uma ação com a sessão da vítima, mesmo sem conhecer o cookie."

---

## Como o Rails protege

**Como funciona:**
Uma app Rails 7.1+ completa normalmente herda de `ActionController::Base`. Nessa stack, apps modernas geradas pelo Rails vêm com proteção contra forgery habilitada.

```ruby
class ApplicationController < ActionController::Base
end
```

Conceitualmente, o comportamento web normal é:

```ruby
class ApplicationController < ActionController::Base
  protect_from_forgery with: :exception
end
```

Em um request que altera estado, o Rails procura token válido nos params ou no header `X-CSRF-Token`. Se não encontrar, `:exception` levanta:

```ruby
ActionController::InvalidAuthenticityToken
```

O token prova que o request passou por uma página legítima da app. Um site externo pode montar um form, mas não pode ler o HTML da app para copiar esse valor.

A proteção não substitui autenticação, autorização, strong params nem regra de negócio.

**Na entrevista:**
> "A sessão identifica o usuário. O token CSRF prova que a ação veio de uma página legítima. Depois disso, o controller ainda precisa autorizar e validar a operação."

---

## authenticity_token

**O que é:**
`authenticity_token` é a prova CSRF gerada pelo Rails. Helpers de form incluem o campo automaticamente.

```erb
<%= form_with model: @profile do |form| %>
  <%= form.text_field :name %>
  <%= form.submit "Salvar" %>
<% end %>
```

O HTML contém, de forma simplificada:

```html
<input type="hidden"
       name="authenticity_token"
       value="token-gerado-pelo-rails">
```

Não gere esse valor na mão. Use `form_with`, `form_tag`, `button_to` ou o helper adequado.

No layout, `csrf_meta_tags` publica o token para JavaScript e Turbo:

```erb
<head>
  <%= csrf_meta_tags %>
</head>
```

Um `fetch` manual, autenticado por cookie, manda o header:

```js
const token = document.querySelector('meta[name="csrf-token"]').content

await fetch("/profile", {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    "X-CSRF-Token": token
  },
  body: JSON.stringify({ profile: { name: "João" } })
})
```

O Rails usa tokens mascarados. Dois forms podem mostrar strings diferentes e continuar válidos. A máscara reduz vazamentos por compressão, como BREACH. Não compare a string visível esperando igualdade.

Rails também suporta tokens por form, vinculados à ação e ao método HTTP. A verificação cuida dessas representações internamente.

**Na entrevista:**
> "O helper inclui `authenticity_token`. O Rails valida a prova contra o estado CSRF da sessão. O token visível é mascarado e pode mudar entre renders."

---

## protect_from_forgery

**O que é:**
`protect_from_forgery` define o tratamento de um request não verificado.

```ruby
protect_from_forgery with: :exception
protect_from_forgery with: :null_session
protect_from_forgery with: :reset_session
```

### `:exception`

Levanta `ActionController::InvalidAuthenticityToken`. É a escolha normal para páginas autenticadas por sessão.

### `:null_session`

Deixa a action rodar sem disponibilizar a sessão autenticada normal. Ele **não rejeita automaticamente o request**.

```ruby
class WebhooksController < ActionController::Base
  protect_from_forgery with: :null_session

  def create
    verify_signature!
    WebhookEvent.create!(payload: request.raw_post)
    head :accepted
  end
end
```

A action precisa ser segura sem a sessão e autenticar o chamador de outra forma. No exemplo, uma assinatura HMAC valida o provedor.

### `:reset_session`

Limpa a sessão quando a verificação falha. É menos comum e, como `:null_session`, não bloqueia da mesma forma que `:exception`.

### Pular a verificação

Para um endpoint que definitivamente não usa cookie, o Rails oferece:

```ruby
class WebhooksController < ApplicationController
  skip_forgery_protection only: :create
end
```

Pular é diferente de `:null_session`: no primeiro caso não há verificação; no segundo, uma falha troca a sessão por uma sessão vazia. Nenhuma opção autentica um webhook.

Não desabilite CSRF globalmente para fazer teste, frontend ou integração passar. Prefira exceção localizada e justificada.

**Na entrevista:**
> "`:exception` bloqueia. `:null_session` deixa a action rodar com sessão vazia. `skip_forgery_protection` não verifica. Null session e skip não são equivalentes."

---

## Cookies SameSite

**O que é:**
`SameSite` diz ao browser em quais contextos entre sites um cookie pode ser enviado.

- `Strict`: mais restritivo; pode afetar navegação vinda de outro site;
- `Lax`: bloqueia muitos envios cross-site, especialmente `POST`;
- `None`: permite contexto cross-site e exige `Secure` em browsers modernos.

Rails usa `SameSite=Lax` por padrão para cookies em configurações modernas. Ele reduz bastante o ataque clássico, mas é defesa em profundidade: não remova o token.

"Site" não é igual a "origem". Subdomínios podem ser considerados do mesmo site, mesmo com origens diferentes. Falha em subdomínio e política ampla de cookie mudam o risco.

`HttpOnly` impede JavaScript de ler o cookie. Não impede o browser de enviá-lo e, portanto, não resolve CSRF.

**Na entrevista:**
> "SameSite=Lax ajuda, mas eu mantenho o token. HttpOnly protege a leitura do cookie; não protege contra o envio forjado."

---

## API e JSON

**O que é:**
JSON não decide se há risco de CSRF. A forma de autenticação decide.

### Bearer token

Se o cliente envia `Authorization: Bearer ...`, um form malicioso não consegue obrigar o browser a anexar esse header. Esse modelo normalmente dispensa token CSRF.

Controllers que herdam de `ActionController::API` usam stack reduzida e não incluem proteção de forgery por padrão:

```ruby
class Api::BaseController < ActionController::API
  before_action :authenticate_bearer_token!
end
```

### Cookie de sessão

Se a API JSON autentica pelo cookie do browser, o risco continua. Mantenha a verificação e envie `X-CSRF-Token` no frontend.

`Content-Type: application/json` pode dificultar um form HTML simples, mas não é a proteção principal.

Use `:null_session` quando a action deve ignorar qualquer sessão recebida e autenticar de outra maneira. Use `skip_forgery_protection` quando o endpoint não depende de credencial automática do browser, como um webhook com assinatura.

Se um controller mistura páginas com sessão e endpoints externos, separe os controllers. Isso evita desabilitar a proteção na action errada.

**Na entrevista:**
> "API não significa sem CSRF. Bearer token explícito normalmente dispensa a proteção. API autenticada por cookie continua precisando dela, mesmo respondendo JSON."

---

## Turbo forms

**Como funciona:**
Turbo intercepta forms e envia requests sem recarregar a página inteira. Isso não elimina CSRF.

```erb
<%= form_with model: @comment do |form| %>
  <%= form.text_area :body %>
  <%= form.submit "Comentar" %>
<% end %>
```

O helper inclui o campo oculto. Turbo também usa o token das meta tags em requests que precisam dele. Mantenha no layout:

```erb
<%= csrf_meta_tags %>
```

Para ações destrutivas, prefira um form real:

```erb
<%= button_to "Excluir", post_path(@post), method: :delete %>
```

Se um Turbo form retorna `InvalidAuthenticityToken`, verifique:

1. `csrf_meta_tags` existe no layout?
2. o form veio de helper Rails?
3. o HTML está antigo em cache?
4. login, logout ou reset rotacionou a sessão?
5. um request customizado manda `X-CSRF-Token`?

Depois de resetar a sessão, carregue uma página com token atualizado. Não copie token para JavaScript estático nem use `skip_forgery_protection` como correção de frontend.

**Na entrevista:**
> "Turbo não pula CSRF. `form_with` gera o campo oculto e `csrf_meta_tags` fornece o token aos requests JavaScript."

---

## Importante na entrevista

A resposta clássica cabe em quatro passos:

1. a vítima já tem um cookie de sessão;
2. um site malicioso dispara um `POST` para a app;
3. o browser pode mandar o cookie automaticamente;
4. o Rails exige um token que o atacante não consegue ler.

Depois faça a distinção principal: cookie é automático e pede defesa CSRF; Bearer token enviado explicitamente no header normalmente não.

Erros clássicos:

- dizer que CORS ou `HttpOnly` resolve CSRF;
- aceitar mudança de estado por `GET`;
- desabilitar a proteção para toda a app;
- achar que `:null_session` bloqueia a action;
- remover proteção de webhook sem validar assinatura;
- confundir CSRF com XSS.

CORS controla leitura de respostas e alguns requests JavaScript. Um form cross-site não precisa de permissão CORS para ser enviado. XSS executa código na origem legítima e pode ler o token; CSRF token não corrige XSS.

---

## Recapitulando

- CSRF usa credenciais que o browser anexa automaticamente.
- O atacante não precisa ler cookie nem resposta.
- `GET` não altera estado.
- Helpers Rails geram `authenticity_token`.
- `csrf_meta_tags` atende Turbo e JavaScript.
- `:exception` bloqueia; `:null_session` deixa a action rodar sem a sessão normal.
- `skip_forgery_protection` exige outro modelo de autenticação.
- `SameSite`, `HttpOnly` e CORS não substituem o token.
- Bearer token normalmente dispensa CSRF; cookie continua exigindo.

---

## Exercícios práticos

### Exercício 1: Explique o ataque

**Enunciado:** Uma route `POST /transfers` usa `current_user` da sessão. Explique como um site externo tentaria criar uma transferência e por que o Rails bloqueia.

<details>
<summary>Solução</summary>

O site externo envia um form automaticamente. O browser pode anexar o cookie, mas o form não tem `authenticity_token` válido. Com `:exception`, o Rails levanta `ActionController::InvalidAuthenticityToken`.

**Pontos-chave:**
- Cookie prova sessão, não intenção
- A mesma origem não impede o envio do form
- O site externo não consegue ler o token
- A route não pode ser `GET`
</details>

### Exercício 2: Cookie ou Bearer

**Enunciado:** `/api/profile` usa cookie de sessão. `/webhooks/payments` usa assinatura HMAC. Onde manter CSRF e onde pular?

<details>
<summary>Solução</summary>

Mantenha CSRF em `/api/profile` e mande `X-CSRF-Token`, porque o browser anexa o cookie. No webhook, use `skip_forgery_protection only: :create` e valide obrigatoriamente a assinatura HMAC. `:null_session` é alternativa para ignorar a sessão, mas não autentica nem bloqueia sozinho.

**Pontos-chave:**
- JSON com cookie ainda tem risco
- Webhook usa assinatura, não CSRF token
- `:null_session` deixa a action rodar
- Separe controllers com autenticações diferentes
</details>

### Exercício 3: Corrija o Turbo

**Enunciado:** Um `fetch` do Stimulus recebe `422 InvalidAuthenticityToken`. O layout não tem `csrf_meta_tags`. Corrija sem desabilitar a proteção.

<details>
<summary>Solução</summary>

Adicione `<%= csrf_meta_tags %>` ao `<head>`. Leia `meta[name="csrf-token"]` e mande o valor no header `X-CSRF-Token`. Se puder, prefira `form_with` para Rails e Turbo cuidarem da integração.

**Pontos-chave:**
- Não use `skip_forgery_protection` para consertar o frontend
- Meta tag publica o token para JavaScript
- O header leva a prova no request customizado
- Após reset da sessão, obtenha token novo
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
