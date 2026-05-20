// Mecanismo de Sincronização Offline -> Online — Economy Cart PWA
// economy-cart/js/sync.js

const SyncManager = {
  isSyncing: false,

  /**
   * Inicializa ouvintes de eventos de rede para sincronizar automaticamente.
   */
  init() {
    // 1. Ouvir o evento global de reestabelecimento de conexão
    window.addEventListener('online', () => {
      console.log('[Sync] Navegador online. Disparando sincronização...');
      showToast('Conexão restabelecida! Sincronizando dados...', 'info');
      this.syncPurchases();
    });

    // 2. Ouvir mensagens do Service Worker (Background Sync event)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.action === 'triggerSync') {
          console.log('[Sync] Recebido comando triggerSync do Service Worker.');
          this.syncPurchases();
        }
      });
    }

    // Tenta sincronizar logo na inicialização se estiver online
    if (navigator.onLine) {
      this.syncPurchases();
    }
  },

  /**
   * Tenta sincronizar todas as compras locais pendentes com o MySQL remoto.
   */
  async syncPurchases() {
    // Evita múltiplas sincronizações simultâneas
    if (this.isSyncing) return;
    if (!navigator.onLine) {
      console.log('[Sync] Cancelando sincronização: Dispositivo offline.');
      return;
    }
    if (!Auth.isAuthenticated()) {
      console.log('[Sync] Cancelando sincronização: Usuário não autenticado.');
      return;
    }

    this.isSyncing = true;
    const user = Auth.getUser();

    try {
      // 1. Obtém todas as compras pendentes do IndexedDB
      const comprasPendentes = await obterComprasNaoSincronizadas(user.id);
      
      if (comprasPendentes.length === 0) {
        console.log('[Sync] Sem compras pendentes de sincronização.');
        this.isSyncing = false;
        return;
      }

      console.log(`[Sync] Encontradas ${comprasPendentes.length} compras para sincronizar.`);

      for (const compra of comprasPendentes) {
        showToast(`Sincronizando compra: ${compra.local_compra}...`, 'info');

        // Etapa A: Sincronizar Compra Mestre
        const responseMaster = await fetch('./api/compras.php', {
          method: 'POST',
          headers: Auth.getHeaders(),
          body: JSON.stringify({
            id_local: compra.id,
            local_compra: compra.local_compra,
            data_compra: compra.data_compra,
            tipo_limite: compra.tipo_limite,
            valor_limite: compra.valor_limite,
            total_geral: compra.total_geral
          })
        });

        const dataMaster = await responseMaster.json();

        if (!responseMaster.ok || dataMaster.error) {
          throw new Error(dataMaster.message || 'Falha ao sincronizar cabeçalho da compra.');
        }

        const idServidor = dataMaster.id_servidor;

        // Etapa B: Buscar e Sincronizar Itens vinculados no IndexedDB
        const itensLocais = await obterItens(compra.id);

        // Mesmo se a lista de itens estiver vazia, sincroniza para refletir no servidor
        const responseItens = await fetch('./api/itens.php', {
          method: 'POST',
          headers: Auth.getHeaders(),
          body: JSON.stringify({
            compra_master_id: idServidor,
            itens: itensLocais.map(item => ({
              id_local: item.id,
              produto: item.produto,
              quantidade: item.quantidade,
              valor_unitario: item.valor_unitario
            }))
          })
        });

        const dataItens = await responseItens.json();

        if (!responseItens.ok || dataItens.error) {
          throw new Error(dataItens.message || 'Falha ao sincronizar itens.');
        }

        // Etapa C: Atualizar IndexedDB local marcando sincronizado = 1
        await marcarSincronizado(compra.id, idServidor);
        
        showToast(`Lista "${compra.local_compra}" salva na nuvem!`, 'success');
      }

      // Se a tela atual for o histórico, força uma recarga visual
      if (window.location.hash === '#historico' && typeof renderizarHistorico === 'function') {
        renderizarHistorico();
      }

    } catch (error) {
      console.error('[Sync] Falha na sincronização:', error);
      showToast(`Erro ao sincronizar dados: ${error.message}`, 'error');
    } finally {
      this.isSyncing = false;
    }
  },

  /**
   * Registra a tag de Background Sync na PWA para tratamento no Service Worker.
   */
  async registerBackgroundSync() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-compras');
        console.log('[Sync] Background Sync "sync-compras" registrado.');
      } catch (e) {
        console.warn('[Sync] Background Sync não suportado ou falhou. Fallback ativo.', e);
      }
    }
  }
};
