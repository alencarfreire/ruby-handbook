# 9.6 Encryption

> **TL;DR**
> Hashing e criptografia resolvem problemas diferentes. Senha vira hash com bcrypt: você compara, não descriptografa. Dado que a app precisa recuperar pode ser criptografado com Active Record Encryption. Credenciais guardam chaves e segredos da app, não dados de usuário. TLS protege o tráfego; criptografia no banco protege dados em repouso. Não invente algoritmo, formato ou gerenciamento de chaves.

## Conteúdo

- [Hashing não é criptografia](#hashing-não-é-criptografia)
- [Senhas com bcrypt](#senhas-com-bcrypt)
- [Active Record Encryption](#active-record-encryption)
- [Criptografia determinística e consultas](#criptografia-determinística-e-consultas)
- [Configuração e chaves](#configuração-e-chaves)
- [Credenciais do Rails](#credenciais-do-rails)
- [Criptografia em repouso e em trânsito](#criptografia-em-repouso-e-em-trânsito)
- [Limites e cuidados operacionais](#limites-e-cuidados-operacionais)
- [Nunca crie sua própria criptografia](#nunca-crie-sua-própria-criptografia)
- [Importante na entrevista](#importante-na-entrevista)
- [Recapitulando](#recapitulando)
- [Exercícios práticos](#exercícios-práticos)

---

## Hashing não é criptografia

**O que é:**
Hashing transforma uma entrada em um resumo. A operação é de mão única: o sistema não precisa recuperar o valor original.

Criptografia transforma texto legível em texto cifrado usando uma chave. Quem tem a chave consegue descriptografar e recuperar o original.

Essa diferença decide a ferramenta:

| Dado | Objetivo | Ferramenta |
|---|---|---|
| Senha | Verificar sem recuperar | Hash de senha |
| CPF | Recuperar para uso autorizado | Criptografia |
| Token de API de terceiro | Enviar o valor original depois | Criptografia |
| Chave de idempotência | Comparar igualdade | Hash ou coluna protegida, conforme o caso |

**Como funciona:**
Um login não compara duas senhas em texto puro. Ele executa a função de verificação do algoritmo sobre a senha informada e o hash armazenado.
Já um dado criptografado faz o caminho inverso quando a app precisa dele: texto puro vira conteúdo cifrado com uma chave, e a mesma chave permite recuperar o texto.

**Na entrevista:**
> "Senha eu não criptografo: aplico um hash lento e próprio para senha. Criptografia é reversível e serve para dados que a aplicação precisa recuperar. Se eu consigo descriptografar a senha do usuário, o desenho está errado."

---

## Senhas com bcrypt

**O que é:**
bcrypt é uma função de hash para senhas. Ela foi feita para ser deliberadamente cara, o que reduz a velocidade de tentativas em massa quando um banco vaza.

Cada hash inclui um salt aleatório. Por isso, duas contas com a mesma senha normalmente geram hashes diferentes. O salt não precisa ser secreto; ele evita tabelas pré-computadas e revela menos sobre senhas repetidas.

**Como funciona:**
No Rails, o caminho comum é `has_secure_password`.

```ruby
# Gemfile
gem "bcrypt", "~> 3.1"
```

O model precisa de uma coluna `password_digest`, normalmente uma `string` obrigatória.

Depois, o model expõe atributos virtuais como `password` e `password_confirmation`:

```ruby
class User < ApplicationRecord
  has_secure_password
end

user = User.new(
  email: "joao@email.com",
  password: "uma senha longa",
  password_confirmation: "uma senha longa"
)
user.save!

user.password_digest       # hash bcrypt, nunca a senha original
user.authenticate("erro")  # false
user.authenticate("uma senha longa") # devolve user
```

No login, o controller busca a conta e chama `user&.authenticate(params[:password])`. Sucesso cria a sessão; falha devolve erro genérico.

**Quando usar:**
Use bcrypt para senha de usuário. Não use SHA-256 puro, MD5 ou uma chamada genérica de digest. Esses hashes são rápidos, e rapidez ajuda o atacante a testar bilhões de candidatos.

Não registre `password`, `password_confirmation` ou o conteúdo de `params` sem filtro. Hash forte não corrige senha vazada em log, evento de analytics ou ferramenta de erro.

**Na entrevista:**
> "`has_secure_password` usa bcrypt e uma coluna `password_digest`. O bcrypt traz salt e fator de custo. Eu valido com `authenticate`; não tento descriptografar nem comparo hashes manualmente."

---

## Active Record Encryption

**O que é:**
Active Record Encryption é a criptografia de atributos integrada ao Rails 7+. Você declara quais atributos são sensíveis. O Rails criptografa antes de persistir e descriptografa quando instancia o model.

O banco recebe um payload cifrado, não o texto original.

```ruby
class Customer < ApplicationRecord
  encrypts :cpf
  encrypts :medical_notes
end
```

Para o código da app, o uso continua natural:

```ruby
customer = Customer.create!(
  name: "Ana",
  cpf: "123.456.789-00",
  medical_notes: "Alergia registrada"
)

customer.cpf # "123.456.789-00"
```

No banco, `cpf` e `medical_notes` ficam como conteúdo cifrado. Uma consulta SQL direta ou um dump sem as chaves não mostra esses valores em texto puro.

**Como funciona:**
O Rails usa criptografia autenticada. Além de esconder o conteúdo, ela permite detectar alteração indevida no payload. Se alguém trocar bytes no banco, a app não deve aceitar silenciosamente um texto adulterado.

A coluna precisa comportar o payload criptografado, que é maior que o original. Planeje o tipo e o limite antes do deploy; `text` costuma ser mais seguro que uma `string` curta.

Não criptografe tudo por reflexo. A criptografia tem custo de armazenamento, processamento, busca e operação de chaves. Comece pela classificação dos dados e pelo risco.

**Quando usar:**
Use em dados pessoais sensíveis, tokens externos e informações reguladas que a app precisa recuperar, mas que não deveriam aparecer em texto puro em um dump ou para operadores do banco.

Criptografia da coluna complementa, mas não substitui, autorização. Se qualquer controller pode ler `customer.cpf`, o atributo criptografado continua exposto pela própria app.

---

## Criptografia determinística e consultas

**O que é:**
Por padrão, criptografar o mesmo texto mais de uma vez produz conteúdos cifrados diferentes. Isso reduz a informação vazada, mas você não pode contar com `find_by` usando o texto puro.

Quando uma busca por igualdade é requisito, o Rails oferece criptografia determinística:

```ruby
class Customer < ApplicationRecord
  encrypts :email, deterministic: true
end

Customer.find_by(email: "ana@email.com")
```

**Como funciona:**
No modo determinístico, a mesma entrada, com a mesma configuração, gera o mesmo conteúdo cifrado. Assim, o banco consegue comparar valores.

O preço é o vazamento de padrões. Quem olha o banco pode perceber que várias linhas têm o mesmo valor cifrado, mesmo sem saber qual é o texto original.

**Quando usar:**
Use `deterministic: true` só quando a busca por igualdade ou um índice único for requisito real. Para texto livre, observações e campos que não participam de busca, prefira o modo não determinístico.

Também pense em normalização. E-mails com caixa ou espaços diferentes podem gerar valores distintos. Normalize com uma regra como `email.to_s.strip.downcase` antes de criptografar.

**Na entrevista:**
> "Criptografia não determinística esconde melhor os padrões, mas não serve para `find_by` no texto puro. Se preciso consultar por igualdade, avalio o modo determinístico e explico o vazamento de repetição."

---

## Configuração e chaves

**Como funciona:**
O Rails pode gerar a configuração inicial:

```bash
bin/rails db:encryption:init
```

As chaves usadas pelo Active Record Encryption incluem uma chave primária, uma chave determinística e um salt de derivação. Elas devem entrar no ambiente por um mecanismo seguro, como Rails credentials ou um gerenciador de segredos.

```yaml
active_record_encryption:
  primary_key: chave-longa-gerada
  deterministic_key: outra-chave-longa-gerada
  key_derivation_salt: salt-longo-gerado
```

Não coloque esses valores em `config/environments/production.rb`, fixture, README, imagem Docker ou variável exposta no CI.

Chave e dado cifrado precisam ficar em domínios diferentes. Um backup do banco junto com a chave que o abre reduz muito o benefício da criptografia.

**Exemplo prático:**
Uma adoção em tabela existente exige estratégia. Habilite a leitura do legado temporariamente, faça backfill em lotes, valide o resultado e remova a compatibilidade. Não tente regravar milhões de linhas em uma migration bloqueante.

Rotação também precisa ser planejada. Trocar a chave sem manter um caminho de leitura para payloads antigos torna os dados ilegíveis. Primeiro permita ler o esquema anterior, depois recriptografe e só então aposente a chave antiga.

**Na entrevista:**
> "O algoritmo é só uma parte. Eu também penso em separação da chave, rotação, backup, auditoria e migração dos dados existentes. Perder a chave pode significar perder os dados."

---

## Credenciais do Rails

**O que é:**
Rails credentials guarda segredos da app em um arquivo criptografado, normalmente `config/credentials.yml.enc`. O arquivo cifrado pode ir para o Git. A chave que o abre não pode.

Edite com `bin/rails credentials:edit`. Em produção, a chave costuma chegar por `RAILS_MASTER_KEY` ou por um mecanismo equivalente da plataforma. `config/master.key` deve ficar fora do repositório. No código, leia com `Rails.application.credentials.dig(:payments, :api_key)`.

**Quando usar:**
Use credentials para segredo de infraestrutura e configuração: chave de API, segredo de assinatura e chaves do Active Record Encryption.

Não use credentials para armazenar CPF de cada cliente, senha de usuário ou conteúdo dinâmico do produto. Credentials não é banco de dados.

Também não confunda os dois recursos:

- Rails credentials protege segredos de configuração.
- Active Record Encryption protege atributos de registros.

Se a `master.key` aparecer no mesmo repositório que `credentials.yml.enc`, o arquivo cifrado deixa de oferecer a separação esperada. Revogue os segredos expostos; apagar o commit não basta.

---

## Criptografia em repouso e em trânsito

**O que é:**
Criptografia em repouso protege dados armazenados: disco, banco, snapshot ou backup. Active Record Encryption é uma camada em repouso no nível da app. Criptografia de volume ou serviço de banco é outra camada útil.

Criptografia em trânsito protege o caminho entre cliente, proxy, app, banco e serviços. Na web, a base é TLS com HTTPS.

São ameaças diferentes: TLS cobre os saltos de rede; a criptografia do atributo cobre o valor persistido.

Ter coluna criptografada não protege uma requisição HTTP sem TLS. Ter HTTPS não protege um dump do banco com dados em texto puro.

A configuração e os detalhes de TLS ficam no ponto **9.7**. Aqui, a resposta importante é: você normalmente precisa das duas proteções.

**Na entrevista:**
> "At rest e in transit não competem. TLS protege o dado circulando. Criptografia no banco ou no atributo protege o dado armazenado. Eu modelo as duas camadas conforme a ameaça."

---

## Limites e cuidados operacionais

**O que é:**
Criptografia reduz impacto de alguns vazamentos. Ela não transforma uma app vulnerável em app segura.

Active Record Encryption não protege contra uma app comprometida, endpoint sem autorização, texto puro em logs ou chaves copiadas junto com o banco.

**Como funciona:**
O dado aparece em texto puro dentro do processo quando a app o usa. Por isso, minimize acesso e exposição.

```ruby
# Evite colocar o atributo sensível em inspeções e logs.
Rails.application.config.filter_parameters += %i[
  password
  password_confirmation
  cpf
  medical_notes
  api_token
]
```

Não serialize models inteiros em JSON por conveniência. Selecione campos permitidos e mantenha autorização perto do endpoint.

Monitore falhas de descriptografia. Elas podem indicar chave errada, deploy incompleto, dado corrompido ou alteração maliciosa. Não "resolva" retornando o conteúdo cifrado ao cliente.

Teste restore de backup com as chaves corretas em ambiente controlado. Backup sem chave pode ser inútil; backup com chave anexada pode ser inseguro.

---

## Nunca crie sua própria criptografia

**O que é:**
"Não invente criptografia" vai além de não inventar um algoritmo. Também significa não combinar primitivas por conta própria sem necessidade.

Erros comuns:

- Usar Base64 e chamar de criptografia.
- Usar SHA-256 puro para senha.
- Reutilizar nonce ou vetor de inicialização.
- Criptografar sem autenticar o payload.
- Deixar a chave hardcoded no código.
- Criar um formato que não suporta versão e rotação.
- Registrar chave ou texto puro durante debug.

Base64 é só codificação reversível sem segredo. Qualquer pessoa consegue desfazer; não há chave, confidencialidade nem proteção contra alteração.

**Quando usar:**
Prefira APIs de alto nível mantidas e revisadas: bcrypt por meio de `has_secure_password`, Active Record Encryption para atributos e Rails credentials ou o gerenciador de segredos da plataforma.

Se o caso não cabe nessas ferramentas, trate como decisão de segurança: requisito claro, biblioteca madura, revisão especializada, gerenciamento de chaves e plano de rotação.

**Na entrevista:**
> "Eu não implemento crypto com `OpenSSL::Cipher` espalhado pelo model. Prefiro a API de alto nível do framework e desenho o ciclo de vida das chaves. Crypto correta com chave mal gerenciada continua insegura."

---

## Importante na entrevista

A pergunta clássica é: **"Você criptografa senha no banco?"**

Uma resposta forte:

> "Não. Senha é hasheada com uma função própria para senha, como bcrypt. O sistema só precisa verificar se a tentativa confere. Como não precisa recuperar a senha original, reversibilidade seria risco desnecessário. Para um CPF ou token que a app precisa ler depois, eu uso criptografia em repouso, por exemplo Active Record Encryption."

Se perguntarem por que não usar SHA-256:

> "SHA-256 foi feito para ser rápido. Em senha, eu quero custo configurável e salt por hash para encarecer tentativa offline. bcrypt já entrega esse desenho."

Se perguntarem se criptografia no banco resolve tudo:

> "Não. Ela ajuda contra dump, backup ou acesso direto sem a chave. Não protege contra app comprometida, endpoint sem autorização ou vazamento em log. Ainda preciso de TLS, controle de acesso, filtro de parâmetros e gestão de chaves."

Uma resposta madura também menciona salt e custo, separa repouso de trânsito e reconhece que chaves, rotação, logs e criptografia determinística fazem parte da decisão.

---

## Recapitulando

- Hashing é de mão única; criptografia é reversível com a chave.
- Senhas ficam em bcrypt, normalmente com `has_secure_password` e `password_digest`.
- Active Record Encryption protege atributos que a app precisa recuperar.
- Modo determinístico permite igualdade, mas revela repetição de valores.
- Rails credentials guarda segredos de configuração, não registros do produto.
- A chave não deve viajar junto com o banco nem ser commitada.
- TLS protege em trânsito; a criptografia do atributo protege em repouso.
- Não invente algoritmo, protocolo ou gerenciamento de chaves.

---

## Exercícios práticos

### Exercício 1: Hash ou criptografia?

**Enunciado:** Classifique senha, CPF, token de uma API externa e código de recuperação de uso único. Explique quando o valor original precisa ser recuperado.

<details>
<summary>Solução</summary>

- Senha: hash com bcrypt. Só precisa verificar.
- CPF: criptografia se a app precisa exibir ou processar o original.
- Token de API externa: criptografia, pois a app precisa enviá-lo ao serviço.
- Código de recuperação de uso único: hash quando basta verificar o código recebido.

**Pontos-chave:**
- A necessidade de recuperar o original define a escolha.
- Dados verificáveis não precisam ser reversíveis.
- Criptografar senha cria um segredo recuperável sem necessidade.
</details>

### Exercício 2: Proteja atributos no Rails

**Enunciado:** Um model `Patient` tem `cpf`, `email` e `notes`. A app busca por e-mail, mas não busca por CPF nem pelas anotações. Declare a criptografia adequada e explique a decisão.

<details>
<summary>Solução</summary>

```ruby
class Patient < ApplicationRecord
  encrypts :cpf
  encrypts :email, deterministic: true
  encrypts :notes
end
```

`email` usa modo determinístico porque participa de busca por igualdade. `cpf` e `notes` ficam no modo padrão, que não revela quando textos iguais se repetem.

Antes de criptografar e-mail, a app deve normalizar caixa e espaços. As colunas também precisam suportar o payload maior.

**Pontos-chave:**
- Modo determinístico é uma decisão de consulta, não o padrão para tudo.
- Igualdade tem custo de privacidade.
- Migração e normalização fazem parte da solução.
</details>

### Exercício 3: Analise o incidente

**Enunciado:** Um time commitou `config/credentials.yml.enc` e `config/master.key`. O banco usa Active Record Encryption, e a mesma credencial contém as chaves dos atributos. O que você faria?

<details>
<summary>Solução</summary>

Trate os segredos como comprometidos. Remover o arquivo no commit seguinte não revoga cópias nem apaga o histórico já distribuído.

1. Restrinja o acesso, avalie o alcance e gere novos segredos.
2. Mantenha leitura temporária dos payloads antigos e recriptografe os dados.
3. Aposente as chaves antigas depois de validar dados e backups.
4. Use um gerenciador de segredos e revise logs, CI, imagens e artefatos.

**Pontos-chave:**
- Arquivo cifrado e chave juntos anulam a separação.
- Rotação precisa preservar leitura antes da recriptografia.
- Gestão de incidente vai além de apagar o segredo do Git.
</details>

---

*Parte do [Ruby/Rails Interview Handbook](/)*
