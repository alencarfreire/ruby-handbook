# 8.3 System spec

> **TL;DR**
> System spec testa o app pelo ponto de vista do usuário. Com Capybara, você abre páginas com `visit`, preenche campos com `fill_in` e aciona links ou botões. `rack_test` é rápido, mas não executa JavaScript. Selenium e Cuprite controlam um navegador e cobrem JavaScript, com custo maior. Marque só os cenários que precisam disso com `js: true` e configure o driver correspondente. Mantenha poucos system specs para happy paths valiosos. Status, JSON e muitas variações pertencem ao request spec.

## Conteúdo

- [O que é](#o-que-é)
- [Capybara](#capybara)
- [Navegação e interação](#navegação-e-interação)
- [Asserções e espera](#asserções-e-espera)
- [Drivers](#drivers)
- [JavaScript com js: true](#javascript-com-js-true)
- [System spec ou request spec](#system-spec-ou-request-spec)
- [Na entrevista](#na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que é

**O que é:**
System spec é o teste de mais alto nível no RSpec para um app Rails. Ele percorre a interface como o usuário: entra numa rota, encontra elementos, preenche um formulário e observa o resultado visível.

O foco não é chamar um método do controller nem verificar diretamente o status HTTP. A pergunta é:

> "O usuário consegue concluir este fluxo pela interface?"

Um cenário atravessa várias camadas:

```text
route → controller → model → view → HTML → navegador
```

Com JavaScript, ele também pode atravessar Turbo, Stimulus e código do front-end.

**Como funciona:**
No RSpec Rails, o arquivo fica em `spec/system`:
Capybara dirige a página. O RSpec organiza o cenário e fornece `expect`. O `type: :system` ativa essa integração.

**Quando usar:**
- login pelo formulário;
- checkout principal;
- criação de um registro essencial pela interface;
- interação com Turbo ou Stimulus;
- regressão que só aparece no fluxo completo.

**Importante na entrevista:**
System spec oferece confiança alta, mas é mais lento e tem mais pontos de falha. Você seleciona jornadas críticas; não replica nele toda a matriz de validações.

---

## Capybara

**O que é:**
Capybara é a DSL usada para interagir com páginas. Ela deixa o teste próximo da linguagem da interface e esconde detalhes do driver.

```ruby
visit products_path
click_link "Novo produto"
fill_in "Nome", with: "Café especial"
click_button "Salvar"
```

O mesmo comando pode ser atendido por `rack_test`, Selenium ou Cuprite.

**Como funciona:**
Prefira encontrar elementos pelo que o usuário percebe:

```ruby
fill_in "Nome", with: "Café especial"
click_button "Criar produto"
click_link "Editar"
```

Evite seletores como `.card:nth-child(2) .actions .primary`: eles acoplam o cenário à estrutura do DOM.

Quando houver elementos repetidos, limite o escopo:

```ruby
within("#product_#{product.id}") do
  click_link "Editar"
end
```

Um `data-testid` ajuda quando não existe texto ou papel semântico estável, mas não deve ser a primeira opção.

---

## Navegação e interação

**Como funciona:**
`visit` abre uma rota. Você pode confirmar a navegação pelo path atual:

```ruby
visit product_path(product)
expect(page).to have_current_path(product_path(product))
```

Use a ação que comunica melhor a intenção:

```ruby
click_link "Minha conta"
click_button "Confirmar pedido"
click_on "Continuar" # aceita link ou botão
```

`fill_in` encontra o campo pelo label, `name` ou `id`:

```erb
<%= form.label :email, "E-mail" %>
<%= form.email_field :email %>
```

```ruby
fill_in "E-mail", with: "maria@email.com"
```

O label melhora acessibilidade e torna o teste legível. Para outros campos, Capybara oferece `select`, `check`, `choose` e `attach_file`. O cenário diz o que a pessoa faz; detalhes de implementação ficam fora dele.

---

## Asserções e espera

**Como funciona:**
As matchers de Capybara consultam a página:

```ruby
expect(page).to have_content("Pedido confirmado")
expect(page).to have_link("Ver pedido")
expect(page).to have_button("Cancelar")
expect(page).to have_field("E-mail", with: "joao@email.com")
expect(page).to have_no_content("Pagamento recusado")
```

Prefira essas matchers a inspecionar `page.body` ou `page.text` manualmente.

Capybara tenta encontrar o resultado até o limite de espera configurado. Isso importa quando Turbo ou JavaScript atualiza a página depois do clique:

```ruby
click_button "Adicionar ao carrinho"
expect(page).to have_content("1 item no carrinho")
```

**Importante na entrevista:**
Não coloque `sleep 2` para "estabilizar" o teste. Use matchers com espera e aguarde um efeito visível. `sleep` sempre espera o tempo inteiro e ainda falha se a operação demorar mais.

---

## Drivers

**O que é:**
O driver define como o Capybara acessa o app.

| Driver | Navegador real | JavaScript | Velocidade | Uso típico |
|---|---:|---:|---:|---|
| `rack_test` | não | não | alta | formulário e navegação sem JS |
| Selenium | sim | sim | menor | fluxo real com JS |
| Cuprite | sim, Chrome via CDP | sim | intermediária | JS headless sem WebDriver |

### `rack_test`

`rack_test` envia requests ao app Rack sem abrir Chrome ou Firefox. Ele interpreta formulários e links, mas não executa JavaScript.

```ruby
RSpec.describe "Cadastro de cliente", type: :system do
  before { driven_by :rack_test }

  it "cadastra um cliente" do
    visit new_customer_path
    fill_in "Nome", with: "Ana"
    click_button "Cadastrar"

    expect(page).to have_content("Cliente cadastrado")
  end
end
```

Use quando a página funciona com HTML e submit normal. Ele é rápido, mas não prova que Turbo, Stimulus, eventos ou APIs do browser funcionam.

### Selenium

Selenium controla um navegador por WebDriver. No CI, Chrome headless é comum:

```ruby
before do
  driven_by :selenium, using: :headless_chrome,
                       screen_size: [1400, 1000]
end
```

Use quando o fluxo depende do comportamento real do navegador. Há mais peças envolvidas — browser, driver e servidor — então o teste custa mais e exige um Chrome compatível no CI.

### Cuprite

Cuprite é um driver Capybara baseado em Ferrum. Ele controla Chrome ou Chromium pelo Chrome DevTools Protocol, sem Selenium WebDriver.

```ruby
# Gemfile
group :test do
  gem "cuprite"
end
```

```ruby
before do
  driven_by :cuprite, screen_size: [1400, 1000]
end
```

Cuprite é uma alternativa para JavaScript headless com uma pilha menor. Selenium e Cuprite resolvem a mesma categoria de problema. A escolha depende de compatibilidade, ferramentas de debug, CI e experiência do time.

Trocar de driver não corrige automaticamente um teste flaky. Primeiro investigue espera incorreta, estado compartilhado, seletor frágil e dependência externa.

---

## JavaScript com js: true

**O que é:**
`js: true` é metadata do RSpec. Ela sinaliza que o exemplo precisa de JavaScript.

```ruby
RSpec.describe "Carrinho", type: :system, js: true do
  it "atualiza o total sem recarregar" do
    visit product_path(product)
    click_button "Adicionar ao carrinho"

    expect(page).to have_content("Total: R$ 25,00")
  end
end
```

**Como funciona:**
A metadata sozinha não instala navegador nem escolhe o driver. Associe-a a Selenium ou Cuprite na configuração:

```ruby
# spec/rails_helper.rb
RSpec.configure do |config|
  config.before(:each, type: :system) do
    driven_by :rack_test
  end

  config.before(:each, type: :system, js: true) do
    driven_by :selenium, using: :headless_chrome,
                         screen_size: [1400, 1000]
  end
end
```

Se o projeto usa Cuprite, troque o segundo `driven_by` por `driven_by :cuprite`. Não configure os dois para o mesmo exemplo.

**Quando usar:**
- Turbo Frame substitui parte da página;
- Stimulus abre um modal ou habilita um campo;
- uma busca atualiza resultados sem reload;
- o browser participa do comportamento testado.

Um formulário com submit HTML normal não precisa automaticamente de `js: true`.

---

## System spec ou request spec

**O que é:**
A decisão vem da pergunta respondida pelo teste.

Use system spec para perguntar:

> "O usuário conclui o fluxo pela interface?"

Use request spec para perguntar:

> "Este endpoint responde corretamente a este request?"

| Pergunta | Melhor ponto de partida |
|---|---|
| O usuário entra pela tela? | system spec |
| `POST /sessions` redireciona quando válido? | request spec |
| O endpoint retorna `401` sem token? | request spec |
| O modal abre e confirma a exclusão? | system spec com JS |
| O JSON respeita o contrato? | request spec |
| O happy path do checkout funciona? | system spec |

**Quando usar:**
No system spec, cubra poucos happy paths de alto valor. Um fluxo pode provar que route, formulário, controller, persistência e view estão conectados.

Não leve para ele todas as combinações de nome ausente, e-mail inválido, senha curta e usuário duplicado. Essa matriz fica mais rápida e clara em model specs, specs do objeto responsável ou request specs, conforme a responsabilidade.

Você pode manter um caso de erro importante quando a exibição na interface é parte do contrato. Isso não significa duplicar todas as regras.

**Importante na entrevista:**
Request spec não é um system spec simplificado. Ele testa a fronteira HTTP sem dirigir a interface. System spec não substitui request spec; cobre a integração visível de poucos fluxos críticos.

Uma estratégia prática:

1. Mantenha um happy path por jornada crítica.
2. Use `rack_test` quando JavaScript não participa.
3. Reserve browser com JS para o que depende dele.
4. Prepare diretamente o estado que não é assunto do cenário.
5. Verifique o resultado que o usuário percebe.

Num teste de checkout, crie usuário e carrinho com factories ou objetos de domínio. Não refaça cadastro e login pela tela só para chegar ao ponto inicial.

---

## Na entrevista

Uma resposta forte e curta:

> "Eu uso system spec para poucos fluxos críticos pelo ponto de vista do usuário. Capybara dá `visit`, `fill_in` e cliques. Começo com `rack_test` sem JavaScript. Para Turbo, Stimulus ou outra interação do browser, marco `js: true` e configuro Selenium headless ou Cuprite. A matriz de status e validações fica em request specs e testes mais baratos."

Se perguntarem por flaky tests:

> "Primeiro removo `sleep` e espero um efeito visível com matchers do Capybara. Depois verifico isolamento de dados, seletores frágeis e dependências externas. Aumentar timeout sem achar a causa só mascara o problema."

---

## Recapitulando

- System spec testa uma jornada pela interface.
- Capybara oferece `visit`, `fill_in`, cliques e matchers da página.
- Encontre elementos pela linguagem visível sempre que possível.
- Matchers do Capybara esperam mudanças assíncronas; evite `sleep`.
- `rack_test` é rápido e não executa JavaScript.
- Selenium usa WebDriver; Cuprite usa Chrome DevTools Protocol.
- `js: true` é metadata; a configuração escolhe um driver com JavaScript.
- Use poucos system specs para happy paths críticos.
- Use request specs para a fronteira HTTP, status, JSON e variações.

---

## Exercícios práticos

### Exercício 1: Escolha o driver

**Enunciado:** Escolha o driver para: (a) um formulário HTML que envia e redireciona; (b) um botão Stimulus que abre um modal e atualiza um Turbo Frame. Explique `js: true`.

<details>
<summary>Solução</summary>

No primeiro, use `rack_test`: o comportamento não depende de JavaScript. No segundo, use Selenium ou Cuprite e marque o cenário com `js: true`.

**Pontos-chave:**
- `rack_test` não executa Stimulus ou Turbo no browser.
- Selenium e Cuprite executam JavaScript.
- `js: true` precisa estar ligado ao driver na configuração.
</details>

### Exercício 2: Remova a espera frágil

**Enunciado:** Reescreva o trecho:

```ruby
click_button "Calcular frete"
sleep 2
expect(page.text).to include("Entrega em até 3 dias úteis")
```

<details>
<summary>Solução</summary>

```ruby
click_button "Calcular frete"
expect(page).to have_content("Entrega em até 3 dias úteis")
```

**Pontos-chave:**
- `have_content` usa a espera do Capybara.
- `sleep` pode ser lento e ainda insuficiente.
- Espere o resultado visível da ação.
</details>

### Exercício 3: Divida a responsabilidade

**Enunciado:** A equipe escreveu 25 system specs para cadastro: um happy path e 24 combinações inválidas. Proponha uma divisão sem perder confiança.

<details>
<summary>Solução</summary>

Mantenha o happy path no system spec. Se a exibição de erros for um risco importante, mantenha um caso representativo pela interface. Leve as regras para model specs ou specs do objeto responsável. Use request specs para comportamentos da fronteira HTTP.

**Pontos-chave:**
- System spec cobre poucos fluxos completos.
- Variações ficam em testes rápidos e focados.
- Request spec testa HTTP, não substitui a jornada visual.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
