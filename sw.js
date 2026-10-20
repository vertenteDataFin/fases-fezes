const CACHE_NAME = 'fases-e-fezes-v28';

const SHELL_ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'favicon.png'
];

// Install: instala apenas o shell mínimo e ativa imediatamente
self.addEventListener('install', (event) => {
  console.log('[SW v28] Instalando...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of SHELL_ASSETS) {
        try { await cache.add(asset); } catch (_) {}
      }
    })
  );
});

// Activate: purga caches antigos e assume o controle
self.addEventListener('activate', (event) => {
  console.log('[SW v28] Ativando...');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: Network-First para navegação, Cache-First para assets
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegação: sempre busca do servidor (garante HTML fresco)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put('./', copy));
          }
          return res;
        })
        .catch(() => caches.match('./'))
    );
    return;
  }

  // Assets: Cache-First (abre rápido depois do primeiro carregamento)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, copy));
        }
        return res;
      }).catch(() => undefined);
    })
  );
});
