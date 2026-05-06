/**
 * Service Worker — PokéWish PWA
 *
 * Estrategia:
 *   - App shell (HTML, CSS, JS): cache-first → la app carga aunque no haya red
 *   - Llamadas API (/api/*): network-only → los datos siempre son frescos
 *   - Recursos externos (CDN): stale-while-revalidate → usa caché y actualiza en segundo plano
 *
 * Incrementar CACHE_VERSION al desplegar una nueva versión fuerza la actualización
 * del caché en todos los clientes.
 */

const CACHE_VERSION = 'v2';
const CACHE_NAME = `pokewish-${CACHE_VERSION}`;

const APP_SHELL = [
  '/',
  '/manifest.json',
  '/css/main.css',
  '/js/api.js',
  '/js/app.js',
  '/js/components/login-page.js',
  '/js/components/register-page.js',
  '/js/components/reset-password-page.js',
  '/js/components/pokemon-list.js',
  '/js/components/pokemon-table.js',
  '/js/components/pokemon-card.js',
  '/js/components/pokemon-filters.js',
  '/js/components/flag-toggle.js',
  '/js/components/admin-panel.js',
  '/js/components/user-manager.js',
  '/js/components/invite-creator.js',
  '/js/components/source-updater.js',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
];

// Precarga el app shell al instalar el SW
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Activa el nuevo SW sin esperar a que cierren las pestañas existentes
  self.skipWaiting();
});

// Elimina cachés antiguas al activar
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Ignorar esquemas que no sean http/https (chrome-extension, etc.)
  if (!url.protocol.startsWith('http')) return;

  // API: siempre red — los datos deben ser frescos
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(request));
    return;
  }

  // CDN externo (ej: esm.sh para Lit): stale-while-revalidate
  if (url.origin !== self.location.origin) {
    e.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        }).catch(() => null);
        return cached ?? await networkFetch;
      })
    );
    return;
  }

  // App shell y estáticos: cache-first, red como fallback
  e.respondWith(
    caches.match(request).then(
      (cached) => cached ?? fetch(request).then((res) => {
        // Guarda en caché los recursos locales obtenidos por primera vez
        if (res.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, res.clone()));
        }
        return res;
      })
    )
  );
});
