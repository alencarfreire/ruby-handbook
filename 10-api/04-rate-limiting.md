# 10.4 Rate limiting

> **TL;DR**
> Rate limiting protege sua API contra abuso, rajadas e consumo injusto de recursos. Quando o cliente ultrapassa o limite, responda `429 Too Many Requests` e, quando possível, envie `Retry-After`. Em Rails 7.1, a escolha comum é `rack-attack`, com contadores compartilhados em Redis. Limite por IP antes da autenticação e por usuário depois que você consegue identificá-lo. Fixed window é simples; sliding window e token bucket tratam rajadas melhor. Rails 8 oferece `rate_limit` no controller, mas você ainda decide chave, store e política.

## Conteúdo

- [Por que limitar requisições](#por-que-limitar-requisições)
- [429 e Retry-After](#429-e-retry-after)
- [Per-IP ou per-user](#per-ip-ou-per-user)
- [Algoritmos](#algoritmos)
- [Rack::Attack no Rails 7.1](#rackattack-no-rails-71)
- [Store compartilhado](#store-compartilhado)
- [Rails 8 e rate_limit](#rails-8-e-rate_limit)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Por que limitar requisições

**O que é:**
Rate limiting define quantas requisições uma identidade pode fazer durante um intervalo.

A identidade pode ser um IP, usuário, organização ou chave de API.

**Quando usar:**
Use em endpoints caros, sensíveis ou fáceis de automatizar:

- login e recuperação de senha;
- criação de conta;
- envio de e-mail ou SMS;
- busca pesada e exportação;
- upload e processamento de arquivo;
- API pública com cota por plano.

O objetivo não é só impedir ataque. Um cliente com bug pode entrar em loop e derrubar a API sem intenção maliciosa. A cota também impede um consumidor de ocupar toda a capacidade.

Rate limiting não substitui autenticação, autorização ou timeout. E um ataque volumétrico deve ser barrado antes do Rails, em CDN, WAF, API gateway ou load balancer.

**Na entrevista:**
> "Eu uso rate limiting para controlar abuso e custo. Coloco uma proteção grossa na borda e regras específicas perto da app."

---

## 429 e Retry-After

**O que é:**
`429 Too Many Requests` informa que o cliente ultrapassou uma política de uso.

Não use `403 Forbidden`: o cliente pode estar autorizado e ter excedido apenas um limite temporário.

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 42

{"error":"rate_limit_exceeded"}
```

**Como funciona:**
`Retry-After` aceita segundos até a nova tentativa ou uma data HTTP. Para APIs, segundos costumam ser mais simples.

O cliente deve esperar pelo menos esse tempo. Em retries automáticos, jitter — um pequeno atraso aleatório — evita que todos tentem novamente no mesmo instante.

O status é o contrato principal. Mantenha também um código estável no JSON. A mensagem para pessoas pode mudar sem quebrar o cliente.

Cabeçalhos de limite e saldo ajudam, mas só os publique se sua implementação consegue calcular valores corretos.

**Na entrevista:**
> "Ao exceder a cota, retorno 429. Envio Retry-After quando sei calcular a próxima tentativa e mantenho um código de erro estável."

---

## Per-IP ou per-user

**O que é:**
A chave do contador responde: "quem está consumindo a cota?"

### Por IP

Funciona antes da autenticação, mas IP não equivale a pessoa. Empresas e operadoras colocam muita gente atrás do mesmo endereço. Um atacante também pode distribuir tráfego entre vários IPs.

Confie em `request.ip` apenas com proxies confiáveis configurados. Não leia `X-Forwarded-For` diretamente: o cliente pode falsificar o cabeçalho. Revise `config.action_dispatch.trusted_proxies` para sua infraestrutura.

### Por usuário ou conta

Depois da autenticação, `user_id` representa melhor o consumidor. Em B2B, a cota pode pertencer à organização, então use `account_id` ou `organization_id`.

Para chave de API, use o ID público da credencial ou um fingerprint. Não coloque o segredo puro no cache nem nos logs.

**Quando usar:**

```text
IP + login         -> reduz tentativa automatizada
usuário + busca    -> protege endpoint caro
organização + API  -> aplica a cota contratada
IP + limite global -> contém cliente anônimo com bug
```

Em login, limitar só pelo e-mail permite negar acesso à vítima: o atacante consome a cota dela. Limitar só por IP também é insuficiente. Combine regras e calibre para evitar falso positivo.

**Na entrevista:**
> "Antes do login eu tenho IP e dados do request. Depois, prefiro user_id ou account_id. Em endpoint sensível, combino mais de uma regra."

---

## Algoritmos

**O que é:**
O algoritmo decide como contar requisições ao longo do tempo.

### Fixed window

Divide o tempo em janelas fixas, como 100 requests por minuto. É simples, mas permite 100 no fim de um minuto e outros 100 no início do próximo.

### Sliding window

Conta o que ocorreu nos últimos 60 segundos a partir de agora. Evita a fronteira da janela fixa, com maior custo de memória ou uma aproximação por contadores.

### Token bucket

Um balde recebe tokens em taxa constante. Cada request consome um token. Se o balde estiver vazio, o request é rejeitado.

```text
capacidade: 20 tokens
reposição: 5 tokens por segundo
custo: 1 token por request
```

A capacidade permite uma rajada de 20. A reposição limita o uso sustentado a 5 por segundo.

**Quando usar:**

- fixed window: regra simples e barata;
- sliding window: fronteiras mais justas;
- token bucket: rajada pequena com taxa média controlada.

**Na entrevista:**
> "Fixed window é simples, mas duplica a rajada na virada. Sliding window suaviza a fronteira. Token bucket aceita uma rajada limitada e controla a média."

---

## Rack::Attack no Rails 7.1

**O que é:**
`rack-attack` é uma gem de middleware para throttle e bloqueio de requests Rack. Em Rails 7.1, é uma escolha comum para rejeitar o request antes do controller.

**Como funciona:**

```ruby
# Gemfile
gem "rack-attack"
```

```ruby
# config/application.rb
config.middleware.use Rack::Attack
```

Confirme que o middleware aparece na stack da app. Depois, crie as regras:

```ruby
# config/initializers/rack_attack.rb
class Rack::Attack
  throttle("api/ip", limit: 60, period: 1.minute) do |request|
    request.ip if request.path.start_with?("/api/")
  end

  self.throttled_responder = lambda do |request|
    data = request.env.fetch("rack.attack.match_data")
    retry_after = data[:period] - (data[:epoch_time] % data[:period])

    body = {
      error: "rate_limit_exceeded",
      message: "Muitas requisições. Tente novamente em breve."
    }

    [
      429,
      {
        "Content-Type" => "application/json",
        "Retry-After" => retry_after.to_i.to_s
      },
      [body.to_json]
    ]
  end
end
```

O block de `throttle` devolve a chave discriminadora. Se devolver `nil`, a regra não conta aquele request. Aqui, cada IP tem seu contador para `/api/`.

**Exemplo prático:**

```ruby
throttle("login/ip", limit: 5, period: 1.minute) do |request|
  if request.post? && request.path == "/api/session"
    request.ip
  end
end
```

Para usuário há uma dificuldade: o middleware roda antes do controller, então `current_user` não está automaticamente disponível.

Com Devise/Warden e a ordem correta da stack, você pode encontrar o usuário no ambiente Rack:

```ruby
throttle("api/user", limit: 300, period: 5.minutes) do |request|
  next unless request.path.start_with?("/api/")

  request.env["warden"]&.user&.id
end
```

Isso pode consultar o banco em cada request. Outra opção é limitar por usuário no controller ou em um serviço, depois da autenticação. Você rejeita mais tarde, mas recebe o contexto autenticado de forma explícita.

Teste que a cota aceita requests até o limite, bloqueia o próximo, expira e mantém identidades independentes. Limpe o cache entre exemplos para evitar teste intermitente.

**Na entrevista:**
> "No Rails 7.1 eu usaria rack-attack. A chave vem do block, o contador fica num cache compartilhado e o responder devolve 429 com Retry-After."

---

## Store compartilhado

**O que é:**
Os contadores precisam de um store. Em produção com várias instâncias, ele deve ser compartilhado. Redis é uma escolha comum.

```ruby
Rack::Attack.cache.store = ActiveSupport::Cache::RedisCacheStore.new(
  url: ENV.fetch("REDIS_URL"),
  namespace: "rack-attack"
)
```

**Como funciona:**
Se quatro processos usam memória local com limite 100, um cliente distribuído pelo load balancer pode chegar perto de 400. Reiniciar um processo também apaga seu contador.

O backend precisa incrementar de forma atômica e expirar chaves. Uma sequência ingênua de `read`, soma e `write` perde atualizações concorrentes.

Decida o comportamento se o store cair:

- fail-open deixa o request passar e preserva disponibilidade;
- fail-closed bloqueia e protege uma operação crítica ou cara.

Não existe resposta universal. Registre a regra acionada, meça respostas 429 e monitore falhas do store sem gravar tokens ou dados sensíveis.

**Na entrevista:**
> "MemoryStore por processo multiplica a cota. Uso um store compartilhado, incremento atômico e defino conscientemente fail-open ou fail-closed."

---

## Rails 8 e rate_limit

**O que é:**
Rails 8 adiciona `rate_limit` ao Action Controller.

```ruby
class Api::ReportsController < ApplicationController
  rate_limit to: 10, within: 1.minute, only: :create

  def create
    # Gera o relatório
  end
end
```

Por padrão, a identidade é baseada no IP. Para usuário autenticado, declare a chave e a resposta:

```ruby
class Api::ExportsController < ApplicationController
  rate_limit to: 5,
    within: 10.minutes,
    by: -> { current_user.id },
    with: -> {
      response.set_header("Retry-After", "600")
      render json: { error: "rate_limit_exceeded" },
        status: :too_many_requests
    },
    only: :create

  def create
    # Agenda a exportação
  end
end
```

**Quando usar:**
No Rails 8, a API é conveniente para regras próximas da action e dependentes de `current_user`. No Rails 7.1, ela não existe; `rack-attack` costuma cobrir rotas de forma centralizada.

Mesmo no Rails 8, você ainda escolhe identidade, store, limite, resposta, política de falha e proteção na borda.

**Na entrevista:**
> "Rails 8 tem rate_limit no controller. Em 7.1 eu usaria rack-attack. Nos dois casos, explico chave, store compartilhado e resposta 429."

---

## Recapitulando

- Rate limiting controla abuso, custo, rajadas e uso injusto.
- Ao exceder a política, responda `429 Too Many Requests`.
- `Retry-After` orienta a próxima tentativa.
- IP funciona antes da autenticação, mas não identifica uma pessoa.
- Depois da autenticação, prefira `user_id`, `account_id` ou ID da chave de API.
- Fixed window é simples; sliding window trata melhor a fronteira.
- Token bucket permite rajada limitada e controla a taxa sustentada.
- Rails 7.1 costuma usar `rack-attack`; Rails 8 oferece `rate_limit`.
- Em produção distribuída, use store compartilhado e incremento atômico.
- Proteja também a borda e monitore respostas 429.

---

## Exercícios práticos

### Exercício 1: Corrigir o contrato HTTP

**Enunciado:** Uma API retorna `403` quando o cliente excede 20 requests por minuto. Corrija a resposta e explique o retry.

<details>
<summary>Solução</summary>

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 30

{"error":"rate_limit_exceeded"}
```

O cliente espera pelo menos 30 segundos e pode adicionar jitter.

**Pontos-chave:**
- `403` é falta de permissão, não excesso temporário
- `429` comunica o limite
- `Retry-After` orienta o cliente
</details>

### Exercício 2: Escolher a chave

**Enunciado:** Escolha identidades para limitar login e exportação de relatório. Explique os riscos.

<details>
<summary>Solução</summary>

No login, combine uma cota por IP com uma regra cuidadosa pelo identificador normalizado da conta. Só e-mail permite negar acesso à vítima; só IP prejudica redes compartilhadas e não contém tráfego distribuído.

Na exportação autenticada, use `user_id` ou `account_id`, conforme quem compartilha a cota. Um limite adicional por IP pode conter automação anormal.

**Pontos-chave:**
- IP é disponível antes da autenticação, mas imperfeito
- depois da autenticação, use identidade estável
- a chave deve refletir a regra de negócio
</details>

### Exercício 3: Corrigir a cota distribuída

**Enunciado:** Quatro instâncias usam `MemoryStore`. O limite é 100 por minuto, mas o cliente chega perto de 400. Explique e corrija.

<details>
<summary>Solução</summary>

Cada processo tem um contador. O load balancer distribui requests e multiplica a cota. Use Redis ou outro store compartilhado:

```ruby
Rack::Attack.cache.store = ActiveSupport::Cache::RedisCacheStore.new(
  url: ENV.fetch("REDIS_URL"),
  namespace: "rack-attack"
)
```

O backend deve incrementar atomicamente e expirar as chaves.

**Pontos-chave:**
- MemoryStore é local ao processo
- múltiplas instâncias multiplicam a cota
- o store de produção precisa ser compartilhado
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
