// Roteador e Inicializador SPA — Economy Cart PWA
// economy-cart/js/app.js

const App = {
  // Contêiner principal onde as views são renderizadas
  mainContainer: null,

  /**
   * Inicializa o aplicativo.
   */
  async bootstrap() {
    this.mainContainer = document.getElementById('app');
    
    // 1. Inicializa o estado de autenticação (busca do IndexedDB)
    await Auth.init();

    // 2. Inicializa o gerenciador de sincronização (ouve online/offline)
    SyncManager.init();

    // 3. Registra ouvinte para mudança de rota
    window.addEventListener('hashchange', () => this.router());

    // 4. Executa o roteador pela primeira vez
    this.router();
  },

  /**
   * Extrai a rota e parâmetros da URL baseados no hash (ex: #compra?id=123)
   */
  getRouteInfo() {
    const hash = window.location.hash || '#historico';
    const parts = hash.split('?');
    const route = parts[0];
    const params = {};

    if (parts[1]) {
      const searchParams = new URLSearchParams(parts[1]);
      for (const [key, value] of searchParams) {
        params[key] = value;
      }
    }

    return { route, params };
  },

  /**
   * Roteia o usuário para a página correspondente.
   */
  async router() {
    const { route, params } = this.getRouteInfo();
    const authenticated = Auth.isAuthenticated();

    // --- PROTEÇÃO DE ROTAS ---
    if (!authenticated && route !== '#login') {
      console.log('[Router] Acesso negado. Redirecionando para login.');
      window.location.hash = '#login';
      return;
    }

    if (authenticated && route === '#login') {
      console.log('[Router] Já autenticado. Redirecionando para histórico.');
      window.location.hash = '#historico';
      return;
    }

    // --- CARREGAMENTO DE TEMPLATES ---
    let templatePath = '';
    switch (route) {
      case '#login':
        templatePath = './pages/login.html';
        break;
      case '#nova-compra':
        templatePath = './pages/nova-compra.html';
        break;
      case '#compra':
        templatePath = './pages/compra.html';
        break;
      case '#historico':
        templatePath = './pages/historico.html';
        break;
      case '#estatisticas':
        templatePath = './pages/estatisticas.html';
        break;
      default:
        // Rota desconhecida vai para histórico
        window.location.hash = '#historico';
        return;
    }

    // --- GERENCIAMENTO DE VISIBILIDADE DO BOTTOM-NAV ---
    const bottomNav = document.getElementById('bottom-nav');
    if (bottomNav) {
      if (authenticated && (route === '#historico' || route === '#estatisticas')) {
        bottomNav.style.display = 'flex';
        
        // Atualiza estilo ativo
        const navHistorico = document.getElementById('nav-historico');
        const navEstatisticas = document.getElementById('nav-estatisticas');
        if (navHistorico && navEstatisticas) {
          navHistorico.classList.remove('active');
          navEstatisticas.classList.remove('active');
          
          if (route === '#historico') navHistorico.classList.add('active');
          if (route === '#estatisticas') navEstatisticas.classList.add('active');
        }
      } else {
        bottomNav.style.display = 'none';
      }
    }

    try {
      // Busca o template HTML (o Service Worker o servirá instantaneamente via cache)
      const response = await fetch(templatePath);
      if (!response.ok) throw new Error(`Não foi possível carregar o template: ${templatePath}`);
      
      const htmlContent = await response.text();
      
      // Injeta o conteúdo no contêiner com efeito de transição
      this.mainContainer.innerHTML = `<div class="fade-in-page">${htmlContent}</div>`;

      // --- INICIALIZAÇÃO DO CONTROLADOR CORRESPONDENTE ---
      this.initController(route, params);

    } catch (e) {
      console.error('[Router] Erro ao carregar página:', e);
      showToast('Erro ao carregar a página. Verifique a integridade do cache.', 'error');
    }
  },

  /**
   * Inicializa os scripts específicos de cada tela após injetar o HTML.
   */
  initController(route, params) {
    switch (route) {
      case '#login':
        if (typeof initLoginScreen === 'function') {
          initLoginScreen();
        } else {
          console.warn('initLoginScreen não definida.');
        }
        break;
      case '#nova-compra':
        if (typeof initNovaCompraScreen === 'function') {
          initNovaCompraScreen();
        } else {
          console.warn('initNovaCompraScreen não definida.');
        }
        break;
      case '#compra':
        if (typeof initCompraScreen === 'function') {
          if (params.id) {
            initCompraScreen(params.id);
          } else {
            showToast('Nenhuma compra selecionada.', 'error');
            window.location.hash = '#historico';
          }
        } else {
          console.warn('initCompraScreen não definida.');
        }
        break;
      case '#historico':
        if (typeof initHistoricoScreen === 'function') {
          initHistoricoScreen();
        } else {
          console.warn('initHistoricoScreen não definida.');
        }
        break;
      case '#estatisticas':
        if (typeof initEstatisticasScreen === 'function') {
          initEstatisticasScreen();
        } else {
          console.warn('initEstatisticasScreen não definida.');
        }
        break;
    }
  }
};

// Bootstrap do Aplicativo
document.addEventListener('DOMContentLoaded', () => {
  App.bootstrap();
});
