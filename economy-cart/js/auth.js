// Controle de Autenticação e Sessão do Usuário — Economy Cart PWA
// economy-cart/js/auth.js

const API_AUTH_URL = './api/auth.php';

const Auth = {
  // Estado local em memória (cache dinâmico)
  _session: null,

  /**
   * Inicializa o estado de autenticação carregando dados do IndexedDB.
   */
  async init() {
    try {
      this._session = await obterSessao();
      console.log('[Auth] Estado carregado:', this._session ? 'Autenticado' : 'Não autenticado');
      return this._session;
    } catch (e) {
      console.error('[Auth] Erro ao inicializar sessão:', e);
      return null;
    }
  },

  /**
   * Verifica se o usuário está autenticado no momento.
   */
  isAuthenticated() {
    return this._session !== null;
  },

  /**
   * Retorna os dados do usuário logado.
   */
  getUser() {
    return this._session ? this._session.user : null;
  },

  /**
   * Retorna o token JWT ativo.
   */
  getToken() {
    return this._session ? this._session.token : null;
  },

  /**
   * Retorna cabeçalhos HTTP padrões contendo a autenticação Bearer JWT.
   */
  getHeaders() {
    const token = this.getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    };
  },

  /**
   * Realiza o cadastro de um novo usuário no servidor.
   */
  async register(nome, email, senha) {
    if (!navigator.onLine) {
      throw new Error('Você está offline. É necessário conexão com a internet para se cadastrar.');
    }

    try {
      const response = await fetch(`${API_AUTH_URL}?action=register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email, senha })
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.message || 'Falha no cadastro do usuário.');
      }

      // Salva sessão no banco local
      await salvarSessao(data.token, data.user);
      this._session = { token: data.token, user: data.user };

      return data;
    } catch (e) {
      console.error('[Auth] Erro no cadastro:', e);
      throw e;
    }
  },

  /**
   * Autentica um usuário existente no servidor.
   */
  async login(email, senha) {
    if (!navigator.onLine) {
      throw new Error('Você está offline. É necessário conexão com a internet para entrar na sua conta.');
    }

    try {
      const response = await fetch(`${API_AUTH_URL}?action=login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha })
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.message || 'E-mail ou senha incorretos.');
      }

      // Salva sessão local
      await salvarSessao(data.token, data.user);
      this._session = { token: data.token, user: data.user };

      return data;
    } catch (e) {
      console.error('[Auth] Erro no login:', e);
      throw e;
    }
  },

  /**
   * Encerra a sessão do usuário, limpa IndexedDB e redireciona para a tela de login.
   */
  async logout() {
    try {
      await limparSessao();
      this._session = null;
      window.location.hash = '#login';
      showToast('Sessão encerrada com sucesso.', 'info');
    } catch (e) {
      console.error('[Auth] Erro ao deslogar:', e);
    }
  }
};

/**
 * Inicializador da tela de Login/Cadastro (DOM).
 */
function initLoginScreen() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const toggleToRegister = document.getElementById('toggle-to-register');
  const toggleToLogin = document.getElementById('toggle-to-login');

  if (toggleToRegister) {
    toggleToRegister.addEventListener('click', (e) => {
      e.preventDefault();
      loginForm.style.display = 'none';
      registerForm.style.display = 'block';
      registerForm.classList.add('fade-in-page');
    });
  }

  if (toggleToLogin) {
    toggleToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      registerForm.style.display = 'none';
      loginForm.style.display = 'block';
      loginForm.classList.add('fade-in-page');
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const senha = document.getElementById('login-senha').value;
      
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerText;
      submitBtn.disabled = true;
      submitBtn.innerText = 'Entrando...';

      try {
        const res = await Auth.login(email, senha);
        showToast(`Bem-vindo de volta, ${res.user.nome}!`, 'success');
        window.location.hash = '#historico';
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = document.getElementById('register-nome').value;
      const email = document.getElementById('register-email').value;
      const senha = document.getElementById('register-senha').value;

      const submitBtn = registerForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerText;
      submitBtn.disabled = true;
      submitBtn.innerText = 'Cadastrando...';

      try {
        const res = await Auth.register(nome, email, senha);
        showToast(`Conta criada! Bem-vindo, ${res.user.nome}!`, 'success');
        window.location.hash = '#historico';
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
      }
    });
  }
}

