# 9.8 OWASP Top 10

> **TL;DR**
> O OWASP Top 10 é um mapa de riscos, não um selo de segurança. Na lista de 2021, Rails ajuda com queries parametrizadas, escape de HTML, proteção CSRF, cookies assinados ou criptografados, digest de senha e filtro de logs. Mas o framework não conhece sua autorização, seu desenho de negócio, sua rede nem sua operação. Na entrevista, cite o risco, mostre a defesa do Rails e deixe claro o limite dela.

## Conteúdo

- [Como ler a lista](#como-ler-a-lista)
- [A01: Broken Access Control](#a01-broken-access-control)
- [A02: Cryptographic Failures](#a02-cryptographic-failures)
- [A03: Injection](#a03-injection)
- [A04: Insecure Design](#a04-insecure-design)
- [A05: Security Misconfiguration](#a05-security-misconfiguration)
- [A06: Vulnerable and Outdated Components](#a06-vulnerable-and-outdated-components)
- [A07: Identification and Authentication Failures](#a07-identification-and-authentication-failures)
- [A08: Software and Data Integrity Failures](#a08-software-and-data-integrity-failures)
- [A09: Security Logging and Monitoring Failures](#a09-security-logging-and-monitoring-failures)
- [A10: Server-Side Request Forgery](#a10-server-side-request-forgery)
- [Resposta de entrevista](#resposta-de-entrevista)
- [Mapa para 9.1–9.7](#mapa-para-91–97)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Como ler a lista

**O que é:**
O OWASP Top 10 reúne categorias frequentes de risco em apps web. A edição usada aqui é a de 2021.

Ele orienta revisão e priorização. Não substitui threat modeling, testes, análise de código nem resposta a incidentes. Um mesmo fluxo pode tocar várias categorias.

**Como funciona:**
Para cada item, pergunte:

1. Qual ativo está em risco?
2. Quem pode acessar ou mudar esse ativo?
3. Qual entrada cruza uma fronteira de confiança?
4. Que default do Rails ajuda?
5. O que a equipe ainda precisa implementar?

**Importante na entrevista:**
Não diga que “Rails resolve o OWASP”. Rails reduz alguns erros comuns. Regra de negócio, configuração e operação continuam com a equipe.

---

## A01: Broken Access Control

**O que é:**
É controle de acesso quebrado. O usuário lê ou executa algo sem autorização. O caso clássico é IDOR: trocar o ID na URL e acessar o registro de outra pessoa.

**Exemplo prático:**
```ruby
# RUIM — autenticar não prova que o pedido é do usuário
@order = Order.find(params[:id])

# BOM — a query já nasce limitada ao dono
@order = current_user.orders.find(params[:id])
authorize @order
```

**Como Rails ajuda:**
Associações facilitam o scope; `before_action` centraliza verificações simples; Pundit organiza Policy. Rails não sabe se um gerente pode estornar uma compra. Essa regra é da app e precisa de teste do caso negado. Detalhe em [9.2 CSRF](/09-security/02-csrf) e [9.5 Autorização (Pundit)](/09-security/05-authorization).

**Na entrevista:**
> "No A01 eu procuro acesso horizontal e vertical. Escopo a query pelo usuário, aplico Policy e testo o acesso negado."

---

## A02: Cryptographic Failures

**O que é:**
É exposição de dados por criptografia ausente, fraca ou mal operada. Inclui dados em trânsito, em repouso, senhas, chaves e backups.

**Como Rails ajuda:**
`force_ssl` força HTTPS; `has_secure_password` usa BCrypt; Active Record Encryption protege atributos; Credentials guarda segredos; cookies podem ser assinados e criptografados.

```ruby
class Customer < ApplicationRecord
  encrypts :document_number
end
```

A chave não deve ficar junto do dado em produção. Você ainda precisa de rotação, backup seguro e classificação dos dados. Senha usa algoritmo próprio; não use SHA256 puro. Detalhe em [9.4](/09-security/04-authentication), [9.6](/09-security/06-encryption) e [9.7](/09-security/07-https-ssl).

**Na entrevista:**
> "Rails ajuda com digest, HTTPS e criptografia de atributos. Gestão e rotação das chaves continuam fora do model."

---

## A03: Injection

**O que é:**
Injection acontece quando entrada não confiável vira parte de um comando: SQL, shell, template ou outro interpretador.

**Exemplo prático:**
```ruby
# RUIM
User.where("email = '#{params[:email]}'")

# BOM
User.where(email: params[:email])
system("convert", safe_input_path, output_path)
```

**Como Rails ajuda:**
Active Record parametriza Hash e bind. ERB escapa HTML por padrão. Strong params limita atributos, mas não é defesa contra SQL injection. Coluna de `order` pede allowlist. Detalhe em [9.1 XSS](/09-security/01-xss) e [9.3 SQL Injection](/09-security/03-sql-injection).

**Na entrevista:**
> "Eu separo dado de comando: bind no SQL, argumentos no shell e allowlist para coluna ou direção de ordenação."

---

## A04: Insecure Design

**O que é:**
É risco criado no desenho do fluxo. O código pode fazer o que foi pedido e o produto ainda ser abusável.

Exemplos: cupom reutilizável sem limite, estorno sem segunda aprovação, reset com pergunta previsível e endpoint caro sem rate limit.

**Como Rails ajuda:**
Rails oferece validações, transações, autenticação e jobs, mas não cria o desenho seguro. Você precisa de threat modeling, casos de abuso e invariantes.

```ruby
Order.transaction do
  coupon.lock!
  raise CouponAlreadyUsed if coupon.used?

  coupon.update!(used_at: Time.current)
  order.apply!(coupon)
end
```

Esse fluxo ainda pede constraint no banco e regra clara de reuso. Rate limit, idempotência e aprovação em duas etapas também nascem no desenho.

**Na entrevista:**
> "A04 não se corrige com uma gem. Eu modelo ameaças e abuso, defino invariantes e implemento controles em camadas."

---

## A05: Security Misconfiguration

**O que é:**
É configuração insegura do Rails, servidor, cloud ou banco. Exemplos: erro detalhado em produção, secret exposto, CORS aberto demais, storage público e ausência de HTTPS.

**Como Rails ajuda:**
Produção traz defaults mais restritivos. Rails oferece `force_ssl`, Host Authorization, filtro de parâmetros e headers de segurança.

```ruby
# config/environments/production.rb
config.force_ssl = true
config.consider_all_requests_local = false

# config/initializers/filter_parameter_logging.rb
Rails.application.config.filter_parameters += %i[password token]
```

Copiar config sem entender pode anular esses defaults. Configuração passa por review e CI. Detalhe em [9.1](/09-security/01-xss), [9.2](/09-security/02-csrf) e [9.7](/09-security/07-https-ssl).

**Na entrevista:**
> "Eu reviso segredos, HTTPS, cookies, hosts, CORS e páginas de erro. Config também é código."

---

## A06: Vulnerable and Outdated Components

**O que é:**
É usar Rails, gem, pacote JavaScript, imagem ou serviço com vulnerabilidade conhecida. `Gemfile.lock` reproduz versões; não garante que sejam seguras.

**Como Rails ajuda:**
Bundler permite atualização controlada. O ecossistema oferece auditoria de dependências e análise estática.

```bash
bundle audit check --update
bin/brakeman
```

`bundler-audit` compara gems com advisories. Brakeman procura padrões inseguros em Rails. Eles não provam ausência de falhas.

A equipe inventaria dependências, acompanha avisos, automatiza alertas, remove gems sem uso e aplica patches. Ruby, sistema e imagem de container também entram.

**Na entrevista:**
> "No A06 eu cito `bundle audit`, Brakeman e política de atualização. O objetivo é reduzir o tempo entre aviso e patch."

---

## A07: Identification and Authentication Failures

**O que é:**
São falhas de identidade, login e sessão: senha fraca, credential stuffing, session fixation, reset inseguro e ausência de MFA quando o risco pede.

**Como Rails ajuda:**
`has_secure_password` usa BCrypt; cookies assinados detectam alteração; tokens podem expirar; `reset_session` reduz session fixation.

```ruby
user = User.authenticate_by(email: params[:email], password: params[:password])
return render :new, status: :unprocessable_entity unless user

reset_session
session[:user_id] = user.id
```

Rails não define MFA, rate limit, bloqueio nem recuperação de conta. Também não impede respostas que revelem se um e-mail existe. Detalhe em [9.4](/09-security/04-authentication) e [9.7](/09-security/07-https-ssl).

**Na entrevista:**
> "Eu protejo credencial e sessão com digest, HTTPS, rotação da sessão, reset curto, rate limit e MFA conforme o risco."

---

## A08: Software and Data Integrity Failures

**O que é:**
É confiar em software, artefato ou dado sem verificar origem e integridade. Inclui supply chain, CI/CD e desserialização insegura.

**Como Rails ajuda:**
Rails oferece cookies e mensagens assinadas. Assinatura detecta alteração; não esconde o conteúdo.

```ruby
verifier = Rails.application.message_verifier(:download)
token = verifier.generate({ file_id: 42 }, expires_in: 10.minutes)
payload = verifier.verify(token)
```

Use criptografia se também precisar de sigilo. Não carregue conteúdo arbitrário com `Marshal.load` ou `YAML.unsafe_load`. Proteja workflow, lockfile, secrets e artefatos do CI. Detalhe em [9.6 Encryption](/09-security/06-encryption).

**Na entrevista:**
> "Eu separo integridade de sigilo. Rails assina tokens e cookies; a supply chain exige CI protegido e artefato rastreável."

---

## A09: Security Logging and Monitoring Failures

**O que é:**
É não registrar, detectar ou responder a eventos de segurança. Um log sem correlação, alerta e responsável não basta.

**Como Rails ajuda:**
Rails tem logger, `request_id`, tagged logging e filtro de parâmetros.

```ruby
Rails.logger.warn(
  event: "authorization_denied",
  user_id: current_user&.id,
  request_id: request.request_id
)
```

Registre falha repetida de login, reset, mudança de MFA, negação de autorização e ação administrativa. Não registre senha, token, cookie ou cartão completo. Defina retenção, alertas e resposta a incidente.

**Na entrevista:**
> "Eu produzo evento estruturado, com usuário e request ID, sem segredo. Depois ligo métrica, alerta e responsável."

---

## A10: Server-Side Request Forgery

**O que é:**
SSRF acontece quando o servidor acessa um destino controlado pelo usuário. O atacante tenta alcançar rede interna, metadata da cloud ou serviço privado.

```ruby
# RUIM — URL arbitrária
Net::HTTP.get(URI(params[:avatar_url]))
```

**Como Rails ajuda:**
Rails não bloqueia SSRF em `Net::HTTP`. Prefira IDs de provedores. Se uma URL for necessária, use allowlist de esquema, host e porta; resolva DNS; bloqueie IP privado, loopback e link-local; revalide redirects; limite tempo e tamanho; restrinja egress.

```ruby
ALLOWED_HOSTS = %w[images.example.com cdn.example.com].freeze
uri = URI.parse(params[:avatar_url])
raise ArgumentError, "URL não permitida" unless uri.scheme == "https" && ALLOWED_HOSTS.include?(uri.host)
```

Isso é só a primeira camada. DNS rebinding exige validar o IP efetivo, não só o texto do host.

**Na entrevista:**
> "No A10 eu evito URL livre, valido host e IP após DNS, revalido redirect e restrinjo saída de rede."

---

## Resposta de entrevista

**Na entrevista:**
Se pedirem “cite três riscos e como Rails ajuda”, você pode responder:

> "Três exemplos são Broken Access Control, Injection e Authentication Failures. Em acesso, eu escopo a query pelo `current_user` e uso Pundit, mas a regra é da app. Em injection, Active Record parametriza queries e ERB escapa HTML, desde que eu não interpole SQL nem use `html_safe` com input. Em autenticação, `has_secure_password`, cookies assinados e sessão ajudam; eu ainda preciso de HTTPS, rate limit, reset seguro e MFA conforme o risco."

A resposta mostra categoria, recurso do Rails e limite do framework. Se houver tempo, dê um ataque concreto e diga como testa o caso negado.

---

## Mapa para 9.1–9.7

| OWASP 2021 | Foco em Rails | Aprofunde em |
|---|---|---|
| A01 Broken Access Control | Policy, scope, CSRF | [9.2](/09-security/02-csrf), [9.5](/09-security/05-authorization) |
| A02 Cryptographic Failures | senha, atributos, TLS, chaves | [9.4](/09-security/04-authentication), [9.6](/09-security/06-encryption), [9.7](/09-security/07-https-ssl) |
| A03 Injection | XSS, SQL, shell | [9.1](/09-security/01-xss), [9.3](/09-security/03-sql-injection) |
| A04 Insecure Design | abuso e invariantes | [9.4](/09-security/04-authentication), [9.5](/09-security/05-authorization) |
| A05 Misconfiguration | headers, CSRF, HTTPS | [9.1](/09-security/01-xss), [9.2](/09-security/02-csrf), [9.7](/09-security/07-https-ssl) |
| A06 Vulnerable Components | gems e runtime | controles de 9.1–9.7 dependem de versões corrigidas |
| A07 Authentication Failures | login, sessão, reset | [9.4](/09-security/04-authentication), [9.7](/09-security/07-https-ssl) |
| A08 Integrity Failures | tokens e supply chain | [9.6](/09-security/06-encryption) |
| A09 Logging Failures | eventos e alertas | controles de 9.1–9.7 precisam ser observáveis |
| A10 SSRF | cliente HTTP e rede | complemente 9.1–9.7 com controles de saída |

---

## Recapitulando

- O Top 10 organiza riscos; não certifica uma app.
- A01 pede autorização por objeto e ação.
- A02 pede algoritmo adequado, HTTPS e gestão de chaves.
- A03 separa dados de comandos.
- A04 começa no desenho e nos casos de abuso.
- A05 trata config de app e infraestrutura.
- A06 pede inventário, auditoria e atualização.
- A07 protege credencial, sessão e recuperação.
- A08 verifica origem e integridade.
- A09 combina log, alerta e resposta.
- A10 limita destino e saída de rede.
- Na entrevista, diga como Rails ajuda e onde ele não ajuda.

---

## Exercícios práticos

### Exercício 1: Identifique o risco

**Enunciado:** Qual é a categoria principal? Corrija o endpoint.

```ruby
class InvoicesController < ApplicationController
  before_action :authenticate_user!

  def show
    @invoice = Invoice.find(params[:id])
  end
end
```

<details>
<summary>Solução</summary>

É A01 Broken Access Control. Autenticar não prova que a fatura pertence ao usuário.

```ruby
def show
  @invoice = current_user.invoices.find(params[:id])
end
```

Com Pundit, use também `policy_scope` e `authorize`. Crie request specs provando que outro usuário recebe `404` ou `403`.

**Pontos-chave:**
- autenticação não substitui autorização;
- scope reduz IDOR;
- teste o acesso negado.
</details>

### Exercício 2: Explique três categorias

**Enunciado:** Em até um minuto, explique Injection, Cryptographic Failures e SSRF. Diga uma ajuda e um limite do Rails para cada uma.

<details>
<summary>Solução</summary>

> "Em Injection, Active Record usa parâmetros e ERB escapa HTML, mas interpolar SQL ou shell ainda abre a falha. Em Cryptographic Failures, Rails oferece digest, criptografia de atributos e HTTPS, mas a equipe gerencia as chaves. Em SSRF, Rails não protege `Net::HTTP`; eu uso allowlist, valido IP após DNS e restrinjo egress."

**Pontos-chave:**
- associe categoria a ataque concreto;
- não venda proteção absoluta;
- SSRF também exige controle de rede.
</details>

### Exercício 3: Revise um webhook

**Enunciado:** Uma app recebe uma URL de webhook, faz POST nela, registra URL, headers e resposta completa, e usa uma gem sem atualização há três anos. Liste três categorias e uma ação para cada uma.

<details>
<summary>Solução</summary>

- **A10 SSRF:** usar destino cadastrado ou allowlist, bloquear IP interno e restringir egress.
- **A09 Logging Failures:** filtrar tokens e dados pessoais; criar evento e alerta úteis.
- **A06 Vulnerable Components:** auditar, atualizar ou substituir a gem.
- **A05 Misconfiguration:** revisar timeout, redirects e regras de rede.
- **A08 Integrity Failures:** assinar payload e proteger o artefato de deploy.

**Pontos-chave:**
- um fluxo toca várias categorias;
- priorize rede interna e vazamento de segredo;
- combine código, configuração e operação.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
