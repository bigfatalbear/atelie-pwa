/**
 * sw.js — Service Worker do Ateliê Manager
 * Estratégia:
 *   - App shell (HTML/CSS/JS/CDN): cache-first + background refresh (stale-while-revalidate)
 *   - Navegação: network-first com fallback ao cache (permite uso 100% offline)
 *   - Demais requisições: network-first
 */
const CACHE_NAME = 'atelie-v11';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.jpg',
  './icons/icon-512.jpg',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/supabase-sync.js',
  './js/precificacao.js',
  './js/precificacao-core.mjs',
  './js/estoque.mjs',
  './js/catalogo.mjs',
  './js/kanban.js',
  './js/whatsapp.mjs',
  // CDNs do app congelados no cache para uso offline
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/dexie@4.0.8/dist/dexie.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
];

// ---------- INSTALAÇÃO: pré-cache do app shell ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
      .catch((error) => caches.delete(CACHE_NAME).then(() => { throw error; }))
      .then(() => self.skipWaiting())
  );
});

// ---------- ATIVAÇÃO: limpa caches antigos ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ---------- BUSCAS ----------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // APIs autenticadas e scripts OAuth nunca devem passar pelo cache do app.
  if (request.url.includes('.supabase.co')) return;

  // Navegação: network-first, fallback ao cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Demais ativos: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const rede = fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || rede;
    })
  );
});
