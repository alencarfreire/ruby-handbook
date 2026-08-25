# 8.5 Mocks e stubs

> **TL;DR**
> Stub controla a resposta de um colaborador. Mock verifica se uma interação aconteceu. Em RSpec, `allow(...).to receive(...)` prepara comportamento; `expect(...).to receive(...)` cria uma expectativa obrigatória. Prefira `instance_double` a `double`: o verifying double confere a interface real. Não simule Active Record para provar query, validation ou callback. Se o teste quebra quando você só reorganiza o código, provavelmente está testando implementação.

## Conteúdo

- [Stub vs mock](#stub-vs-mock)
- [`allow` e `receive`](#allow-e-receive)
- [`expect(...).to receive`](#expectto-receive)
- [`double` vs `instance_double`](#double-vs-instance_double)
- [Verifying doubles](#verifying-doubles)
- [Não faça mock de Active Record](#não-faça-mock-de-active-record)
- [Quando mock é um cheiro](#quando-mock-é-um-cheiro)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Stub vs mock

**O que é:**
Stub e mock são test doubles: objetos usados no lugar de um colaborador real durante o teste.

| Técnica | Pergunta principal |
|---|---|
| Stub | “Se o colaborador responder X, qual será o resultado?” |
| Mock | “O colaborador recebeu a mensagem esperada?” |

Stub fornece uma resposta controlada. Mock estabelece uma expectativa de interação. O mesmo double pode cumprir os dois papéis; o que muda é a verificação.

**Como funciona:**

```ruby
result = instance_double(
  PaymentResult,
  success?: true,
  transaction_id: "tx_123"
)
gateway = instance_double(PaymentGateway)
allow(gateway).to receive(:charge).and_return(result)

transaction_id = Checkout.new(gateway: gateway).call(
  amount_cents: 12_900,
  token: "tok_123"
)

expect(transaction_id).to eq("tx_123")
```

O gateway é stub: sua resposta prepara o cenário. Se o teste usasse `expect(gateway).to receive(:charge)`, ele verificaria a interação como mock.

**Quando usar:**
- Stub: timeout, erro raro, relógio ou resposta de API externa.
- Mock: envio de e-mail, publicação de evento ou cobrança no gateway.

**Na entrevista:**
> “Stub define o que o colaborador devolve. Mock verifica a mensagem recebida. Eu prefiro verificar resultado; verifico interação quando ela é o comportamento relevante.”

---

## `allow` e `receive`

**O que é:**
`allow(objeto).to receive(:metodo)` intercepta um método durante o exemplo.

```ruby
allow(gateway).to receive(:charge).and_return(result)
```

Isso não exige que `charge` seja chamado. Se nenhuma chamada acontecer, essa configuração não falha por si só.

**Como funciona:**

```ruby
# Restringe os argumentos
allow(gateway).to receive(:charge)
  .with(amount_cents: 5_000, token: "tok_ok")
  .and_return(approved_result)

# Simula uma falha externa
allow(client).to receive(:fetch)
  .and_raise(Timeout::Error, "tempo esgotado")
```

Stub parcial altera um método de um objeto real:

```ruby
allow(SecureRandom).to receive(:uuid).and_return("uuid-fixo")
```

**Importante na entrevista:**
Quanto mais genérico o stub, mais bugs ele pode esconder. Quando os argumentos fazem parte do cenário, use `with`.

---

## `expect(...).to receive`

**O que é:**
`expect(objeto).to receive(:metodo)` registra uma expectativa antes da execução. O exemplo falha se a mensagem não chegar.

```ruby
expect(gateway).to receive(:charge).with(
  amount_cents: 12_900,
  token: "tok_123"
).once.and_return(result)

Checkout.new(gateway: gateway).call(
  amount_cents: 12_900,
  token: "tok_123"
)
```

Por padrão, `receive` espera uma chamada. Você pode usar `once`, `twice`, `at_least` e `ordered`. Só exija ordem se ela fizer parte do contrato.

**Como funciona:**
A expectativa precisa vir antes da chamada:

```ruby
expect(gateway).to receive(:charge).and_return(result)
service.call
```

Se `service.call` vier antes da expectativa, a chamada já passou e não será capturada.

Se preferir executar e verificar depois, use um spy:

```ruby
allow(gateway).to receive(:charge).and_return(result)

service.call

expect(gateway).to have_received(:charge).with(
  amount_cents: 12_900,
  token: "tok_123"
)
```

**Quando usar:**
- quando deixar de chamar o colaborador seria um bug visível;
- para garantir publicação de evento ou chamada ao gateway;
- para impedir uma notificação duplicada com `once`.

Não use para provar que um método privado chamou outro método privado.

**Na entrevista:**
> “`expect(...).to receive` vem antes da execução. Para verificar depois, preparo com `allow` e uso `have_received`.”

---

## `double` vs `instance_double`

**O que é:**
`double` aceita a interface que o teste inventar:

```ruby
gateway = double("Gateway", aproove: true)
```

O typo passa mesmo que nenhum objeto real tenha `aproove`.

`instance_double` verifica a interface de instâncias de uma classe real:

```ruby
gateway = instance_double(PaymentGateway)
allow(gateway).to receive(:charge).and_return(result)
```

Se `PaymentGateway` não define `charge`, o RSpec falha ao configurar o double. Ele também verifica se a chamada respeita a assinatura disponível.

**Como funciona:**
Se `PaymentGateway` define `charge(amount_cents:, token:)`, o double aceita essa chamada. Configurar `refund` ou omitir um keyword argument obrigatório falha.

Prefira passar a constante, não uma string. Assim, nomes de classe errados aparecem cedo.

**Quando usar:**
- `instance_double`: colaborador representado por uma instância.
- `class_double`: API chamada diretamente na classe.
- `object_double`: interface de um objeto específico.
- `double`: objeto sem contraparte real, usado com parcimônia.

**Na entrevista:**
> “Eu prefiro `instance_double` porque ele verifica a interface real. `double` puro pode deixar um typo ou uma refatoração quebrada passar.”

---

## Verifying doubles

**O que é:**
`instance_double`, `class_double` e `object_double` são verifying doubles. Eles conferem se o colaborador real responde à interface simulada.

Sem essa verificação, o teste pode continuar verde depois que `charge` for renomeado para `authorize`.

**Como funciona:**

```ruby
gateway = instance_double(PaymentGateway)
allow(gateway).to receive(:charge).and_return(approved_result)
# Falha se PaymentGateway não tiver mais charge
```

O RSpec também pode verificar stubs parciais:

```ruby
RSpec.configure do |config|
  config.mock_with :rspec do |mocks|
    mocks.verify_partial_doubles = true
  end
end
```

Com essa opção, `allow(SecureRandom).to receive(:metodo_inexistente)` falha na configuração.

**Importante na entrevista:**
Verifying double confere a interface Ruby. Não prova que a API externa responde, que o JSON tem o formato esperado ou que a query funciona no banco. Você ainda precisa de testes de integração.

---

## Não faça mock de Active Record

**O que é:**
Não simule Active Record para testar comportamento que depende do banco.

```ruby
# RUIM
allow(User).to receive(:active).and_return([user])

result = NewsletterRecipients.call

expect(result).to eq([user])
```

Esse teste não prova que o scope existe, gera SQL correto ou exclui usuários inativos.

Evite também cadeias simuladas:

```ruby
allow(Order).to receive_message_chain(:paid, :recent, :limit)
  .and_return([order])
```

O stub repete a implementação. Mudar a ordem dos scopes quebra o teste mesmo quando o resultado continua certo.

**Como funciona:**
Para scope, validation, association, callback e query, crie registros no banco de teste:

```ruby
RSpec.describe NewsletterRecipients do
  it "retorna apenas usuários ativos" do
    active_user = create(:user, active: true)
    create(:user, active: false)

    expect(described_class.call).to contain_exactly(active_user)
  end
end
```

Não faça stub de `valid?`, `save`, association ou callback para afirmar que o model funciona.

**Quando usar:**
Substitua a fronteira externa chamada pelo código Rails: gateway de pagamento, cliente HTTP, storage remoto ou relógio. O banco da suíte faz parte do comportamento do Active Record.

**Na entrevista:**
> “Eu não mocko Active Record para provar query ou validation. Crio dados mínimos no banco de teste. Faço mock da fronteira externa, não do ORM.”

---

## Quando mock é um cheiro

**O que é:**
Mock vira cheiro quando o teste descreve como o código trabalha, em vez de qual comportamento entrega.

Sinais comuns:
- muitas expectativas de mensagens em um exemplo;
- expectativa sobre métodos privados;
- `receive_message_chain` reproduzindo lógica interna;
- `allow_any_instance_of` alterando todas as instâncias;
- ordem exigida sem necessidade de negócio;
- teste quebrando ao extrair ou renomear método interno;

**Exemplo prático:**

```ruby
# Acoplado à implementação
expect(report).to receive(:load_orders)
expect(report).to receive(:group_by_month)
expect(report).to receive(:format_rows)
report.call

# Focado no comportamento
expect(report.call).to eq([
  { month: "2026-07", total_cents: 35_000 }
])
```

Uma refatoração para uma única query quebra o primeiro teste, mas não deveria quebrar o segundo.

**Como funciona:**
Antes de adicionar um mock, pergunte:

1. Essa interação é relevante para quem usa o objeto?
2. Um teste de resultado seria mais simples?
3. Estou isolando uma fronteira lenta ou não determinística?
4. O double representa uma interface real?
5. Uma refatoração sem mudança de comportamento deveria manter o teste verde?

**Importante na entrevista:**
Mock não é ruim por definição. O problema é verificar cada detalhe interno. Use no limite do sistema e mantenha o contrato pequeno.

---

## Recapitulando

- Stub controla resposta; mock exige interação.
- `allow(...).to receive` não exige que a chamada aconteça.
- `expect(...).to receive` vem antes da execução.
- `have_received` verifica depois como spy.
- Prefira `instance_double` para conferir a interface real.
- Verifying double não substitui integração.
- Não faça mock de Active Record para provar query ou validation.
- Faça mock de fronteiras externas.
- Se uma refatoração interna quebra o teste, revise o acoplamento.

---

## Exercícios práticos

### Exercício 1: Stub ou mock?

**Enunciado:** Teste que `CurrencyQuote` devolve `:unavailable` quando o cliente levanta `Timeout::Error`. Diga qual papel o cliente cumpre.

<details>
<summary>Solução</summary>

```ruby
client = instance_double(ExchangeClient)
allow(client).to receive(:fetch)
  .with("BRL", "USD")
  .and_raise(Timeout::Error)

result = CurrencyQuote.new(client: client).call("BRL", "USD")

expect(result).to eq(:unavailable)
```

O cliente atua como stub: controla a exceção para que o teste verifique o resultado.

**Pontos-chave:**
- `allow` prepara o cenário.
- A API real não é chamada.
- O foco está no resultado.
</details>

### Exercício 2: Use um verifying double

**Enunciado:** Corrija o teste para detectar o typo: `double("Gateway", aproove: true)`.

<details>
<summary>Solução</summary>

```ruby
gateway = instance_double(PaymentGateway)
allow(gateway).to receive(:approve).and_return(true)
```

`PaymentGateway` precisa definir `approve`. Se o método não existir, o RSpec acusa a divergência.

**Pontos-chave:**
- `double` aceita interface inventada.
- `instance_double` verifica métodos de instância.
- A constante ajuda a descobrir erros cedo.
</details>

### Exercício 3: Remova o mock de Active Record

**Enunciado:** Reescreva o teste que usa `allow(User).to receive(:active)` para provar que usuários inativos são excluídos.

<details>
<summary>Solução</summary>

```ruby
active_user = create(:user, active: true)
create(:user, active: false)

result = NewsletterRecipients.call

expect(result).to contain_exactly(active_user)
```

O exemplo usa o banco de teste e exercita o SQL gerado pelo Active Record.

**Pontos-chave:**
- Query é comportamento integrado ao banco.
- O teste verifica resultado, não cadeia de métodos.
- Dados mínimos deixam o cenário explícito.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
