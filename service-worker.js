/** Shell offline do Local Music. Arquivos de música nunca são armazenados no cache. */
const CACHE_NAME = 'local-music-shell-v13';
const CACHE_PREFIX = 'local-music-shell-';
const APP_BASE = new URL('./', self.registration.scope);
const asset = path => new URL(path, APP_BASE).href;

const STATIC_ASSETS = [
  './', './index.html', './welcome.html', './manifest.json',
  './css/style.css', './css/tokens.css', './css/base.css', './css/components.css', './css/player.css', './css/responsive.css',
  './js/app.js', './js/library.js', './js/metadata.js', './js/player.js', './js/queue.js', './js/search.js',
  './js/playlists.js', './js/favorites.js', './js/storage.js', './js/lyrics.js', './js/zip.js', './js/media-session.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'
].map(asset);

const CACHEABLE_ORIGINS = new Set([
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://cdnjs.cloudflare.com'
]);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.protocol === 'blob:' || request.destination === 'audio') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const allowedExternal = CACHEABLE_ORIGINS.has(url.origin);
  if (!sameOrigin && !allowedExternal) return;

  const changingAsset = sameOrigin && ['script', 'style', 'worker'].includes(request.destination);
  event.respondWith(changingAsset ? staleWhileRevalidate(request) : cacheFirst(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request))
      || (await caches.match(asset('./index.html')))
      || new Response('Local Music está offline. Abra o app on-line uma vez para concluir a instalação.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const update = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || (await update) || new Response('', { status: 504 });
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 504 });
  }
}
