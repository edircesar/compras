// Camada de Persistência Local — IndexedDB (via idb v8)
// economy-cart/js/db.js

const DB_NAME = 'economia-inteligente-db';
const DB_VERSION = 1;

let dbPromise = null;

/**
 * Inicializa e abre a conexão com o IndexedDB.
 */
function getDB() {
  if (!dbPromise) {
    if (typeof idb === 'undefined') {
      console.error('A biblioteca idb não foi carregada. Verifique a conexão com a CDN.');
      return Promise.reject('idb undefined');
    }
    
    dbPromise = idb.openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        console.log(`[IndexedDB] Upgrading schema from version ${oldVersion} to ${newVersion}`);
        
        // 1. Store para sessão (JWT e dados do usuário)
        if (!db.objectStoreNames.contains('session')) {
          db.createObjectStore('session', { keyPath: 'key' });
        }
        
        // 2. Store para compras (tabela master)
        if (!db.objectStoreNames.contains('compras')) {
          const compraStore = db.createObjectStore('compras', { keyPath: 'id' });
          compraStore.createIndex('usuario_id', 'usuario_id');
          compraStore.createIndex('sincronizado', 'sincronizado');
        }
        
        // 3. Store para itens das compras
        if (!db.objectStoreNames.contains('itens')) {
          const itemStore = db.createObjectStore('itens', { keyPath: 'id' });
          itemStore.createIndex('compra_master_id', 'compra_master_id');
        }
      }
    });
  }
  return dbPromise;
}

// ==========================================
// FUNÇÕES DE SESSÃO E AUTENTICAÇÃO
// ==========================================

async function salvarSessao(token, user) {
  const db = await getDB();
  const tx = db.transaction('session', 'readwrite');
  await tx.store.put({ key: 'token', value: token });
  await tx.store.put({ key: 'user', value: user });
  await tx.done;
  console.log('[IndexedDB] Sessão salva localmente.');
}

async function obterSessao() {
  const db = await getDB();
  const tokenObj = await db.get('session', 'token');
  const userObj = await db.get('session', 'user');
  
  if (tokenObj && userObj) {
    return {
      token: tokenObj.value,
      user: userObj.value
    };
  }
  return null;
}

async function limparSessao() {
  const db = await getDB();
  const tx = db.transaction('session', 'readwrite');
  await tx.store.clear();
  await tx.done;
  console.log('[IndexedDB] Sessão limpa.');
}

// ==========================================
// FUNÇÕES DE COMPRAS (MASTER)
// ==========================================

async function salvarCompra(compra) {
  const db = await getDB();
  // Garante que campos obrigatórios existam
  if (!compra.id) compra.id = crypto.randomUUID();
  if (compra.sincronizado === undefined) compra.sincronizado = 0;
  if (compra.total_geral === undefined) compra.total_geral = 0.00;
  if (!compra.criado_em) compra.criado_em = new Date().toISOString();

  const tx = db.transaction('compras', 'readwrite');
  await tx.store.put(compra);
  await tx.done;
  console.log('[IndexedDB] Compra salva:', compra.id);
  return compra;
}

async function obterCompra(compraId) {
  const db = await getDB();
  return await db.get('compras', compraId);
}

async function listarCompras(usuarioId) {
  const db = await getDB();
  const todasCompras = await db.getAllFromIndex('compras', 'usuario_id', usuarioId);
  // Ordenar cronologicamente decrescente (data_compra, criado_em)
  return todasCompras.sort((a, b) => {
    const dataDiff = new Date(b.data_compra) - new Date(a.data_compra);
    if (dataDiff !== 0) return dataDiff;
    return new Date(b.criado_em) - new Date(a.criado_em);
  });
}

async function obterComprasNaoSincronizadas(usuarioId) {
  const db = await getDB();
  const todas = await db.getAllFromIndex('compras', 'usuario_id', usuarioId);
  return todas.filter(compra => compra.sincronizado === 0);
}

async function marcarSincronizado(compraId, idServidor) {
  const db = await getDB();
  const tx = db.transaction('compras', 'readwrite');
  const compra = await tx.store.get(compraId);
  if (compra) {
    compra.sincronizado = 1;
    compra.id_servidor = idServidor; // Referência da ID remota
    await tx.store.put(compra);
    console.log(`[IndexedDB] Compra ${compraId} marcada como sincronizada (ID Servidor: ${idServidor}).`);
  }
  await tx.done;
}

async function excluirCompra(compraId) {
  const db = await getDB();
  
  // Inicia transação combinada para deletar compra e itens
  const tx = db.transaction(['compras', 'itens'], 'readwrite');
  
  // 1. Exclui a compra master
  await tx.objectStore('compras').delete(compraId);
  
  // 2. Exclui todos os itens associados
  const itemStore = tx.objectStore('itens');
  const index = itemStore.index('compra_master_id');
  const itens = await index.getAll(compraId);
  
  for (const item of itens) {
    await itemStore.delete(item.id);
  }
  
  await tx.done;
  console.log(`[IndexedDB] Compra ${compraId} e seus itens foram removidos.`);
}

// ==========================================
// FUNÇÕES DE ITENS DA COMPRA
// ==========================================

async function obterItens(compraId) {
  const db = await getDB();
  return await db.getAllFromIndex('itens', 'compra_master_id', compraId);
}

/**
 * Salva ou atualiza um item e recalcula o total_geral da compra associada.
 */
async function salvarItem(item) {
  const db = await getDB();
  if (!item.id) item.id = crypto.randomUUID();
  item.valor_total = Number((item.quantidade * item.valor_unitario).toFixed(2));

  // Inicia transação para garantir consistência
  const tx = db.transaction(['compras', 'itens'], 'readwrite');
  
  // 1. Salva o item
  await tx.objectStore('itens').put(item);
  
  // 2. Recalcula o subtotal da compra
  const itensStore = tx.objectStore('itens');
  const index = itensStore.index('compra_master_id');
  const itens = await index.getAll(item.compra_master_id);
  
  let novoTotal = 0;
  for (const it of itens) {
    // Caso seja o próprio item atualizado, garante que pega os novos valores
    if (it.id === item.id) {
      novoTotal += item.valor_total;
    } else {
      novoTotal += it.valor_total;
    }
  }
  novoTotal = Number(novoTotal.toFixed(2));

  // 3. Atualiza na compra master
  const comprasStore = tx.objectStore('compras');
  const compra = await comprasStore.get(item.compra_master_id);
  if (compra) {
    compra.total_geral = novoTotal;
    compra.sincronizado = 0; // Desmarcado se foi modificado offline
    await comprasStore.put(compra);
  }

  await tx.done;
  console.log('[IndexedDB] Item salvo e compra atualizada:', item.id);
  return item;
}

/**
 * Remove um item e recalcula o total_geral da compra.
 */
async function excluirItem(itemId, compraId) {
  const db = await getDB();
  const tx = db.transaction(['compras', 'itens'], 'readwrite');
  
  // 1. Exclui o item
  await tx.objectStore('itens').delete(itemId);
  
  // 2. Recalcula o total
  const itensStore = tx.objectStore('itens');
  const index = itensStore.index('compra_master_id');
  const itens = await index.getAll(compraId);
  
  let novoTotal = 0;
  for (const it of itens) {
    novoTotal += it.valor_total;
  }
  novoTotal = Number(novoTotal.toFixed(2));

  // 3. Atualiza a compra master
  const comprasStore = tx.objectStore('compras');
  const compra = await comprasStore.get(compraId);
  if (compra) {
    compra.total_geral = novoTotal;
    compra.sincronizado = 0; // Desmarcado pois houve alteração offline
    await comprasStore.put(compra);
  }
  
  await tx.done;
  console.log('[IndexedDB] Item removido e total recalculado:', itemId);
}
