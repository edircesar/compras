const CACHE_NAME = 'economia-inteligente-v7';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/sync.js',
  './js/auth.js',
  './js/compra.js',
  './js/historico.js',
  './js/estatisticas.js',
  './js/notificacoes.js',
  './pages/login.html',
  './pages/nova-compra.html',
  './pages/compra.html',
  './pages/historico.html',
  './pages/estatisticas.html',
  './pages/sobre.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/idb@8/build/umd.js'
];

// Instalação do Service Worker - Cacheia recursos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Cacheando todos os recursos estáticos');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Ativação do Service Worker - Limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removendo cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepção de Requisições (Fetch)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Estratégia Network-First para chamadas da API
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // Se a rede falhar, retorna uma resposta JSON padrão de falha de conexão
          return new Response(
            JSON.stringify({
              error: true,
              message: 'Você está offline. A operação foi salva localmente e será sincronizada assim que você se reconectar.',
              offline: true
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
  }
  // 2. Estratégia Cache-First para CDNs externas (libs de terceiros, fontes)
  else if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        }).catch(() => {
          // Retorna falha caso a CDN externa falhe offline
          return new Response('Recurso externo indisponível offline.', { status: 404 });
        });
      })
    );
  }
  // 3. Estratégia Network-First para assets locais (HTML, JS, CSS do próprio app)
  else {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Se a rede estiver online e retornar sucesso, atualiza o cache e retorna
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Se falhar (offline), tenta recuperar do cache local
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Se for uma navegação de página do SPA e falhar, cai no index.html
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
        })
    );
  }
});

// Ouvir o evento de Background Sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-compras') {
    console.log('[Service Worker] Background Sync acionado para compras');
    // Envia uma mensagem para todas as janelas do app executarem o sync
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ action: 'triggerSync' });
        });
      })
    );
  }
});

// Ouvir cliques nas notificações para abrir/focar o app e ir para a rota correta
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notificação clicada! Evento:', event);
  
  event.notification.close(); // Fecha o balão de notificação imediatamente

  // Define a URL destino (se fornecida nos dados, senão abre a página inicial)
  const targetUrl = event.notification.data ? event.notification.data.url : self.registration.scope;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se houver uma aba aberta, foca e redireciona ela para a URL destino
      for (const client of clientList) {
        if ('focus' in client) {
          // Navega até a rota destino e coloca em foco
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Se não houver nenhuma janela aberta, abre uma nova
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
