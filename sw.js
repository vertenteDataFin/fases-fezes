const CACHE_NAME = 'fases-e-fezes-v30';

// Fontes do Google e scripts do Firebase vêm de fora do site, com endereço versionado:
// ficam num cache próprio que sobrevive às atualizações do app.
const CACHE_EXTERNO = 'fases-e-fezes-externos';
const HOSTS_EXTERNOS = ['fonts.gstatic.com', 'www.gstatic.com'];

// Com sinal fraco, espera no máximo isso pela rede antes de abrir a versão guardada
const TEMPO_MAX_REDE_MS = 3500;

// Sem estes o app não abre offline: se falhar, a instalação falha e a versão anterior continua valendo
const ARQUIVOS_OBRIGATORIOS = [
  './',
  'flutter_bootstrap.js?v=30',
  'main.dart.js?v=30',
];

const ARQUIVOS_EXTRAS = [
  'index.html',
  'manifest.json?v=30',
  'favicon.png?v=30',
  'icons/app-logo-192.png?v=30',
  'assets/AssetManifest.bin',
  'assets/AssetManifest.bin.json',
  'assets/FontManifest.json',
  'assets/fonts/MaterialIcons-Regular.otf',
  'assets/packages/cupertino_icons/assets/CupertinoIcons.ttf',
  'assets/shaders/ink_sparkle.frag',
  'assets/shaders/stretch_effect.frag',
  'assets/assets/images/app_logo.png',
];

// Scripts do Firebase carregados por firebase_core_web (supportedFirebaseJsSdkVersion).
// Sem eles o Firebase não inicia e o app não abre offline. Atualizar ao subir a versão do firebase_core.
const FIREBASE_JS_SDK = '11.9.1';
const ARQUIVOS_FIREBASE = ['app', 'auth', 'firestore'].map(
  (m) => `https://www.gstatic.com/firebasejs/${FIREBASE_JS_SDK}/firebase-${m}.js`
);

function ehExterno(url) {
  return HOSTS_EXTERNOS.includes(url.hostname);
}

function podeGuardar(res) {
  return res && (res.status === 200 || res.type === 'opaque');
}

self.addEventListener('install', (event) => {
  console.log('[SW v30] Instalando...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(ARQUIVOS_OBRIGATORIOS.map((a) => new Request(a, { cache: 'reload' })));
      for (const asset of ARQUIVOS_EXTRAS) {
        try { await cache.add(new Request(asset, { cache: 'reload' })); } catch (_) {}
      }
    }).then(async () => {
      const externo = await caches.open(CACHE_EXTERNO);
      for (const url of ARQUIVOS_FIREBASE) {
        try {
          if (await externo.match(url)) continue;
          const res = await fetch(url, { mode: 'cors' });
          if (res.ok) await externo.put(url, res);
        } catch (_) {}
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW v30] Ativando...');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== CACHE_EXTERNO).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// A página manda a lista do que carregou (motor gráfico da variante do navegador, fontes, Firebase)
// para guardar o que ainda falta. Cobre a primeira visita e a troca de versão.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type !== 'GUARDAR_RECURSOS' || !Array.isArray(data.urls)) return;

  event.waitUntil((async () => {
    for (const u of data.urls) {
      let url;
      try { url = new URL(u); } catch (_) { continue; }
      const externo = ehExterno(url);
      if (url.origin !== self.location.origin && !externo) continue;
      if (url.pathname.endsWith('sw.js')) continue;
      if (await caches.match(u)) continue;
      try {
        const res = await fetch(u, { cache: externo ? 'default' : 'no-cache' });
        if (podeGuardar(res)) {
          const cache = await caches.open(externo ? CACHE_EXTERNO : CACHE_NAME);
          await cache.put(u, res);
        }
      } catch (_) {}
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const externo = ehExterno(url);
  if (url.origin !== self.location.origin && !externo) return;

  // Navegação: tenta a rede por até TEMPO_MAX_REDE_MS; sem resposta, abre a versão guardada
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const rede = fetch(request).then((res) => {
        if (res && res.status === 200) cache.put('./', res.clone());
        return res;
      });
      event.waitUntil(rede.catch(() => undefined));

      const guardado = await caches.match('./');
      if (!guardado) return rede;

      const limite = new Promise((resolve) => setTimeout(() => resolve(null), TEMPO_MAX_REDE_MS));
      try {
        const res = await Promise.race([rede, limite]);
        if (res && res.ok) return res;
      } catch (_) {}
      return guardado;
    })());
    return;
  }

  // Arquivos: Cache-First (abre rápido e funciona sem internet depois do primeiro carregamento)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (podeGuardar(res)) {
          const copy = res.clone();
          caches.open(externo ? CACHE_EXTERNO : CACHE_NAME).then((c) => c.put(request, copy));
        }
        return res;
      });
    })
  );
});
