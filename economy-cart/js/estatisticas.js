// Controlador da Tela de Estatísticas e Inteligência de Economia — Economy Cart PWA
// economy-cart/js/estatisticas.js

// Mantém referências aos gráficos ativos para destruí-los antes de recriar
const EstatisticasController = {
  chartGastosTempo: null,
  chartGastosLocal: null,
  chartProdutoPreco: null
};

/**
 * Inicializador da tela de Estatísticas.
 */
async function initEstatisticasScreen() {
  const user = Auth.getUser();
  if (!user) {
    window.location.hash = '#login';
    return;
  }

  // 1. Configura Botão de Exportação de PDF
  const btnExportPdf = document.getElementById('btn-export-pdf');
  if (btnExportPdf) {
    btnExportPdf.onclick = () => exportarRelatorioPDF(user.nome);
  }

  // Configura ouvinte para o sino de notificações
  const btnSino = document.getElementById('btn-sino-estatisticas');
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

  // 2. Processa dados e renderiza os painéis
  await carregarEProcessarEstatisticas(user.id);
}

/**
 * Carrega compras e itens do IndexedDB, realiza análises agregadas e renderiza a tela.
 */
async function carregarEProcessarEstatisticas(usuarioId) {
  try {
    // 1. Busca todas as compras locais ordenadas
    const compras = await listarCompras(usuarioId);
    
    // Se não houver compras cadastradas
    if (compras.length === 0) {
      renderizarTelaSemDados();
      return;
    }

    // 2. Busca de forma assíncrona todos os itens de cada compra
    const allItems = [];
    for (const compra of compras) {
      const itens = await obterItens(compra.id);
      itens.forEach((item) => {
        allItems.push({
          id: item.id,
          produto: item.produto.trim(),
          quantidade: parseFloat(item.quantidade),
          valor_unitario: parseFloat(item.valor_unitario),
          valor_total: parseFloat(item.valor_total),
          local_compra: compra.local_compra,
          data_compra: compra.data_compra,
          compra_id: compra.id
        });
      });
    }

    // 3. Cálculos de Métricas Gerais
    let totalGastoAcumulado = 0;
    compras.forEach(c => totalGastoAcumulado += parseFloat(c.total_geral));

    const totalListas = compras.length;
    const gastoMedio = totalListas > 0 ? (totalGastoAcumulado / totalListas) : 0;
    const totalItensQtd = allItems.length;

    // 4. Identificar Maior e Menor Compra
    let maiorCompra = null;
    let menorCompra = null;

    compras.forEach((compra) => {
      const valor = parseFloat(compra.total_geral);
      if (valor > 0) {
        if (!maiorCompra || valor > parseFloat(maiorCompra.total_geral)) {
          maiorCompra = compra;
        }
        if (!menorCompra || valor < parseFloat(menorCompra.total_geral)) {
          menorCompra = compra;
        }
      }
    });

    // 5. Injeta as métricas gerais no HTML
    document.getElementById('stat-total-gasto').innerText = `R$ ${totalGastoAcumulado.toFixed(2).replace('.', ',')}`;
    document.getElementById('stat-gasto-medio').innerText = `R$ ${gastoMedio.toFixed(2).replace('.', ',')}`;
    document.getElementById('stat-total-listas').innerText = totalListas;
    document.getElementById('stat-total-itens').innerText = totalItensQtd;

    // Preenche informações de Maior Compra
    const labelMaior = document.getElementById('stat-maior-compra');
    const labelMaiorMeta = document.getElementById('stat-maior-compra-meta');
    if (maiorCompra) {
      labelMaior.innerText = `R$ ${parseFloat(maiorCompra.total_geral).toFixed(2).replace('.', ',')}`;
      labelMaiorMeta.innerHTML = `${maiorCompra.local_compra}<br><span style="font-size:0.7rem; font-weight:normal;">${formatarDataString(maiorCompra.data_compra)}</span>`;
    } else {
      labelMaior.innerText = 'R$ 0,00';
      labelMaiorMeta.innerText = 'Nenhuma registrada';
    }

    // Preenche informações de Menor Compra
    const labelMenor = document.getElementById('stat-menor-compra');
    const labelMenorMeta = document.getElementById('stat-menor-compra-meta');
    if (menorCompra) {
      labelMenor.innerText = `R$ ${parseFloat(menorCompra.total_geral).toFixed(2).replace('.', ',')}`;
      labelMenorMeta.innerHTML = `${menorCompra.local_compra}<br><span style="font-size:0.7rem; font-weight:normal;">${formatarDataString(menorCompra.data_compra)}</span>`;
    } else {
      labelMenor.innerText = 'R$ 0,00';
      labelMenorMeta.innerText = 'Nenhuma registrada';
    }

    // 6. Configura e popula o consultor de economia de produto
    configurarConsultorEconomia(allItems);

    // 7. Renderiza Gráficos Gerais
    renderizarGraficoEvolucaoTempo(compras);
    renderizarGraficoGastosPorLocal(compras);

  } catch (err) {
    console.error('[Estatísticas] Erro ao carregar dados:', err);
    showToast('Erro ao carregar dados do painel.', 'error');
  }
}

/**
 * Caso o usuário não tenha nenhuma compra registrada localmente.
 */
function renderizarTelaSemDados() {
  const container = document.getElementById('estatisticas-relatorio-container');
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--color-text-muted);">
        <p style="font-size: 3rem; margin-bottom: 16px;">📈</p>
        <h2 style="color: var(--color-primary-dark); margin-bottom: 8px;">Dados insuficientes</h2>
        <p>Você precisa registrar pelo menos 1 lista de compras ativa com itens para gerar estatísticas econômicas.</p>
        <p style="font-size: 0.85rem; margin-top: 8px; color: var(--color-text-muted);">
          Toque na aba "Minhas Compras" e utilize o botão "+" para iniciar a sua primeira lista!
        </p>
      </div>
    `;
  }
}

/**
 * Configura o consultor de economia: popula nomes únicos de produtos e escuta mudanças.
 */
function configurarConsultorEconomia(allItems) {
  const selectProduto = document.getElementById('advisor-produto-select');
  const divResultados = document.getElementById('advisor-resultados');
  const divVazio = document.getElementById('advisor-vazio');

  if (!selectProduto) return;

  // Extrai nomes de produtos únicos e ordena alfabeticamente
  const produtosUnicos = [...new Set(allItems.map(item => item.produto.toLowerCase()))]
    .map(prodLower => {
      // Tenta encontrar o nome com a primeira letra maiúscula original
      const original = allItems.find(item => item.produto.toLowerCase() === prodLower);
      return original ? original.produto : prodLower;
    })
    .sort((a, b) => a.localeCompare(b));

  // Limpa opções antigas e insere novas
  selectProduto.innerHTML = '<option value="">Selecione um produto...</option>';
  produtosUnicos.forEach((prod) => {
    const opt = document.createElement('option');
    opt.value = prod.toLowerCase();
    opt.innerText = prod;
    selectProduto.appendChild(opt);
  });

  // Evento ao mudar o produto selecionado
  selectProduto.onchange = () => {
    const selectedProd = selectProduto.value;
    
    if (!selectedProd) {
      divResultados.style.display = 'none';
      divVazio.style.display = 'block';
      return;
    }

    divVazio.style.display = 'none';
    divResultados.style.display = 'block';

    // Filtra todas as ocorrências do produto selecionado
    const ocorrencias = allItems.filter(item => item.produto.toLowerCase() === selectedProd);

    // Identificar Menor e Maior Preço Unitário
    let menorPrecoItem = null;
    let maiorPrecoItem = null;

    ocorrencias.forEach((item) => {
      if (!menorPrecoItem || item.valor_unitario < menorPrecoItem.valor_unitario) {
        menorPrecoItem = item;
      }
      if (!maiorPrecoItem || item.valor_unitario > maiorPrecoItem.valor_unitario) {
        maiorPrecoItem = item;
      }
    });

    // Injeta os dados
    if (menorPrecoItem) {
      document.getElementById('advisor-preco-min').innerText = `R$ ${menorPrecoItem.valor_unitario.toFixed(2).replace('.', ',')}`;
      document.getElementById('advisor-meta-min').innerHTML = `${menorPrecoItem.local_compra}<br><span style="font-size:0.7rem; font-weight:normal;">${formatarDataString(menorPrecoItem.data_compra)}</span>`;
    }

    if (maiorPrecoItem) {
      document.getElementById('advisor-preco-max').innerText = `R$ ${maiorPrecoItem.valor_unitario.toFixed(2).replace('.', ',')}`;
      document.getElementById('advisor-meta-max').innerHTML = `${maiorPrecoItem.local_compra}<br><span style="font-size:0.7rem; font-weight:normal;">${formatarDataString(maiorPrecoItem.data_compra)}</span>`;
    }

    // Calcula Economia Potencial
    const containerSaving = document.getElementById('advisor-box-saving');
    const labelDiferenca = document.getElementById('advisor-economia-valor');
    const labelPercentual = document.getElementById('advisor-economia-percentual');

    if (menorPrecoItem && maiorPrecoItem && menorPrecoItem.valor_unitario < maiorPrecoItem.valor_unitario) {
      containerSaving.style.display = 'flex';
      const dif = maiorPrecoItem.valor_unitario - menorPrecoItem.valor_unitario;
      const pct = (dif / maiorPrecoItem.valor_unitario) * 100;
      
      labelDiferenca.innerText = `Economia de R$ ${dif.toFixed(2).replace('.', ',')} por unidade!`;
      labelPercentual.innerText = `Você paga ${pct.toFixed(0)}% a menos comprando no local mais barato.`;
    } else {
      // Sem diferença de preço (só comprou em um lugar ou mesmo preço em tudo)
      containerSaving.style.display = 'none';
    }

    // Renderiza Gráfico da Variação de Preço deste Produto
    renderizarGraficoVariacaoPrecoProduto(ocorrencias);
  };
}

// ==========================================
// FUNÇÕES DE PLOTAGEM DE GRÁFICOS (CHART.JS)
// ==========================================

/**
 * Gráfico 1: Evolução Histórica de Gastos (Linha)
 */
function renderizarGraficoEvolucaoTempo(compras) {
  const ctx = document.getElementById('chart-gastos-tempo');
  if (!ctx) return;

  // Ordena compras cronologicamente de forma crescente (mais antiga para mais recente)
  const cronologico = [...compras].reverse();

  const labels = cronologico.map(c => {
    const dataFmt = c.data_compra.split('-');
    const diaMes = dataFmt.length === 3 ? `${dataFmt[2]}/${dataFmt[1]}` : c.data_compra;
    // Encurta nome do local se for muito longo
    const localCurto = c.local_compra.length > 10 ? c.local_compra.substring(0, 10) + '..' : c.local_compra;
    return `${diaMes} - ${localCurto}`;
  });
  
  const valores = cronologico.map(c => parseFloat(c.total_geral));

  // Destrói gráfico anterior se houver
  if (EstatisticasController.chartGastosTempo) {
    EstatisticasController.chartGastosTempo.destroy();
  }

  // Cria gradiente esmeralda premium
  const canvasCtx = ctx.getContext('2d');
  const gradient = canvasCtx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, 'rgba(45, 106, 79, 0.4)');
  gradient.addColorStop(1, 'rgba(45, 106, 79, 0.02)');

  EstatisticasController.chartGastosTempo = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Valor da Compra (R$)',
        data: valores,
        borderColor: '#2d6a4f',
        borderWidth: 3,
        backgroundColor: gradient,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#1b4332',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1.5,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(27, 67, 50, 0.9)',
          titleFont: { size: 12, weight: 'bold' },
          bodyFont: { size: 12 },
          callbacks: {
            label: function(context) {
              return ` Total: R$ ${context.parsed.y.toFixed(2).replace('.', ',')}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0, 0, 0, 0.05)' },
          ticks: {
            callback: value => 'R$ ' + value,
            font: { size: 10 }
          }
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 0 }
        }
      }
    }
  });
}

/**
 * Gráfico 2: Gastos Acumulados por Local (Barras)
 */
function renderizarGraficoGastosPorLocal(compras) {
  const ctx = document.getElementById('chart-gastos-local');
  if (!ctx) return;

  // Agrupa gastos por estabelecimento
  const locaisGroup = {};
  compras.forEach((c) => {
    const local = c.local_compra.trim();
    locaisGroup[local] = (locaisGroup[local] || 0) + parseFloat(c.total_geral);
  });

  // Transforma em array e ordena do mais gasto para o menos
  const locaisSorted = Object.entries(locaisGroup)
    .map(([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor);

  const labels = locaisSorted.map(item => item.nome.length > 15 ? item.nome.substring(0, 13) + '..' : item.nome);
  const valores = locaisSorted.map(item => item.valor);

  // Destrói gráfico anterior
  if (EstatisticasController.chartGastosLocal) {
    EstatisticasController.chartGastosLocal.destroy();
  }

  // Paleta de verdes do mais escuro ao mais claro
  const colors = [
    '#1b4332',
    '#2d6a4f',
    '#40916c',
    '#52b788',
    '#74c69d',
    '#95d5b2',
    '#b7e4c7'
  ];

  EstatisticasController.chartGastosLocal = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        data: valores,
        backgroundColor: valores.map((_, i) => colors[i % colors.length]),
        borderRadius: 6,
        borderWidth: 0,
        barPercentage: 0.6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(27, 67, 50, 0.9)',
          callbacks: {
            label: function(context) {
              return ` Acumulado: R$ ${context.parsed.y.toFixed(2).replace('.', ',')}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0, 0, 0, 0.05)' },
          ticks: {
            callback: value => 'R$ ' + value,
            font: { size: 10 }
          }
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 } }
        }
      }
    }
  });
}

/**
 * Gráfico 3: Histórico Dinâmico de Preço do Produto (Linha com Marcadores)
 */
function renderizarGraficoVariacaoPrecoProduto(ocorrencias) {
  const ctx = document.getElementById('chart-produto-preco');
  if (!ctx) return;

  // Ordena as compras do produto por data crescente
  const sorted = [...ocorrencias].sort((a, b) => new Date(a.data_compra) - new Date(b.data_compra));

  const labels = sorted.map((item) => {
    const d = item.data_compra.split('-');
    const diaMes = d.length === 3 ? `${d[2]}/${d[1]}` : item.data_compra;
    const localCurto = item.local_compra.length > 8 ? item.local_compra.substring(0, 8) + '.' : item.local_compra;
    return `${diaMes} - ${localCurto}`;
  });

  const precosUnitarios = sorted.map(item => item.valor_unitario);

  // Destrói gráfico anterior
  if (EstatisticasController.chartProdutoPreco) {
    EstatisticasController.chartProdutoPreco.destroy();
  }

  EstatisticasController.chartProdutoPreco = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Preço Unitário (R$)',
        data: precosUnitarios,
        borderColor: '#ffb703', // Destaque em âmbar para diferenciar dos gráficos gerais
        borderWidth: 2.5,
        backgroundColor: 'rgba(255, 183, 3, 0.1)',
        fill: true,
        tension: 0.1,
        pointBackgroundColor: '#f4511e',
        pointBorderColor: '#ffffff',
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(33, 37, 41, 0.95)',
          callbacks: {
            label: function(context) {
              const itemOrig = sorted[context.dataIndex];
              return ` R$ ${context.parsed.y.toFixed(2).replace('.', ',')} (${itemOrig.quantidade} unid.)`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false, // Foca melhor nas flutuações de centavos
          grid: { color: 'rgba(0, 0, 0, 0.05)' },
          ticks: {
            callback: value => 'R$ ' + value.toFixed(2),
            font: { size: 9 }
          }
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 8 } }
        }
      }
    }
  });
}

// ==========================================
// EXPORTAÇÃO DO RELATÓRIO PDF (HTML2PDF)
// ==========================================

/**
 * Captura e exporta a tela de estatísticas como um PDF limpo e profissional.
 */
function exportarRelatorioPDF(nomeUsuario) {
  const element = document.getElementById('estatisticas-relatorio-container');
  if (!element) {
    showToast('Erro ao capturar painel para PDF.', 'error');
    return;
  }

  showToast('Preparando relatório PDF...', 'info');

  // Ajusta opções para gerar um documento elegante em A4
  const opt = {
    margin: [12, 12, 12, 12],
    filename: `Relatorio-Economia-Inteligente-${nomeUsuario.replace(/\s+/g, '-')}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { 
      scale: 2.5, // Resolução premium super nítida
      useCORS: true,
      logging: false,
      backgroundColor: '#f4f7f5'
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  // Executa biblioteca externa carregada via CDN e cacheada offline
  if (typeof html2pdf !== 'undefined') {
    html2pdf()
      .from(element)
      .set(opt)
      .save()
      .then(() => {
        showToast('Relatório PDF exportado com sucesso!', 'success');
      })
      .catch((err) => {
        console.error('[PDF] Erro ao exportar:', err);
        showToast('Falha ao exportar PDF.', 'error');
      });
  } else {
    showToast('html2pdf não foi carregado. Verifique conexão.', 'error');
  }
}

// ==========================================
// FUNÇÕES AUXILIARES UTILITÁRIAS
// ==========================================

/**
 * Formata data de 'AAAA-MM-DD' para 'DD/MM/AAAA'
 */
function formatarDataString(dataStr) {
  if (!dataStr) return '';
  const partes = dataStr.split('-');
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return dataStr;
}
