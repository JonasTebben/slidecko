// Slidecko's service worker: keeps the app's own files in the browser, so it starts and works without a connection.
// The build (vite.config.js) fills in VERSION, FILES (cached on install: everything the app needs) and LAZY (the
// icon sets, 11 MB, only for the icon picker: icons on slides keep their own SVG), cached when first used.
// Files with a hash in their name are copied from the previous version's cache instead of being downloaded again.
// A new version waits until the user updates (the app shows a button) or every tab is closed: a page keeps the files
// it started with. Other sites (YouTube, embedded web pages) are not touched.
const VERSION = __VERSION__, FILES = __FILES__, LAZY = new Set(__LAZY__), CACHE = 'slidecko-' + VERSION
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
  for (const f of LAZY) { const old = await caches.match(at(f)); if (old) await cache.put(at(f), old) } // sets used before stay offline
})()))

self.addEventListener('activate', e => e.waitUntil((async () => {
  // the version before stays: a tab still running it (another tab updated) loads its later parts from there
  const old = (await caches.keys()).filter(k => k.startsWith('slidecko-') && k !== CACHE)
  for (const k of old.slice(0, -1)) await caches.delete(k)
  await self.clients.claim() // the first install: the open page works offline at once
})()))

self.addEventListener('message', e => { if (e.data === 'update') self.skipWaiting() })

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  e.respondWith((async () => {
    const cache = await caches.open(CACHE)
    // the app's address (/app/, /app/?x, /app/#12) is its start page
    const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' && await cache.match(at('index.html')))
    if (hit) return hit
    const prev = new URL(req.url).pathname.includes('/assets/') && await caches.match(req) // a file of the version before
    if (prev) return prev
    const res = await fetch(req)
    const f = req.url.slice(self.registration.scope.length)
    if (res.ok && LAZY.has(f)) await cache.put(req, res.clone())
    return res
  })())
})
