/**
 * Service Worker — PokéWish PWA
 *
 * Estrategia:
 *   - App shell y estáticos propios: network-first con límite de NETWORK_TIMEOUT_MS.
 *     Con conexión siempre se carga la última versión desplegada; sin conexión
 *     (o si la red tarda demasiado) se usa la última copia guardada.
 *   - Llamadas API (/api/*): network-only → los datos siempre son frescos.
 *   - Recursos externos (CDN): stale-while-revalidate.
 *
 * Detección de versiones nuevas: cuando la página vuelve a primer plano pide al
 * SW que compruebe el app shell (peticiones condicionales, normalmente 304).
 * Si algún fichero cambió, se avisa a la página para que ofrezca recargar.
 * No hace falta tocar CACHE_VERSION en cada despliegue; solo si cambia este
 * fichero de forma incompatible con la caché anterior.
 */

const CACHE_VERSION = 'v4';
const CACHE_NAME = `pokewish-${CACHE_VERSION}`;
const NETWORK_TIMEOUT_MS = 3000;

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
  '/js/components/events-page.js',
  '/js/components/admin-panel.js',
  '/js/components/user-manager.js',
  '/js/components/invite-creator.js',
  '/js/components/source-updater.js',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
];

// Precarga el app shell al instalar el SW. `cache: 'reload'` evita que la
// caché HTTP del navegador devuelva copias antiguas.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
  // Activa el nuevo SW sin esperar a que cierren las pestañas existentes
  self.skipWaiting();
});

// Cachés de las versiones cache-first: las páginas abiertas con ellas no saben
// mostrar el aviso de versión nueva, así que se recargan una única vez al migrar
const LEGACY_CACHES = ['pokewish-v1', 'pokewish-v2', 'pokewish-v3'];

// Elimina cachés antiguas al activar
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const migratingFromLegacy = keys.some((k) => LEGACY_CACHES.includes(k));
    await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
    if (migratingFromLegacy) {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) {
        // Sin await: la navegación pasa por este SW, que no atiende peticiones
        // hasta terminar de activarse (esperarla aquí bloquearía la página).
        // Sin el #fragmento: navegar a la misma URL con fragmento no recarga.
        const url = new URL(c.url);
        url.hash = '';
        c.navigate(url.href).catch(() => {});
      }
    }
  })());
});

// ── Utilidades ────────────────────────────────────────────────────────────────

function fingerprint(res) {
  return res.headers.get('etag') || res.headers.get('last-modified') || '';
}

/** Guarda la respuesta y devuelve true si sustituye a una versión distinta. */
async function putAndCompare(cache, key, res) {
  const cached = await cache.match(key);
  const changed = !!cached && !!fingerprint(res) && fingerprint(cached) !== fingerprint(res);
  await cache.put(key, res);
  return changed;
}

async function notifyUpdate() {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) client.postMessage({ type: 'update-available' });
}

/**
 * Network-first con límite de tiempo. Si la red no responde a tiempo y hay
 * copia guardada, se sirve la copia y la respuesta de red se guarda al llegar
 * (avisando a la página si trae una versión distinta de la servida).
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const isNavigation = request.mode === 'navigate';
  // Las navegaciones se guardan como '/' (la SPA siempre sirve index.html)
  const key = isNavigation ? '/' : request;
  // No se puede reconstruir una Request de navegación con opciones: se usa la URL
  const networkRequest = isNavigation
    ? fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(request, { cache: 'no-cache' });

  let servedFromCache = false;
  const network = networkRequest.then(async (res) => {
    if (res.ok) {
      const changed = await putAndCompare(cache, key, res.clone());
      if (changed && servedFromCache) notifyUpdate();
    }
    return res;
  });

  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, 'timeout'));
  try {
    const winner = await Promise.race([network, timeout]);
    if (winner !== 'timeout') return winner;
  } catch {
    // Sin red: se intenta la caché
  }

  const cached = await cache.match(key);
  if (cached) {
    servedFromCache = true;
    network.catch(() => {});
    return cached;
  }
  return network; // No hay copia: esperar a la red aunque tarde
}

/** Comprueba el app shell contra el servidor y actualiza la caché. */
async function checkForUpdates() {
  const cache = await caches.open(CACHE_NAME);
  const results = await Promise.all(
    APP_SHELL.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        return res.ok ? putAndCompare(cache, url, res) : false;
      } catch {
        return false;
      }
    })
  );
  if (results.some(Boolean)) await notifyUpdate();
}

self.addEventListener('message', (e) => {
  if (e.data?.type === 'check-updates') e.waitUntil(checkForUpdates());
});

// ── Peticiones ────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Ignorar esquemas que no sean http/https (chrome-extension, etc.) y no-GET
  if (!url.protocol.startsWith('http') || request.method !== 'GET') return;

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

  // App shell y estáticos propios: network-first
  e.respondWith(networkFirst(request));
});
