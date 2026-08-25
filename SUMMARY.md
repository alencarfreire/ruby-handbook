# Sumário

* [Introdução](README.md)
* [Roadmap](roadmap.md)

## 1. Fundamentos de Ruby

* [1.1 Tipos](01-ruby-basics/01-types.md)
* [1.2 Variáveis e escopo](01-ruby-basics/02-variables-and-scope.md)
* [1.3 Operadores](01-ruby-basics/03-operators.md)
* [1.4 Controle de fluxo](01-ruby-basics/04-control-flow.md)
* [1.5 Métodos e blocks](01-ruby-basics/05-methods-and-blocks.md)
* [1.6 Enumerable](01-ruby-basics/06-enumerable.md)
* [1.7 Strings, symbols e regex](01-ruby-basics/07-strings-symbols-regex.md)

## 2. OOP em Ruby

* [2.1 Classes e objetos](02-oop/01-classes-objects.md)
* [2.2 Herança](02-oop/02-inheritance.md)
* [2.3 Modules e mixins](02-oop/03-modules-mixins.md)
* [2.4 `self` e visibilidade](02-oop/04-self-and-visibility.md)
* [2.5 `include` vs `prepend` vs `extend`](02-oop/05-include-prepend-extend.md)
* [2.6 Comparable](02-oop/06-comparable.md)
* [2.7 Metaprogramação](02-oop/07-metaprogramming.md)
* [2.8 `method_missing`](02-oop/08-method-missing.md)

## 3. Ruby avançado

* [3.1 Gems e Bundler](03-ruby-advanced/01-gems-bundler.md)
* [3.2 Zeitwerk e autoload](03-ruby-advanced/02-zeitwerk-autoload.md)
* [3.3 Exceções](03-ruby-advanced/03-exceptions.md)
* [3.4 Proc, lambda e `yield`](03-ruby-advanced/04-procs-lambdas.md)
* [3.5 Enumerator e lazy](03-ruby-advanced/05-enumerators-lazy.md)
* [3.6 Threads, Fiber, Ractor](03-ruby-advanced/06-concurrency.md)
* [3.7 Ruby 3.x](03-ruby-advanced/07-ruby-3.md)

## 4. Git

* [4.1 Git básico](04-git/01-git-basics.md)
* [4.2 Branching](04-git/02-branching.md)
* [4.3 Rebase vs merge](04-git/03-rebase-vs-merge.md)
* [4.4 Git Flow / GitHub Flow](04-git/04-git-flow.md)
* [4.5 Conflitos](04-git/05-conflicts.md)

## 5. Fundamentos de Rails

* [5.1 Arquitetura e boot](05-rails-basics/01-architecture-boot.md)
* [5.2 Rotas](05-rails-basics/02-routes.md)
* [5.3 Controllers](05-rails-basics/03-controllers.md)
* [5.4 Views e helpers](05-rails-basics/04-views-helpers.md)
* [5.5 Request, response e strong params](05-rails-basics/05-request-response.md)
* [5.6 Concerns](05-rails-basics/06-concerns.md)
* [5.7 Convenções e generators](05-rails-basics/07-conventions-generators.md)
* [5.8 Config e environments](05-rails-basics/08-config-environments.md)

## 6. Active Record

* [6.1 Models e migrations](06-active-record/01-models-migrations.md)
* [6.2 Associations](06-active-record/02-associations.md)
* [6.3 Query interface](06-active-record/03-query-interface.md)
* [6.4 Validations e callbacks](06-active-record/04-validations-callbacks.md)
* [6.5 N+1 (`includes` / `eager_load` / `preload`)](06-active-record/05-n-plus-one.md)
* [6.6 Transactions e locks](06-active-record/06-transactions-locks.md)
* [6.7 Scopes e Query Object](06-active-record/07-scopes-query-objects.md)

## 7. SQL & Databases

* [7.1 SQL básico](07-sql-databases/01-sql-basics.md)
* [7.2 Agregações](07-sql-databases/02-aggregates.md)
* [7.3 Índices](07-sql-databases/03-indexes.md)
* [7.4 Transactions](07-sql-databases/04-transactions.md)
* [7.5 Normalização](07-sql-databases/05-normalization.md)
* [7.6 N+1 no banco](07-sql-databases/06-n-plus-one.md)
* [7.7 Otimização de query](07-sql-databases/07-query-optimization.md)
* [7.8 Redis](07-sql-databases/08-redis.md)
* [7.9 Cache](07-sql-databases/09-caching.md)

## 8. Testing

* [8.1 RSpec — model spec](08-testing/01-rspec-model.md)
* [8.2 Request spec](08-testing/02-request-spec.md)
* [8.3 System spec](08-testing/03-system-spec.md)
* [8.4 FactoryBot](08-testing/04-factorybot.md)
* [8.5 Mocks e stubs](08-testing/05-mocks-stubs.md)
* [8.6 TDD](08-testing/06-tdd.md)
* [8.7 Coverage](08-testing/07-coverage.md)

## 9. Security

* [9.1 XSS](09-security/01-xss.md)
* [9.2 CSRF](09-security/02-csrf.md)
* [9.3 SQL Injection](09-security/03-sql-injection.md)
* [9.4 Autenticação](09-security/04-authentication.md)
* [9.5 Autorização (Pundit)](09-security/05-authorization.md)
* [9.6 Encryption](09-security/06-encryption.md)
* [9.7 HTTPS / SSL](09-security/07-https-ssl.md)
* [9.8 OWASP Top 10](09-security/08-owasp-top-10.md)

## 10. API

* [10.1 REST](10-api/01-rest.md)
* [10.2 Serializers (jbuilder / Alba)](10-api/02-serializers.md)
* [10.3 OpenAPI](10-api/03-openapi.md)
* [10.4 Rate limiting](10-api/04-rate-limiting.md)
* [10.5 Versionamento](10-api/05-versioning.md)
* [10.6 CORS](10-api/06-cors.md)

## 11. Docker & CI

* [11.1 Docker](11-docker/01-docker.md)
* [11.2 Dockerfile](11-docker/02-dockerfile.md)
* [11.3 Compose](11-docker/03-compose.md)
* [11.4 CI/CD](11-docker/04-ci-cd.md)
* [11.5 Deploy](11-docker/05-deploy.md)
* [11.6 Monitoring](11-docker/06-monitoring.md)

## 12. Background jobs

* [12.1 Active Job](12-background-jobs/01-active-job.md)
* [12.2 Sidekiq](12-background-jobs/02-sidekiq.md)
* [12.3 Retry, dead set, uniqueness](12-background-jobs/03-retry-dead-uniqueness.md)
* [12.4 Jobs agendados](12-background-jobs/04-scheduled-jobs.md)
* [12.5 Testar jobs](12-background-jobs/05-testing-jobs.md)

## 13. Hotwire

* 13.1 Turbo Drive
* 13.2 Turbo Frames
* 13.3 Turbo Streams
* 13.4 Stimulus
* 13.5 Morphing

## 14. Action Cable

* 14.1 Canais e conexões
* 14.2 Broadcast
* 14.3 Auth no cabo
* 14.4 Quando não usar

## 15. Performance

* 15.1 Caching (Russian Doll, Solid Cache)
* 15.2 Queries
* 15.3 Rack e middleware
* 15.4 Frontend
* 15.5 Scaling

## 16. Princípios

* 16.1 KISS, DRY, YAGNI
* 16.2 SOLID no Rails
* 16.3 Service Object
* 16.4 Form Object
* 16.5 Presenter / Decorator

## 17. Arquitetura

* 17.1 MVC de verdade
* 17.2 Service layer
* 17.3 Query Object
* 17.4 Policy
* 17.5 DDD leve
* 17.6 Eventos

## 18. Soft skills

* 18.1 Code review
* 18.2 Agile
* 18.3 Entrevista técnica
* 18.4 Documentação
* 18.5 Time management

## 19. Prática

* 19.1 Coding challenges
* 19.2 System design
* 19.3 Debug
* 19.4 Refactor
* 19.5 Casos reais
