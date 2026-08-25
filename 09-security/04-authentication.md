# 9.4 Autenticação

> **TL;DR**
> Autenticação responde **quem você é**; autorização decide **o que você pode fazer** e fica no capítulo 9.5. Em Rails 7.1+, `has_secure_password` com `bcrypt` entrega digest e verificação de senha. O banco guarda `password_digest`, nunca senha em texto puro. Depois do login, chame `reset_session` contra session fixation e guarde só o ID do usuário na session. Devise é a gem comum quando você precisa de vários fluxos prontos. Rails 8 continua usando `has_secure_password`; o mecanismo não ficou obsoleto.

## Conteúdo

- [Autenticação não é autorização](#autenticação-não-é-autorização)
- [Senha nunca fica em texto puro](#senha-nunca-fica-em-texto-puro)
- [has_secure_password e bcrypt](#has_secure_password-e-bcrypt)
- [Cadastro e login](#cadastro-e-login)
- [Session e reset_session](#session-e-reset_session)
- [Usuário atual e logout](#usuário-atual-e-logout)
- [Falhas e logs](#falhas-e-logs)
- [Devise](#devise)
- [Rails 8 e compatibilidade com 7.1](#rails-8-e-compatibilidade-com-71)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Autenticação não é autorização

**O que é:**
Autenticação prova a identidade: “quem está fazendo este request?”. Senha, passkey e login social são formas de autenticar.

Autorização vem depois: “essa identidade pode editar este pedido?”. Esse é o tema do capítulo 9.5.

```ruby
# Autenticação
user = User.authenticate_by(email: email, password: password)

# Autorização — não prova identidade
user.admin?
```

Um usuário pode estar autenticado e receber `403 Forbidden`. Estar logado não dá acesso a todos os registros.

**Na entrevista:**
> “Autenticação é quem você é. Autorização é o que você pode fazer. Eu autentico primeiro e aplico policy ou outra regra de autorização depois.”

---

## Senha nunca fica em texto puro

**O que é:**
A app não precisa recuperar a senha original. Ela só precisa verificar se uma tentativa corresponde à senha definida.

Bcrypt gera um digest com salt e custo de processamento. O salt faz senhas iguais produzirem digests diferentes; o custo torna tentativa em massa mais cara.

```ruby
# RUIM
add_column :users, :password, :string
add_column :users, :encrypted_password_reversible, :string

# BOM
add_column :users, :password_digest, :string, null: false
```

Base64 é codificação, não proteção. Criptografia reversível também é a escolha errada para senha: quem obtém a chave recupera todas.

“Nunca armazenar” inclui banco, log, backup auxiliar, fixture, evento e analytics. Vazamento de banco ainda é incidente: bcrypt dificulta ataques, mas não salva uma senha fraca.

**Na entrevista:**
> “Eu nunca salvo nem criptografo senha de forma reversível. Guardo um digest lento e com salt, como bcrypt, e verifico a tentativa contra ele.”

---

## has_secure_password e bcrypt

**O que é:**
`has_secure_password` integra o model ao bcrypt. Você adiciona a gem, cria `password_digest` e declara a macro.

```ruby
# Gemfile
gem "bcrypt", "~> 3.1"
```

```ruby
class AddPasswordDigestToUsers < ActiveRecord::Migration[7.1]
  def change
    add_column :users, :password_digest, :string, null: false
  end
end
```

```ruby
class User < ApplicationRecord
  has_secure_password

  normalizes :email, with: ->(email) { email.strip.downcase }
  validates :email, presence: true, uniqueness: true
end
```

**Como funciona:**
A macro cria atributos virtuais `password` e `password_confirmation`. Ao atribuir `password`, o bcrypt preenche o digest. A senha original não é persistida.

```ruby
user = User.create!(
  email: "ana@example.com",
  password: "uma senha longa",
  password_confirmation: "uma senha longa"
)

user.authenticate("uma senha longa") # user
user.authenticate("senha errada")    # false
```

Com validations ligadas, a macro exige senha na criação, respeita o limite aceito pelo bcrypt e valida confirmation quando ela foi informada. Confirmation evita erro de digitação; não aumenta a força criptográfica.

Não compare `password_digest` com a entrada. Passe a tentativa para `authenticate`.

**Quando usar:**
Login interno, painel simples ou produto cujo time quer controlar controllers e views. Se os fluxos crescerem muito, uma gem madura pode compensar.

**Na entrevista:**
> “has_secure_password espera password_digest e bcrypt. Password é virtual; a atribuição gera o digest. Authenticate devolve o usuário ou false.”

---

## Cadastro e login

**Exemplo prático:**
No cadastro, permita os atributos virtuais. Nunca aceite `password_digest` do request.

```ruby
def user_params
  params.require(:user).permit(
    :email,
    :password,
    :password_confirmation
  )
end
```

No login, Rails 7.1 oferece `authenticate_by`, que junta busca e verificação:

```ruby
class SessionsController < ApplicationController
  def create
    user = User.authenticate_by(
      email: params[:email].to_s.strip.downcase,
      password: params[:password]
    )

    if user
      reset_session
      session[:user_id] = user.id
      redirect_to dashboard_path, notice: "Login realizado."
    else
      flash.now[:alert] = "E-mail ou senha inválidos."
      render :new, status: :unprocessable_entity
    end
  end
end
```

`authenticate_by` evita pular todo o trabalho de digest quando o e-mail não existe, reduzindo diferença de tempo que ajuda a enumerar contas.

Normalizar e-mail reduz duplicatas por caixa e espaços. Combine a validation com índice único coerente no banco. Isso garante integridade do login, não autorização.

**Na entrevista:**
> “No cadastro permito password e confirmation, nunca password_digest. No Rails 7.1 posso usar authenticate_by. Se autenticar, reseto a session e salvo só user_id.”

---

## Session e reset_session

**O que é:**
Após validar credenciais, a session reconhece o navegador nos próximos requests. No `CookieStore`, default comum do Rails, os dados ficam em cookie criptografado e assinado.

Guarde o mínimo:

```ruby
# BOM
session[:user_id] = user.id

# RUIM
session[:user] = user.attributes
session[:password] = params[:password]
```

O ID é pequeno e permite buscar o estado atual. Objeto inteiro fica desatualizado, aumenta o cookie e pode manter informação já revogada. Mesmo em um store como Redis, guardar pouco é uma boa regra.

Cookie protegido não é banco: ele tem limite, viaja em requests e pode ser reutilizado enquanto válido. Produção precisa de HTTPS e configuração adequada de `secure`, `httponly` e `same_site`.

**Como funciona:**
Session fixation ocorre quando a vítima usa uma session conhecida pelo atacante e ela continua válida depois do login. Renove a session na mudança de privilégio:

```ruby
if user
  reset_session
  session[:user_id] = user.id
end
```

A ordem importa. Se gravar `user_id` antes, `reset_session` apaga o próprio login. O reset não verifica senha; ele descarta o contexto anterior.

**Na entrevista:**
> “Depois da senha válida eu chamo reset_session antes de salvar user_id. Isso impede que uma session fixada antes do login vire autenticada.”

---

## Usuário atual e logout

**Como funciona:**
Centralize a identidade atual e trate usuário removido como não autenticado.

```ruby
class ApplicationController < ActionController::Base
  helper_method :current_user

  private

  def current_user
    return @current_user if defined?(@current_user)

    @current_user = User.find_by(id: session[:user_id])
  end

  def require_authentication
    return if current_user

    redirect_to login_path, alert: "Entre para continuar."
  end
end
```

`find_by` aceita uma session antiga apontando para conta excluída. A memoização vale só no request; variável global ou de classe pode vazar identidade entre requests concorrentes.

Uma rota protegida usa `before_action :require_authentication`. Depois ainda autoriza o recurso com um escopo ou uma policy.

Logout muda estado. Use `DELETE`, proteção CSRF e reset completo:

```ruby
# config/routes.rb
resource :session, only: %i[new create destroy]

def destroy
  reset_session
  redirect_to login_path, notice: "Você saiu."
end
```

Não use `GET` para logout: crawler ou prefetch pode acioná-lo. Não desabilite CSRF só para o botão funcionar.

**Na entrevista:**
> “Resolvo current_user pelo ID, memoizo no request e uso find_by. Logout é DELETE com CSRF e reset_session. A policy vem depois da identidade.”

---

## Falhas e logs

**O que é:**
Responder “e-mail não cadastrado” e “senha errada” separadamente confirma quais contas existem. Prefira a mesma resposta pública: “E-mail ou senha inválidos.”

Filtre credenciais dos logs. O Rails gerado cobre nomes comuns, mas inclua nomes customizados, como `secret_phrase`, em `config.filter_parameters`.

Mensagem genérica não impede tentativa automatizada. Combine monitoramento e limitação de tentativas por IP, conta ou risco, sem criar bloqueio permanente fácil contra a vítima.

**Na entrevista:**
> “Na falha não revelo se o e-mail existe. Filtro credenciais dos logs e limito tentativas. Segurança não termina no bcrypt.”

---

## Devise

**O que é:**
Devise é a gem de autenticação mais comum no ecossistema Rails. Ela costuma compensar quando o produto precisa de recuperação de senha, confirmação de e-mail, lembrar login, bloqueio, timeout e provedores externos.

Isto não é um manual de Devise. O ponto de entrevista é o critério: uma gem madura reduz código sensível próprio, mas você ainda precisa entender os módulos ativados, routes, e-mails, callbacks e estados no banco.

Não ligue tudo “por garantia”. Cada módulo aumenta superfície e testes. Devise também não substitui autorização, TLS, CSRF, proteção de segredo ou limitação de tentativas.

**Na entrevista:**
> “Devise economiza fluxos maduros. Para login pequeno, has_secure_password pode ser mais claro. Eu escolho pelos requisitos e não trato a gem como autorização.”

---

## Rails 8 e compatibilidade com 7.1

**O que é:**
Rails 8 trouxe mais estrutura gerada para autenticação, mas continua apoiado em `has_secure_password`. O contrato com bcrypt e `password_digest` não ficou obsoleto.

Os exemplos centrais deste capítulo existem no Rails 7.1+: `has_secure_password`, `authenticate_by`, session e `reset_session`. Ao copiar um exemplo de Rails 8, separe o primitive de senha do generator e da estrutura ao redor, que podem não existir iguais no 7.1.

**Na entrevista:**
> “Rails 8 não aposentou has_secure_password. O que muda é a estrutura pronta ao redor; o fluxo central deste capítulo funciona no 7.1.”

---

## Recapitulando

- Autenticação identifica; autorização permite ou nega.
- Senha nunca vai em texto puro, log ou session.
- `has_secure_password` usa bcrypt e espera `password_digest`.
- `password` é virtual; `authenticate` e `authenticate_by` verificam a tentativa.
- Depois do login, `reset_session` vem antes de gravar `user_id`.
- Session guarda só o ID; o estado atual vem do banco.
- `current_user` identifica, mas uma policy ou escopo ainda autoriza.
- Logout usa `DELETE`, CSRF e `reset_session`.
- Devise é comum para fluxos completos, não substituto das outras camadas.
- Rails 8 mantém `has_secure_password`; o núcleo vale para Rails 7.1.

---

## Exercícios práticos

### Exercício 1: Corrija o armazenamento

**Enunciado:** Um model persiste uma coluna `password`. Reescreva migration e model com o recurso nativo para bcrypt.

<details>
<summary>Solução</summary>

```ruby
class ReplacePasswordWithPasswordDigest < ActiveRecord::Migration[7.1]
  def change
    remove_column :users, :password, :string
    add_column :users, :password_digest, :string, null: false
  end
end

class User < ApplicationRecord
  has_secure_password
end
```

Adicione `gem "bcrypt", "~> 3.1"`. Em produção, a remoção exige plano de transição e tratamento do texto puro já exposto.

**Pontos-chave:**
- A coluna é `password_digest`
- `password` passa a ser virtual
- Texto puro precisa sair também de logs e backups auxiliares
</details>

### Exercício 2: Corrija a ordem do login

**Enunciado:** Por que este código não mantém o login? Qual risco existiria sem o reset?

```ruby
session[:user_id] = user.id
reset_session
```

<details>
<summary>Solução</summary>

O reset apaga o ID recém-gravado. A ordem correta, após autenticar, é:

```ruby
reset_session
session[:user_id] = user.id
```

Sem renovar a session, um identificador fixado antes do login poderia continuar autenticado.

**Pontos-chave:**
- Primeiro valida a senha
- Depois reseta a session antiga
- Por último grava a identidade
</details>

### Exercício 3: Logado pode editar?

**Enunciado:** Um usuário logado chama `Order.find(params[:id]).update!(order_params)`. Explique o problema e aplique uma proteção inicial.

<details>
<summary>Solução</summary>

Login prova identidade, não acesso ao pedido. A busca global permite tentar IDs de outros clientes.

```ruby
before_action :require_authentication

def update
  order = current_user.orders.find(params[:id])
  order.update!(order_params)
  redirect_to order
end
```

Regras de gerente, organização ou estado pedem a policy correspondente, assunto do capítulo 9.5.

**Pontos-chave:**
- `current_user` vem da autenticação
- Escopo ou policy faz autorização
- Estar logado não libera acesso global
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
