# 12.4 Jobs agendados

> **TL;DR**
> Job atrasado é um enqueue com relógio: `set(wait:)` (daqui a X) ou `set(wait_until:)` (neste instante). Recorrente é outro bicho — alguém precisa acordar todo dia e enfileirar de novo. Em Rails 7.1+ isso é sidekiq-cron, Solid Queue recurring ou whenever escrevendo crontab. Clock process é um processo só para o relógio. Cron do SO dispara um comando. **Não coloque o relógio no web dyno:** escala HTTP, duplica o job.

## Conteúdo

- [Atrasado não é recorrente](#atrasado-não-é-recorrente)
- [set(wait:)](#setwait)
- [set(wait_until:)](#setwait_until)
- [wait: não é argumento de perform_later](#wait-não-é-argumento-de-perform_later)
- [sidekiq-cron](#sidekiq-cron)
- [Solid Queue recurring](#solid-queue-recurring)
- [whenever](#whenever)
- [Clock process vs cron no SO](#clock-process-vs-cron-no-so)
- [Não coloque cron no web dyno](#não-coloque-cron-no-web-dyno)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Atrasado não é recorrente

**O que é:**
Dois relógios diferentes. Entrevistador mistura. Você separa.

| Tipo | Pergunta | API |
|---|---|---|
| Atrasado (delayed) | “roda daqui a 1 hora, uma vez” | `set(wait:)` / `set(wait_until:)` |
| Recorrente (cron) | “todo dia às 3h” | scheduler: sidekiq-cron, Solid Queue, whenever |

Delayed entra na queue com `scheduled_at`. O worker não pega agora. Recorrente precisa de um processo ou do crontab do SO enfileirando de novo, todo ciclo.

**Quando usar:**
- Boas-vindas 10 minutos depois do cadastro → delayed.
- Lembrete da trial no 7º dia → delayed com `wait_until:`.
- Limpar anexos órfãos toda madrugada → recorrente.
- Relatório mensal → recorrente.

Não use recorrente “a cada 1 minuto” para simular delay. Isso é polling. Enfileira com `wait:`.

**Na entrevista:**
> "Delayed é Active Job com wait. Recorrente é um scheduler por cima. Sem o processo do relógio, o job atrasado ainda roda; o cron não."

---

## set(wait:)

**O que é:**
Atraso relativo. “Daqui a 5 minutos.” O relógio começa agora.

**Como funciona:**
```ruby
WelcomeEmailJob.set(wait: 10.minutes).perform_later(user.id)
ExpireHoldJob.set(wait: 1.hour).perform_later(order.id)
```

O adapter guarda o job com timestamp. Sidekiq: sorted set no Redis. Solid Queue: coluna `scheduled_at`. Quando o relógio passa, o dispatcher move para a queue de execução.

`wait:` aceita duration do Active Support: `5.seconds`, `2.days`. Não passa string `"10 minutes"`.

**Quando usar:**
Cooldown, e-mail que não sai no mesmo request, hold de estoque.

**Na entrevista:**
> "set(wait: 10.minutes).perform_later. O wait é no set, não no perform_later. O job fica scheduled até o horário."

---

## set(wait_until:)

**O que é:**
Instante absoluto. “Amanhã ao meio-dia, no fuso da app.”

**Como funciona:**
```ruby
# config/application.rb
config.time_zone = "America/Sao_Paulo"

TrialEndingJob
  .set(wait_until: Time.zone.parse("2026-08-26 10:00"))
  .perform_later(account.id)
```

**Importante na entrevista:**
`Time.now` é o relógio da máquina. `Time.zone.now` é o `config.time_zone`. “3h no Brasil” com `Time.parse` em servidor UTC sai na hora errada.

```ruby
# RUIM — fuso da máquina
CleanupJob.set(wait_until: Time.parse("2026-08-26 03:00")).perform_later

# BOM — fuso da app
CleanupJob.set(wait_until: Time.zone.parse("2026-08-26 03:00")).perform_later
```

Instante no passado vira “agora”. Teste com relógio congelado, não com `sleep`.

**Quando usar:**
Campanha numa data, vencimento de trial, janela comercial.

**Na entrevista:**
> "wait é duração. wait_until é relógio. Eu uso Time.zone, não Time.now. Produção em UTC com time_zone America/Sao_Paulo é o caso clássico que quebra horário."

---

## wait: não é argumento de perform_later

**O que é:**
Armadilha de API. `perform_later` recebe os args do `perform`. Opção de agendamento vive no `set`.

**Como funciona:**
```ruby
# RUIM — wait vira argumento do job
WelcomeEmailJob.perform_later(user.id, wait: 10.minutes)
# perform(user_id, wait: ...) — ArgumentError ou wait ignorado

# BOM
WelcomeEmailJob.set(wait: 10.minutes).perform_later(user.id)

# Sidekiq puro, sem Active Job
WelcomeEmailJob.perform_in(10.minutes, user.id)
WelcomeEmailJob.perform_at(Time.zone.parse("2026-08-26 10:00"), user.id)
```

Se a app usa Active Job, fique no `set`. `perform_in` / `perform_at` são API do worker Sidekiq. Misturar os dois no mesmo arquivo é cheiro de entrevista.

**Na entrevista:**
> "perform_later(wait: 5.minutes) não atrasa. Isso entra como keyword do perform. O delay é Job.set(wait: 5.minutes).perform_later(args)."

---

## sidekiq-cron

**O que é:**
Gem que lê crontab e enfileira job Sidekiq no horário. O relógio mora no processo do Sidekiq, coordenado via Redis.

**Como funciona:**
```yaml
# config/schedule.yml
cleanup_uploads:
  cron: "0 3 * * *"
  class: "CleanupUploadsJob"
  queue: low
```

```ruby
# config/initializers/sidekiq.rb
Sidekiq::Cron::Job.load_from_hash!(
  YAML.load_file(Rails.root.join("config/schedule.yml"))
)
```

O cron do sidekiq-cron **não executa** o trabalho. Ele dá `perform_later` (ou `perform_async`) na hora certa. Quem roda é o worker. Se o job for pesado, a queue `low` existe por isso.

Vários processos Sidekiq: a gem usa Redis para não enfileirar duas vezes no mesmo tick. Ainda assim o **job** precisa ser idempotente — o tick seguinte pode disparar enquanto o anterior não acabou.

**Quando usar:**
App já no Sidekiq, Heroku/Render sem crontab, dezenas de crons no YAML.

**Na entrevista:**
> "sidekiq-cron enfileira. Não processa. Precisa de processo Sidekiq no ar. Recorrente overlap: eu deixo o job idempotente ou unique, não confio no cron sozinho."

---

## Solid Queue recurring

**O que é:**
Scheduler nativo do adapter Solid Queue (Rails 8 no default; gem usa em Rails 7.1+). Recorrência em YAML, persistida no banco, sem Redis obrigatório.

**Como funciona:**
```yaml
# config/recurring.yml
production:
  cleanup_uploads:
    class: CleanupUploadsJob
    queue: background
    schedule: at 3am every day
```

O supervisor (`bin/jobs` / `solid_queue:start`) lê o YAML, grava na tabela de recurring e enfileira quando o cron casa. Sem esse processo, o YAML é enfeite.

Delayed (`set(wait:)`) e recurring convivem: um é linha scheduled na tabela; o outro é definição que gera enqueue periódico.

**Quando usar:**
App no Solid Queue, time que quer cron no repo sem gem extra, deploy onde Redis é só cache e você não quer scheduler nele.

Não misture sidekiq-cron e Solid Queue recurring no mesmo job. Um adapter, um relógio.

**Na entrevista:**
> "Solid Queue tem recurring.yml. Quem dispara é o processo bin/jobs, não o Puma. Rails 7.1 usa a gem; Rails 8 já vem com o adapter."

---

## whenever

**O que é:**
Gem que **escreve crontab** a partir de Ruby. Quem acorda é o cron do sistema operacional, não um processo Ruby permanente.

**Como funciona:**
```ruby
# config/schedule.rb
set :output, "log/cron.log"

every 1.day, at: "3:00 am" do
  runner "CleanupUploadsJob.perform_later"
end
```

```bash
whenever --update-crontab
```

O SO roda `bundle exec rails runner '...'`. Isso só enfileira. Worker continua obrigatório. Sem worker, o cron “rodou” e o e-mail não saiu.

**Quando usar:**
VPS/uma máquina, crontab que o time já opera, job raro (1x/dia) em que um processo clock 24h é desperdício.

Não use no Heroku: não tem crontab seu. Lá é clock dyno, sidekiq-cron ou o Scheduler da plataforma (one-off, sem garantia de minuto exato).

**Na entrevista:**
> "whenever não é scheduler Ruby. É gerador de crontab. Funciona em VPS. Em dyno efêmero não tem crontab — aí é clock process ou sidekiq-cron."

---

## Clock process vs cron no SO

**O que é:**
Dois jeitos de ter o relógio fora do request HTTP.

**Clock process:**
Processo longo (`clockwork`, `rufus-scheduler`, o próprio Sidekiq com sidekiq-cron, `bin/jobs` do Solid Queue). Fica no ar, ticta, enfileira. No Procfile:

```procfile
web: bundle exec puma -C config/puma.rb
worker: bundle exec sidekiq
clock: bundle exec clockwork config/clock.rb
```

Com sidekiq-cron você **não** precisa de linha `clock` extra se o worker Sidekiq já carrega a gem. Solid Queue: o `bin/jobs` é o clock + o worker.

**Cron no SO:**
`crontab` chama um comando e morre. whenever, ou uma linha crua:

```cron
0 3 * * * cd /var/app && bin/rails runner 'CleanupUploadsJob.perform_later'
```

| | Clock process | Cron no SO |
|---|---|---|
| Onde vive | dyno/container 24h | crontab da máquina |
| Heroku / Render | sim | não (sem crontab seu) |
| VPS um box | pode, mas custa um processo | simples |
| N máquinas | 1 clock ou lock | crontab em **uma** só, senão duplica |
| Deploy | escala como worker | precisa atualizar crontab (`whenever --update`) |

O clock **enfileira**. O worker **executa**. Juntar os dois no mesmo processo até vai; juntar com o Puma não.

**Na entrevista:**
> "Clock é processo da app. Cron é o SO. PaaS sem crontab: clock ou scheduler no Sidekiq/Solid Queue. VPS: crontab numa máquina só."

---

## Não coloque cron no web dyno

**O que é:**
O erro clássico de deploy. Relógio no mesmo processo que serve HTTP.

```ruby
# RUIM — initializer no Puma
# config/initializers/clock.rb
if Rails.env.production?
  Thread.new { Rufus::Scheduler.singleton.cron("0 3 * * *") { CleanupUploadsJob.perform_later } }
end
```

Três web dynos = o cleanup roda três vezes. Deploy rolling: dyno velho e novo tictam juntos. Web que dorme: o cron some.

```procfile
# RUIM
web: bundle exec clockwork config/clock.rb & bundle exec puma
```

O `&` no web dyno: o clock morre com o Puma, o PaaS só healthchecka a porta HTTP, e você ainda duplica quando escala `web=3`.

**Como funciona o certo:**
1. Web só HTTP.
2. Worker só job.
3. Relógio: um clock dyno, **ou** sidekiq-cron no worker (com lock no Redis), **ou** `bin/jobs` do Solid Queue, **ou** crontab numa máquina.

Job recorrente ainda precisa ser idempotente. Lock do scheduler evita double enqueue no tick. Não evita o job lento atravessar o próximo tick.

```ruby
class CleanupUploadsJob < ApplicationJob
  def perform
    Upload.orphan.find_each(&:purge) # rodar duas vezes não cria dado
  end
end
```

**Na entrevista:**
> "Cron no web dyno duplica quando eu escalo o Puma. Relógio é processo separado, ou scheduler no worker com lock. Web não é relógio."

---

## Recapitulando

- Delayed: `Job.set(wait: 10.minutes).perform_later(id)` — uma vez, daqui a X.
- Absoluto: `set(wait_until: Time.zone.parse(...))`. Fuso da app, não `Time.now`.
- `perform_later(wait:)` não atrasa. `wait:` é do `set`.
- Recorrente precisa de quem acorde: sidekiq-cron, Solid Queue recurring, ou whenever/crontab.
- Scheduler enfileira. Worker executa.
- Clock process na app; cron no SO. PaaS sem crontab → clock ou scheduler do adapter.
- **Não coloque cron no web dyno.** Escala HTTP, duplica job.
- Recorrente overlap: job idempotente.

---

## Exercícios práticos

### Exercício 1: Por que o e-mail saiu na hora?

**Enunciado:** O time escreveu `WelcomeEmailJob.perform_later(user.id, wait: 10.minutes)` e o e-mail foi embora no mesmo segundo. Explique. Escreva a chamada certa para atrasar 10 minutos e a certa para disparar amanhã às 10h em `America/Sao_Paulo`.

<details>
<summary>Solução</summary>

`wait:` foi para o `perform`, não para o adapter. Active Job não tem keyword `wait` em `perform_later`.

```ruby
WelcomeEmailJob.set(wait: 10.minutes).perform_later(user.id)

WelcomeEmailJob
  .set(wait_until: Time.zone.tomorrow.change(hour: 10, min: 0))
  .perform_later(user.id)
```

**Pontos-chave:**
- Delay vive no `set`
- `wait` vs `wait_until`
- `Time.zone`, não `Time.now`
</details>

### Exercício 2: Três dynos, um digest

**Enunciado:** `DailyDigestJob` deve rodar todo dia útil às 8h. A app no Heroku tem `web=3` e `worker=2` (Sidekiq). Alguém sugeriu um `Rufus::Scheduler` no initializer do Rails. O que você responde, e como configura?

<details>
<summary>Solução</summary>

Initializer no Puma: 3 web dynos = 3 disparos. Relógio não mora no web.

Com Sidekiq: `config/schedule.yml` + sidekiq-cron. O worker enfileira uma vez (lock no Redis). Os dois workers só competem para **executar**, o que é certo.

Sem Sidekiq, no Solid Queue: `config/recurring.yml` e processo `bin/jobs`, não o Puma.

Job idempotente: se o digest marcar `digest_sent_on: Date.current`, a segunda execução no mesmo dia não reenvia.

**Pontos-chave:**
- Web dyno não é clock
- Scheduler enfileira uma vez; worker processa
- Idempotência além do lock
</details>

### Exercício 3: Clock ou crontab?

**Enunciado:** Duas apps. (A) Heroku, Puma + Sidekiq. (B) Um VPS Ubuntu, um box, deploy com Capistrano. Onde você usa clock process, sidekiq-cron e whenever? Por que crontab nas duas web machines da (B) seria bug?

<details>
<summary>Solução</summary>

**(A)** Sem crontab. sidekiq-cron no processo Sidekiq, ou um clock dyno se o scheduler não for o Sidekiq. Web só Puma.

**(B)** whenever gerando crontab **numa** máquina — ou no box que já tem o worker. Clock process 24h também serve, mas cobra um processo a mais para um cron diário.

Crontab nas duas web machines: cada uma roda `rails runner` às 3h. Dois `perform_later`. Dois jobs. O mesmo bug do web dyno, agora com SO.

**Pontos-chave:**
- PaaS → clock/scheduler da app
- VPS → crontab em um lugar só
- Duplicar o relógio duplica o job
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
