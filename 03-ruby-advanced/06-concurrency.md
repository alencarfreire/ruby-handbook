# 3.6 Threads, Fiber, Ractor

> **TL;DR**
> MRI tem GVL: um thread executa bytecode Ruby por vez. Thread serve para IO (DB, HTTP, Redis). CPU paralelo de verdade: processo (Puma worker) ou Ractor. Fiber é cooperativo — você cede, ninguém te preempta. `Fiber.schedule` precisa de scheduler. Mutex protege estado compartilhado. Request Rails = uma thread do pool do Puma. Ractor isola, mas ainda é limitado: gem e Rails não estão prontos.

## Conteúdo

- [GIL e GVL](#gil-e-gvl)
- [Thread](#thread)
- [Thread e IO](#thread-e-io)
- [Mutex](#mutex)
- [Fiber](#fiber)
- [Fiber scheduler](#fiber-scheduler)
- [Ractor](#ractor)
- [Puma e o request Rails](#puma-e-o-request-rails)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## GIL e GVL

**O que é:**
No MRI (CRuby), a VM tem um lock global. Nome antigo: GIL (Global Interpreter Lock). Nome certo hoje: GVL (Global VM Lock). Só um thread roda bytecode Ruby por vez nesse processo.

**Como funciona:**
Você cria dez threads. O sistema operacional agenda. A VM, no Ruby, não: um de cada vez. IO bloqueante e muita extensão C soltam o GVL. Aí outro thread entra.

Concorrência não é paralelismo. Várias tarefas em voo é concorrência. Duas cores executando Ruby ao mesmo tempo no mesmo processo MRI: não. GIL o entrevistador aceita — você corrige sem pedantismo: o nome certo é GVL.

**Na entrevista:**
> "No MRI o GVL impede paralelismo de CPU entre threads. IO libera o lock. Por isso thread no Rails ajuda em espera de banco, não em `JSON.parse` gigante."

---

## Thread

**O que é:**
Thread nativo. Preemptivo. O Ruby agenda com o SO. Memória compartilhada no mesmo processo.

**Como funciona:**
```ruby
t = Thread.new do
  sleep 0.1
  "pronto"
end

t.join
t.value  # "pronto"
```

`join` espera. `value` espera e devolve o retorno — ou relança a exceção do thread. Sem `value` e sem `abort_on_exception`, a exceção some. Se a main acaba, o processo leva os outros.

**Quando usar:**
Várias chamadas HTTP, vários IOs independentes, fan-out curto. Não para esmagar CPU no MRI.

**Exemplo prático:**
```ruby
urls = ["https://a.exemplo.com", "https://b.exemplo.com"]

respostas = urls.map do |url|
  Thread.new { Net::HTTP.get(URI(url)) }
end.map(&:value)
```

Vários requests em paralelo de IO. O GVL quase não atrapalha: cada um está bloqueado na rede.

**Na entrevista:**
> "Thread compartilha memória. Eu crio, faço join, pego `value`. Sem `value`, a exceção do thread some e eu fico caçando bug."

---

## Thread e IO

**O que é:**
O caso que justifica thread no MRI. Esperar banco, Redis, S3, HTTP. Enquanto um espera, outro thread roda.

**Como funciona:**
CPU puro:

```ruby
# RUIM no MRI — GVL segura
threads = 4.times.map do
  Thread.new { (1..10_000_000).reduce(:+) }
end
threads.each(&:join)
```

Quatro threads, quase o mesmo tempo de um. O lock não solta.

IO:

```ruby
threads = 4.times.map do
  Thread.new { sleep 1 }  # wait — solta GVL
end
threads.each(&:join)
# ~1s, não ~4s
```

**Quando usar:**
Fan-out de IO. Timeout em cada chamada. Não dispare thread sem teto.

**Na entrevista:**
> "Thread no MRI é arma de IO. CPU-bound eu escalo com processo: Puma worker, job, ou outro processo. Não com mais thread."

---

## Mutex

**O que é:**
Trava. Um thread entra, os outros esperam. Estado compartilhado sem Mutex é corrida.

**Como funciona:**
```ruby
mutex = Mutex.new
counter = 0

threads = 10.times.map do
  Thread.new do
    1000.times do
      mutex.synchronize { counter += 1 }
    end
  end
end
threads.each(&:join)
counter  # 10000
```

`counter += 1` não é atômico: lê, soma, grava. Dois threads no meio = perde incremento.

`Queue` já é thread-safe. Produtor/consumidor: use `Queue`, não array + Mutex na mão.

```ruby
fila = Queue.new
produtor = Thread.new { 3.times { |i| fila << i } }
consumidor = Thread.new { 3.times { fila.pop } }
[produtor, consumidor].each(&:join)
```

**Quando usar:**
Contador, cache em memória, hash global, qualquer escrita que dois threads veem. No Rails você quase não inventa Mutex: o framework e o Puma já travam o que é deles. Código de request não deveria compartilhar mutável entre requests.

**Exemplo prático:**
```ruby
# RUIM — variável de classe vira estado entre requests
class RateLimit
  @@hits = Hash.new(0)

  def self.hit!(key)
    @@hits[key] += 1  # corrida + vazou entre usuários
  end
end
```

Isso no Puma threaded é bug. Redis, não classe.

**Na entrevista:**
> "Mutex quando dois threads escrevem o mesmo objeto. Eu prefiro não compartilhar. Hash de classe, array global, singleton mutável: cheiro. Queue se for fila. Redis se for entre processos."

---

## Fiber

**O que é:**
Coroutine cooperativa. Leve. Você manda `resume`, ela roda até `Fiber.yield` ou acabar. Ninguém tira ela do CPU no meio — diferente de Thread.

**Como funciona:**
```ruby
f = Fiber.new do
  Fiber.yield 1
  Fiber.yield 2
  3
end

f.resume  # 1
f.resume  # 2
f.resume  # 3
f.resume  # FiberError — dead
```

Um thread, vários fibers. A stack é menor. Enumerator lazy e alguns parsers usam fiber por baixo.

Não é paralelismo. É controle de fluxo: pausa aqui, volta depois.

**Quando usar:**
Iterator preguiçoso, protocolo passo a passo, IO assíncrono com scheduler. Não para acelerar request Rails.

**Na entrevista:**
> "Fiber é cooperativo. Thread o SO preempta. Fiber só troca quando dá yield ou resume. Barato. Sem scheduler, não substitui thread de IO."

---

## Fiber scheduler

**O que é:**
Ruby 3 abriu um gancho: `Fiber.set_scheduler`. Gems como `async` implementam. Com scheduler, `Fiber.schedule` cria trabalho e `sleep` / IO não travam o thread inteiro — cedem para outro fiber.

**Como funciona:**
Sem scheduler:

```ruby
Fiber.schedule { puts "oi" }
# RuntimeError: No scheduler is available!
```

Com scheduler (a gem como `async` instala um; você não escreve o event loop), vários `Fiber.schedule` intercalam IO no mesmo thread. No Rails clássico (Puma + request síncrono) isso quase não aparece.

**Quando usar:**
App com muito IO no mesmo processo, Falcon/async, jobs que fan-out HTTP. Não é default do Rails 7.1.

**Na entrevista:**
> "Fiber.schedule existe no Ruby 3. Sem scheduler, levanta erro. Eu não falo que o Rails é async por padrão. Puma thread ainda é o modelo da maioria."

---

## Ractor

**O que é:**
Ruby 3. Actor isolado. Heap próprio. Não compartilha objeto mutável. Comunicação por mensagem: `send` / `take` (ou `receive`).

**Como funciona:**
```ruby
r = Ractor.new { 1 + 1 }
r.take  # 2

r1 = Ractor.new { Ractor.receive * 2 }
r1.send(21)
r1.take  # 42
```

Objeto atravessa se for shareable: frozen profundo, ou `Ractor.make_shareable`.

```ruby
payload = { cents: 1990, currency: "BRL" }.freeze
Ractor.make_shareable(payload)

# mutável comum mandado de fora → Ractor::IsolationError
```

Paralelismo de CPU no MRI: este é o caminho na linguagem. Processo também é.

**Quando usar:**
CPU pesado isolado, experimento, entrevista. Não no request Rails.

**Importante na entrevista:**
Ractor ainda é limitado. Muita gem quebra. Extensão C precisa ser marked. Active Record, autoload, muita metaprogramação assumem um mundo compartilhado. Rails não atende request em Ractor. API mudou ao longo do 3.x. Ferramenta da VM, não stack de produção web.

**Na entrevista:**
> "Ractor isola memória e foge do GVL para CPU. Eu conheço. Não colocaria no Puma. Gem e Rails ainda não são Ractor-safe. Para CPU de verdade no app, processo ou job."

---

## Puma e o request Rails

**O que é:**
Um request Rails, no Puma threaded, ocupa **uma thread** do pool até o `render`. Concorrência vem do pool, não de você abrir Thread no controller.

**Como funciona:**
```text
Puma workers (processos) × threads do pool = requests ao mesmo tempo
```

Default comum: `RAILS_MAX_THREADS=5`. Cinco requests por worker. Cada um com sua conexão no pool do Active Record. Thread do Puma não é a que você criou no `each`.

GVL: cinco threads ajudam quando o request espera o Postgres. Cinco threads calculando relatório CPU-bound se atropelam.

**Exemplo prático:**
```ruby
# config/puma.rb — ideia
workers Integer(ENV.fetch("WEB_CONCURRENCY", 2))
threads_count = Integer(ENV.fetch("RAILS_MAX_THREADS", 5))
threads threads_count, threads_count
```

Pool do banco ≥ threads. Puma com 5 threads e AR pool 5: ok. Thread extra no request falando com o banco: estoura o pool.

```ruby
# RUIM no controller
ids.map { |id| Thread.new { User.find(id) } }.map(&:value)
# cada thread quer conexão. pool pequeno = timeout
```

Se um dia o fan-out for inevitável, empresta e devolve:

```ruby
Thread.new do
  ActiveRecord::Base.connection_pool.with_connection do
    User.find(id)
  end
end
```

Prefira uma query. Ou job. Não thread no meio do action.

`CurrentAttributes` / locale são por thread. Por isso o Puma isola request. Por isso variável de classe vaza entre usuários.

**Quando usar:**
Ajustar worker vs thread: IO-bound → mais thread (com teto). CPU-bound / memória → mais worker (processo, copy-on-write). JRuby não tem GVL; MRI tem.

**Na entrevista:**
> "Request é uma thread do Puma. O pool é a concorrência. Eu não solto Thread no controller. Connection pool casa com RAILS_MAX_THREADS. CPU: aumento worker, não thread. Ractor não entra nesse desenho."

---

## Recapitulando

- MRI: GVL. Um bytecode Ruby por vez por processo.
- Thread: IO. Memória compartilhada. `join` / `value`.
- Mutex: estado compartilhado. Melhor não compartilhar. `Queue` se for fila.
- Fiber: cooperativo, barato. Não é paralelo.
- `Fiber.schedule` exige scheduler. Rails clássico não usa.
- Ractor: isolamento + CPU no MRI. Ainda limitado. Não é o request.
- Puma: request = 1 thread do pool. Worker = processo. Pool do AR casa com as threads.

---

## Exercícios práticos

### Exercício 1: GVL na entrevista

**Enunciado:** O entrevistador diz: "Ruby não tem thread de verdade por causa do GIL, então Puma threaded não serve." Responda em poucas frases. Quando thread ajuda e quando você sobe worker.

<details>
<summary>Solução</summary>

GIL/GVL existe no MRI. Thread existe — é thread do SO. O que não existe é paralelismo de bytecode Ruby no mesmo processo. Thread ajuda em IO (banco, Redis, HTTP): o GVL solta. Não ajuda em CPU (JSON enorme, relatório): aí worker ou job. Puma threaded serve; você casa `RAILS_MAX_THREADS` com o pool do AR.

**Pontos-chave:**
- GVL ≠ "não tem thread"
- IO vs CPU
- worker = processo, thread = pool do request
</details>

### Exercício 2: corrida sem Mutex

**Enunciado:** O que pode imprimir? Por quê? Como você corrige sem inventar framework?

```ruby
counter = 0
threads = 10.times.map do
  Thread.new do
    1000.times { counter += 1 }
  end
end
threads.each(&:join)
puts counter
```

<details>
<summary>Solução</summary>

Pode imprimir menos que 10000. `+=` lê, soma, grava. Dois threads intercalam e um incremento some.

```ruby
mutex = Mutex.new
counter = 0
threads = 10.times.map do
  Thread.new do
    1000.times { mutex.synchronize { counter += 1 } }
  end
end
threads.each(&:join)
puts counter  # 10000
```

No app: não faça contador em variável. Redis `INCR`, banco, ou nada compartilhado entre threads.

**Pontos-chave:**
- `+=` não é atômico
- Mutex no exemplo de entrevista
- Em produção, não compartilhe mutável
</details>

### Exercício 3: Thread, Fiber ou Ractor?

**Enunciado:** Para cada caso, escolha uma e justifique em uma frase.

1. Dez HTTP para APIs externas no mesmo processo, MRI.
2. Pausar um iterator e continuar depois, um thread só.
3. Parse CPU-bound de um arquivo enorme, quer usar 4 cores no MRI.
4. Action de Rails que responde HTML.

<details>
<summary>Solução</summary>

1. **Thread** (ou Fiber com scheduler). IO solta GVL. Sem scheduler, Thread é o caminho óbvio.
2. **Fiber**. Cooperativo. `yield` / `resume`. Enumerator já faz isso.
3. **Ractor** ou **processo**. Thread não paraleliza CPU no MRI. Ractor é a resposta de linguagem; job/processo é a de produção.
4. **Nenhuma das três na mão.** Uma thread do pool do Puma. Sem Thread no action, sem Ractor, sem `Fiber.schedule`.

**Pontos-chave:**
- IO → Thread
- controle de fluxo → Fiber
- CPU no MRI → processo / Ractor (Ractor ainda limitado)
- request Rails → pool do Puma
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
