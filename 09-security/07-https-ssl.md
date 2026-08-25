# 9.7 HTTPS / SSL

> **TL;DR**
> HTTP puro trafega em texto legível. HTTPS é HTTP dentro de uma conexão protegida por TLS. O certificado liga uma chave pública a um domínio e deve formar uma cadeia confiável. Em Rails 7.1+, `config.force_ssl = true` redireciona para HTTPS, ativa HSTS e marca cookies como `Secure`. Se o load balancer termina TLS, encaminhe corretamente o protocolo original e use `config.assume_ssl = true` quando o Rails receber HTTP interno sem reconhecer que o cliente usou HTTPS. TLS protege o transporte; não substitui autenticação, autorização ou validação.

## Conteúdo

- [HTTP é texto puro](#http-é-texto-puro)
- [TLS e HTTPS](#tls-e-https)
- [Certificados](#certificados)
- [`force_ssl` no Rails](#force_ssl-no-rails)
- [`assume_ssl` no Rails 7.1](#assume_ssl-no-rails-71)
- [HSTS](#hsts)
- [Cookies seguros](#cookies-seguros)
- [TLS no load balancer](#tls-no-load-balancer)
- [Importante na entrevista](#importante-na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## HTTP é texto puro

**O que é:**
HTTP sem TLS não oferece confidencialidade nem integridade ao tráfego.

Quem consegue observar a rede pode ler headers, cookies e corpo do request.
Também pode alterar dados durante o caminho.

```http
POST /sessions HTTP/1.1
Host: app.exemplo.com
Content-Type: application/x-www-form-urlencoded

email=ana%40exemplo.com&password=segredo
```

Isso não está criptografado.
Codificação de formulário, JSON e Base64 não são criptografia.

**Como funciona:**
HTTPS preserva a semântica do HTTP, mas transporta a conversa por TLS.
O navegador ainda envia um request HTTP; ele só não cruza a rede em texto puro.

TLS protege dados **em trânsito** entre dois pontos da conexão.
Não protege uma senha depois que ela chegou ao servidor.
Não corrige XSS, SQL injection ou autorização quebrada.

**Na entrevista:**
> "HTTP é plaintext. HTTPS é HTTP sobre TLS: cifra o tráfego, detecta alteração e autentica o servidor pelo certificado."

---

## TLS e HTTPS

**O que é:**
TLS é o protocolo criptográfico usado pelo HTTPS.
SSL é o nome histórico; SSL antigo está obsoleto.
No dia a dia, “certificado SSL” normalmente quer dizer certificado para TLS.

TLS entrega três propriedades principais:

- **Confidencialidade:** terceiros não leem o conteúdo facilmente.
- **Integridade:** alteração no tráfego é detectada.
- **Autenticidade:** o cliente verifica a identidade apresentada pelo servidor.

**Como funciona:**
No handshake, cliente e servidor negociam versão e algoritmos.
O servidor apresenta o certificado e prova que possui a chave privada correspondente.
As partes derivam chaves de sessão.

Depois do handshake, criptografia simétrica protege os dados.
Ela é adequada para o volume da conexão.
Criptografia assimétrica participa da autenticação e da negociação, não cifra cada byte da resposta.

Em termos de entrevista, pense nesta sequência:

1. O cliente abre a conexão.
2. O servidor apresenta certificado e cadeia.
3. O cliente valida domínio, validade e confiança.
4. As partes estabelecem chaves de sessão.
5. Requests e responses passam pelo canal cifrado.

---

## Certificados

**O que é:**
O certificado associa uma identidade, como `app.exemplo.com`, a uma chave pública.
Uma autoridade certificadora, a CA, assina essa associação.

O servidor guarda a chave privada.
Ela não deve entrar no repositório, na imagem pública ou em logs.

**Como funciona:**
O navegador confia em CAs raiz conhecidas.
O servidor normalmente entrega seu certificado e os certificados intermediários.
O cliente monta a cadeia até uma raiz confiável.

Ele verifica pelo menos:

- se o hostname está nos nomes permitidos pelo certificado;
- se o período de validade inclui a data atual;
- se as assinaturas da cadeia são válidas;
- se a cadeia chega a uma raiz confiável.

**Exemplo prático:**
Em produção, automatize emissão e renovação no provedor, no ingress ou com ACME.
Monitore expiração mesmo com renovação automática.

Se o certificado expirar ou faltar um intermediário, clientes podem rejeitar a conexão mesmo com o Rails saudável.

**Na entrevista:**
> "O certificado contém a chave pública e os nomes válidos. A chave privada fica protegida no servidor. O cliente valida hostname, validade e cadeia de confiança."

---

## `force_ssl` no Rails

**O que é:**
`config.force_ssl` habilita o middleware `ActionDispatch::SSL`.
Ele centraliza três comportamentos importantes:

- redireciona requests HTTP para HTTPS;
- adiciona o header HSTS nas responses HTTPS;
- marca cookies com o atributo `Secure`.

**Exemplo prático:**

```ruby
# config/environments/production.rb
Rails.application.configure do
  config.force_ssl = true
end
```

Com isso, uma visita a `http://app.exemplo.com/pedidos` deve ir para a URL HTTPS.
O redirecionamento melhora a transição, mas não torna seguro o primeiro request que já saiu em HTTP.
HSTS trata essa janela nas visitas seguintes.

Você pode configurar opções do middleware:

```ruby
# config/environments/production.rb
Rails.application.configure do
  config.force_ssl = true

  config.ssl_options = {
    hsts: {
      expires: 1.year,
      subdomains: true,
      preload: false
    }
  }
end
```

Não desative `secure_cookies` só para contornar uma configuração incorreta de proxy.
Corrija o reconhecimento do protocolo original.

**Quando usar:**
Em produção, quando a app deve ser acessada exclusivamente por HTTPS.
Antes de ligar, confirme certificado, proxy, health checks e subdomínios.

**Na entrevista:**
> "`force_ssl` não instala certificado. Ele age dentro do Rails: redireciona HTTP, envia HSTS e torna cookies seguros. A terminação TLS pode acontecer antes da app."

---

## `assume_ssl` no Rails 7.1

**O que é:**
Rails 7.1 adicionou `config.assume_ssl`.
Essa opção faz a app assumir que o request externo chegou por SSL, mesmo que o hop até o Rails seja HTTP.

Ela atende o cenário comum em que um load balancer termina TLS e encaminha tráfego interno sem TLS.

```text
Navegador --HTTPS--> Load balancer --HTTP interno--> Rails
```

Sem os sinais corretos, o Rails pode enxergar `http`.
Isso causa URL gerada com protocolo errado, redirect em loop ou cookie sem o comportamento esperado.

**Exemplo prático:**

```ruby
# config/environments/production.rb
Rails.application.configure do
  config.assume_ssl = true
  config.force_ssl = true
end
```

As opções resolvem problemas diferentes:

- `assume_ssl`: informa ao Rails como interpretar o request recebido.
- `force_ssl`: aplica a política de exigir HTTPS e habilita as proteções do middleware.

`assume_ssl` não cria criptografia no trecho interno.
O load balancer ainda deve aceitar HTTPS e redirecionar HTTP na borda.

**Quando usar:**
Use quando a arquitetura termina TLS antes da app e o Rails não recebe informação confiável suficiente para reconhecer HTTPS.

Não habilite às cegas em uma app exposta diretamente à internet por HTTP.
Ela passaria a tratar uma conexão realmente insegura como segura.

**Na entrevista:**
> "No Rails 7.1, `assume_ssl` é para TLS terminado no proxy. Ele faz o Rails considerar HTTPS externo. Já `force_ssl` impõe a política, envia HSTS e protege cookies."

---

## HSTS

**O que é:**
HTTP Strict Transport Security é um header enviado por HTTPS:

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Ele manda o navegador usar somente HTTPS para aquele host durante o `max-age`.
O navegador troca uma tentativa futura de HTTP por HTTPS antes de enviar o request inseguro.

**Como funciona:**
O header recebido por HTTP é ignorado.
Por isso, a primeira visita ainda depende do redirect, salvo quando o domínio está em uma lista de preload do navegador.

`includeSubDomains` amplia a política para subdomínios.
`preload` declara intenção de entrar na lista mantida pelos navegadores, mas colocar o atributo no header não cadastra o domínio sozinho.

**Quando usar:**
Use quando HTTPS funciona de forma estável.
Comece com `max-age` menor durante a implantação e aumente depois.

Tenha cuidado com `includeSubDomains` e preload.
Um subdomínio legado sem HTTPS pode ficar inacessível.
Preload é um compromisso difícil de reverter rapidamente.

**Na entrevista:**
> "Redirect reage a um request HTTP. HSTS faz o navegador nem enviar esse request nas próximas visitas. Ele só é aceito quando veio por HTTPS."

---

## Cookies seguros

**O que é:**
Um cookie com `Secure` só deve ser enviado pelo navegador em conexões HTTPS.
Isso reduz o risco de a sessão vazar por um request HTTP acidental.

```http
Set-Cookie: _app_session=...; Path=/; Secure; HttpOnly; SameSite=Lax
```

Cada atributo tem um papel:

- `Secure`: restringe o envio a HTTPS.
- `HttpOnly`: impede acesso normal via JavaScript.
- `SameSite`: ajuda a controlar envio cross-site e reduzir CSRF.

Um não substitui o outro.
E cookie assinado ou criptografado ainda precisa de transporte seguro.

**Como funciona:**
Com `force_ssl`, o middleware marca cookies como seguros por padrão.
Se a app não percebe que o request externo foi HTTPS, configure corretamente proxy e `assume_ssl`.

**Na entrevista:**
> "`Secure` protege o transporte do cookie. `HttpOnly` trata acesso por script. `SameSite` trata contexto cross-site. Eu normalmente quero os três na sessão."

---

## TLS no load balancer

**O que é:**
Terminar TLS no load balancer significa que ele recebe e decifra HTTPS.
Depois, encaminha o request para o Rails por outra conexão.

Isso centraliza certificados e tira da app o trabalho do handshake.
Também facilita rotação de certificado e distribuição entre várias instâncias.

**Como funciona:**
O proxy deve preservar host, IP e protocolo originais em headers padronizados, como `X-Forwarded-Proto: https`.
O Rails e a infraestrutura precisam confiar somente nos proxies conhecidos.

Não aceite headers `X-Forwarded-*` arbitrários de clientes diretos.
Um atacante poderia forjar que o request veio por HTTPS ou alterar informações usadas pela app.

HTTP interno não vira seguro só porque está atrás de um load balancer.
Avalie isolamento de rede, risco, compliance e modelo de ameaça.
Ambientes zero trust ou redes compartilhadas podem exigir TLS também entre proxy e app.

**Exemplo prático:**
Uma configuração coerente tem estas responsabilidades:

1. O load balancer possui um certificado válido para o domínio.
2. A porta 80 redireciona para 443 na borda.
3. O protocolo original é encaminhado de forma confiável.
4. O Rails usa `assume_ssl` se ainda recebe o request como HTTP.
5. `force_ssl` mantém HSTS e cookies seguros na camada da app.
6. O acesso direto às instâncias fica bloqueado ou restrito.

Teste o caminho real, não apenas `localhost`.
Confira URL de redirect, header HSTS e `Set-Cookie` na response pública.

---

## Importante na entrevista

Uma resposta forte separa camadas.

> "HTTP puro é texto legível e pode ser lido ou alterado no caminho. TLS cria um canal com confidencialidade, integridade e autenticação do servidor. O certificado liga domínio e chave pública por uma cadeia de confiança. Em Rails, `force_ssl` redireciona, ativa HSTS e marca cookies como `Secure`. Se o load balancer termina TLS, o Rails precisa reconhecer o HTTPS original; no Rails 7.1 posso usar `assume_ssl`. Ainda protejo ou isolo o trecho interno e não confio em forwarded headers vindos de qualquer cliente."

---

## Recapitulando

- HTTP puro é plaintext; JSON e Base64 não escondem o conteúdo.
- HTTPS usa TLS para confidencialidade, integridade e autenticação do servidor.
- O cliente valida hostname, validade e cadeia do certificado.
- `force_ssl` redireciona, envia HSTS e marca cookies como `Secure`.
- `assume_ssl`, no Rails 7.1, representa HTTPS terminado antes da app.
- HSTS evita requests HTTP futuros, mas exige implantação cuidadosa.
- `Secure`, `HttpOnly` e `SameSite` resolvem riscos diferentes.
- TLS no load balancer não protege automaticamente o trecho interno.
- Forwarded headers só são confiáveis quando vêm de proxies confiáveis.

---

## Exercícios práticos

### Exercício 1: Explique HTTP e HTTPS

**Enunciado:** Em até quatro frases, explique por que login por HTTP é inseguro e o que TLS acrescenta.

<details>
<summary>Solução</summary>

HTTP puro envia headers e corpo em texto legível pela rede.
Assim, credenciais e cookies podem ser observados ou alterados no caminho.
TLS cifra a conexão, detecta adulteração e autentica o servidor pelo certificado.
Ele protege o transporte, mas não substitui segurança da app nem proteção de dados em repouso.

**Pontos-chave:**
- Dizer explicitamente que HTTP é plaintext
- Citar confidencialidade, integridade e autenticidade
- Limitar a garantia a dados em trânsito
</details>

### Exercício 2: Corrija o loop de redirect

**Enunciado:** O navegador acessa HTTPS, o load balancer envia HTTP ao Rails e `force_ssl` entra em loop. Mostre a configuração Rails 7.1+ e explique o motivo.

<details>
<summary>Solução</summary>

```ruby
# config/environments/production.rb
Rails.application.configure do
  config.assume_ssl = true
  config.force_ssl = true
end
```

O TLS termina no load balancer, então o hop interno pode chegar como HTTP.
`assume_ssl` faz o Rails interpretar o request como HTTPS externo.
`force_ssl` continua aplicando redirect, HSTS e cookies seguros.
O load balancer também deve encaminhar metadados confiáveis e impedir acesso direto indevido à app.

**Pontos-chave:**
- Separar interpretação (`assume_ssl`) de política (`force_ssl`)
- Não afirmar que `assume_ssl` cifra o trecho interno
- Restringir confiança aos proxies da infraestrutura
</details>

### Exercício 3: Revise HSTS e cookies

**Enunciado:** A equipe quer ativar `includeSubDomains`, preload e um `max-age` longo no primeiro deploy. Além disso, pretende remover `Secure` porque o Rails recebe HTTP do proxy. O que você mudaria?

<details>
<summary>Solução</summary>

Primeiro, valide HTTPS em todos os hosts e subdomínios afetados.
Comece HSTS com um `max-age` menor e aumente quando a operação estiver estável.
Só use `includeSubDomains` e preload depois de verificar que nenhum subdomínio depende de HTTP.

Não remova `Secure` para acomodar a terminação TLS.
Configure o proxy e, quando necessário no Rails 7.1+, `config.assume_ssl = true`.
O navegador se conecta à borda por HTTPS, portanto o cookie de sessão deve continuar restrito a HTTPS.

**Pontos-chave:**
- HSTS pode tornar hosts inacessíveis se HTTPS falhar
- Preload não é revertido rapidamente
- `Secure` observa a conexão do navegador, não o hop interno isoladamente
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
