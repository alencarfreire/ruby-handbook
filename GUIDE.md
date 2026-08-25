# Guia do handbook

Tom e regras do `rails-handbook`. Escreve do zero. Não traduz o php-handbook.

Idioma: **pt-BR de entrevista**. Não é verbete e não é português de manual.

---

## Tom

- **você**, nunca tu
- Frase curta, direta, como no quadro
- Sem “neste presente documento”
- Sem pt-PT: ficheiro, autocarro, descarregar, aplicação (no sentido de app → **app**)
- **Na entrevista** tem que soar falado — o que você diria para o entrevistador

Ruim: “O framework efetua a resolução das dependências via o contentor de serviços.”

Bom: “O Rails instancia o controller. Você pede o model, o Active Record busca.”

---

## Formato de cada tema

1. Título `# N.N Nome`
2. `> **TL;DR**` — um bloco, frases curtas
3. `## Conteúdo` — TOC interno
4. Corpo com os rótulos abaixo
5. `## Recapitulando`
6. `## Exercícios práticos` com **Enunciado:** e `<details><summary>Solução</summary>`
7. Footer: `*Parte do [Ruby/Rails Interview Handbook](/)*`

Não inventar TL;DR se o tema for só exercício (practice).

---

## Rótulos

Usar sempre estes. Não improvisar sinônimo no meio do livro.

- Resumo / TL;DR
- Conteúdo
- O que é
- Como funciona
- Quando usar
- Exemplo prático
- Na entrevista
- Exercícios práticos
- Exercício N
- Enunciado
- Pontos-chave
- Recapitulando
- Importante na entrevista

Labels em negrito no corpo (`**O que é:**`) usam a mesma tabela.

---

## Termos que ficam em inglês

A comunidade BR já fala assim.

Ruby: gem, block, proc, lambda, symbol, mixin, module, yield, Enumerable, duck typing, metaprogramming, monkey patch

Rails: Active Record, Active Job, Action Cable, Action Mailer, Action Controller, route, concern, callback, migration, fixture, factory, strong params, N+1, `includes`, `eager_load`, `preload`

Hotwire: Turbo, Turbo Frame, Turbo Stream, Stimulus

Jobs: Sidekiq, queue, worker, retry, dead set

Testes: RSpec, FactoryBot, request spec, model spec, system spec

Padrões: MVC, SOLID, DRY, REST, DDD, Service Object, Form Object, Query Object, Presenter, Policy

Infra: Docker, Redis, cache, deploy, CI/CD

Primeira ocorrência de termo misto:

`Zeitwerk (autoload do Rails)`

Depois só `Zeitwerk`.

---

## Termos que vão para pt-BR

| Conceito | pt-BR |
|---|---|
| class | classe |
| module (prosa) | module (fica) / módulo só se for “módulo do sistema” |
| inheritance | herança |
| exception | exceção |
| routing | rotas / roteamento |
| authentication | autenticação |
| authorization | autorização |
| encryption | criptografia |
| debugging (prosa) | depurar |
| debugging (ato) | fazer debug |
| repository (git) | repositório |

- controller, não controlador
- middleware, não “software intermediário”
- job / queue, não “trabalho / fila” na primeira menção (fila pode aparecer depois)
- Service Object = padrão; serviço = prosa

---

## Código

Comentário e string em pt-BR. Identificador em inglês.

```ruby
def greet
  "Olá, #{name}!"
end

user.name = "João"
user.email = "joao@email.com"
```

`User`, `greet`, `find_each` ficam. Moeda de exemplo: R$ / centavos / BRL.

---

## Critério de arquivo pronto

1. Código de exemplo roda na cabeça (Ruby 3.3+ / Rails 7.1+)
2. TOC bate com os headings
3. Tom de entrevista, não verbete
4. Uma unidade = um arquivo

---

## O que este livro não é

- Não é tradução do php-handbook
- Não força analogia Laravel → Rails (Service Container / Facade não têm capítulo)
- Não ensina Rails 4
