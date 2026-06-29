/**
 * service-worker.js
 * Estratégia Cache First para assets estáticos do Local Music.
 * Músicas nunca são cacheadas — ficam no dispositivo do usuário.
 * O app funciona offline após a primeira visita.
 */

const CACHE_NAME    = 'LocalMusic-v2';
const CACHE_VERSION = 2;

/** Assets estáticos que serão cacheados no install */
const STATIC_ASSETS = [
  '/LocalMusic/',
  '/LocalMusic/index.html',
  '/LocalMusic/css/style.css',
  '/LocalMusic/js/app.js',
  '/LocalMusic/js/library.js',
  '/LocalMusic/js/metadata.js',
  '/LocalMusic/js/player.js',
  '/LocalMusic/js/queue.js',
  '/LocalMusic/js/search.js',
  '/LocalMusic/js/playlists.js',
  '/LocalMusic/js/favorites.js',
  '/LocalMusic/js/download.js',
  '/LocalMusic/js/storage.js',
  '/LocalMusic/js/ui.js',
  '/LocalMusic/assets/default-cover.svg',
  '/LocalMusic/assets/logo.svg',
  '/LocalMusic/icons/icon.svg',
  '/LocalMusic/icons/icon-192.png',
  '/LocalMusic/icons/icon-512.png',
  '/LocalMusic/manifest.json'
];

/** Domínios externos permitidos em cache (fontes e CDN) */
const CACHEABLE_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://cdnjs.cloudflare.com'
];

// ── Install ───────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      // Ativa imediatamente sem esperar tabs antigas fecharem
      return self.skipWaiting();
    })
  );
});

// ── Activate ──────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => {
      // Assume controle de todas as tabs abertas imediatamente
      return self.clients.claim();
    })
  );
});

// ── Fetch ─────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca cacheia requisições para a cobalt.tools API
  if (url.hostname === 'api.cobalt.tools') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Nunca cacheia arquivos de áudio (blob: ou qualquer audio/*)
  if (event.request.destination === 'audio') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Nunca cacheia requisições de blob URLs
  if (url.protocol === 'blob:') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache First para assets do próprio app e origens externas permitidas
  const isSameOrigin    = url.origin === self.location.origin;
  const isAllowedOrigin = CACHEABLE_ORIGINS.some(o => event.request.url.startsWith(o));

  if (isSameOrigin || isAllowedOrigin) {
    event.respondWith(_cacheFirst(event.request));
    return;
  }

  // Qualquer outra requisição vai direto para a rede
  event.respondWith(fetch(event.request));
});

// ── Estratégias ───────────────────────────────────────────────

/**
 * Cache First: serve do cache se disponível, senão busca na rede
 * e salva no cache para uso futuro.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function _cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);

    // Só cacheia respostas válidas (status 200, tipo básico ou cors)
    if (
      response.ok &&
      (response.type === 'basic' || response.type === 'cors')
    ) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }

    return response;
  } catch {
    // Offline e sem cache: retorna página de fallback se disponível
    const fallback = await caches.match('/LocalMusic/index.html');
    return fallback || new Response('Offline — abra o app quando estiver conectado.', {
      status:  503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}