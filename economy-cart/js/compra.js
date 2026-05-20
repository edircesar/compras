// Controlador da Tela de Compras e Adição — Economy Cart PWA
// economy-cart/js/compra.js

// ==========================================
// 1. TELA DE NOVA COMPRA
// ==========================================

function initNovaCompraScreen() {
  const form = document.getElementById('nova-compra-form');
  const dateInput = document.getElementById('data-compra');
  const toggleLimite = document.getElementById('toggle-limite');
  const containerLimite = document.getElementById('container-valor-limite');
  const valorLimiteInput = document.getElementById('valor-limite');

  if (!form) return;

  // Preenche a data da compra com o dia atual local (AAAA-MM-DD)
  const hoje = new Date();
  const hojeString = hoje.getFullYear() + '-' + 
                     String(hoje.getMonth() + 1).padStart(2, '0') + '-' + 
                     String(hoje.getDate()).padStart(2, '0');
  dateInput.value = hojeString;

  // Ouvinte para mostrar/ocultar campo do limite de gastos
  toggleLimite.addEventListener('change', () => {
    if (toggleLimite.checked) {
      containerLimite.style.display = 'block';
      valorLimiteInput.setAttribute('required', 'required');
      valorLimiteInput.focus();
    } else {
      containerLimite.style.display = 'none';
      valorLimiteInput.removeAttribute('required');
      valorLimiteInput.value = '';
    }
  });

  // Ouvinte de envio do formulário de nova compra
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const local = document.getElementById('local-compra').value.trim();
    const data = dateInput.value;
    const temLimite = toggleLimite.checked;
    const limiteValor = temLimite ? parseFloat(valorLimiteInput.value) : null;

    if (!local || !data) {
      showToast('Preencha os campos obrigatórios.', 'error');
      return;
    }

    const user = Auth.getUser();
    if (!user) {
      showToast('Sessão expirada. Faça login novamente.', 'error');
      window.location.hash = '#login';
      return;
    }

    const novaCompra = {
      id: crypto.randomUUID(), // UUID local temporário
      usuario_id: user.id,
      local_compra: local,
      data_compra: data,
      tipo_limite: temLimite ? 'valor_maximo' : 'livre',
      valor_limite: limiteValor,
      total_geral: 0.00,
      sincronizado: 0,
      criado_em: new Date().toISOString()
    };

    try {
      // Salva no IndexedDB local
      await salvarCompra(novaCompra);
      showToast('Lista de compras iniciada!', 'success');
      
      // Redireciona para a tela de edição/compra com o ID gerado
      window.location.hash = `#compra?id=${novaCompra.id}`;
    } catch (err) {
      console.error(err);
      showToast('Erro ao criar a lista de compras.', 'error');
    }
  });
}

// ==========================================
// 2. TELA DE COMPRA ATIVA (CARRINHO)
// ==========================================

async function initCompraScreen(compraId) {
  // 1. Carrega dados do cabeçalho da compra
  const compra = await obterCompra(compraId);
  if (!compra) {
    showToast('Lista de compras não encontrada.', 'error');
    window.location.hash = '#historico';
    return;
  }

  // 2. Atualiza elementos visuais do cabeçalho
  const tituloLocal = document.getElementById('compra-titulo-local');
  const badgeStatus = document.getElementById('compra-badge-status');
  
  if (tituloLocal) tituloLocal.innerText = compra.local_compra;
  
  if (badgeStatus) {
    if (compra.sincronizado === 1) {
      badgeStatus.className = 'badge badge-sync';
      badgeStatus.innerText = 'Salvo na Nuvem';
    } else {
      badgeStatus.className = 'badge badge-offline';
      badgeStatus.innerText = 'Pendente Offline';
    }
  }

  // 3. Renderiza os itens e atualiza o orçamento
  await renderizarItensEAtualizar(compraId, compra);

  // 4. Configura ouvintes de eventos da tela de compra
  const addItemForm = document.getElementById('add-item-form');
  const inputProduto = document.getElementById('item-produto');
  const inputQuantidade = document.getElementById('item-quantidade');
  const inputValorUnitario = document.getElementById('item-valor-unitario');
  const btnFinalizar = document.getElementById('btn-finalizar-compra');
  const btnVoltarHistorico = document.getElementById('btn-voltar-historico');
  const btnLimparCarrinho = document.getElementById('btn-limpar-carrinho');

  // Adicionar novo item
  if (addItemForm) {
    // Remove listeners antigos para evitar duplicações em re-renderizações
    const novoForm = addItemForm.cloneNode(true);
    addItemForm.parentNode.replaceChild(novoForm, addItemForm);

    novoForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const produto = document.getElementById('item-produto').value.trim();
      const quantidade = parseFloat(document.getElementById('item-quantidade').value);
      const valorUnitario = parseFloat(document.getElementById('item-valor-unitario').value);

      if (!produto || isNaN(quantidade) || isNaN(valorUnitario) || quantidade <= 0 || valorUnitario <= 0) {
        showToast('Valores de quantidade e preço inválidos.', 'error');
        return;
      }

      const novoItem = {
        id: crypto.randomUUID(),
        compra_master_id: compraId,
        produto: produto,
        quantidade: quantidade,
        valor_unitario: valorUnitario
      };

      try {
        await salvarItem(novoItem);
        showToast(`"${produto}" adicionado!`, 'success');
        
        // Limpa campos e foca de volta no input de produto
        document.getElementById('item-produto').value = '';
        document.getElementById('item-quantidade').value = '1';
        document.getElementById('item-valor-unitario').value = '';
        document.getElementById('item-produto').focus();

        // Atualiza a visualização
        const compraAtualizada = await obterCompra(compraId);
        await renderizarItensEAtualizar(compraId, compraAtualizada);
        
        // Tenta disparar sync silencioso se online
        if (navigator.onLine) {
          SyncManager.syncPurchases();
        }
      } catch (err) {
        console.error(err);
        showToast('Erro ao salvar item no banco local.', 'error');
      }
    });
  }

  // Delegador de cliques na lista de itens (Deletar e ajustar quantidade)
  const itensContainer = document.getElementById('itens-container');
  if (itensContainer) {
    const novoContainer = itensContainer.cloneNode(true);
    itensContainer.parentNode.replaceChild(novoContainer, itensContainer);

    novoContainer.addEventListener('click', async (e) => {
      const deleteBtn = e.target.closest('.delete-item-btn');
      const qtyBtn = e.target.closest('.qty-adjuster-btn');

      // Caso A: Deletar item
      if (deleteBtn) {
        const itemId = deleteBtn.getAttribute('data-id');
        const nomeProduto = deleteBtn.getAttribute('data-nome');
        
        if (confirm(`Remover "${nomeProduto}" do carrinho?`)) {
          try {
            await excluirItem(itemId, compraId);
            showToast('Item removido.', 'info');
            
            const compraAtualizada = await obterCompra(compraId);
            await renderizarItensEAtualizar(compraId, compraAtualizada);

            if (navigator.onLine) {
              SyncManager.syncPurchases();
            }
          } catch (err) {
            console.error(err);
          }
        }
      }

      // Caso B: Ajustar quantidade via botões de + e - (Micro-animação e feedback instantâneo)
      if (qtyBtn) {
        const itemId = qtyBtn.getAttribute('data-id');
        const action = qtyBtn.getAttribute('data-action');
        
        try {
          const itens = await obterItens(compraId);
          const item = itens.find(it => it.id === itemId);
          if (!item) return;

          let novaQtd = item.quantidade;
          if (action === 'increment') {
            novaQtd += 1;
          } else if (action === 'decrement') {
            novaQtd -= 1;
          }

          if (novaQtd <= 0) {
            // Se cair para zero, pergunta se quer remover
            if (confirm(`Remover "${item.produto}" do carrinho?`)) {
              await excluirItem(itemId, compraId);
              showToast('Item removido.', 'info');
            }
          } else {
            item.quantidade = novaQtd;
            await salvarItem(item);
          }

          const compraAtualizada = await obterCompra(compraId);
          await renderizarItensEAtualizar(compraId, compraAtualizada);

          if (navigator.onLine) {
            SyncManager.syncPurchases();
          }
        } catch (err) {
          console.error(err);
        }
      }
    });
  }

  // Limpar todo o carrinho
  if (btnLimparCarrinho) {
    btnLimparCarrinho.onclick = async () => {
      if (confirm('Tem certeza que deseja remover TODOS os itens desta lista?')) {
        try {
          const itens = await obterItens(compraId);
          for (const item of itens) {
            await excluirItem(item.id, compraId);
          }
          showToast('Carrinho esvaziado.', 'info');
          const compraAtualizada = await obterCompra(compraId);
          await renderizarItensEAtualizar(compraId, compraAtualizada);

          if (navigator.onLine) {
            SyncManager.syncPurchases();
          }
        } catch (err) {
          console.error(err);
        }
      }
    };
  }

  // Finalizar Compra
  if (btnFinalizar) {
    btnFinalizar.onclick = () => {
      showToast('Compra finalizada com sucesso!', 'success');
      window.location.hash = '#historico';
      
      // Dispara sincronização em rede
      if (navigator.onLine) {
        SyncManager.syncPurchases();
      }
    };
  }

  // Fechar/Voltar
  if (btnVoltarHistorico) {
    btnVoltarHistorico.onclick = () => {
      window.location.hash = '#historico';
    };
  }
}

/**
 * Renderiza a lista de itens na tela e atualiza o widget de orçamento do footer.
 */
async function renderizarItensEAtualizar(compraId, compra) {
  const container = document.getElementById('itens-container');
  const qtdItensLabel = document.getElementById('compra-qtd-itens');
  if (!container) return;

  const itens = await obterItens(compraId);

  // Atualiza quantidade total de itens (contagem de linhas)
  if (qtdItensLabel) {
    qtdItensLabel.innerText = `Itens no carrinho (${itens.length})`;
  }

  // Se a lista estiver vazia
  if (itens.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--color-text-muted);">
        <p style="font-size: 1.5rem; margin-bottom: 8px;">🛒</p>
        <p>Seu carrinho está vazio.</p>
        <p style="font-size: 0.8rem; margin-top: 4px;">Adicione o nome e preço do produto acima para começar.</p>
      </div>
    `;
    atualizarOrcamento(compra, 0.00);
    return;
  }

  // Monta o HTML dinamicamente com os seletores de quantidade
  let html = '';
  let totalCalculado = 0;

  itens.forEach((item) => {
    totalCalculado += item.valor_total;
    
    // Formatação de quantidade: se for inteira não exibe casas decimais desnecessárias
    const qtdFormatada = Number(item.quantidade) % 1 === 0 ? 
                         parseInt(item.quantidade) : 
                         Number(item.quantidade).toFixed(3).replace(/\.?0+$/, '');

    html += `
      <div class="item-row">
        <div class="item-info">
          <div class="item-name">${item.produto}</div>
          <div class="item-qty-price" style="display: flex; align-items: center; margin-top: 4px;">
            <div class="qty-adjuster">
              <button class="qty-adjuster-btn" data-id="${item.id}" data-action="decrement">&minus;</button>
              <span class="qty-display">${qtdFormatada}</span>
              <button class="qty-adjuster-btn" data-id="${item.id}" data-action="increment">+</button>
            </div>
            <span>x R$ ${Number(item.valor_unitario).toFixed(2).replace('.', ',')}</span>
          </div>
        </div>
        <div class="item-total">R$ ${Number(item.valor_total).toFixed(2).replace('.', ',')}</div>
        <button class="delete-item-btn" data-id="${item.id}" data-nome="${item.produto}" title="Remover item">&times;</button>
      </div>
    `;
  });

  container.innerHTML = html;

  // Atualiza o widget de orçamento do rodapé
  atualizarOrcamento(compra, totalCalculado);
}

/**
 * Atualiza o footer de orçamento dinamicamente.
 * Verde -> Amarelo (>= 90%) -> Vermelho (>= 100%).
 */
function atualizarOrcamento(compra, totalAcumulado) {
  const footer = document.getElementById('footer-budget');
  const labelStatus = document.getElementById('budget-label-status');
  const totalLabel = document.getElementById('budget-total-acumulado');
  const limiteLabel = document.getElementById('budget-limite-maximo');

  if (!footer) return;

  // Exibe total formatado em Reais
  totalLabel.innerText = `R$ ${totalAcumulado.toFixed(2).replace('.', ',')}`;

  // Se for livre (sem limite)
  if (compra.tipo_limite === 'livre' || !compra.valor_limite) {
    footer.className = 'footer-budget bg-budget-safe';
    labelStatus.innerText = 'Total no Carrinho';
    limiteLabel.innerText = 'Sem limite definido';
    return;
  }

  const limite = parseFloat(compra.valor_limite);
  limiteLabel.innerText = `Limite: R$ ${limite.toFixed(2).replace('.', ',')}`;

  const percentual = totalAcumulado / limite;

  // Regra de coloração e alertas visuais
  if (percentual >= 1.0) {
    footer.className = 'footer-budget bg-budget-danger';
    labelStatus.innerText = 'Orçamento Estourado! ⚠️';
  } else if (percentual >= 0.90) {
    footer.className = 'footer-budget bg-budget-warning';
    labelStatus.innerText = 'Atenção: Limite Próximo (90%)! ⚠️';
  } else {
    footer.className = 'footer-budget bg-budget-safe';
    labelStatus.innerText = 'Total no Carrinho';
  }
}
