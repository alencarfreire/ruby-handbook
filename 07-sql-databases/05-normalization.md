# 7.5 Normalização

> **TL;DR**
> Normalizar é organizar tabelas para cada fato ter uma fonte de verdade. A 1FN elimina grupos repetidos e exige valores atômicos; a 2FN elimina dependências de parte de uma chave composta; a 3FN elimina dependências transitivas entre atributos não-chave. Isso reduz anomalias de inserção, atualização e exclusão. Para a maioria dos apps, 3FN é suficiente. Desnormalize só depois de medir um gargalo e definir como manter a cópia consistente. No Rails, `counter_cache` é a desnormalização clássica para evitar `COUNT(*)` repetido.

## Conteúdo

- [Por que normalizar](#por-que-normalizar)
- [Anomalias de dados](#anomalias-de-dados)
- [Primeira Forma Normal — 1FN](#primeira-forma-normal--1fn)
- [Segunda Forma Normal — 2FN](#segunda-forma-normal--2fn)
- [Terceira Forma Normal — 3FN](#terceira-forma-normal--3fn)
- [Até onde normalizar](#até-onde-normalizar)
- [Quando desnormalizar](#quando-desnormalizar)
- [Counter cache no Rails](#counter-cache-no-rails)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Por que normalizar

**O que é:**
Normalização é uma técnica de modelagem relacional. Você separa fatos em tabelas para reduzir repetição e dependências indevidas.

A pergunta central é: **onde está a fonte de verdade deste dado?**

```text
customers(id, name, email)
orders(id, customer_id, total_cents)
```

Se nome e e-mail também estivessem em `orders`, uma mudança poderia atualizar uma tabela e esquecer a outra. Aqui, `customers.email` é a fonte de verdade.

**Importante na entrevista:**
Normalizar não é criar o maior número possível de tabelas. É guardar cada fato no lugar determinado pela chave correta.

Duas pessoas podem ter o mesmo nome. Isso é repetição de valor, não duplicação do mesmo fato.

---

## Anomalias de dados

**O que é:**
Uma tabela mal modelada permite estados inconsistentes ou obriga você a inventar dados.

Imagine:

```text
enrollments
student_id | student_name | course_id | course_name | teacher_email
1          | Ana          | 10        | SQL         | bia@escola.com
2          | Caio         | 10        | SQL         | bia@escola.com
```

### Anomalia de atualização

A professora muda de e-mail. Você precisa atualizar todas as matrículas do curso. Se uma linha ficar com o endereço antigo, a mesma pergunta passa a ter duas respostas.

Esse é o caso clássico: um único fato exige vários `UPDATE`s.

### Anomalia de inserção

Você quer cadastrar um curso antes da primeira matrícula. A tabela exige aluno, então não existe lugar natural para guardar apenas o curso.

### Anomalia de exclusão

O último aluno sai. Ao apagar a última matrícula, você também perde o nome do curso e o e-mail da professora.

**Como funciona:**
Separe entidades e o relacionamento:

```text
students(id, name)
teachers(id, email)
courses(id, name, teacher_id)
enrollments(student_id, course_id)
```

Agora cada alteração toca o fato correspondente uma vez.

**Na entrevista:**
> “Eu normalizo para reduzir anomalias. Se o e-mail aparece em cem matrículas, atualizar noventa e nove cria inconsistência. Em `teachers`, existe uma fonte de verdade.”

---

## Primeira Forma Normal — 1FN

**O que é:**
Uma relação está na Primeira Forma Normal quando cada coluna contém um valor atômico no contexto do modelo e não existem grupos repetidos.

### Exemplo que viola a 1FN

```text
customers
id | name | phone_1     | phone_2
1  | Ana  | 11999990000 | 1133334000
```

`phone_1` e `phone_2` formam um grupo repetido. O modelo impõe um limite artificial.

Guardar `"11999990000,1133334000"` em uma coluna também esconde uma coleção em texto. Indexar, validar e garantir unicidade de cada telefone fica difícil.

### Versão em 1FN

```text
customers(id, name)
customer_phones(id, customer_id, number)
```

Agora cada telefone ocupa uma linha e pode receber índice próprio.

### “Atômico” depende do uso

Uma data em `starts_at` é uma unidade válida, mesmo contendo ano, mês, dia e hora. O banco conhece o tipo e consulta suas partes.

Um endereço em texto pode bastar se você só imprime uma etiqueta. Se filtra por CEP e cidade, essas partes merecem estrutura.

**Na entrevista:**
> “Na 1FN eu evito lista separada por vírgula e colunas como `phone_1`, `phone_2`. Crio uma linha por telefone. O que é atômico depende do uso no domínio.”

---

## Segunda Forma Normal — 2FN

**O que é:**
Uma relação está na Segunda Forma Normal quando está na 1FN e todo atributo não-chave depende da chave inteira, não só de parte dela.

A 2FN importa principalmente quando existe chave candidata composta.

### Dependência parcial

```text
order_items
order_id | product_id | product_name | quantity
10       | 7          | Teclado      | 2
11       | 7          | Teclado      | 1
```

Considere `(order_id, product_id)` como chave:

- `quantity` depende do pedido e do produto;
- `product_name` depende apenas de `product_id`.

O nome tem dependência parcial. A versão em 2FN separa:

```text
products(id, name)
order_items(order_id, product_id, quantity)
```

### `id` não conserta o modelo

Adicionar um `id` artificial à tabela original não remove `product_id -> product_name`.

Formas normais consideram chaves candidatas e dependências do domínio, não apenas a primary key escolhida no Rails.

Se a única chave candidata tem uma coluna, não existe “parte da chave”. Estando na 1FN, a relação já atende à 2FN.

**Na entrevista:**
> “A 2FN remove dependência parcial de chave composta. Quantidade depende do pedido e do produto; nome depende só do produto e vai para `products`.”

---

## Terceira Forma Normal — 3FN

**O que é:**
Uma relação está na Terceira Forma Normal quando está na 2FN e atributos não-chave não dependem transitivamente da chave por outro atributo não-chave.

Em linguagem direta: coluna não-chave deve descrever a chave, não outra coluna não-chave.

### Dependência transitiva

```text
employees
id | name | department_id | department_name
1  | Ana  | 3             | Engenharia
2  | Caio | 3             | Engenharia
```

As dependências são:

```text
id -> department_id
department_id -> department_name
```

O nome do departamento está repetido em cada funcionário. Em 3FN:

```text
departments(id, name)
employees(id, name, department_id)
```

Agora o nome muda em uma linha.

### Cuidado com fatos históricos

Nem toda cópia aparente é o mesmo fato.

Um pedido pode guardar `shipping_address` como retrato da entrega. Se o cliente mudar o endereço do perfil, o pedido antigo não deve mudar.

Da mesma forma, `products.current_price_cents` é o preço atual e `order_items.unit_price_cents` é o preço negociado na compra.

Snapshots históricos são intencionais. Não representam anomalia de atualização.

**Na entrevista:**
> “Na 3FN eu removo dependência transitiva. `department_name` depende de `department_id`, não do funcionário. Mas preservo preço e endereço do pedido, pois são fatos históricos.”

---

## Até onde normalizar

**Importante na entrevista:**
Para a maioria dos apps, 3FN é suficiente.

Uma resposta madura:

> “Eu começo próximo da 3FN, com foreign keys e índices. Se uma consulta crítica ficar cara, meço e desnormalizo o ponto específico, com estratégia de consistência.”

Não diga que banco normalizado é sempre lento. `JOIN` é operação central de banco relacional e, com índices corretos, costuma ser a solução certa.

---

## Quando desnormalizar

**O que é:**
Desnormalizar é duplicar ou pré-calcular dados de propósito para tornar uma leitura mais barata.

Você troca simplicidade de leitura por custo de escrita e risco de inconsistência.

**Quando usar:**

- a medição aponta `JOIN` ou agregação como gargalo real;
- a leitura acontece muito mais que a escrita;
- calcular sob demanda custa caro;
- existe uma fonte de verdade;
- existe mecanismo de atualização e reparo.

Exemplos: contador de comentários, total de reações, tabela de relatório e materialized view.

**Quando não usar:**

- para evitar qualquer `JOIN`, sem medir;
- quando duas colunas competem como fonte de verdade;
- quando os caminhos de escrita não conseguem manter a cópia.

Antes, confira índices, plano da consulta, N+1 e paginação. Muitas vezes o problema não é normalização.

**Na entrevista:**
> “Desnormalização é otimização consciente. Eu meço, documento a fonte de verdade e deixo uma forma de reparar divergências.”

---

## Counter cache no Rails

**O que é:**
Counter cache guarda no pai a quantidade de filhos. Em vez de executar `COUNT(*)` sempre, o Rails lê uma coluna.

```ruby
post.comments.count # executa SELECT COUNT(*)
post.comments.size  # pode usar comments_count
```

```ruby
add_column :posts, :comments_count, :integer, null: false, default: 0
```

Configure no lado do `belongs_to`:

```ruby
class Comment < ApplicationRecord
  belongs_to :post, counter_cache: true
end
```

Por convenção, Rails procura `comments_count` em `posts`. Ao criar ou destruir um comentário, o Active Record atualiza o contador.

### Backfill e reparo

Adicionar zero não calcula dados antigos. Faça backfill:

```ruby
Post.find_each do |post|
  Post.reset_counters(post.id, :comments)
end
```

Em base grande, rode em lotes. Para operação longa, prefira task ou script versionado a depender de models da app dentro de uma migration antiga.

Operações que pulam callbacks podem causar divergência:

```ruby
Comment.where(spam: true).delete_all
Comment.connection.execute("DELETE FROM comments WHERE spam = TRUE")
```

`Post.reset_counters(post.id, :comments)` também repara um contador. A fonte de verdade continua sendo `comments`; `comments_count` é derivado.

Counter cache resolve contagem simples. Contagem filtrada, como apenas comentários aprovados, exige estratégia própria.

**Na entrevista:**
> “`counter_cache` é desnormalização suportada pelo Rails. A coluna fica no pai e `counter_cache: true` no `belongs_to`. Eu lembro do backfill e do risco de `delete_all` ou SQL direto.”

---

## Recapitulando

- Normalização mantém cada fato em uma fonte de verdade.
- Anomalias de atualização, inserção e exclusão indicam responsabilidades misturadas.
- 1FN: valores atômicos, sem grupos repetidos.
- 2FN: atributo não-chave depende da chave composta inteira.
- Um `id` artificial não corrige dependência parcial.
- 3FN: atributo não-chave não depende de outro atributo não-chave.
- Snapshot histórico representa outro fato, não duplicação acidental.
- 3FN é suficiente para a maioria dos apps.
- Desnormalize depois de medir, com atualização e reparo.
- `counter_cache` evita contagens repetidas, mas requer backfill e cuidado com callbacks.

---

## Exercícios práticos

### Exercício 1: Da lista para a 1FN

**Enunciado:** `users.skill_names` guarda `"Ruby,SQL,Docker"`. Modele uma versão em 1FN que permita pesquisar por habilidade e impeça o mesmo vínculo duas vezes.

<details>
<summary>Solução</summary>

```text
users(id, name)
skills(id, name)
user_skills(user_id, skill_id)
```

```ruby
add_index :skills, :name, unique: true
add_index :user_skills, [:user_id, :skill_id], unique: true
```

**Pontos-chave:**
- Uma habilidade por linha
- Índice composto impede vínculo duplicado
</details>

### Exercício 2: Da dependência à 3FN

**Enunciado:** Em `registrations(student_id, course_id, student_name, course_name, teacher_id, teacher_email, grade)`, a chave é `(student_id, course_id)`. Identifique violações e normalize.

<details>
<summary>Solução</summary>

`student_name` depende só de `student_id`. `course_name` e `teacher_id` dependem só de `course_id`: violações da 2FN. `teacher_email` depende de `teacher_id`: dependência transitiva.

```text
students(id, name)
teachers(id, email)
courses(id, name, teacher_id)
registrations(student_id, course_id, grade)
```

**Pontos-chave:**
- Dados do aluno ficam em `students`
- E-mail pertence à professora
</details>

### Exercício 3: Counter cache seguro

**Enunciado:** Uma lista de 50 posts chama `post.comments.count`. Explique a otimização com `counter_cache`, incluindo dados antigos e risco de divergência.

<details>
<summary>Solução</summary>

Adicione `comments_count` em `posts` com zero como default e `null: false`. Configure:

```ruby
class Comment < ApplicationRecord
  belongs_to :post, counter_cache: true
end
```

Faça backfill com `Post.reset_counters(post.id, :comments)` para cada post. Use `comments_count` ou `comments.size` na listagem.

`delete_all`, SQL direto e importações que pulam callbacks podem divergir. Recalcule a partir de `comments`, que continua sendo a fonte de verdade.

**Pontos-chave:**
- A coluna fica no pai
- A opção fica no `belongs_to`
- Dados antigos exigem backfill
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
