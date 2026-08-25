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
      { text: 'GitHub', link: 'https://github.com/alencarfreire' }
    ],

    sidebar: [
      {
        text: 'Fundamentos de Ruby',
        collapsed: false,
        items: [
          { text: 'Tipos', link: '/01-ruby-basics/01-types' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/alencarfreire' }
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
