// Slidecko's service worker: keeps the app's own files in the browser, so it starts and works without a connection.
// The build (vite.config.js) fills in VERSION and FILES, every file of the app except the start page's showcase.
// Files with a hash in their name are copied from the previous version's cache instead of being downloaded again.
// A new version waits until the user updates (the app shows a button) or every tab is closed: a page keeps the files
// it started with. Other sites (YouTube, embedded web pages) are not touched.
const VERSION = __VERSION__, FILES = __FILES__, CACHE = 'slidecko-' + VERSION
const at = f => new URL(f, self.registration.scope).href

self.addEventListener('install', e => e.waitUntil((async () => {
  const cache = await caches.open(CACHE)
  // all or nothing: a half-filled cache would fail offline later; a failed install is retried on the next visit
  await Promise.all(FILES.map(async f => {
    const old = f.startsWith('assets/') && await caches.match(at(f))
    const res = old || await fetch(at(f), { cache: 'reload' })
    if (!res.ok) throw new Error(`${f}: ${res.status}`)
    await cache.put(at(f), res)
  }))
})()))

self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('slidecko-') && k !== CACHE) await caches.delete(k)
  await self.clients.claim() // the first install: the open page works offline at once
})()))

self.addEventListener('message', e => { if (e.data === 'update') self.skipWaiting() })

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  e.respondWith((async () => {
    const cache = await caches.open(CACHE)
    // the app's address (/app/, /app/?x, /app/#12) is its start page
    return await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' && await cache.match(at('index.html'))) || fetch(req)
  })())
})
