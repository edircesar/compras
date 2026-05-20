// Gerenciador de Notificações Locais e Dicas de Economia — Economy Cart PWA
// economy-cart/js/notificacoes.js

const DICAS_MOTIVACIONAIS = [
  "Não esqueça da sua economia na hora de comprar, use seu app de economia inteligente! 🛍️",
  "Planejar suas compras economiza até 30% do seu orçamento mensal. Crie uma nova lista hoje! 📊",
  "Compare os preços antes de comprar! Seu bolso e seu orçamento agradecem. 💸",
  "Evite fazer compras com fome, isso ajuda a manter o foco exclusivo nos itens da sua lista! 🛒",
  "Levar uma lista de compras evita compras desnecessárias por impulso. Economize mais! 📋",
  "Use a aba de Estatísticas para descobrir em qual mercado seus produtos favoritos são mais baratos! 💡"
];

const NotificacoesManager = {
  /**
   * Solicita permissão nativa para o navegador enviar notificações.
   */
  async solicitarPermissao() {
    if (!('Notification' in window)) {
      showToast('Este navegador não suporta notificações do sistema.', 'error');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      
      this.atualizarTodosOsSinos();

      if (permission === 'granted') {
        showToast('Notificações ativadas com sucesso! 🔔', 'success');
        // Envia uma notificação imediata de demonstração/boas-vindas
        this.enviarNotificacao(
          "Notificações Ativas! 🔔", 
          "Agora você receberá dicas inteligentes de economia e lembretes diários locais."
        );
        return true;
      } else if (permission === 'denied') {
        showToast('Permissão de notificações negada. Ative nas configurações do navegador.', 'info');
        return false;
      }
      return false;
    } catch (err) {
      console.error('[Notificações] Erro ao pedir permissão:', err);
      return false;
    }
  },

  /**
   * Dispara uma notificação nativa através do Service Worker registrado.
   * @param {string} titulo 
   * @param {string} corpo 
   */
  enviarNotificacao(titulo, corpo) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(titulo, {
          body: corpo,
          icon: './icons/icon-192.png',
          badge: './icons/icon-192.png',
          vibrate: [200, 100, 200],
          tag: 'economia-lembrete',
          renotify: true,
          data: {
            url: window.location.origin + window.location.pathname + '#estatisticas'
          }
        });
      }).catch((err) => {
        console.error('[Notificações] Erro ao obter Service Worker para notificar:', err);
        // Fallback para notificação sem Service Worker (caso SW não esteja pronto)
        new Notification(titulo, { body: corpo, icon: './icons/icon-192.png' });
      });
    } else {
      new Notification(titulo, { body: corpo, icon: './icons/icon-192.png' });
    }
  },

  /**
   * Verifica se já foi enviado um lembrete hoje. Caso contrário, gera uma dica e envia.
   */
  async verificarEEnviarLembreteDiario() {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const hoje = new Date().toDateString();
    const ultimoLembrete = localStorage.getItem('pwa_ultimo_lembrete_data');

    // Se já enviou uma notificação no dia de hoje, não faz nada
    if (ultimoLembrete === hoje) {
      console.log('[Notificações] Notificação diária já disparada hoje.');
      return;
    }

    try {
      // Gera a mensagem
      const mensagem = await this.gerarDicaDeEconomiaInteligente();

      // Envia
      this.enviarNotificacao("Economia Inteligente 🛍️", mensagem);

      // Registra a data
      localStorage.setItem('pwa_ultimo_lembrete_data', hoje);
      console.log('[Notificações] Lembrete diário disparado com sucesso.');
    } catch (err) {
      console.error('[Notificações] Erro no fluxo do lembrete diário:', err);
    }
  },

  /**
   * Vasculha o IndexedDB local para dar dicas personalizadas de preço baixo de produtos.
   * Se não houver dados, retorna uma dica motivacional padrão.
   */
  async gerarDicaDeEconomiaInteligente() {
    const user = Auth.getUser();
    if (!user) {
      return DICAS_MOTIVACIONAIS[Math.floor(Math.random() * DICAS_MOTIVACIONAIS.length)];
    }

    try {
      const compras = await listarCompras(user.id);
      
      if (compras.length === 0) {
        return DICAS_MOTIVACIONAIS[Math.floor(Math.random() * DICAS_MOTIVACIONAIS.length)];
      }

      // Reúne todos os itens comprados
      const allItems = [];
      for (const compra of compras) {
        const itens = await obterItens(compra.id);
        itens.forEach((item) => {
          allItems.push({
            produto: item.produto.trim(),
            valor_unitario: parseFloat(item.valor_unitario),
            local_compra: compra.local_compra,
            data_compra: compra.data_compra
          });
        });
      }

      if (allItems.length === 0) {
        return DICAS_MOTIVACIONAIS[Math.floor(Math.random() * DICAS_MOTIVACIONAIS.length)];
      }

      // Escolhe um produto aleatório da lista para analisar
      const itemAleatorio = allItems[Math.floor(Math.random() * allItems.length)];
      const nomeProduto = itemAleatorio.produto;

      // Filtra todos os registros desse produto específico
      const ocorrencias = allItems.filter(item => item.produto.toLowerCase() === nomeProduto.toLowerCase());

      // Ordena por preço unitário para encontrar o menor e o maior
      ocorrencias.sort((a, b) => a.valor_unitario - b.valor_unitario);

      const cheapest = ocorrencias[0];
      const mostExpensive = ocorrencias[ocorrencias.length - 1];

      // Se houver variação de preço
      if (cheapest.valor_unitario < mostExpensive.valor_unitario) {
        const economiaReal = mostExpensive.valor_unitario - cheapest.valor_unitario;
        return `Economize: O produto "${cheapest.produto}" foi encontrado por R$ ${cheapest.valor_unitario.toFixed(2).replace('.', ',')} no "${cheapest.local_compra}", economizando R$ ${economiaReal.toFixed(2).replace('.', ',')}!`;
      } else {
        // Se só comprou em um lugar ou mesmo preço
        return `Lembrete: O produto "${cheapest.produto}" está registrado por R$ ${cheapest.valor_unitario.toFixed(2).replace('.', ',')} no "${cheapest.local_compra}". Use o app para planejar seus gastos!`;
      }

    } catch (e) {
      console.warn('[Notificações] Falha ao ler banco local para dica personalizada:', e);
      return DICAS_MOTIVACIONAIS[Math.floor(Math.random() * DICAS_MOTIVACIONAIS.length)];
    }
  },

  /**
   * Atualiza a exibição de todos os botões de sino na interface.
   */
  atualizarTodosOsSinos() {
    const botoesSino = document.querySelectorAll('.btn-sino-notificacao');
    botoesSino.forEach((btn) => {
      if (!('Notification' in window)) {
        btn.innerHTML = '🔕';
        btn.title = 'Notificações não suportadas';
        btn.style.opacity = '0.5';
        return;
      }

      if (Notification.permission === 'granted') {
        btn.innerHTML = '🔔';
        btn.title = 'Notificações Ativas';
        btn.style.color = '#ffb703'; // Destaque âmbar/amarelo para ativas
        btn.style.borderColor = '#ffb703';
      } else if (Notification.permission === 'denied') {
        btn.innerHTML = '🔕';
        btn.title = 'Notificações Bloqueadas (Ative no navegador)';
        btn.style.color = 'var(--color-alert-danger)';
        btn.style.borderColor = 'var(--color-alert-danger)';
      } else {
        btn.innerHTML = '🔕';
        btn.title = 'Ativar Notificações de Economia';
        btn.style.color = 'rgba(255, 255, 255, 0.7)';
        btn.style.borderColor = 'rgba(255, 255, 255, 0.3)';
      }
    });
  },

  /**
   * Dispara uma notificação imediata de demonstração para o usuário testar a ativação.
   */
  async dispararNotificacaoTeste() {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      const ativado = await this.solicitarPermissao();
      if (!ativado) return;
    }

    const dica = await this.gerarDicaDeEconomiaInteligente();
    this.enviarNotificacao("Lembrete de Economia 🛍️", dica);
  }
};
