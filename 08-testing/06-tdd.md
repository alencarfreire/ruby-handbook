# 8.6 TDD

> **TL;DR**
> TDD é um ciclo de feedback: escreva um teste que falha, implemente o mínimo para passar e melhore o código sem quebrar o comportamento. Em Rails, ele costuma render mais nas regras de domínio do que em CRUD gerado e telas exploratórias. Outside-in começa pelo comportamento visível e desce para os colaboradores. Inside-out começa nas peças do domínio e sobe até a integração. Na entrevista, mostre que você usa TDD para reduzir incerteza, não como ritual.

## Conteúdo

- [O que é TDD](#o-que-é-tdd)
- [Red, green, refactor](#red-green-refactor)
- [Exemplo prático](#exemplo-prático)
- [Outside-in](#outside-in)
- [Inside-out](#inside-out)
- [Como escolher](#como-escolher)
- [Quando TDD ajuda em Rails](#quando-tdd-ajuda-em-rails)
- [Quando TDD não compensa](#quando-tdd-não-compensa)
- [Armadilhas comuns](#armadilhas-comuns)
- [Kent Beck, em poucas palavras](#kent-beck-em-poucas-palavras)
- [Na entrevista](#na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que é TDD

**O que é:**
TDD, ou Test-Driven Development, é desenvolver em ciclos curtos guiados por exemplos executáveis.

Você escolhe um comportamento pequeno, vê o teste falhar, faz passar e reorganiza o código.
O teste vem antes da implementação daquele comportamento.

TDD não significa apenas “ter testes”.
Uma equipe pode testar depois e ter ótima cobertura sem praticar TDD.
Também não significa testar cada método privado.
O foco é comportamento observável.

```text
Red -> Green -> Refactor -> próximo comportamento
```

O ciclo responde três perguntas:

1. O teste falha pelo motivo esperado?
2. A implementação atende ao exemplo?
3. O código pode ficar mais simples sem mudar o resultado?

**Importante na entrevista:**
> “TDD é uma técnica de desenvolvimento, não sinônimo de suíte de testes. Eu uso ciclos pequenos para descobrir uma API e receber feedback cedo.”

---

## Red, green, refactor

### Red

Escreva o menor exemplo do próximo comportamento.
Execute e confirme a falha.

A falha prova que o teste detecta a ausência da regra.
Ela evita o falso positivo de um teste que já nasce verde.

```ruby
RSpec.describe ShippingQuote do
  it "oferece frete grátis a partir de R$ 200" do
    quote = described_class.new(subtotal_cents: 20_000)

    expect(quote.price_cents).to eq(0)
  end
end
```

Uma boa falha é específica.
Se você esperava diferença de valor e recebeu `NameError`, avance até a expectativa mostrar a regra ausente.

### Green

Implemente o suficiente para o exemplo passar.
Não tente prever todas as regras futuras.

```ruby
class ShippingQuote
  def initialize(subtotal_cents:)
    @subtotal_cents = subtotal_cents
  end

  def price_cents
    0
  end
end
```

Retornar `0` parece simplista, mas o primeiro exemplo ainda não exige outra resposta.
O próximo caso força a generalização:

```ruby
it "cobra R$ 15 abaixo de R$ 200" do
  quote = described_class.new(subtotal_cents: 19_999)

  expect(quote.price_cents).to eq(1_500)
end
```

Agora o método pode usar a condição:

```ruby
def price_cents
  @subtotal_cents >= 20_000 ? 0 : 1_500
end
```

### Refactor

Com tudo verde, melhore nomes, remova duplicação e ajuste responsabilidades.
Não adicione comportamento novo nessa etapa.

```ruby
class ShippingQuote
  FREE_THRESHOLD_CENTS = 20_000
  STANDARD_PRICE_CENTS = 1_500

  def initialize(subtotal_cents:)
    @subtotal_cents = subtotal_cents
  end

  def price_cents
    @subtotal_cents >= FREE_THRESHOLD_CENTS ? 0 : STANDARD_PRICE_CENTS
  end
end
```

O teste protege o contrato durante a mudança.
Passos pequenos deixam a causa da falha evidente.

---

## Exemplo prático

Um cliente premium recebe 10% de desconto no pedido.
Essa regra tem entrada, saída e casos de borda claros: boa candidata a TDD.

Primeiro exemplo:

```ruby
RSpec.describe OrderPricing do
  it "aplica 10% de desconto ao cliente premium" do
    pricing = described_class.new(subtotal_cents: 10_000, premium: true)

    expect(pricing.total_cents).to eq(9_000)
  end
end
```

Depois do red, implemente o cálculo mínimo.
O segundo exemplo espera `10_000` para um cliente comum e força a condição entre os dois comportamentos.

Um caso com `999` centavos força o time a definir o arredondamento.
O teste também serve para esclarecer uma decisão de domínio.

Depois, integre a classe ao fluxo do Rails.
Não é obrigatório extrair uma classe no primeiro teste: você pode começar no model e extrair quando a responsabilidade ficar clara.
TDD não exige Service Object para toda regra.

---

## Outside-in

**O que é:**
Outside-in começa na fronteira que entrega valor ao usuário.
Em Rails, pode ser um request spec ou system spec.
Depois você desce para objetos menores conforme descobre responsabilidades.

```ruby
RSpec.describe "Checkout", type: :request do
  it "confirma o total com desconto premium" do
    customer = create(:customer, premium: true)
    order = create(:order, customer:, subtotal_cents: 10_000)

    post order_checkout_path(order)

    expect(response).to have_http_status(:ok)
    expect(response.body).to include("R$ 90,00")
  end
end
```

Esse teste define o resultado externo.
Para fazê-lo passar, você pode descobrir que precisa de uma política de preço e criar exemplos menores para ela.

**Quando usar:**

- O fluxo de negócio está claro para quem usa.
- O risco maior está na integração entre camadas.
- A API HTTP é parte importante do contrato.
- Você quer evitar objetos sem necessidade real.

O custo é ter feedback mais lento e falhas com mais causas possíveis.
Outside-in não significa concentrar todas as regras no request spec.
O teste externo guia o fluxo; testes focados detalham o domínio.

---

## Inside-out

**O que é:**
Inside-out começa no núcleo da regra.
Você desenvolve objetos pequenos e depois os conecta ao model, controller ou job.

No exemplo anterior, você começaria por `OrderPricing`.
Quando a regra estivesse clara, ligaria o cálculo ao `Order` e cobriria a integração necessária.

**Quando usar:**

- A complexidade está no cálculo ou na política.
- Entradas e saídas são fáceis de expressar.
- A fronteira HTTP ainda pode mudar.
- Você quer feedback rápido sem subir a stack do Rails.

Falhas ficam localizadas e casos de borda ficam baratos.
Por outro lado, você pode criar uma abstração que o fluxo real não pede.
As peças também podem funcionar sozinhas e falhar integradas.

Por isso, inside-out ainda precisa de algum teste na fronteira.
Um exemplo de integração pode provar a conexão sem duplicar todos os casos.

---

## Como escolher

Não transforme outside-in versus inside-out em disputa religiosa.
Pergunte onde está a maior incerteza.

| Incerteza principal | Ponto de partida provável |
|---|---|
| Fluxo HTTP e integração | Outside-in |
| Regra de preço ou elegibilidade | Inside-out |
| Jornada entre várias telas | Outside-in |
| Algoritmo com casos de borda | Inside-out |
| Contrato externo já definido | Outside-in |
| Domínio conhecido, interface instável | Inside-out |

Você pode alternar:

1. Um request spec falha.
2. Um teste de domínio descreve a regra ausente.
3. A unidade fica verde.
4. O request spec fica verde.
5. Você refatora com os dois níveis protegendo decisões diferentes.

**Na entrevista:**
> “Eu começo onde o risco está. Outside-in para validar o fluxo; inside-out quando a incerteza é uma regra de domínio. Muitas vezes combino os dois sem repetir todos os casos.”

---

## Quando TDD ajuda em Rails

TDD ajuda quando o próximo comportamento pode ser expresso antes da implementação.
No Rails, isso aparece muito no domínio:

- cálculo de preço, taxa, comissão e desconto;
- elegibilidade para plano, benefício ou reembolso;
- transições de estado de pedido ou assinatura;
- regras de limite, prazo e disponibilidade;
- autorização com combinações de papéis e recursos;
- transformação de dados com casos de borda;
- correção de bug reproduzível.

Para bug, escreva um teste que reproduz o erro, confirme o red, corrija a causa e mantenha o exemplo como proteção de regressão.

TDD também evidencia acoplamento.
Se uma regra simples exige dez records, callbacks e uma API, o teste mostra uma dificuldade de design.
Separe apenas a responsabilidade que precisa de feedback isolado.

---

## Quando TDD não compensa

TDD tem custo.
Se a incerteza não está no comportamento do código, escrever o teste primeiro pode não ajudar.

CRUD gerado é o exemplo clássico.
Uma tela administrativa que apenas cria, lista, edita e remove um model já usa convenções bem conhecidas do Rails.
Dirigir expectativa por expectativa costuma repetir o framework.

Concentre testes no que é seu:

- autorização;
- validação de negócio;
- efeito colateral;
- contrato relevante;
- erro que precisa de regressão.

TDD também pode render pouco em protótipo descartável, ajuste visual, exploração de gem, spike técnico e configuração sem lógica própria.
Explore primeiro; quando o comportamento ficar claro, estabilize a parte importante com testes.

“Não usar TDD” não significa “não testar”.
Você pode testar depois, validar manualmente ou escolher cobertura proporcional ao risco.

---

## Armadilhas comuns

- **Escrever testes em lote:** cria muitas suposições. Prefira um comportamento por ciclo.
- **Pular o red:** um teste que nasce verde pode não observar o que você imagina.
- **Permanecer no green ruim:** código mínimo é temporário; depois melhore a estrutura.
- **Testar implementação:** expectativas sobre detalhes internos quebram em refactors seguros.
- **Mockar o domínio inteiro:** o teste vira um roteiro de chamadas, não uma prova de resultado.
- **Usar banco para toda regra:** prefira objetos Ruby quando persistência não faz parte do comportamento.

---

## Kent Beck, em poucas palavras

Kent Beck popularizou a forma moderna de TDD no contexto de Extreme Programming.
Ele descreveu passos pequenos, testes automatizados e refatoração contínua.

A ideia não é escrever a solução perfeita de primeira.
É reduzir o intervalo entre uma decisão e o feedback sobre ela: faça funcionar, faça direito e faça rápido apenas se necessário.

---

## Na entrevista

Uma resposta madura conecta a técnica ao risco, sem vender obrigação:

> “Eu pratico TDD principalmente em regras de domínio e bugs reproduzíveis. Faço red, green e refactor em passos pequenos. Posso começar outside-in por um request spec ou inside-out por um objeto de domínio. Para CRUD gerado e exploração visual, não forço TDD; testo o que tem risco real.”

Se pedirem um exemplo, use preço, cancelamento ou transição de estado.
Se perguntarem sobre design, diga que TDD pressiona por interfaces testáveis, mas não garante bom design sozinho.

---

## Recapitulando

- TDD é desenvolvimento guiado por feedback, não sinônimo de cobertura.
- Red prova que o teste detecta o comportamento ausente.
- Green entrega o mínimo para o exemplo passar.
- Refactor melhora a estrutura com a suíte verde.
- Outside-in parte do comportamento externo e desce para colaboradores.
- Inside-out parte da regra e sobe até a integração.
- Em Rails, TDD costuma ajudar mais em domínio, bugs e casos de borda.
- CRUD gerado e exploração visual raramente justificam o ritual completo.
- Use TDD de forma proporcional ao risco.

---

## Exercícios práticos

### Exercício 1: Dirija uma regra de frete

**Enunciado:** Um pedido tem frete grátis a partir de R$ 200,00. Abaixo disso, custa R$ 15,00. Descreva os ciclos para implementar `ShippingQuote#price_cents`.

<details>
<summary>Solução</summary>
Comece esperando `0` para `20_000` centavos e veja falhar.
Implemente o mínimo; depois espere `1_500` para `19_999` e generalize. Com tudo verde, extraia constantes se ajudarem.
**Pontos-chave:**
- O limite está explícito.
- Cada teste adiciona um comportamento.
- A abstração aparece no refactor.
</details>

### Exercício 2: Escolha a direção

**Enunciado:** Uma regra de reembolso tem oito combinações de prazo, status e forma de pagamento. A tela ainda será redesenhada. Você começa outside-in ou inside-out?

<details>
<summary>Solução</summary>
Inside-out é um bom começo porque a incerteza está na política e a interface é instável.
Crie exemplos para `RefundPolicy`. Depois mantenha um request spec para provar que o endpoint a usa, sem repetir as oito combinações.
**Pontos-chave:**
- O nível acompanha a fonte de risco.
- Testes focados barateiam os casos de borda.
- Um teste externo cobre a conexão.
</details>

### Exercício 3: TDD no CRUD

**Enunciado:** Um admin gerado cadastra categorias com apenas `name`. Você faria TDD para cada action do controller? Proponha uma estratégia proporcional.

<details>
<summary>Solução</summary>
Não é necessário dirigir cada action convencional.
Teste validação se for requisito, o caminho crítico e a autorização. Regras futuras justificam ciclos próprios.
**Pontos-chave:**
- Convenção e baixo risco permitem menos testes.
- Regra própria e autorização merecem atenção.
- TDD não é uma meta de cobertura.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
