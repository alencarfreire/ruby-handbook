# 11.6 Monitoring

> **TL;DR**
> Você não conserta o que não vê. Em container, log vai para stdout — de preferência uma linha JSON por evento. `/up` diz se o processo Rails subiu, não se o Postgres responde. Sentry pega exceção. APM (Skylight, New Relic ou OpenTelemetry) diz onde o request gasta tempo. Métrica, log e trace respondem perguntas diferentes. Sem os três, você adivinha.

## Conteúdo

- [Você não conserta o que não vê](#você-não-conserta-o-que-não-vê)
- [Logs: stdout](#logs-stdout)
- [Logs: JSON](#logs-json)
- [Healthcheck /up](#healthcheck-up)
- [Error tracker: Sentry](#error-tracker-sentry)
- [APM](#apm)
- [Métricas vs logs vs traces](#métricas-vs-logs-vs-traces)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Você não conserta o que não vê

**O que é:**
Monitoring é o conjunto que responde três perguntas depois do deploy: a app está viva, está lenta, e o que quebrou. Sem isso, o usuário avisa no Slack.

**Como funciona:**
Em Docker o processo some, o disco do container some, o `log/production.log` some junto. Quem coleta é a plataforma: `docker logs`, agente, sidecar. Por isso o contrato da app é simples: escreve evento, expõe saúde, manda erro e amostra de performance para fora.

Os sinais não se substituem:

| Sinal | Pergunta | Exemplo |
|---|---|---|
| Healthcheck | O processo atende? | `GET /up` → 200 |
| Log | O que aconteceu neste request? | `checkout_failed` + `request_id` |
| Error tracker | Qual exceção, em qual release? | `ActiveRecord::Deadlocked` no Sentry |
| Métrica | Está piorando agora? | p95 de `/checkout` subiu |
| Trace | Por onde o request passou? | controller → job → gateway |

**Quando usar:**
A partir do primeiro ambiente que não é o seu laptop. Staging sem Sentry e sem log JSON é o ensaio do apagão de sexta.

**Na entrevista:**
> "Eu não conserto o que não vejo. Healthcheck para o orquestrador, log estruturado para o que aconteceu, Sentry para exceção, APM ou métrica para lentidão. Sem isso eu estou no escuro."

---

## Logs: stdout

**O que é:**
O processo escreve em stdout e stderr. O runtime do container captura. Você não abre arquivo dentro da imagem para “ver o log”.

**Como funciona:**
O `production.rb` gerado pelo Rails 7.1 já tem o gancho:

```ruby
# config/environments/production.rb
if ENV["RAILS_LOG_TO_STDOUT"].present?
  logger           = ActiveSupport::Logger.new($stdout)
  logger.formatter = config.log_formatter
  config.logger    = ActiveSupport::TaggedLogging.new(logger)
end
```

No Compose ou no deploy, você liga o ENV:

```yaml
environment:
  RAILS_LOG_TO_STDOUT: "1"
  RAILS_LOG_LEVEL: info
```

`config.log_tags = [:request_id]` carimba cada linha. Sem isso, quatro instâncias misturam request e você não reconstitui nada.

**Quando usar:**
Sempre em container. Arquivo em `log/` só faz sentido no laptop. Volume para log de app é cheiro: a imagem fica stateful e o `docker logs` volta vazio.

Não logue senha, token, cookie, CPF, cartão. O filtro do Rails cobre params conhecidos:

```ruby
# config/initializers/filter_parameter_logging.rb
Rails.application.config.filter_parameters += %i[
  password token secret cpf credit_card
]
```

**Na entrevista:**
> "Em Docker o log é stdout. RAILS_LOG_TO_STDOUT no production.rb. Arquivo dentro do container some com o container. request_id em toda linha."

---

## Logs: JSON

**O que é:**
Uma linha, um evento, campos estáveis. O agregador (CloudWatch, Loki, Datadog, ELK) parseia. Multiline do Rails default — `Started GET`, `Processing`, `Completed` — vira três eventos soltos e a busca quebra.

**Como funciona:**
`lograge` é o atalho da comunidade Rails: um JSON por request.

```ruby
# Gemfile
gem "lograge"

# config/environments/production.rb
config.lograge.enabled = true
config.lograge.formatter = Lograge::Formatters::Json.new
config.lograge.custom_options = lambda do |event|
  {
    request_id: event.payload[:request_id],
    user_id: event.payload[:user_id],
    host: event.payload[:host]
  }
end
```

Evento de negócio continua no logger, também em JSON:

```ruby
Rails.logger.info({
  event: "checkout_failed",
  order_id: order.id,
  reason: "gateway_timeout",
  request_id: request.request_id
}.to_json)
```

Sem gem, um formatter curto já muda o jogo. O ponto não é a biblioteca. É campo nomeado, não prosa.

**Quando usar:**
Produção e staging. Development pode ficar human-readable — você lê no terminal. Em entrevista, “JSON em prod, texto no laptop” é a resposta adulta.

**Importante na entrevista:**
Log sem `request_id` não correlaciona. Log com PII vira incidente. Log em nível `debug` em produção é custo e ruído, não observabilidade.

**Na entrevista:**
> "O logger default do Rails é multiline. Em produção eu colapso para JSON, um evento por linha, com request_id. Sem isso o agregador não junta o request."

---

## Healthcheck /up

**O que é:**
Rails 7.1 entrega `GET /up` de fábrica. É o `Rails::HealthController`: 200 se a app bootou, 500 se o boot falhou. Não consulta Postgres, Redis nem Sidekiq.

```ruby
# config/routes.rb — gerado pelo Rails 7.1+
get "up" => "rails/health#show", as: :rails_health_check
```

**Como funciona:**
Docker e o orquestrador batem nesse path. Se o processo travou no boot, `/up` não responde 200 e o container sai da rotação.

```yaml
# compose
healthcheck:
  test: ["CMD-SHELL", "curl -fsS http://localhost:3000/up || exit 1"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 40s
```

Dois conceitos que a entrevista cobra:

| Probe | Pergunta | Endpoint típico |
|---|---|---|
| Liveness | O processo está vivo? | `/up` |
| Readiness | Posso mandar tráfego? | `/ready` com check de DB |

```ruby
class ReadyController < ApplicationController
  def show
    ActiveRecord::Base.connection.verify!
    head :ok
  rescue StandardError
    head :service_unavailable
  end
end
```

Não coloque query pesada no liveness. Se o banco oscila e o probe mata o pod, você transforma lentidão em restart em cascata.

**Quando usar:**
Todo serviço no Compose, no Kubernetes e atrás de load balancer. `/up` na liveness. Dependência crítica na readiness, barata e com timeout curto.

**Na entrevista:**
> "/up do Rails 7.1 só diz que o processo subiu. Eu uso isso como liveness. Readiness é outro endpoint, com check leve de DB. Se eu mato o pod porque o Postgres piscou, pioro o incidente."

---

## Error tracker: Sentry

**O que é:**
Serviço que captura exceção não tratada, stack, release e contexto do usuário. Log registra o que você escreveu. Sentry registra o que explodiu — mesmo o `rescue` que você esqueceu de logar.

**Como funciona:**
`sentry-ruby` + `sentry-rails`. DSN vem de ENV, nunca do repositório.

```ruby
# config/initializers/sentry.rb
Sentry.init do |config|
  config.dsn = ENV["SENTRY_DSN"]
  config.breadcrumbs_logger = %i[active_support_logger http_logger]
  config.enabled_environments = %w[production staging]
  config.release = ENV["GIT_SHA"]
  config.send_default_pii = false
  config.traces_sample_rate = 0.1
end
```

No controller ou no job, contexto mínimo:

```ruby
Sentry.set_user(id: current_user.id)
Sentry.set_tags(request_id: request.request_id)
```

Release (`GIT_SHA` da imagem) liga o erro ao deploy. Sem isso você vê o stack e não sabe se já saiu o hotfix.

**Quando usar:**
Staging e produção. Development não. Não substitui log: Sentry é exceção e regressão. Evento de negócio esperado — pagamento recusado, validação — fica no log, não como issue.

Não mande e-mail, CPF, body de cartão. `send_default_pii = false` é o default certo.

**Na entrevista:**
> "Sentry para exceção, com release e sem PII. Log para evento de negócio. Os dois carregam request_id. Se só tem um dos dois, metade do incidente fica cego."

---

## APM

**O que é:**
Application Performance Monitoring. Mede tempo por endpoint, SQL, view, job. Responde “por que o checkout ficou lento?”, não “deu 500?”.

**Como funciona:**
Três nomes caem em entrevista Rails. Você não precisa ter usado os três. Precisa saber o que cada um cobre.

| Ferramenta | Papel |
|---|---|
| Skylight | APM focado em Rails. Endpoint, SQL, N+1. Pouca config. |
| New Relic | APM + infra + log. Mais peso, comum em empresa grande. |
| OpenTelemetry | Padrão de instrumentação. Você exporta para Jaeger, Tempo, Datadog, o que o time já tem. |

Skylight e New Relic são produto. OpenTelemetry é o protocolo. Em 2026, dizer “eu instrumento com OTel e exporto” mostra que você não casa a app com um vendor.

Amostra. 100% dos traces em produção é conta e ruído. `traces_sample_rate = 0.1` ou head sampling na borda. Erro pode amostrar mais alto.

**Quando usar:**
Quando a pergunta é latência, N+1, pool de DB, job lento. Sentry sozinho não substitui APM: stack de exceção não explica p95. Métrica de CPU sozinha também não: o request pode estar esperando SQL.

**Na entrevista:**
> "APM mostra onde o tempo vai: SQL, view, HTTP de saída, job. Skylight é o caminho curto no Rails. New Relic aparece em empresa com stack único. OpenTelemetry é o padrão se eu não quero vendor lock-in. Eu menciono, não instalo os três."

---

## Métricas vs logs vs traces

**O que é:**
Os três pilares. Cada um tem custo e pergunta certa. Quem mistura os três no mesmo parágrafo não operou incidente de verdade.

**Como funciona:**

**Log** é evento. Rico, caro de guardar, ruim para alerta de tendência. Serve para “o que aconteceu com o `order_id=42`”.

**Métrica** é número no tempo: taxa, p95, erro, saturação. Barata, boa para dashboard e alerta. Os quatro sinais clássicos (SRE): latency, traffic, errors, saturation. Em Rails isso é tempo de request, RPS, 5xx, pool de DB / fila do Sidekiq.

**Trace** é a viagem de um request. Span no controller, span no SQL, span no HTTP do gateway, span no worker. Sem trace, microserviço e job viram buraco. O `X-Request-Id` do Rails é o mínimo; OTel propaga o contexto entre processos.

```
métrica  →  "p95 de POST /checkout foi de 200ms para 2s"
log      →  "checkout_failed order_id=42 reason=gateway_timeout"
trace    →  "o span Payments::Charge durou 1.8s neste request_id"
Sentry   →  "Net::OpenTimeout na release abc123, 40 eventos"
/up      →  "o processo ainda responde; o problema não é boot"
```

Alerta em sintoma, não em causa solta. 5xx sobe ou `/up` falha: pagina. CPU 70% sozinha: investiga depois. Log `info` não dispara pager.

**Quando usar:**
Os três juntos, com o mesmo `request_id` / trace id. Time pequeno: `/up` + log JSON + Sentry já evita o “só o usuário viu”. Time com SLO: métrica e APM entram no mesmo sprint, não “depois”.

**Na entrevista:**
> "Log conta história. Métrica conta tendência. Trace conta o caminho. Sentry é a exceção. /up é o pulso. Se o entrevistador pede só uma coisa, eu começo por stdout JSON e Sentry — sem isso o resto não se investiga."

---

## Recapitulando

- Você não conserta o que não vê.
- Em container, log é stdout. Arquivo em `log/` some com o container.
- Produção fala JSON, uma linha por evento, com `request_id`. Sem PII.
- `/up` (Rails 7.1+) é liveness: o processo bootou. Não é saúde do banco.
- Readiness é outro endpoint, check leve, timeout curto.
- Sentry captura exceção + release. Evento de negócio fica no log.
- APM (Skylight / New Relic / OpenTelemetry) explica lentidão e N+1.
- Métrica, log e trace não são sinônimo. Alerta no sintoma.

---

## Exercícios práticos

### Exercício 1: `docker logs` vazio

**Enunciado:** A app Rails roda no Compose. `docker logs web` não mostra request. Dentro do container, `log/production.log` cresce. O que está errado e como você corrige?

<details>
<summary>Solução</summary>

O logger de produção está gravando arquivo. O runtime só captura stdout/stderr.

```ruby
# config/environments/production.rb
if ENV["RAILS_LOG_TO_STDOUT"].present?
  logger           = ActiveSupport::Logger.new($stdout)
  logger.formatter = config.log_formatter
  config.logger    = ActiveSupport::TaggedLogging.new(logger)
end
```

```yaml
environment:
  RAILS_LOG_TO_STDOUT: "1"
```

**Pontos-chave:**
- Container é efêmero: arquivo some no restart
- `docker logs` lê stdout
- `request_id` no tag, não prosa solta
</details>

### Exercício 2: `/up` verde, checkout 500

**Enunciado:** O healthcheck do Compose está verde. Usuários recebem 500 no checkout. O Postgres principal caiu. Por que `/up` não pegou? O que você muda no probe?

<details>
<summary>Solução</summary>

`GET /up` só verifica se o Rails bootou. Banco fora não muda o status.

- Liveness continua em `/up`. Não mate o pod porque o DB piscou.
- Readiness em `/ready` com `ActiveRecord::Base.connection.verify!` e timeout curto. O load balancer para de mandar tráfego.
- Sentry e log do 500 ainda entram: o probe não substitui error tracker.

**Pontos-chave:**
- `/up` ≠ “todas as dependências ok”
- liveness ≠ readiness
- check pesado no liveness causa restart em cascata
</details>

### Exercício 3: Qual sinal?

**Enunciado:** Três incidentes no mesmo dia. Para cada um, diga o sinal principal e o que você abre primeiro.

1. p95 de `POST /checkout` foi de 180ms para 1,9s. Quase nenhum 500.
2. Slack enche de `NoMethodError` depois do deploy `abc123`.
3. Um pedido específico falhou. Você tem `order_id` e precisa ver controller, job e HTTP do gateway.

<details>
<summary>Solução</summary>

1. **Métrica / APM.** Tendência de latência, não exceção. Skylight, New Relic ou trace amostrado: SQL, N+1, HTTP de saída.
2. **Sentry.** Exceção + release. Confirma o SHA, rollback ou hotfix. Log JSON confirma volume; Sentry dá o stack.
3. **Trace**, com log no mesmo `request_id`. Métrica não conta um pedido. Sentry só ajuda se houve exceção.

**Pontos-chave:**
- lento ≠ quebrado
- exceção ≠ um request específico
- os três pilares não se substituem
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
