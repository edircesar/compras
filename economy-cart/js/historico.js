// Controlador da Tela de Histórico — Economy Cart PWA
// economy-cart/js/historico.js

/**
 * Inicializador da tela de Histórico.
 */
async function initHistoricoScreen() {
  const user = Auth.getUser();
  if (!user) {
    window.location.hash = '#login';
    return;
  }

  // 1. Atualiza saudação do usuário
  const saudacaoLabel = document.getElementById('historico-saudacao');
  if (saudacaoLabel) {
    saudacaoLabel.innerText = `Olá, ${user.nome}!`;
  }

  // Configura ouvinte para o sino de notificações
  const btnSino = document.getElementById('btn-sino-historico');
  if (btnSino) {
    if (typeof NotificacoesManager !== 'undefined') {
      NotificacoesManager.atualizarTodosOsSinos();
    }
    btnSino.onclick = () => {
      if (typeof NotificacoesManager !== 'undefined') {
        NotificacoesManager.dispararNotificacaoTeste();
      }
    };
  }

  // 2. Renderiza a lista de compras históricas salvas
  await renderizarHistorico();

  // 3. Configura ouvinte do botão de sincronização manual
  const btnSync = document.getElementById('btn-manual-sync');
  if (btnSync) {
    btnSync.onclick = async () => {
      if (!navigator.onLine) {
        showToast('Navegador offline. Não é possível sincronizar no momento.', 'error');
        return;
      }
      
      const originalText = btnSync.innerText;
      btnSync.disabled = true;
      btnSync.innerText = 'Sincronizando...';
      
      try {
        await SyncManager.syncPurchases();
        await renderizarHistorico();
      } catch (err) {
        console.error(err);
      } finally {
        btnSync.disabled = false;
        btnSync.innerText = originalText;
      }
    };
  }
}

/**
 * Renderiza dinamicamente as compras do IndexedDB no contêiner da página.
 */
async function renderizarHistorico() {
  const user = Auth.getUser();
  if (!user) return;

  const container = document.getElementById('historico-compras-container');
  const resumoTitulo = document.getElementById('historico-titulo-resumo');

  if (!container) return;

  try {
    // 1. Obtém as compras ordenadas do IndexedDB
    const compras = await listarCompras(user.id);

    // 2. Calcula as estatísticas gerais do usuário
    let totalGeralAcumulado = 0;
    compras.forEach(c => totalGeralAcumulado += c.total_geral);

    if (resumoTitulo) {
      resumoTitulo.innerText = `R$ ${totalGeralAcumulado.toFixed(2).replace('.', ',')}`;
    }

    // 3. Se não houver compras
    if (compras.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--color-text-muted);">
          <p style="font-size: 1.5rem; margin-bottom: 8px;">📋</p>
          <p>Nenhuma compra registrada.</p>
          <p style="font-size: 0.8rem; margin-top: 4px;">Toque no botão "+" abaixo para começar a economizar!</p>
        </div>
      `;
      return;
    }

    // 4. Monta os cards das compras
    let html = '';
    compras.forEach((compra) => {
      // Formata a data (de AAAA-MM-DD para DD/MM/AAAA)
      const dataPartes = compra.data_compra.split('-');
      const dataFormatada = dataPartes.length === 3 ? 
                             `${dataPartes[2]}/${dataPartes[1]}/${dataPartes[0]}` : 
                             compra.data_compra;

      const badgeClass = compra.sincronizado === 1 ? 'badge-sync' : 'badge-offline';
      const badgeText = compra.sincronizado === 1 ? 'Sincronizada' : 'Pendente Offline';

      // Informações sobre limite
      let limiteTexto = 'Livre (Sem limite)';
      if (compra.tipo_limite === 'valor_maximo' && compra.valor_limite) {
        limiteTexto = `Limite: R$ ${parseFloat(compra.valor_limite).toFixed(2).replace('.', ',')}`;
      }

      html += `
        <div class="card card-clickable" onclick="if(!event.target.closest('.btn-excluir-compra')) window.location.hash = '#compra?id=${compra.id}'">
          <div class="card-header-flex">
            <div>
              <div class="card-title">${compra.local_compra}</div>
              <div class="card-meta">${dataFormatada} &bull; ${limiteTexto}</div>
            </div>
            <span class="badge ${badgeClass}">${badgeText}</span>
          </div>
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(0,0,0,0.05);">
            <div>
              <span style="font-size: 0.75rem; color: var(--color-text-muted); display: block; text-transform: uppercase;">Total Acumulado</span>
              <span style="font-size: 1.25rem; font-weight: 800; color: var(--color-primary-dark);">
                R$ ${Number(compra.total_geral).toFixed(2).replace('.', ',')}
              </span>
            </div>
            
            <button class="btn-excluir-compra" data-id="${compra.id}" data-local="${compra.local_compra}" title="Excluir Lista" 
                    style="background: none; border: none; color: var(--color-alert-danger); cursor: pointer; padding: 8px; font-size: 1.2rem; display: flex; align-items: center; justify-content: center;">
              🗑️
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // 5. Configura ouvintes para botões de exclusão de compras
    const botoesExcluir = container.querySelectorAll('.btn-excluir-compra');
    botoesExcluir.forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation(); // Evita navegar para a tela de compras ao clicar na lixeira
        
        const compraId = btn.getAttribute('data-id');
        const localNome = btn.getAttribute('data-local');

        if (confirm(`Tem certeza de que deseja deletar a lista de compras do "${localNome}"? Esta ação removerá a lista e todos os seus itens localmente.`)) {
          try {
            await excluirCompra(compraId);
            showToast('Lista excluída do dispositivo.', 'info');
            await renderizarHistorico();
          } catch (err) {
            console.error(err);
            showToast('Erro ao excluir lista.', 'error');
          }
        }
      };
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--color-alert-danger);">
        <p>Erro ao ler o histórico local do dispositivo.</p>
      </div>
    `;
  }
}
