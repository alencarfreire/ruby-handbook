# 9.1 XSS

> **TL;DR**
> XSS acontece quando dado controlado pelo usuário vira código no browser. No stored XSS, o payload fica salvo e atinge visitas futuras. No reflected XSS, ele volta na própria response. ERB escapa `<%= %>` por default. `html_safe` e `raw` desligam essa defesa; não limpam nada. Nunca use `html_safe` em input de usuário. Se o produto precisa aceitar HTML, use `sanitize` com uma lista mínima de tags e atributos. CSP reduz o impacto, mas não corrige uma view vulnerável.

## Conteúdo

- [O que é XSS](#o-que-é-xss)
- [Stored XSS](#stored-xss)
- [Reflected XSS](#reflected-xss)
- [Escape automático do ERB](#escape-automático-do-erb)
- [html_safe e raw](#html_safe-e-raw)
- [sanitize](#sanitize)
- [Contexto e CSP](#contexto-e-csp)
- [Como responder na entrevista](#como-responder-na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que é XSS

**O que é:**
Cross-Site Scripting é a execução de código controlado por um atacante dentro da página da sua app.

O problema aparece na fronteira entre dado e código: uma string vira HTML ou JavaScript executável no browser.

```erb
<% malicious_name = '<img src=x onerror="alert(document.domain)">' %>

<%= malicious_name %>       <%# texto escapado %>
<%= raw(malicious_name) %>  <%# evento executa %>
```

O `alert` é só uma prova visível. Um ataque real pode ler a página, alterar formulários, capturar o que a vítima digita ou fazer requests com a sessão dela.

Cookie `HttpOnly` impede JavaScript de ler seu valor. Mesmo assim, XSS ainda pode agir no mesmo site com a sessão autenticada. É redução de impacto, não correção.

**Como funciona:**

1. O atacante controla um dado.
2. A app coloca esse dado em um contexto executável.
3. O browser interpreta o dado como código.

Não confie num valor só porque veio do banco ou de uma integração. Params, headers, cookies, registros persistidos e respostas de API podem conter dado não confiável.

**Na entrevista:**
> "XSS é dado não confiável virando código no browser. Eu mantenho o escape do ERB, evito `html_safe` e `raw`, e sanitizo só quando o requisito aceita HTML."

---

## Stored XSS

**O que é:**
O payload fica persistido no banco, arquivo, cache ou outro serviço. Toda pessoa que abre a tela vulnerável pode receber o ataque.

```ruby
# Salvar texto não executa o payload
profile.update!(bio: params[:bio])
```

O problema aparece na saída:

```erb
<%# RUIM %>
<div class="bio"><%= @profile.bio.html_safe %></div>

<%# BOM para uma bio de texto puro %>
<div class="bio"><%= @profile.bio %></div>
```

Se a página é usada por administradores, o atacante pode mirar uma conta com mais permissão. Não tente remover `<script>` com regex antes de salvar. Mantenha texto como dado e escape na saída.

**Na entrevista:**
> "Stored XSS persiste o payload e atinge visitantes futuros. Salvar o texto não é a falha; renderizar esse texto como HTML confiável é."

---

## Reflected XSS

**O que é:**
O payload chega no request e volta imediatamente na response. Não precisa ser salvo.

```ruby
# GET /search?q=<img src=x onerror=alert(1)>
def index
  @query = params[:q]
end
```

```erb
<%# Seguro %>
<h1>Resultados para <%= @query %></h1>

<%# RUIM %>
<h1>Resultados para <%= raw(@query) %></h1>
```

O atacante prepara um link e convence a vítima a abrir. A app reflete a query; o browser executa. Mensagens de erro, previews e páginas de debug também merecem atenção.

| Tipo | De onde vem | Quando executa |
|---|---|---|
| Stored | conteúdo persistido | em visitas futuras |
| Reflected | request atual | na response atual |

Nos dois, a raiz é a mesma: dado não confiável chegou a um contexto executável.

**Na entrevista:**
> "Stored fica persistido; reflected volta no mesmo request. Nos dois eu procuro onde dado vira markup ou script, não só onde params entrou."

---

## Escape automático do ERB

**O que é:**
Em templates HTML, `<%= valor %>` escapa por default. Caracteres com significado em HTML viram entidades.

```erb
<% value = '<script>alert("x")</script>' %>
<%= value %>
```

Saída simplificada:

```html
&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;
```

O usuário vê texto. O browser não cria a tag `script`. Você não precisa chamar `h` em cada valor; `h(value)` é o helper explícito de `html_escape`, mas `<%= value %>` já escapa.

Rails diferencia uma string comum de um `ActiveSupport::SafeBuffer`. Helpers como `tag` e `content_tag` montam markup seguro e escapam argumentos dinâmicos.

```ruby
def status_badge(order)
  tag.span(order.status, class: "badge")
end
```

Mesmo se `order.status` contiver uma tag, o conteúdo é escapado. Prefira helpers a concatenar strings. Veja a base de ERB e helpers em [5.4 Views e helpers](/05-rails-basics/04-views-helpers).

**Importante na entrevista:**
> "ERB escapa output por default. Para construir HTML, uso `tag.*` sem desligar o escape do conteúdo dinâmico."

---

## html_safe e raw

**O que é:**
`html_safe` marca uma string como HTML confiável. `raw(value)` faz o mesmo na renderização. Nenhum deles inspeciona ou limpa a string.

```erb
<%= user_input.html_safe %>
<%= raw(user_input) %>
```

As duas linhas desligam a defesa do escape.

```ruby
payload = '<img src=x onerror="alert(1)">'
payload.html_safe.html_safe? # true
```

O `true` significa “confie em mim”, não “o Rails verificou”.

```ruby
# RUIM: a interpolação também vira confiável
def greeting(user)
  "<strong>Olá, #{user.name}</strong>".html_safe
end

# BOM: a tag é controlada; o nome é escapado
def greeting(user)
  tag.strong("Olá, #{user.name}")
end
```

Nunca faça isto, mesmo em campo “só de admin”:

```erb
<%= params[:message].html_safe %>
<%= @comment.body.html_safe %>
<%= raw(external_api_response) %>
```

Conta pode ser comprometida, integração pode mudar e autorização pode ter bug.

**Na entrevista:**
> "Nunca uso `html_safe` em input de usuário. `html_safe` e `raw` não sanitizam; só mandam o Rails parar de escapar."

---

## sanitize

**O que é:**
`sanitize` permite renderizar um subconjunto de HTML. Ele remove tags e atributos não permitidos e filtra protocolos perigosos.

Use quando aceitar HTML é requisito real: descrição com parágrafo, lista e ênfase. Para nome, título, status ou comentário de texto puro, deixe o ERB escapar.

```erb
<%= sanitize(
  @article.body,
  tags: %w[p br strong em ul ol li a],
  attributes: %w[href title]
) %>
```

Uma lista pequena é mais fácil de revisar. Não libere `style`, handlers como `onclick` ou tags complexas sem necessidade.

| Requisito | Escolha |
|---|---|
| mostrar texto como texto | escape automático do ERB |
| aceitar HTML limitado | `sanitize` com lista mínima |
| construir markup da app | `tag.*` e helpers Rails |
| imprimir HTML arbitrário do usuário | não faça |

Sanitizar na saída mantém a política perto do contexto. Mesmo que você limpe antes de salvar, imports e caminhos antigos podem escrever dados diferentes. Não crie sanitizer com regex: HTML tem entidades, atributos e protocolos demais para listas caseiras.

**Na entrevista:**
> "Texto eu escapo. Rich text eu passo por `sanitize` com allowlist mínima. Não troco sanitizer por regex e não trato `html_safe` como sanitizer."

---

## Contexto e CSP

**O que é:**
Escape HTML protege conteúdo HTML. URL, atributo, JavaScript, CSS e JSON têm regras próprias.

```erb
<p><%= params[:message] %></p>
<%= link_to "Site", @profile.website_url %>
```

A primeira linha trata texto. Na segunda, escapar aspas não transforma uma URL perigosa em permitida. Se o usuário escolhe o destino, valide o esquema e aceite só o necessário, normalmente `http` e `https`.

Evite interpolar input dentro de JavaScript:

```erb
<%# RUIM: mistura dado e código %>
<script>
  window.message = "<%= params[:message] %>";
</script>

<%# MELHOR: helper monta um atributo de dados %>
<%= tag.div("Mensagem", data: {
  controller: "message",
  message_text_value: params[:message]
}) %>
```

Content Security Policy é um header que restringe de onde scripts e outros recursos podem vir. Rails 7.1+ oferece configuração:

```ruby
# config/initializers/content_security_policy.rb
Rails.application.configure do
  config.content_security_policy do |policy|
    policy.default_src :self, :https
    policy.script_src :self, :https
    policy.object_src :none
    policy.base_uri :self
  end
end
```

Adapte a política à app. Evite `unsafe-inline`; para scripts inline necessários, nonce costuma ser melhor. Você pode começar em modo de relatório antes de aplicar.

CSP é defesa em profundidade. Ela pode bloquear parte de um payload, mas não torna correto `<%= raw(params[:bio]) %>`. Primeiro corrija a saída; depois use CSP para reduzir impacto.

**Na entrevista:**
> "Escape é contextual. URL precisa de política de protocolo e dado não entra em script. CSP é uma segunda camada; não substitui escape e sanitização."

---

## Como responder na entrevista

**Na entrevista:**
Uma resposta curta e forte:

> "Rails escapa `<%= %>` por default. XSS aparece quando dado não confiável chega a um contexto executável, principalmente com `html_safe` ou `raw`. Stored fica persistido; reflected volta no request atual. Eu nunca uso `html_safe` em input de usuário. Para texto, mantenho o escape. Para rich text, uso `sanitize` com allowlist mínima. CSP entra como defesa em profundidade."

Se aparecer uma view no quadro:

1. Marque a origem: params, banco, cookie, header ou API.
2. Ache o sink: `raw`, `html_safe`, string de HTML, script ou URL.
3. Pergunte se o requisito é texto ou HTML.
4. Texto: remova o opt-out e deixe ERB escapar.
5. HTML limitado: use `sanitize` com política explícita.
6. Markup da app: use `tag.*` e helpers.
7. Cite CSP como camada extra.

Não responda só “valido no model”. Presença, tamanho e formato não garantem uma saída segura. XSS depende do contexto de renderização.

---

## Recapitulando

- XSS é dado não confiável executado como código no browser.
- Stored persiste; reflected volta no request preparado.
- `<%= valor %>` escapa HTML por default.
- `html_safe` e `raw` não limpam conteúdo: desligam o escape.
- Nunca use `html_safe` em input de usuário.
- Texto fica escapado. HTML permitido passa por `sanitize` com allowlist mínima.
- Prefira `tag.*` a concatenar markup.
- Escape depende do contexto. URL e JavaScript exigem tratamento próprio.
- CSP reduz impacto, mas não corrige uma view vulnerável.
- Revise ERB e helpers em [5.4 Views e helpers](/05-rails-basics/04-views-helpers).

---

## Exercícios práticos

### Exercício 1: Stored ou reflected?

**Enunciado:** Classifique cada caso e identifique o sink.

1. Um comentário é salvo e renderizado com `<%= raw(comment.body) %>`.
2. `/search?q=...` devolve `<%= params[:q].html_safe %>` na mesma response.
3. Uma bio salva é renderizada com `<%= profile.bio %>`.

<details>
<summary>Solução</summary>

1. Stored XSS. O payload fica no comentário; o sink é `raw`.
2. Reflected XSS. O payload volta imediatamente; o sink é `html_safe`.
3. Não há XSS nesse trecho. A origem é não confiável, mas ERB escapa.

```erb
<%= comment.body %>
<%= params[:q] %>
<%= profile.bio %>
```

Se comentário aceitar HTML por requisito, use `sanitize` com tags explícitas.

**Pontos-chave:**
- Dado do banco continua não confiável
- `raw` e `html_safe` são sinks
- Origem não confiável com saída escapada continua como texto
</details>

### Exercício 2: Corrija o helper

**Enunciado:** O helper mostra o nome em negrito. Explique a vulnerabilidade e reescreva sem `html_safe`.

```ruby
def welcome(user)
  "<strong>Bem-vindo, #{user.name}</strong>".html_safe
end
```

<details>
<summary>Solução</summary>

A interpolação entra antes de a string inteira ser marcada como segura. Um nome malicioso vira markup executável.

```ruby
def welcome(user)
  tag.strong("Bem-vindo, #{user.name}")
end
```

`tag.strong` controla a tag e escapa o conteúdo dinâmico.

**Pontos-chave:**
- Nunca marque string com input de usuário como segura
- Helper de tag separa markup de conteúdo
- SafeBuffer não significa conteúdo sanitizado
</details>

### Exercício 3: Rich text e CSP

**Enunciado:** Um artigo aceita apenas parágrafo, negrito, ênfase e lista. Corrija a view. Ativar CSP permite manter `raw`?

```erb
<article><%= raw(@article.body) %></article>
```

<details>
<summary>Solução</summary>

```erb
<article>
  <%= sanitize(
    @article.body,
    tags: %w[p strong em ul ol li],
    attributes: []
  ) %>
</article>
```

CSP não permite manter `raw`. Ela pode bloquear alguns scripts, mas a view continuaria aceitando HTML arbitrário.

**Pontos-chave:**
- Rich text usa `sanitize`, não `raw`
- Allowlist reflete o requisito
- CSP complementa; não substitui a correção
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
