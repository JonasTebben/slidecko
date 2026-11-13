// Serves the built app (dist/) on Railway. Everything runs in the browser; the server only delivers files.
import { join, normalize } from 'node:path'

const root = join(import.meta.dir, 'dist')

export function resolve(pathname) {
  let p
  try { p = decodeURIComponent(pathname) } catch { return null }
  if (p.endsWith('/')) p += 'index.html'
  const file = normalize(join(root, p))
  return file.startsWith(root + '/') ? file : null // no ../ out of dist
}

export function handle(req) {
  const { pathname } = new URL(req.url)
  if (pathname === '/health') return new Response('ok')
  const file = resolve(pathname)
  if (!file) return new Response('Bad Request', { status: 400 })
  const f = Bun.file(file)
  return f.exists().then(ok => ok
    ? new Response(f, { headers: { 'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' } })
    : new Response('Not Found', { status: 404 }))
}

if (import.meta.main) {
  const server = Bun.serve({ port: Number(Bun.env.PORT ?? 3000), fetch: handle })
  console.log(`Slidecko on http://localhost:${server.port}`)
}
