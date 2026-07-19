const MAINTENANCE_CACHE = 'panzershrek-maintenance-v1'
const MAINTENANCE_PAGE = '/maintenance.html'
const MAINTENANCE_ASSETS = [
  MAINTENANCE_PAGE,
  '/menu-background.webp',
  '/panzer-shrek-icon.png',
]
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504])

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(MAINTENANCE_CACHE)
      .then((cache) => cache.addAll(MAINTENANCE_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key.startsWith('panzershrek-maintenance-') &&
                  key !== MAINTENANCE_CACHE,
              )
              .map((key) => caches.delete(key)),
          ),
        ),
      self.registration.navigationPreload?.enable(),
      self.clients.claim(),
    ]),
  )
})

async function createMaintenanceResponse() {
  const cachedPage = await caches.match(MAINTENANCE_PAGE)

  if (!cachedPage) {
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Обновление PanzerShrek</title><h1>Идёт обновление игры</h1><p>Подождите немного и обновите страницу.</p>',
      {
        status: 503,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Retry-After': '15',
        },
      },
    )
  }

  return new Response(await cachedPage.text(), {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': '15',
    },
  })
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    MAINTENANCE_ASSETS.includes(url.pathname) &&
    url.pathname !== MAINTENANCE_PAGE
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request)),
    )
    return
  }

  if (request.mode !== 'navigate') return

  event.respondWith(
    (async () => {
      try {
        const response =
          (await event.preloadResponse) ?? (await fetch(request))

        if (RETRYABLE_STATUS_CODES.has(response.status)) {
          return createMaintenanceResponse()
        }

        return response
      } catch {
        return createMaintenanceResponse()
      }
    })(),
  )
})
