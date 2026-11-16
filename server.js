// Serves the built app (dist/, or the folder in DIST). Everything runs in the browser; the server only delivers files.
import { join, normalize, resolve as absolute } from 'node:path'

const root = Bun.env.DIST ? absolute(Bun.env.DIST) : join(import.meta.dir, 'dist')

export function resolve(pathname) {
  let p
  try { p = decodeURIComponent(pathname) } catch { return null }
  if (p.includes('\0')) return null // Bun.file throws on NUL
  if (p.endsWith('/')) p += 'index.html'
  const file = normalize(join(root, p))
  return file.startsWith(root + '/') ? file : null // no ../ out of dist
}

export function handle(req) {
  const { pathname } = new URL(req.url)
  if (pathname === '/health') return new Response('ok')
  if (pathname.startsWith('//')) return new Response('Not Found', { status: 404 }) // a redirect to //x would leave the site
  const file = resolve(pathname)
  if (!file) return new Response('Bad Request', { status: 400 })
  const f = Bun.file(file)
  return f.exists().then(async ok => ok
    ? new Response(f, { headers: { 'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' } })
    : !pathname.endsWith('/') && await Bun.file(join(file, 'index.html')).exists()
      ? Response.redirect(pathname + '/', 301) // /app → /app/, so relative asset paths resolve
      : new Response('Not Found', { status: 404 }))
}

if (import.meta.main) {
  const server = Bun.serve({ port: Number(Bun.env.PORT ?? 3000), fetch: handle })
  console.log(`Slidecko on http://localhost:${server.port}`)
}
