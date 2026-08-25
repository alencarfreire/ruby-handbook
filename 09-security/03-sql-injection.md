# 9.3 SQL Injection

> **TL;DR**
> SQL injection acontece quando entrada externa deixa de ser um valor e vira parte da estrutura do SQL. O bug clássico em Rails é `where("email = '#{params[:email]}'")`. Use Hash ou bind parameters para valores. Em buscas com `LIKE`, escape `%` e `_` com `sanitize_sql_like` e mantenha o bind. Coluna, direção, fragmento de `ORDER BY` e outras partes estruturais não aceitam bind: escolha opções por allowlist. `Arel.sql` não sanitiza nada; use somente com SQL fixo selecionado por allowlist. Para `limit`, converta para Integer, aplique limites de negócio e passe o número a `limit`.

## Conteúdo

- [O que é SQL injection](#o-que-é-sql-injection)
- [A falha: interpolar no where](#a-falha-interpolar-no-where)
- [Hash e bind parameters](#hash-e-bind-parameters)
- [Busca com LIKE e sanitize_sql_like](#busca-com-like-e-sanitize_sql_like)
- [SQL dinâmico e Arel.sql](#sql-dinâmico-e-arelsql)
- [Ordenação segura](#ordenação-segura)
- [Limite seguro](#limite-seguro)
- [Defesa em profundidade](#defesa-em-profundidade)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## O que é SQL injection

**O que é:**
SQL injection é a alteração de uma consulta por dados que deveriam ser apenas valores.

O problema não é “usar SQL em uma string”. O problema é misturar dado não confiável com a estrutura dessa string.

```ruby
# A intenção é procurar um e-mail.
email = params[:email]

# Mas o valor é colado dentro do comando SQL.
User.where("email = '#{email}'")
```

Se o parâmetro contém aspas e operadores SQL, ele pode mudar o significado da cláusula. O banco não sabe qual trecho veio do programador e qual veio do request. Ele recebe uma única string.

O impacto depende da consulta, do adapter e das permissões do usuário do banco. Pode incluir leitura indevida, bypass de filtro, alteração de dados ou indisponibilidade. Entrada externa não é só `params`: headers, cookies, webhooks, arquivos importados e mensagens de queue também são dados não confiáveis.

**Na entrevista:**
> "SQL injection aparece quando dado vira sintaxe SQL. Eu separo os dois: valor vai por Hash ou bind; estrutura dinâmica passa por allowlist."

Para revisar a composição básica de `Relation`, `where`, `order` e `limit`, veja também [6.3 Query interface](../06-active-record/03-query-interface.md).

---

## A falha: interpolar no where

**Como funciona:**
A versão vulnerável costuma parecer simples e legível:

```ruby
# RUIM — params entra na estrutura SQL
User.where("email = '#{params[:email]}'")

# RUIM — concatenação tem o mesmo problema
Order.where("status = '" + params[:status] + "'")
```

As aspas escritas pelo código não protegem a consulta. Uma aspas recebida no parâmetro pode encerrar o valor e iniciar outra expressão.

Substituições artesanais de aspas e escape de HTML também não ajudam. Uma lista caseira não entende a gramática SQL, e HTML é outro contexto de segurança.

**Importante na entrevista:**
`where(params[:condition])` também é perigoso quando o parâmetro contém uma condição SQL inteira. Não existe interpolação visível, mas a entrada já é a própria estrutura:

```ruby
# RUIM — o request escolhe a cláusula SQL
Order.where(params[:condition])
```

Strong params não sanitizam SQL. Eles controlam quais chaves podem seguir para mass assignment; não tornam uma string segura para uma consulta.

---

## Hash e bind parameters

**Quando usar:**
Use Hash para igualdade e condições que o Active Record representa diretamente.

```ruby
User.find_by(email: params[:email])
Order.where(status: params[:status])
Order.where(id: params[:ids])
Invoice.where(paid_at: nil)
```

O Active Record trata os dados como valores. Ele também faz type casting conforme a coluna.

Arrays em um Hash geram `IN`; `nil` gera `IS NULL`. O Active Record continua fazendo bind dos valores.

Quando você precisa de operador, função ou expressão, use placeholder:

```ruby
Order.where("total_cents >= ?", params[:minimum_cents])
Order.where("created_at >= ?", 30.days.ago)
User.where("email = :email", email: params[:email])
```

O placeholder marca a posição de um **valor**. O adapter envia ou escapa esse valor sem deixá-lo mudar a gramática da consulta.

Não coloque aspas em volta do placeholder: ele já representa o valor completo. Binds também não substituem identificadores nem palavras-chave. Em `Order.order("? DESC", params[:sort])`, o `?` seria um valor literal, não um nome de coluna. Para coluna, tabela, operador e direção, escolha entre opções conhecidas pelo código.

**Na entrevista:**
> "Hash é minha primeira opção para igualdade. Quando preciso de um operador, uso placeholder posicional ou nomeado. Eu nunca adiciono aspas manualmente ao bind."

---

## Busca com LIKE e sanitize_sql_like

**O que é:**
Em `LIKE`, `%` significa qualquer sequência e `_` significa um caractere. Isso não é necessariamente SQL injection, mas pode mudar a semântica e ampliar muito a busca.

Se a pessoa pesquisar por `100%`, normalmente ela quer o texto literal, não “100 seguido de qualquer coisa”.

```ruby
term = params[:query].to_s

# Incompleto — o bind evita injection, mas % e _ ainda são curingas
Product.where("name LIKE ?", "%#{term}%")
```

Escape os curingas e continue usando bind:

```ruby
term = ActiveRecord::Base.sanitize_sql_like(params[:query].to_s)

Product.where("name LIKE ?", "%#{term}%")
```

O bind impede que o valor vire estrutura SQL. `sanitize_sql_like` trata `%` e `_` como texto literal. Os `%` adicionados pelo código mantêm a busca por “contém”.

Não interpole o resultado sanitizado:

```ruby
term = ActiveRecord::Base.sanitize_sql_like(params[:query].to_s)

# RUIM — sanitize_sql_like não substitui bind
Product.where("name LIKE '%#{term}%'")
```

`sanitize_sql_like` escapa curingas de padrão. Ele não foi criado para tornar uma string inteira segura para SQL arbitrário.

**Na entrevista:**
> "No LIKE eu tenho duas preocupações. Bind evita SQL injection; sanitize_sql_like neutraliza os curingas fornecidos pela pessoa. Um não substitui o outro."

---

## SQL dinâmico e Arel.sql

**O que é:**
`Arel.sql` marca uma string como SQL conhecido pelo programador. Ele não escapa, valida nem sanitiza seu conteúdo.

```ruby
# MUITO RUIM — transforma entrada externa em SQL aceito como literal
Order.order(Arel.sql(params[:order]))
```

Use `Arel.sql` somente quando a expressão é fixa no código ou foi escolhida por uma allowlist fechada.

```ruby
SORT_EXPRESSIONS = {
  "recent" => Arel.sql("orders.created_at DESC, orders.id DESC"),
  "pending_first" => Arel.sql(
    "CASE WHEN orders.status = 'pending' THEN 0 ELSE 1 END, orders.id ASC"
  )
}.freeze

sort = SORT_EXPRESSIONS.fetch(params[:sort], SORT_EXPRESSIONS.fetch("recent"))
Order.order(sort)
```

O parâmetro seleciona uma chave. Ele nunca é concatenado ao SQL. Todos os fragmentos possíveis foram escritos e revisados no código.

Para ordenação simples, nem use `Arel.sql`. Símbolos e Hash são mais claros:

```ruby
Order.order(created_at: :desc, id: :desc)
```

Uma regex sobre SQL livre não equivale a uma allowlist. SQL é uma linguagem complexa; selecione fragmentos completos e fixos.

**Importante na entrevista:**
> "Arel.sql é um aviso de confiança, não um sanitizador. Se existe entrada externa, ela escolhe uma chave de allowlist; nunca entra no fragmento."

---

## Ordenação segura

`ORDER BY` é um ponto comum de injection porque coluna e direção fazem parte da estrutura. Elas não podem ser bind parameters.

Mapeie a linguagem da API para identificadores internos:

```ruby
SORT_COLUMNS = {
  "date" => :created_at,
  "total" => :total_cents,
  "status" => :status
}.freeze

SORT_DIRECTIONS = {
  "asc" => :asc,
  "desc" => :desc
}.freeze

column = SORT_COLUMNS.fetch(params[:sort], :created_at)
direction = SORT_DIRECTIONS.fetch(params[:direction], :desc)

Order.order(column => direction)
```

Isso também desacopla o nome público do nome real da coluna. A API pode aceitar `total` sem expor `total_cents`.

Não faça isto:

```ruby
# RUIM — entrada externa dentro de uma expressão estrutural
Order.order(Arel.sql("#{params[:sort]} #{params[:direction]}"))
```

Rails 7.1 rejeita vários argumentos SQL brutos desconhecidos em métodos de consulta. Essa validação ajuda, mas não é a fronteira de segurança do seu código. Chamar `Arel.sql` para silenciar o erro remove justamente essa proteção.

Se uma ordenação exige expressão complexa, combine a allowlist com fragmentos fixos, como na seção anterior. Se exige só coluna e direção, prefira Hash.

**Na entrevista:**
> "Eu não tento bindar ORDER BY. Traduzo sort e direction por allowlists e entrego símbolos ao Active Record."

---

## Limite seguro

O limite também merece tratamento. A falha mais clara aparece quando alguém monta SQL manualmente:

```ruby
# RUIM — o parâmetro é colado no comando
Order.find_by_sql("SELECT * FROM orders LIMIT #{params[:limit]}")
```

Com a query interface, converta a entrada para Integer e aplique uma faixa permitida:

```ruby
requested_limit = Integer(params[:limit], exception: false)
limit = requested_limit&.clamp(1, 100) || 20

Order.order(created_at: :desc).limit(limit)
```

`Integer(..., exception: false)` rejeita texto como `"10 OR 1=1"` sem tentar aproveitá-lo. `clamp` impede zero, negativos e respostas enormes.

O método `limit` passa pela geração SQL do adapter; não o substitua por concatenação manual. Há dois riscos: injection no SQL bruto e abuso de recurso quando um número enorme força leitura e serialização excessivas. Não use `to_i` cegamente: `"abc".to_i` vira `0` e esconde entrada inválida.

**Na entrevista:**
> "No limit eu converto estritamente para Integer, aplico mínimo e máximo e uso o método limit. Isso evita SQL bruto e também controla consumo de recurso."

---

## Defesa em profundidade

Binds e allowlists são a defesa principal no código. Use privilégio mínimo no banco, centralize consultas complexas, teste entradas malformadas e mantenha Rails e o adapter atualizados.

Validação de model não substitui bind. Autorização também não substitui bind. Cada mecanismo responde a uma pergunta diferente.

Não confunda SQL injection com autorização. Uma consulta sem injection ainda pode vazar dados se faltar escopo por conta, organização ou usuário.

**Na entrevista:**
> "Eu começo pela API segura do Active Record, uso allowlist para estrutura dinâmica e mantenho privilégio mínimo no banco. Depois testo os pontos em que params influenciam a consulta."

---

## Recapitulando

- Interpolar ou concatenar entrada em `where` é o bug clássico.
- Hash e placeholders mantêm valores separados da estrutura SQL.
- Strong params não são sanitização de SQL.
- Bind serve para valor, não para coluna, tabela, operador ou direção.
- Em `LIKE`, use `sanitize_sql_like` para `%` e `_` e mantenha o bind.
- `Arel.sql` não sanitiza. Use apenas SQL fixo selecionado por allowlist.
- Ordenação simples deve mapear opções externas para símbolos e direções conhecidas.
- Para `limit`, faça conversão estrita, aplique teto e use a query interface.
- Privilégio mínimo reduz impacto, mas não corrige uma consulta vulnerável.

---

## Exercícios práticos

### Exercício 1: Corrija o filtro vulnerável

**Enunciado:** Corrija a consulta abaixo. Ela deve filtrar pedidos por status e por valor mínimo recebido no request.

```ruby
Order.where(
  "status = '#{params[:status]}' AND total_cents >= #{params[:minimum]}"
)
```

<details>
<summary>Solução</summary>

```ruby
minimum = Integer(params[:minimum], exception: false)

orders = Order.where(status: params[:status])
orders = orders.where("total_cents >= ?", minimum) if minimum
```

O Hash protege o status. O placeholder protege o valor do operador `>=`. A conversão define o contrato esperado para o valor mínimo.

**Pontos-chave:**
- Não interpolar nenhum dos valores
- Preferir Hash quando a condição é igualdade
- Usar bind quando a condição precisa de operador
- Decidir explicitamente o que fazer com número inválido
</details>

### Exercício 2: Busca literal e ordenação

**Enunciado:** Implemente uma busca de produtos por texto. `%` e `_` recebidos devem ser literais. Aceite ordenação pública por `name` ou `price`, com direção `asc` ou `desc`.

<details>
<summary>Solução</summary>

```ruby
columns = {
  "name" => :name,
  "price" => :price_cents
}.freeze

directions = {
  "asc" => :asc,
  "desc" => :desc
}.freeze

term = ActiveRecord::Base.sanitize_sql_like(params[:query].to_s)
column = columns.fetch(params[:sort], :name)
direction = directions.fetch(params[:direction], :asc)

products = Product
  .where("name LIKE ?", "%#{term}%")
  .order(column => direction)
  .limit(50)
```

O termo usa escape de padrão e bind. Coluna e direção são escolhidas por allowlist, porque são estrutura SQL.

**Pontos-chave:**
- `sanitize_sql_like` não substitui placeholder
- A API pública não precisa expor o nome real da coluna
- Não há motivo para usar `Arel.sql` nessa ordenação simples
</details>

### Exercício 3: Revise Arel.sql e limit

**Enunciado:** A equipe quer ordenar pedidos por uma expressão especial e aceitar tamanho de página. Corrija o código.

```ruby
Order
  .order(Arel.sql(params[:order]))
  .limit(params[:limit])
```

<details>
<summary>Solução</summary>

```ruby
orders = {
  "recent" => Arel.sql("orders.created_at DESC, orders.id DESC"),
  "largest" => Arel.sql("orders.total_cents DESC, orders.id ASC")
}.freeze

order_expression = orders.fetch(params[:order], orders.fetch("recent"))
requested_limit = Integer(params[:limit], exception: false)
page_size = requested_limit&.clamp(1, 100) || 20

Order.order(order_expression).limit(page_size)
```

`Arel.sql` recebe apenas strings fixas do código. O request escolhe uma chave. O limite passa por conversão estrita e fica entre 1 e 100.

**Pontos-chave:**
- `Arel.sql(params[:order])` confia em SQL fornecido pelo request
- Allowlist seleciona fragmentos completos e revisáveis
- `Integer(..., exception: false)` rejeita texto malformado
- O teto do limite também protege disponibilidade
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
