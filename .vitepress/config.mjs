import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Ruby/Rails Handbook',
  description: 'Guia para entrevista de desenvolvedor Ruby/Rails',
  lang: 'pt-BR',

  ignoreDeadLinks: true,

  themeConfig: {
    nav: [
      { text: 'Início', link: '/' },
      { text: 'Roadmap', link: '/roadmap' },
      { text: 'GitHub', link: 'https://github.com/alencarfreire/ruby-handbook' }
    ],

    sidebar: [
      {
        text: 'Fundamentos de Ruby',
        collapsed: false,
        items: [
          { text: 'Tipos', link: '/01-ruby-basics/01-types' },
          { text: 'Variáveis e escopo', link: '/01-ruby-basics/02-variables-and-scope' },
          { text: 'Operadores', link: '/01-ruby-basics/03-operators' },
          { text: 'Controle de fluxo', link: '/01-ruby-basics/04-control-flow' },
          { text: 'Métodos e blocks', link: '/01-ruby-basics/05-methods-and-blocks' },
          { text: 'Enumerable', link: '/01-ruby-basics/06-enumerable' },
          { text: 'Strings, symbols e regex', link: '/01-ruby-basics/07-strings-symbols-regex' }
        ]
      },
      {
        text: 'OOP em Ruby',
        collapsed: false,
        items: [
          { text: 'Classes e objetos', link: '/02-oop/01-classes-objects' },
          { text: 'Herança', link: '/02-oop/02-inheritance' },
          { text: 'Modules e mixins', link: '/02-oop/03-modules-mixins' },
          { text: 'self e visibilidade', link: '/02-oop/04-self-and-visibility' },
          { text: 'include, prepend, extend', link: '/02-oop/05-include-prepend-extend' },
          { text: 'Comparable', link: '/02-oop/06-comparable' },
          { text: 'Metaprogramação', link: '/02-oop/07-metaprogramming' },
          { text: 'method_missing', link: '/02-oop/08-method-missing' }
        ]
      },
      {
        text: 'Ruby avançado',
        collapsed: true,
        items: [
          { text: 'Gems e Bundler', link: '/03-ruby-advanced/01-gems-bundler' },
          { text: 'Zeitwerk e autoload', link: '/03-ruby-advanced/02-zeitwerk-autoload' },
          { text: 'Exceções', link: '/03-ruby-advanced/03-exceptions' },
          { text: 'Proc, lambda e yield', link: '/03-ruby-advanced/04-procs-lambdas' },
          { text: 'Enumerator e lazy', link: '/03-ruby-advanced/05-enumerators-lazy' },
          { text: 'Threads, Fiber, Ractor', link: '/03-ruby-advanced/06-concurrency' },
          { text: 'Ruby 3.x', link: '/03-ruby-advanced/07-ruby-3' }
        ]
      },
      {
        text: 'Git',
        collapsed: true,
        items: [
          { text: 'Git básico', link: '/04-git/01-git-basics' },
          { text: 'Branching', link: '/04-git/02-branching' },
          { text: 'Rebase vs merge', link: '/04-git/03-rebase-vs-merge' },
          { text: 'Git Flow / GitHub Flow', link: '/04-git/04-git-flow' },
          { text: 'Conflitos', link: '/04-git/05-conflicts' }
        ]
      },
      {
        text: 'Fundamentos de Rails',
        collapsed: false,
        items: [
          { text: 'Arquitetura e boot', link: '/05-rails-basics/01-architecture-boot' },
          { text: 'Rotas', link: '/05-rails-basics/02-routes' },
          { text: 'Controllers', link: '/05-rails-basics/03-controllers' },
          { text: 'Views e helpers', link: '/05-rails-basics/04-views-helpers' },
          { text: 'Request e strong params', link: '/05-rails-basics/05-request-response' },
          { text: 'Concerns', link: '/05-rails-basics/06-concerns' },
          { text: 'Convenções e generators', link: '/05-rails-basics/07-conventions-generators' },
          { text: 'Config e environments', link: '/05-rails-basics/08-config-environments' }
        ]
      },
      {
        text: 'Active Record',
        collapsed: false,
        items: [
          { text: 'Models e migrations', link: '/06-active-record/01-models-migrations' },
          { text: 'Associations', link: '/06-active-record/02-associations' },
          { text: 'Query interface', link: '/06-active-record/03-query-interface' },
          { text: 'Validations e callbacks', link: '/06-active-record/04-validations-callbacks' },
          { text: 'N+1', link: '/06-active-record/05-n-plus-one' },
          { text: 'Transactions e locks', link: '/06-active-record/06-transactions-locks' },
          { text: 'Scopes e Query Object', link: '/06-active-record/07-scopes-query-objects' }
        ]
      },
      {
        text: 'SQL & Databases',
        collapsed: true,
        items: [
          { text: 'SQL básico', link: '/07-sql-databases/01-sql-basics' },
          { text: 'Agregações', link: '/07-sql-databases/02-aggregates' },
          { text: 'Índices', link: '/07-sql-databases/03-indexes' },
          { text: 'Transactions', link: '/07-sql-databases/04-transactions' },
          { text: 'Normalização', link: '/07-sql-databases/05-normalization' },
          { text: 'N+1 no banco', link: '/07-sql-databases/06-n-plus-one' },
          { text: 'Otimização de query', link: '/07-sql-databases/07-query-optimization' },
          { text: 'Redis', link: '/07-sql-databases/08-redis' },
          { text: 'Cache', link: '/07-sql-databases/09-caching' }
        ]
      },
      {
        text: 'Testing',
        collapsed: false,
        items: [
          { text: 'RSpec — model spec', link: '/08-testing/01-rspec-model' },
          { text: 'Request spec', link: '/08-testing/02-request-spec' },
          { text: 'System spec', link: '/08-testing/03-system-spec' },
          { text: 'FactoryBot', link: '/08-testing/04-factorybot' },
          { text: 'Mocks e stubs', link: '/08-testing/05-mocks-stubs' },
          { text: 'TDD', link: '/08-testing/06-tdd' },
          { text: 'Coverage', link: '/08-testing/07-coverage' }
        ]
      },
      {
        text: 'Security',
        collapsed: true,
        items: [
          { text: 'XSS', link: '/09-security/01-xss' },
          { text: 'CSRF', link: '/09-security/02-csrf' },
          { text: 'SQL Injection', link: '/09-security/03-sql-injection' },
          { text: 'Autenticação', link: '/09-security/04-authentication' },
          { text: 'Autorização (Pundit)', link: '/09-security/05-authorization' },
          { text: 'Encryption', link: '/09-security/06-encryption' },
          { text: 'HTTPS / SSL', link: '/09-security/07-https-ssl' },
          { text: 'OWASP Top 10', link: '/09-security/08-owasp-top-10' }
        ]
      },
      {
        text: 'API',
        collapsed: true,
        items: [
          { text: 'REST', link: '/10-api/01-rest' },
          { text: 'Serializers', link: '/10-api/02-serializers' },
          { text: 'OpenAPI', link: '/10-api/03-openapi' },
          { text: 'Rate limiting', link: '/10-api/04-rate-limiting' },
          { text: 'Versionamento', link: '/10-api/05-versioning' },
          { text: 'CORS', link: '/10-api/06-cors' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/alencarfreire/ruby-handbook' }
    ],

    footer: {
      message: 'Publicado sob a licença MIT',
      copyright: 'Feito com ❤️ por Vinícius Freire'
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: 'Buscar',
            buttonAriaLabel: 'Buscar'
          },
          modal: {
            noResultsText: 'Sem resultados para',
            resetButtonTitle: 'Limpar busca',
            footer: {
              selectText: 'selecionar',
              navigateText: 'navegar',
              closeText: 'fechar'
            }
          }
        }
      }
    },

    outline: {
      level: [2, 3],
      label: 'Nesta página'
    },

    docFooter: {
      prev: 'Anterior',
      next: 'Próxima'
    },

    darkModeSwitchLabel: 'Tema',
    lightModeSwitchTitle: 'Mudar para o tema claro',
    darkModeSwitchTitle: 'Mudar para o tema escuro',
    sidebarMenuLabel: 'Menu',
    returnToTopLabel: 'Voltar ao topo'
  }
})
