/** Shell offline do Local Music. Arquivos de música nunca são armazenados no cache. */
const CACHE_NAME = 'local-music-shell-v16';
const CACHE_PREFIX = 'local-music-shell-';
const APP_BASE = new URL('./', self.registration.scope);
const asset = path => new URL(path, APP_BASE).href;
const CACHE_COMPLETE_MARKER = asset('./__local_music_cache_complete__');

const STATIC_ASSETS = [
  './', './index.html', './welcome.html', './manifest.json',
  './css/style.css', './css/tokens.css', './css/base.css', './css/components.css', './css/player.css', './css/responsive.css',
  './js/app.js', './js/library.js', './js/metadata.js', './js/player.js', './js/queue.js', './js/search.js',
  './js/playlists.js', './js/favorites.js', './js/storage.js', './js/lyrics.js', './js/zip.js', './js/media-session.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'
].map(asset);
const STATIC_ASSET_URLS = new Set(STATIC_ASSETS);

const CACHEABLE_ORIGINS = new Set([
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://cdnjs.cloudflare.com'
]);
const APP_ASSET_DESTINATIONS = new Set(['script', 'style', 'image', 'font', 'manifest', 'worker']);
const EXTERNAL_ASSET_DESTINATIONS = new Set(['script', 'style', 'font']);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const existingCache = await caches.open(CACHE_NAME);
    if (await existingCache.match(CACHE_COMPLETE_MARKER)) {
      throw new Error('O nome do cache deve mudar antes de atualizar o shell.');
    }
    await caches.delete(CACHE_NAME);
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(STATIC_ASSETS);
      await cache.put(CACHE_COMPLETE_MARKER, new Response(CACHE_NAME));
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
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
    if (url.origin !== self.location.origin) return;
    event.respondWith(shellFirst(request));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const knownStaticAsset = sameOrigin && STATIC_ASSET_URLS.has(url.href);
  const cacheableAppAsset = sameOrigin && APP_ASSET_DESTINATIONS.has(request.destination);
  const cacheableExternalAsset = CACHEABLE_ORIGINS.has(url.origin) && EXTERNAL_ASSET_DESTINATIONS.has(request.destination);
  if (!knownStaticAsset && !cacheableAppAsset && !cacheableExternalAsset) return;

  event.respondWith(cacheFirst(request));
});

async function shellFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request) || await cache.match(asset('./index.html'));
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Local Music está offline. Abra o app on-line uma vez para concluir a instalação.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 504 });
  }
}
