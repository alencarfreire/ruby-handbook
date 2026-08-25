# 8.7 Coverage

> **TL;DR**
> Coverage mostra quais partes do código rodaram durante os testes. Não mostra se os testes verificam o comportamento certo. Use SimpleCov antes de carregar a app, acompanhe linhas e branches, cubra primeiro o código de maior risco e faça o CI falhar abaixo de um limite combinado. `100%` pode ser só métrica de vaidade: um teste sem expectativa também executa linhas. Na entrevista: coverage ajuda a encontrar pontos cegos, mas coverage não é qualidade.

## Conteúdo

- [O que coverage mede](#o-que-coverage-mede)
- [SimpleCov](#simplecov)
- [Linha versus branch](#linha-versus-branch)
- [100% pode ser uma métrica de vaidade](#100-pode-ser-uma-métrica-de-vaidade)
- [Cubra risco, não linhas](#cubra-risco-não-linhas)
- [Threshold no CI](#threshold-no-ci)
- [O que não contar](#o-que-não-contar)
- [Na entrevista](#na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que coverage mede

**O que é:**
Coverage é uma medida de execução. Ele responde se uma linha ou um caminho condicional rodou durante a suíte.

Ele não responde se o teste fez uma boa verificação.

```ruby
RSpec.describe DiscountCalculator do
  it "calcula o desconto" do
    described_class.call(total_cents: 10_000, vip: true)
  end
end
```

O método pode ter sido executado por inteiro, mas o teste não tem `expect`. Se o resultado mudar de 10% para 90%, ele ainda pode passar.

Coverage também não revela sozinho:

- se os cenários representam a regra de negócio;
- se uma expectativa observa o efeito correto;
- se faltam casos de fronteira;
- se o teste é determinístico;
- se a suíte encontra regressões importantes.

**Importante na entrevista:**
Coverage mede código executado, não comportamento validado. É um sinal sobre a suíte, não uma nota final de qualidade.

---

## SimpleCov

**O que é:**
SimpleCov é a gem mais usada para medir coverage em Ruby. Ela usa a API de coverage do Ruby, agrega os resultados e gera um relatório navegável.

Adicione a gem apenas no ambiente de teste:

```ruby
# Gemfile
group :test do
  gem "simplecov", require: false
end
```

**Como funciona:**
O SimpleCov precisa iniciar **antes** do carregamento do código da app. Caso contrário, arquivos já carregados podem ficar fora da medição.

Com RSpec, coloque no começo de `spec/spec_helper.rb`:

```ruby
require "simplecov"

SimpleCov.start "rails" do
  enable_coverage :branch
  primary_coverage :line
  add_filter "/spec/"
end
```

Garanta que `rails_helper.rb` carregue `spec_helper` antes do ambiente Rails:

```ruby
require "spec_helper"
require File.expand_path("../config/environment", __dir__)
```

Com Minitest, a ordem é a mesma em `test/test_helper.rb`:

```ruby
require "simplecov"
SimpleCov.start("rails") { enable_coverage :branch }

ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"
```

Rode `bundle exec rspec` ou `bin/rails test`. O relatório HTML costuma ficar em `coverage/index.html`; adicione `/coverage/` ao `.gitignore`.

**Quando usar:**
Use localmente para investigar lacunas e no CI para evitar regressão do piso combinado.

---

## Linha versus branch

**O que é:**
Line coverage mede quantas linhas executáveis rodaram. Branch coverage mede os caminhos possíveis de decisões como `if`, `unless`, ternário e `case`.

```ruby
class ShippingCalculator
  def self.call(total_cents:)
    return 0 if total_cents >= 20_000

    1_500
  end
end
```

Um teste com `total_cents: 25_000` percorre o retorno antecipado. Ele não prova o preço abaixo de R$ 200.

Para cobrir os dois caminhos relevantes:

```ruby
RSpec.describe ShippingCalculator do
  it "dá frete grátis a partir de R$ 200" do
    expect(described_class.call(total_cents: 20_000)).to eq(0)
  end

  it "cobra frete abaixo de R$ 200" do
    expect(described_class.call(total_cents: 19_999)).to eq(1_500)
  end
end
```

O segundo teste não existe só para pintar o relatório de verde. Ele cruza a fronteira da regra.

Veja outro caso:

```ruby
def allowed?(user, order)
  user.admin? || order.user_id == user.id
end
```

Executar a linha uma vez pode gerar line coverage. Ainda faltam perguntas: admin acessa pedido alheio? Dono acessa o próprio? Usuário comum é bloqueado?

**Importante na entrevista:**
Line coverage pergunta “a linha rodou?”. Branch coverage pergunta “cada saída da decisão rodou?”. Nenhuma garante que a expectativa esteja correta.

---

## 100% pode ser uma métrica de vaidade

Buscar `100%` como objetivo isolado incentiva testes ruins:

- chamar um método sem verificar o resultado;
- testar delegações triviais só para subir o percentual;
- excluir arquivos difíceis para preservar o número;
- repetir a implementação na expectativa;
- ignorar branches porque as linhas já estão verdes.

```ruby
it "processa o pagamento" do
  PaymentProcessor.call(order)
  expect(order).to be_present
end
```

Esse teste não verifica cobrança, status, idempotência nem falha do gateway. Pode aumentar coverage sem proteger a regra.

Isso não torna `100%` proibido. Em uma biblioteca pequena ou módulo crítico, pode ser viável. O erro é tratar o número como prova automática de qualidade.

**Na entrevista:**
> "Eu não uso 100% como objetivo isolado. Coverage encontra código não exercitado, mas uma linha coberta pode ter uma expectativa fraca. Priorizo risco e uso o percentual como guardrail."

---

## Cubra risco, não linhas

**Como funciona:**
Priorize comportamentos cuja falha tem maior probabilidade ou impacto. Normalmente merecem cobertura forte:

- autenticação e autorização;
- cobrança, reembolso e arredondamento;
- transações e consistência de dados;
- jobs com retry e idempotência;
- integrações externas e seus erros;
- mudanças de status;
- dados pessoais;
- código que já causou incidente.

Para um cupom, pense em válido, expirado, inexistente, limite atingido, valor mínimo e uso concorrente. O relatório ajuda a encontrar um caminho ausente; o domínio decide se ele importa.

**Quando usar:**
No legado, não tente elevar todos os arquivos de uma vez. Proteja primeiro o que pode perder dinheiro, dados ou confiança do usuário.

Uma sequência prática:

1. identifique os fluxos críticos;
2. teste sucesso, falha e fronteira;
3. abra o relatório;
4. investigue lacunas relevantes;
5. suba o threshold aos poucos.

---

## Threshold no CI

**O que é:**
Threshold é o limite mínimo aceito. Abaixo dele, o SimpleCov termina com status de erro e o job do CI deve falhar.

```ruby
SimpleCov.start "rails" do
  enable_coverage :branch
  primary_coverage :line

  minimum_coverage line: 85, branch: 70
  minimum_coverage_by_file line: 60, branch: 40

  add_filter "/spec/"
end
```

O limite global evita queda na cobertura combinada. O limite por arquivo impede que um arquivo em `0%` fique escondido pela média dos demais.

Os números são exemplos, não um padrão universal. Em legado com `42%`, configurar `90%` no primeiro dia só deixa o CI permanentemente vermelho.

Uma adoção melhor:

1. meça a base atual;
2. configure o piso próximo do valor real;
3. impeça novas quedas;
4. cubra os maiores riscos;
5. aumente o limite deliberadamente.

Também é possível restringir a queda em relação à execução anterior:

```ruby
SimpleCov.start "rails" do
  enable_coverage :branch
  maximum_coverage_drop line: 0.5, branch: 1.0
end
```

O threshold absoluto define o piso; o limite de queda detecta regressão. No CI, executar `bundle exec rspec` basta: se o mínimo não for atingido, o comando falha.

**Importante na entrevista:**
Não escolha um número para impressionar. Explique como ele evita regressão e como a equipe aumenta o piso sem bloquear todo o desenvolvimento.

---

## O que não contar

**O que é:**
O denominador deve representar código mantido pela equipe e cujo comportamento vale testar.

Normalmente faz sentido excluir:

- testes e helpers de teste;
- código de gems em `vendor/`;
- arquivos gerados e artefatos de build;
- configuração declarativa sem lógica relevante;
- `db/schema.rb`.

```ruby
SimpleCov.start "rails" do
  enable_coverage :branch
  add_filter "/spec/"
  add_filter "/vendor/"
  add_filter "/db/schema.rb"
end
```

Não exclua um arquivo só porque ele derruba o percentual. Se é código da equipe, tem regra e pode quebrar, a dificuldade de teste é um sinal sobre o design.

### E as views?

Contar templates é opcional. ERB mistura HTML e Ruby, e a medição nem sempre gera um sinal tão útil quanto em classes Ruby.

Você pode deixar views fora do denominador e testar o resultado com request specs ou system specs. Se houver lógica complexa, mova-a para presenter, helper, policy ou outro objeto adequado e testável.

Mesmo sem contar ERB, verifique botão condicionado à autorização, mensagens de erro, estado vazio, campos do formulário e o fluxo principal no navegador.

**Na entrevista:**
> "Eu excluo código gerado e dependências, não código difícil por conveniência. Views são opcionais no denominador, mas continuo testando seu comportamento com request ou system specs."

---

## Na entrevista

Pergunta comum: “Coverage alto significa uma suíte de qualidade?”

> "Não. Coverage mostra que o código foi executado, não que foi verificado corretamente. Eu olho line e branch coverage para encontrar pontos cegos, priorizo regras de maior risco e coloco um threshold no CI. O objetivo é confiança no comportamento, não chegar a 100% por vaidade."

Se pedirem um exemplo, cite o teste sem expectativa. Ele pode executar todas as linhas e não provar nada sobre o resultado.

O ponto central é: **coverage ≠ qualidade**.

Coverage baixo alerta sobre pontos cegos. Coverage alto evidencia execução. Qualidade exige boas expectativas, cenários relevantes e testes confiáveis.

---

## Recapitulando

- SimpleCov deve iniciar antes de carregar a app.
- Line coverage mede linhas; branch coverage mede caminhos de decisões.
- Uma linha coberta pode ter uma expectativa inútil.
- `100%` não prova qualidade e pode virar métrica de vaidade.
- Cubra primeiro dinheiro, autorização, dados e integrações.
- Faça o CI falhar abaixo de um threshold realista.
- Exclua código gerado e dependências, não código difícil por conveniência.
- Contar views é opcional; testar seu comportamento não é.
- Na entrevista: coverage encontra lacunas, mas coverage não é qualidade.

---

## Exercícios práticos

### Exercício 1: Linha coberta, branch ausente

**Enunciado:** Um único teste usa `total_cents: 12_000` e `vip: true`. Quais caminhos faltam? Escreva os testes.

```ruby
def self.call(total_cents:, vip:)
  return 0 if total_cents < 10_000
  vip ? 20 : 10
end
```

<details>
<summary>Solução</summary>

Faltam o pedido abaixo do mínimo e o cliente não VIP. Vale testar a fronteira exata.

```ruby
it "não dá desconto abaixo de R$ 100" do
  expect(described_class.call(total_cents: 9_999, vip: true)).to eq(0)
end

it "dá 20% para VIP na fronteira" do
  expect(described_class.call(total_cents: 10_000, vip: true)).to eq(20)
end

it "dá 10% para cliente comum" do
  expect(described_class.call(total_cents: 10_000, vip: false)).to eq(10)
end
```

**Pontos-chave:**
- Line coverage pode esconder saídas não exercitadas.
- Branch coverage expõe o retorno antecipado e o ternário.
- `9_999` e `10_000` verificam a fronteira.
</details>

### Exercício 2: Threshold no legado

**Enunciado:** Uma app tem `58%` de linhas e `31%` de branches. Proponha uma configuração inicial que evite quedas sem bloquear todos os pull requests.

<details>
<summary>Solução</summary>

```ruby
SimpleCov.start "rails" do
  enable_coverage :branch
  minimum_coverage line: 58, branch: 31
  maximum_coverage_drop line: 0.5, branch: 1.0
  add_filter "/spec/"
end
```

Comece na base real, cubra primeiro autorização, pagamentos e incidentes conhecidos, depois suba o piso em passos pequenos.

**Pontos-chave:**
- Threshold impossível vira ruído.
- O CI deve falhar quando o piso não for atingido.
- Números não devem ser reduzidos só para fazer o CI passar.
</details>

### Exercício 3: Coverage é qualidade?

**Enunciado:** Responda em até quatro frases: “Nossa suíte tem 100% de coverage, então quase não temos bugs”. Cite uma decisão sobre views.

<details>
<summary>Solução</summary>

> "100% prova que as linhas instrumentadas rodaram, não que os testes validaram o comportamento correto. Um teste sem expectativa aumenta o número e ainda deixa bugs passarem. Eu uso line e branch coverage como mapa de risco e mantenho um threshold no CI. Views podem ficar fora do denominador, mas testo seus comportamentos com request e system specs."

**Pontos-chave:**
- Coverage é evidência de execução.
- Qualidade depende das expectativas e dos cenários.
- Views opcionais no cálculo não significa views sem teste.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
