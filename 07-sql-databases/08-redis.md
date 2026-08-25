# 7.8 Redis

> **TL;DR**
> Redis é um banco de dados em memória, orientado a estruturas de dados. Ele entrega acesso rápido a strings, listas, sets e hashes, entre outros tipos. Em Rails, aparece muito como cache, backend do Sidekiq e store de sessão. TTL faz uma chave expirar sem limpeza manual. RDB e AOF ajudam na persistência, mas têm custos e garantias diferentes. Redis não substitui PostgreSQL ou MySQL como fonte principal de dados relacionais.

## Conteúdo

- [O que é Redis](#o-que-é-redis)
- [Strings](#strings)
- [Listas](#listas)
- [Sets](#sets)
- [Hashes](#hashes)
- [TTL e expiração](#ttl-e-expiração)
- [Redis como cache no Rails](#redis-como-cache-no-rails)
- [Redis com Sidekiq](#redis-com-sidekiq)
- [Redis como store de sessão](#redis-como-store-de-sessão)
- [Persistência com RDB e AOF](#persistência-com-rdb-e-aof)
- [Redis não substitui SQL](#redis-não-substitui-sql)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que é Redis

**O que é:**
Redis é um servidor de dados que mantém o conjunto de trabalho principalmente em memória. Por isso, leituras e escritas costumam ter baixa latência.

Ele não guarda apenas texto. Cada chave aponta para uma estrutura de dados: string, lista, set, hash e outros tipos.

**Como funciona:**
Sua app abre uma conexão com o Redis e envia comandos. O servidor executa o comando sobre uma chave e devolve o resultado.

```text
SET greeting "Olá"
GET greeting
```

O Redis é rápido, mas memória é finita e mais cara que disco. Você precisa definir o que pode entrar, quando expira e o que acontece quando faltar memória.

**Na entrevista:**
> "Redis é um banco em memória orientado a estruturas de dados. Eu uso para acesso rápido e dados que combinam com operações como contador, fila, conjunto e expiração. Não trato como um Hash Ruby compartilhado sem limites."

---

## Strings

**O que é:**
String guarda texto, bytes, JSON serializado ou um número que será incrementado.

```text
SET page:home:views 0
INCR page:home:views
INCRBY page:home:views 10
```

**Quando usar:**
- Contador de visualizações.
- Flag temporária.
- Cache de um valor serializado.
- Lock simples, com cuidado e prazo de expiração.

```text
SET password_reset:user:42 "token-secreto" EX 900
```

`EX 900` define expiração em 900 segundos. `NX` também pode ser usado para só gravar quando a chave ainda não existe.

**Na entrevista:**
> "String não é só texto. Um contador também pode ser string e usar `INCR`, que é atômico. Para chave temporária, prefiro criar valor e TTL no mesmo comando."

---

## Listas

**O que é:**
Lista é uma sequência ordenada de valores. Você insere ou remove pelas extremidades.

```text
LPUSH notifications:user:42 "Pedido enviado"
LPUSH notifications:user:42 "Pagamento aprovado"
LRANGE notifications:user:42 0 9
RPOP notifications:user:42
```

`LPUSH` adiciona à esquerda. `RPUSH` adiciona à direita. `LPOP` e `RPOP` removem das extremidades.

**Quando usar:**
Uma lista funciona para histórico curto, buffer ou uma fila simples. Mas uma fila de jobs real precisa de confirmação, retry, agendamento, observabilidade e tratamento de falha.

É por isso que, em Rails, você normalmente usa Sidekiq em vez de inventar uma fila só com `LPUSH` e `RPOP`.

**Na entrevista:**
> "Listas mantêm ordem e operam bem nas pontas. Elas permitem uma fila simples, mas eu não reimplementaria as garantias operacionais do Sidekiq com dois comandos Redis."

---

## Sets

**O que é:**
Set é uma coleção sem duplicatas e sem ordem de posição garantida.

```text
SADD online:user_ids 42
SADD online:user_ids 42
SADD online:user_ids 81
SCARD online:user_ids
SISMEMBER online:user_ids 42
SREM online:user_ids 42
```

Adicionar `42` duas vezes não cria duas entradas. `SCARD` devolve a quantidade de membros.

**Quando usar:**
- IDs únicos conectados agora.
- Interseção entre grupos.
- Deduplicação de itens.

`SINTER` calcula interseção e `SUNION` calcula união entre sets.

**Na entrevista:**
> "Set resolve unicidade e operações como interseção. Se preciso de ordem ou score, eu escolheria outra estrutura, como sorted set."

---

## Hashes

**O que é:**
Hash guarda campos e valores dentro de uma chave. É útil para representar um objeto pequeno sem criar uma chave Redis para cada atributo.

```text
HSET user:42:profile name "Ana" plan "pro" city "Recife"
HMGET user:42:profile name plan
HGETALL user:42:profile
HINCRBY user:42:profile login_count 1
```

Não confunda um hash do Redis com persistir um model Active Record. O Redis não aplica migration, foreign key, associação ou validação do model.

O TTL vale para a chave inteira, não para cada campo do hash.

Com `EXPIRE user:42:profile 3600`, todos os campos expiram juntos.

**Na entrevista:**
> "Hash agrupa campos em uma chave. É bom para um objeto pequeno e mutável, mas não ganha as garantias relacionais do banco SQL. O TTL expira o hash inteiro."

---

## TTL e expiração

**O que é:**
TTL é o tempo de vida restante de uma chave. Quando o prazo termina, a chave deixa de existir.

```text
SET verification:user:42 "847201" EX 300
TTL verification:user:42
```

Essa forma evita uma chave permanente se a app cair entre `SET` e `EXPIRE`.

**Como funciona:**
Redis remove chaves expiradas tanto ao acessá-las quanto em ciclos de limpeza. Para sua app, uma chave vencida deve ser tratada como ausente.

TTL é central para cache, sessão, rate limit e token temporário. Sem TTL, dados transitórios acumulam e consomem memória até a política de eviction entrar em ação ou o servidor falhar.

**Na entrevista:**
> "TTL faz a chave desaparecer depois de um prazo. Eu prefiro operações que gravam valor e expiração juntas. Também trato cache miss e chave expirada como fluxo normal."

---

## Redis como cache no Rails

**Quando usar:**
Rails pode usar Redis como backend de `Rails.cache`. Isso ajuda quando vários processos ou servidores precisam compartilhar o mesmo cache.

Na app, você usa a API de cache do Rails, não comandos Redis espalhados pelo domínio:

```ruby
top_products = Rails.cache.fetch("top-products", expires_in: 10.minutes) do
  Product.order(sales_count: :desc).limit(10).to_a
end
```

**Como funciona:**
No primeiro acesso, o bloco consulta o banco e grava o resultado. Até expirar, outros acessos leem o valor do cache.

Cache é descartável. Se a chave sumir, a app deve reconstruí-la. O banco SQL continua sendo a fonte da verdade.

Pense também em invalidação. Um TTL curto aceita algum atraso. Para dado que precisa refletir uma alteração imediatamente, você pode apagar ou versionar a chave ao atualizar o registro.

Uma atualização urgente também pode apagar a entrada com `Rails.cache.delete("top-products")`.

**Na entrevista:**
> "Eu uso Redis via `Rails.cache` e aplico cache-aside: tento ler, calculo no miss e salvo com expiração. Cache não é fonte da verdade, e invalidação faz parte da solução."

---

## Redis com Sidekiq

**O que é:**
Sidekiq usa Redis para armazenar e coordenar jobs. O processo web enfileira; processos Sidekiq retiram e executam.

```ruby
class ReceiptWorker
  include Sidekiq::Job

  def perform(order_id)
    order = Order.find(order_id)
    ReceiptMailer.with(order: order).deliver_now
  end
end

ReceiptWorker.perform_async(order.id)
```

Passe IDs e argumentos simples. Não passe um objeto Active Record esperando que ele continue atual quando o job rodar.

Um job pode executar mais de uma vez por causa de retry ou falha depois de parte do processamento. Por isso, escreva jobs idempotentes quando possível.

Cache e Sidekiq têm criticidades diferentes. Perder cache gera miss e recálculo; perder dados da queue pode perder trabalho. Em produção, é comum separar instâncias ou, no mínimo, políticas e capacidade para evitar que cache pressione a memória dos jobs.

**Na entrevista:**
> "Sidekiq depende do Redis como infraestrutura de queue. Eu passo IDs, penso em idempotência e não misturo a criticidade dos jobs com cache descartável sem avaliar isolamento e eviction."

---

## Redis como store de sessão

**Quando usar:**
Redis pode centralizar sessões quando vários processos Rails atendem o mesmo usuário. O cookie leva o identificador da sessão, e os dados ficam no servidor.

```ruby
# config/initializers/session_store.rb
Rails.application.config.session_store(
  :redis_store,
  servers: [ENV.fetch("REDIS_SESSION_URL")],
  expire_after: 2.hours,
  key: "_store_session"
)
```

Esse exemplo pressupõe uma integração compatível com `:redis_store`; a configuração exata depende da gem escolhida.

**Como funciona:**
Cada request recupera a sessão pela chave. O prazo reduz sessões abandonadas, mas expiração ou remoção força o usuário a iniciar uma nova sessão.

Não coloque objetos grandes, dados que precisam durar para sempre ou informação que deveria estar modelada no banco. Sessão deve ser pequena.

Compare com o padrão do Rails, `CookieStore`: nele, o conteúdo da sessão fica no cookie assinado e criptografado, sujeito ao limite do cookie. Redis vira uma decisão de arquitetura, não uma obrigação.

**Na entrevista:**
> "Redis permite sessão server-side compartilhada. Eu defino expiração, mantenho o payload pequeno e aceito que indisponibilidade ou eviction pode encerrar sessões. Também sei que Rails usa CookieStore por padrão."

---

## Persistência com RDB e AOF

**O que é:**
Embora opere em memória, Redis pode persistir dados em disco. Os dois mecanismos principais são RDB e AOF.

**RDB:**
Cria snapshots do conjunto de dados em determinados momentos. Costuma gerar arquivos compactos e permite recuperação rápida, mas uma falha pode perder alterações feitas depois do último snapshot.

**AOF:**
Registra operações de escrita em um log. Dependendo da política de `fsync`, reduz a janela de perda, com custo maior de I/O e arquivos que precisam ser reescritos periodicamente.

Você pode usar RDB, AOF, ambos ou nenhum, conforme o papel da instância.

Cache puro pode aceitar nenhuma persistência. Jobs e sessões exigem uma conversa mais séria sobre durabilidade, réplica, backup e recuperação.

Persistência não elimina todos os riscos. Replicação pode ser assíncrona, failover pode perder escritas recentes e um backup só vale se a restauração for testada.

**Na entrevista:**
> "RDB é snapshot periódico; AOF registra escritas. A escolha depende da perda aceitável e do custo operacional. Persistência ajuda, mas não transforma Redis automaticamente em um banco com as mesmas garantias do PostgreSQL."

---

## Redis não substitui SQL

**O que é:**
PostgreSQL e MySQL são adequados para dados relacionais, consultas flexíveis, constraints e transações duráveis. Redis é adequado quando a estrutura e o padrão de acesso combinam com suas operações em memória.

Esse domínio precisa de foreign keys, integridade, consultas e histórico. Guardá-lo apenas em chaves Redis transfere consistência para código da app.

Um desenho comum é:

```text
PostgreSQL: usuários, pedidos, pagamentos
Redis: cache, jobs, sessões, rate limit
```

Redis pode ser banco primário em casos específicos, desde que o modelo de dados, a durabilidade e as operações tenham sido desenhados para isso. Essa exceção não faz dele uma troca direta por SQL em uma app Rails típica.

**Na entrevista:**
> "Eu não apresento Redis como substituto de SQL. O banco relacional mantém a fonte da verdade e as constraints. Redis atende padrões de baixa latência e dados transitórios ou especializados."

---

## Recapitulando

- Redis é um banco em memória orientado a estruturas de dados.
- Chaves são strings; namespaces com `:` são convenção.
- Strings atendem valor simples e contador atômico.
- Listas mantêm ordem e operam pelas extremidades.
- Sets removem duplicatas e permitem interseção e união.
- Hashes agrupam campos, mas não substituem models relacionais.
- TTL remove dados temporários e deve ser parte do desenho.
- Rails pode usar Redis para cache compartilhado.
- Sidekiq usa Redis para armazenar e coordenar jobs.
- Sessões server-side podem usar Redis, mas Rails usa CookieStore por padrão.
- RDB cria snapshots; AOF registra escritas.
- Persistência, réplica e backup não são a mesma garantia.
- Redis não é uma troca direta por PostgreSQL ou MySQL.
- Memória, eviction, isolamento e observabilidade importam em produção.

---

## Exercícios práticos

### Exercício 1: Escolha a estrutura

**Enunciado:** Você precisa representar três casos: contador de acessos, IDs únicos de usuários online e dez notificações mais recentes. Escolha uma estrutura Redis para cada caso e mostre comandos básicos.

<details>
<summary>Solução</summary>

Use string para o contador, set para IDs únicos e list para notificações ordenadas.

```text
INCR page:pricing:views

SADD online:user_ids 42
SISMEMBER online:user_ids 42

LPUSH notifications:user:42 "Pagamento aprovado"
LTRIM notifications:user:42 0 9
LRANGE notifications:user:42 0 9
```

`LTRIM` mantém apenas os dez primeiros itens depois do `LPUSH`.

**Pontos-chave:**
- A estrutura vem do padrão de acesso.
- `INCR` evita o read-modify-write no cliente.
- Set deduplica membros.
- List preserva a ordem das notificações.
</details>

### Exercício 2: Cache com expiração

**Enunciado:** Faça cache dos cinco produtos mais vendidos por dez minutos. Explique o que acontece quando a chave expira.

<details>
<summary>Solução</summary>

```ruby
products = Rails.cache.fetch("products:top-5", expires_in: 10.minutes) do
  Product.order(sales_count: :desc).limit(5).to_a
end
```

No primeiro miss, o Rails executa o bloco e grava o resultado. Enquanto a entrada existe, devolve o cache. Depois da expiração, o próximo acesso executa o bloco novamente.

**Pontos-chave:**
- PostgreSQL continua sendo a fonte da verdade.
- Expiração transforma ausência em fluxo normal.
- Uma atualização urgente pode exigir `Rails.cache.delete`.
- Muitos misses simultâneos podem causar efeito manada.
</details>

### Exercício 3: Redis ou PostgreSQL?

**Enunciado:** Um time quer guardar pedidos, pagamentos, jobs e cache na mesma instância Redis. Avalie a proposta e sugira uma separação.

<details>
<summary>Solução</summary>

Pedidos e pagamentos têm relações, constraints, consultas e alta exigência de durabilidade. Eles ficam no PostgreSQL.

Sidekiq pode usar Redis para jobs. `Rails.cache` pode usar Redis para cache. Como a perda de cache é tolerável e a perda de jobs não é equivalente, vale separar instâncias ou garantir políticas de memória, persistência e capacidade próprias.

```text
PostgreSQL -> pedidos e pagamentos
Redis A    -> Sidekiq
Redis B    -> cache com TTL e eviction apropriada
```

**Pontos-chave:**
- Escolha o banco pelo modelo e pela garantia necessária.
- Cache é reconstruível; pedido pago não é.
- Eviction de cache não deve remover jobs.
- RDB/AOF ajudam, mas não substituem modelagem relacional e constraints.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
