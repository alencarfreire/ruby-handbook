# 7.9 Cache

> **TL;DR**
> Cache troca consistência imediata por menos latência e menos trabalho. No padrão cache-aside, você tenta ler do cache; no miss, busca a fonte de verdade e grava o resultado. `Rails.cache.fetch` faz esse fluxo. Memory Store é local ao processo, Redis é compartilhado e Solid Cache usa banco SQL. Use chave versionada, TTL e invalidação explícita. Para stampede, combine `race_condition_ttl`, TTL com jitter e, quando necessário, lock. Low-level cache guarda valores calculados; Russian Doll organiza fragmentos aninhados de view e será aprofundado no capítulo 15.1.

## Conteúdo

- [O que é cache](#o-que-é-cache)
- [Cache-aside com Rails.cache.fetch](#cache-aside-com-railscachefetch)
- [Chaves e versionamento](#chaves-e-versionamento)
- [Memory Store, Redis e Solid Cache](#memory-store-redis-e-solid-cache)
- [Low-level cache](#low-level-cache)
- [Russian Doll em uma camada](#russian-doll-em-uma-camada)
- [Stampede](#stampede)
- [Expiração e invalidação](#expiração-e-invalidação)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que é cache

**O que é:**
Cache é uma cópia temporária de um dado caro de obter. A fonte de verdade continua sendo o banco, uma API ou outro sistema.

Você aceita que a cópia pode ficar velha por algum tempo para reduzir queries, chamadas externas, CPU e latência. Cache não corrige query ruim. Primeiro meça, elimine N+1 e confira índices.

**Como funciona:**
Todo acesso tem dois resultados básicos:

- **hit:** a chave existe e o valor volta do cache;
- **miss:** a chave não existe, expirou ou mudou de versão.

O miss custa mais porque você consulta a fonte e reconstrói o valor. Por isso taxa de hit sem latência não conta a história inteira.

**Quando usar:**
Use quando o valor é lido muitas vezes, muda menos do que é lido e pode tolerar alguma defasagem.

Não use cache como única cópia de pedido, pagamento ou permissão. Cache pode ser removido, expirar ou falhar.

**Na entrevista:**
> "Cache é uma otimização, não a fonte de verdade. Eu começo pela tolerância a dado velho, defino chave e invalidação, e só depois escolho o store."

---

## Cache-aside com `Rails.cache.fetch`

**O que é:**
Cache-aside deixa a app responsável por ler e preencher o cache. É o padrão mais comum com `Rails.cache`.

O fluxo é: tenta ler a chave; no hit, devolve o valor; no miss, executa o block, grava e devolve o retorno.

**Exemplo prático:**
```ruby
class SalesDashboard
  def total_for(date)
    Rails.cache.fetch(["sales-total", date], expires_in: 15.minutes) do
      Order.paid.where(paid_at: date.all_day).sum(:total_cents)
    end
  end
end
```

Você poderia escrever `read`, testar `nil`, calcular e chamar `write`. `fetch` concentra o comportamento. O block só roda no miss; se ele chama API externa, trate timeout e erro normalmente.

**Importante na entrevista:**
Por padrão, um retorno `nil` também pode ser armazenado. Se `nil` significa “não consegui obter”, evite congelar uma falha temporária:

```ruby
Rails.cache.fetch("catalog/featured", expires_in: 5.minutes, skip_nil: true) do
  Product.featured.first&.id
end
```

Cache-aside também tem uma janela de inconsistência. O banco pode mudar antes de a chave expirar ou ser apagada. Isso é parte do desenho, não surpresa de produção.

---

## Chaves e versionamento

**O que é:**
A chave diz qual resultado está guardado. Ela precisa variar com toda entrada que muda o resultado.

Uma chave como `"recommendations"` mistura os resultados de todos. Uma chave explícita separa contexto e versão lógica:

```ruby
Rails.cache.fetch(["recommendations", "v2", user.id], expires_in: 1.hour) do
  recommendations_for(user).map(&:id)
end
```

O `v2` permite invalidar uma família inteira quando o algoritmo muda. Você troca para `v3`; as chaves antigas expiram depois.

**Como funciona:**
Rails expande arrays e objetos que respondem a `cache_key_with_version`:

```ruby
product.cache_key_with_version
# "products/42-20260825143015999999"

Rails.cache.fetch(["price-summary", product], expires_in: 30.minutes) do
  PriceSummary.new(product).as_json
end
```

Quando `updated_at` muda, a versão do model muda. A leitura seguinte usa outra versão e vira miss.

Isso não resolve dependências invisíveis. Se o resumo depende de `product.variants`, alterar uma variante precisa:

- atualizar ou dar `touch` no produto;
- entrar na chave com sua própria versão;
- ou disparar invalidação explícita.

**Quando usar:**
Prefira chaves compostas e previsíveis. Inclua nome do recurso, versão do algoritmo, tenant, locale, filtros, página e versão do registro quando esses dados mudarem o resultado.

Não coloque token, senha, e-mail ou outro dado sensível na chave. Chaves aparecem em métricas e ferramentas do store.

**Importante na entrevista:**
Evite guardar instâncias completas de Active Record. Serialização, mudança de schema e associação carregada criam surpresas. Guarde IDs, números, strings, arrays ou hashes simples e busque o registro quando precisar de consistência atual.

---

## Memory Store, Redis e Solid Cache

`Rails.cache` oferece a mesma API sobre stores diferentes. A escolha muda compartilhamento, persistência, operação e custo.

### Memory Store

**O que é:**
`ActiveSupport::Cache::MemoryStore` guarda valores na memória do processo Ruby.

```ruby
# config/environments/development.rb
config.cache_store = :memory_store, { size: 64.megabytes }
```

É rápido e simples. Mas cada processo Puma tem sua própria cópia. Um deploy ou restart apaga tudo, e processos diferentes podem devolver valores diferentes.

**Quando usar:**
Serve para desenvolvimento, processo único e cache pequeno e descartável. Não escolha Memory Store esperando compartilhar dados entre dynos, pods ou workers.

### Redis

**O que é:**
`RedisCacheStore` usa Redis como store compartilhado. Web e workers podem enxergar as mesmas chaves.

```ruby
# config/environments/production.rb
config.cache_store = :redis_cache_store, {
  url: ENV.fetch("REDIS_CACHE_URL"),
  connect_timeout: 1,
  read_timeout: 1,
  write_timeout: 1
}
```

Redis entrega baixa latência e expiração nativa. Em troca, você opera outro serviço, controla memória, eviction, conexão e disponibilidade.

Separe cache descartável de dados Redis que não podem sofrer eviction. Uma política de memória adequada para cache não é necessariamente adequada para queue ou lock.

### Solid Cache

**O que é:**
Solid Cache implementa o store sobre banco SQL. Ele pode aproveitar disco barato e manter um cache maior que a RAM disponível no Redis.

```ruby
# Depois de instalar e configurar a gem solid_cache
config.cache_store = :solid_cache_store
```

Em Rails 7.1, você adiciona e instala a gem explicitamente. Apps Rails mais novas podem gerar essa infraestrutura por padrão. O setup cria schema e configuração próprios.

Em produção, prefira um banco de cache separado do banco principal. Se ambos disputam o mesmo pool, I/O e locks, o cache pode aumentar a pressão que deveria reduzir.

**Quando usar:**
Solid Cache faz sentido quando persistência em disco, simplicidade operacional ou volume de cache favorecem SQL. Redis faz sentido quando latência muito baixa e estruturas/operações do Redis já fazem parte da arquitetura.

| Store | Compartilha entre processos? | Sobrevive a restart da app? | Principal cuidado |
|---|---:|---:|---|
| Memory Store | não | não | memória por processo |
| Redis | sim | depende da infra | memória, eviction e conexões |
| Solid Cache | sim | sim | banco, limpeza e contenção |

**Na entrevista:**
> "A API é `Rails.cache`; o store é decisão operacional. Memory Store não é distribuído. Redis é rápido e compartilhado. Solid Cache usa SQL e disco, de preferência fora do banco primário."

---

## Low-level cache

**O que é:**
Low-level cache guarda um valor calculado diretamente com `Rails.cache`, sem envolver o template inteiro.

```ruby
class ProductMetrics
  def initialize(product)
    @product = product
  end

  def average_rating
    Rails.cache.fetch(["average-rating", @product], expires_in: 20.minutes) do
      @product.reviews.average(:rating)&.to_f
    end
  end
end
```

É útil para agregação SQL, resposta normalizada de API, feature cara ou resultado de um objeto de consulta.

**Como funciona:**
A API também oferece `read`, `write`, `delete` e `fetch_multi`. Use a operação de lote quando várias chaves independentes puderem ser lidas juntas; o ganho depende do store.

**Quando usar:**
Use no ponto em que o custo e as dependências são claros. Não espalhe `Rails.cache.fetch` em cada linha do model. Cache sem dono vira invalidação impossível de rastrear.

---

## Russian Doll em uma camada

**O que é:**
Russian Doll caching aninha fragmentos de view. O fragmento externo contém internos, como bonecas russas. Fragmentos internos que não mudaram podem ser reaproveitados quando o externo for reconstruído.

```erb
<% cache [post, "card"] do %>
  <article>
    <h2><%= post.title %></h2>

    <% post.comments.each do |comment| %>
      <% cache comment do %>
        <%= render "comments/comment", comment: comment %>
      <% end %>
    <% end %>
  </article>
<% end %>
```

Para a mudança de comentário invalidar o fragmento externo, o pai precisa refletir essa mudança. Um caminho comum é:

```ruby
class Comment < ApplicationRecord
  belongs_to :post, touch: true
end
```

Low-level cache guarda dados e cálculos. Fragment caching guarda HTML. Russian Doll coordena vários fragmentos e versões de template.

Aqui basta distinguir os níveis. Dependências, collection caching, digest de template e desenho completo de Russian Doll ficam no [capítulo 15.1](../15-performance/01-caching.md).

---

## Stampede

**O que é:**
Cache stampede, ou efeito manada, acontece quando muitos requests recebem miss para a mesma chave e todos refazem o trabalho caro ao mesmo tempo.

É comum logo após expiração, deploy ou cache frio.

**Como funciona:**
`race_condition_ttl` permite que um processo estenda por pouco tempo uma entrada recém-expirada enquanto a recalcula. Os demais continuam recebendo o valor velho nesse intervalo.

```ruby
Rails.cache.fetch(
  "homepage/top-products/v3",
  expires_in: 10.minutes,
  race_condition_ttl: 10.seconds
) do
  Product.top.limit(20).pluck(:id)
end
```

Isso reduz a manada na expiração, mas não resolve toda situação. Se a chave nunca existiu, todos podem chegar ao miss frio. E o comportamento precisa ser compatível com o store e a tolerância a dado velho.

Outras ferramentas:

- **jitter:** varia um pouco o TTL para chaves não expirarem juntas;
- **aquecimento:** preenche chaves críticas antes do tráfego;
- **lock distribuído:** só um processo reconstrói um valor muito caro;
- **stale-while-revalidate:** serve dado velho enquanto atualiza fora do caminho crítico.

Lock não é a primeira resposta. Ele adiciona timeout, expiração, dono e risco de deadlock. Use quando duplicar o cálculo é realmente perigoso ou caro.

**Na entrevista:**
> "TTL sozinho pode sincronizar milhares de misses. Eu considero `race_condition_ttl`, jitter e aquecimento. Para miss frio muito caro, avalio lock distribuído com timeout."

---

## Expiração e invalidação

**O que é:**
Expirar é decidir quando uma cópia deixa de ser válida. Há três estratégias principais:

- **TTL:** a entrada some depois de um tempo;
- **chave versionada:** uma mudança passa a apontar para outra chave;
- **delete explícito:** o fluxo de escrita remove a chave conhecida.

Na prática, você combina as três. TTL é rede de segurança, não substituto para uma regra de invalidação.

**Exemplo prático:**
Depois de `product.update!`, você pode apagar uma chave fixa com `Rails.cache.delete(["storefront-price", product.id])`. Se a escrita está em uma transaction maior, invalide depois do commit. Apagar antes abre uma janela: outro request perde o cache, lê o valor antigo e o grava novamente.

Quando a chave inclui o model, a mudança de `updated_at` já cria uma nova versão:

```ruby
Rails.cache.fetch(["storefront-price", product], expires_in: 1.day) do
  { id: product.id, price_cents: product.price_cents }
end
```

A chave antiga pode continuar fisicamente no store até expirar ou ser removida pela política de limpeza. Ela só não é mais lida pela nova versão.

**Importante na entrevista:**
Não use `delete_matched("products/*")` como estratégia padrão. Varredura pode ser cara e o suporte varia por store. Prefira namespace versionado, chave conhecida ou versionamento por registro.

Também defina o que acontece se o cache cair. Para cache de performance, a app deveria buscar a fonte de verdade, talvez mais lenta. Monitore hit, miss, latência, timeout, eviction, reconstrução e pressão no banco.

---

## Recapitulando

- Cache é cópia descartável; a fonte de verdade fica fora dele.
- Cache-aside lê, calcula no miss e grava. `Rails.cache.fetch` implementa esse fluxo.
- Chave inclui tudo que altera o resultado. Versão lógica ajuda em mudanças de algoritmo.
- `cache_key_with_version` acompanha `updated_at`, mas dependências precisam de `touch` ou invalidação.
- Memory Store é local ao processo. Redis e Solid Cache são compartilhados.
- Redis usa memória e exige cuidado com eviction. Solid Cache usa SQL e deve evitar disputar o banco principal.
- Low-level cache guarda dados e cálculos. Fragment cache guarda HTML.
- Russian Doll aninha fragmentos; o aprofundamento fica no capítulo 15.1.
- `race_condition_ttl`, jitter e aquecimento reduzem stampede.
- Combine TTL, chave versionada e delete depois do commit.
- Meça hit, miss, latência, erro, eviction e custo de reconstrução.

---

## Exercícios práticos

### Exercício 1: Corrija a chave

**Enunciado:** Uma chave `"featured"` guarda os dez `Product` completos e mistura lojas e idiomas. Corrija a chave e o valor.

<details>
<summary>Solução</summary>

```ruby
product_ids = Rails.cache.fetch(
  ["featured", "v1", current_store.id, I18n.locale],
  expires_in: 30.minutes
) do
  Product.where(store: current_store).featured.limit(10).pluck(:id)
end

products = Product.where(id: product_ids).index_by(&:id)
ordered_products = product_ids.filter_map { |id| products[id] }
```

**Pontos-chave:** loja e locale alteram o resultado; `v1` permite trocar o algoritmo; IDs são mais seguros que models serializados; o segundo passo preserva a ordem.
</details>

### Exercício 2: Evite a manada

**Enunciado:** Uma query de dashboard leva oito segundos. A cada cinco minutos, dezenas de requests a executam juntos. Mostre uma primeira mitigação e diga qual limite ela tem.

<details>
<summary>Solução</summary>

```ruby
Rails.cache.fetch(
  ["dashboard", "v2", account.id],
  expires_in: rand(270..330).seconds,
  race_condition_ttl: 15.seconds
) do
  DashboardQuery.new(account).call
end
```

`race_condition_ttl` deixa requests concorrentes usarem por pouco tempo a entrada recém-expirada enquanto um processo recalcula. O TTL variável evita que todas as contas expirem no mesmo instante.

**Pontos-chave:** reduz a manada de uma entrada recém-expirada, mas aceita dado velho e não garante exclusão no miss frio. Nesse caso, considere aquecimento ou lock distribuído com timeout.
</details>

### Exercício 3: Invalide no momento certo

**Enunciado:** Um checkout atualiza preço dentro de uma transaction. Por que apagar o cache antes do commit é perigoso? Proponha uma chave versionada.

<details>
<summary>Solução</summary>

Se você apaga antes do commit, outro request pode receber miss, ler o preço antigo do banco e recolocá-lo no cache. A transaction original só faz commit depois.

Use `["checkout-price", product]`: depois de `product.update!`, o `updated_at` muda e `cache_key_with_version` aponta para outra versão. Se outras tabelas alteram o preço, elas precisam tocar o produto ou participar da chave.

Para uma chave fixa, faça o delete depois que o commit tiver sucesso, por exemplo no fluxo que controla a transaction ou com um callback `after_commit` bem delimitado.

**Pontos-chave:** invalidação antes do commit abre race condition; a versão do model evita reutilizar a chave antiga; dependência indireta exige `touch` ou invalidação; TTL é a rede de segurança.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
