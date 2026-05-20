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
   * @param {boolean} isManual - Define se a sincronização foi solicitada manualmente pelo usuário para exibir feedbacks adicionais.
   */
  async syncPurchases(isManual = false) {
    // Evita múltiplas sincronizações simultâneas
    if (this.isSyncing) return;
    
    if (!navigator.onLine) {
      console.log('[Sync] Cancelando sincronização: Dispositivo offline.');
      if (isManual) {
        showToast('Navegador offline. Não é possível sincronizar no momento.', 'error');
      }
      return;
    }
    
    if (!Auth.isAuthenticated()) {
      console.log('[Sync] Cancelando sincronização: Usuário não autenticado.');
      if (isManual) {
        showToast('Você precisa estar logado para sincronizar suas compras.', 'error');
      }
      return;
    }

    this.isSyncing = true;
    const user = Auth.getUser();

    try {
      // ----------------------------------------------------
      // ETAPA 1: UPLOAD (ENVIAR COMPRAS PENDENTES LOCAIS)
      // ----------------------------------------------------
      const comprasPendentes = await obterComprasNaoSincronizadas(user.id);
      let syncSucedidos = 0;

      if (comprasPendentes.length > 0) {
        console.log(`[Sync] Encontradas ${comprasPendentes.length} compras locais para sincronizar.`);
        
        for (const compra of comprasPendentes) {
          if (isManual) {
            showToast(`Sincronizando compra: ${compra.local_compra}...`, 'info');
          }

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
          syncSucedidos++;
          
          if (isManual) {
            showToast(`Lista "${compra.local_compra}" salva na nuvem!`, 'success');
          }
        }
      } else {
        console.log('[Sync] Sem compras locais pendentes de envio.');
      }

      // ----------------------------------------------------
      // ETAPA 2: DOWNLOAD (BAIXAR COMPRAS DA NUVEM)
      // ----------------------------------------------------
      if (isManual) {
        showToast('Buscando compras salvas na nuvem...', 'info');
      }

      const responseGet = await fetch('./api/compras.php', {
        method: 'GET',
        headers: Auth.getHeaders()
      });

      if (!responseGet.ok) {
        throw new Error('Falha ao obter dados da nuvem.');
      }

      const comprasServidor = await responseGet.json();
      let listasBaixadas = 0;

      for (const compraServidor of comprasServidor) {
        // Tenta encontrar a compra localmente pelo id_local (que é a chave primária no IndexedDB)
        const compraLocal = await obterCompra(compraServidor.id_local);

        if (!compraLocal) {
          // Caso A: A lista NÃO existe localmente (criada em outro dispositivo)
          const responseItens = await fetch(`./api/itens.php?compra_master_id=${compraServidor.id}`, {
            method: 'GET',
            headers: Auth.getHeaders()
          });

          if (responseItens.ok) {
            const itensServidor = await responseItens.json();
            
            const novaCompraLocal = {
              id: compraServidor.id_local,
              usuario_id: user.id,
              local_compra: compraServidor.local_compra,
              data_compra: compraServidor.data_compra,
              tipo_limite: compraServidor.tipo_limite,
              valor_limite: compraServidor.valor_limite,
              total_geral: compraServidor.total_geral,
              sincronizado: 1,
              id_servidor: compraServidor.id,
              criado_em: new Date().toISOString()
            };

            const db = await getDB();
            const tx = db.transaction(['compras', 'itens'], 'readwrite');
            await tx.objectStore('compras').put(novaCompraLocal);

            const itemStore = tx.objectStore('itens');
            for (const itemS of itensServidor) {
              await itemStore.put({
                id: itemS.id_local,
                compra_master_id: compraServidor.id_local,
                produto: itemS.produto,
                quantidade: itemS.quantidade,
                valor_unitario: itemS.valor_unitario,
                valor_total: itemS.valor_total
              });
            }
            await tx.done;
            listasBaixadas++;
          }
        } else {
          // Caso B: A lista já existe localmente. Atualiza se houver divergência no total_geral
          // (indica que foi editada em outro dispositivo) ou se ainda constava como não sincronizada localmente
          if (Number(compraLocal.total_geral) !== Number(compraServidor.total_geral) || compraLocal.sincronizado === 0) {
            const responseItens = await fetch(`./api/itens.php?compra_master_id=${compraServidor.id}`, {
              method: 'GET',
              headers: Auth.getHeaders()
            });

            if (responseItens.ok) {
              const itensServidor = await responseItens.json();

              compraLocal.local_compra = compraServidor.local_compra;
              compraLocal.data_compra = compraServidor.data_compra;
              compraLocal.tipo_limite = compraServidor.tipo_limite;
              compraLocal.valor_limite = compraServidor.valor_limite;
              compraLocal.total_geral = compraServidor.total_geral;
              compraLocal.sincronizado = 1;
              compraLocal.id_servidor = compraServidor.id;

              const db = await getDB();
              const tx = db.transaction(['compras', 'itens'], 'readwrite');
              await tx.objectStore('compras').put(compraLocal);

              // Remove os itens locais antigos desta compra
              const itemStore = tx.objectStore('itens');
              const index = itemStore.index('compra_master_id');
              const itensLocaisAntigos = await index.getAll(compraLocal.id);
              for (const itemAntigo of itensLocaisAntigos) {
                await itemStore.delete(itemAntigo.id);
              }

              // Salva os novos itens vindos do servidor
              for (const itemS of itensServidor) {
                await itemStore.put({
                  id: itemS.id_local,
                  compra_master_id: compraServidor.id_local,
                  produto: itemS.produto,
                  quantidade: itemS.quantidade,
                  valor_unitario: itemS.valor_unitario,
                  valor_total: itemS.valor_total
                });
              }
              await tx.done;
              listasBaixadas++;
            }
          }
        }
      }

      // Se a tela atual for o histórico, força uma recarga visual
      if (window.location.hash === '#historico' && typeof renderizarHistorico === 'function') {
        await renderizarHistorico();
      }

      if (isManual) {
        if (syncSucedidos > 0 || listasBaixadas > 0) {
          showToast(`Sincronização concluída! Enviadas: ${syncSucedidos}, Recebidas: ${listasBaixadas}.`, 'success');
        } else {
          showToast('Tudo sob controle! Todas as suas compras já estão sincronizadas.', 'success');
        }
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
