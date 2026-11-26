// Serves the built app (dist/, or the folder in DIST). Everything runs in the browser; the server only delivers files.
import { join, normalize, sep, resolve as absolute } from 'node:path'
import { brotliCompressSync, gzipSync, constants } from 'node:zlib'

const root = Bun.env.DIST ? absolute(Bun.env.DIST) : join(import.meta.dir, 'dist')

export function resolve(pathname) {
  let p
  try { p = decodeURIComponent(pathname) } catch { return null }
  if (p.includes('\0')) return null // Bun.file throws on NUL
  if (p.endsWith('/')) p += 'index.html'
  const file = normalize(join(root, p))
  return file.startsWith(root + sep) ? file : null // no ../ out of dist (sep: Windows paths use \)
}

// text files go out compressed (brotli, else gzip), each compressed once and kept in memory: the build is fixed
// while the server runs; pictures, fonts and videos are compressed already
const TEXT = /\.(js|mjs|css|html|svg|json|txt|webmanifest|xml)$/
const packed = new Map()
async function compressed(file, enc) {
  const key = enc + file
  if (!packed.has(key)) {
    const data = new Uint8Array(await Bun.file(file).arrayBuffer())
    packed.set(key, enc === 'br' ? brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }) : gzipSync(data, { level: 9 }))
  }
  return packed.get(key)
}
// hashed file names (Vite's assets/, also under a path like /app/assets/) never change: cached for a year
export const cacheFor = pathname => (/\/assets\//.test(pathname) ? 'public, max-age=31536000, immutable' : 'no-cache')

export function handle(req) {
  const { pathname } = new URL(req.url)
  if (pathname === '/health') return new Response('ok')
  if (pathname.startsWith('//')) return new Response('Not Found', { status: 404 }) // a redirect to //x would leave the site
  const file = resolve(pathname)
  if (!file) return new Response('Bad Request', { status: 400 })
  const f = Bun.file(file)
  return f.exists().then(async ok => ok
    ? serve(req, file, f, pathname)
    : !pathname.endsWith('/') && await Bun.file(join(file, 'index.html')).exists()
      ? Response.redirect(pathname + '/', 301) // /app → /app/, so relative asset paths resolve
      : new Response('Not Found', { status: 404 }))
}

async function serve(req, file, f, pathname) {
  // frame-ancestors: no other site may frame the app (clickjacking, or its runner outside a sandbox)
  const headers = { 'Cache-Control': cacheFor(pathname), 'Content-Type': f.type, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "frame-ancestors 'self'", 'Referrer-Policy': 'strict-origin-when-cross-origin' }
  if (!TEXT.test(file)) return new Response(f, { headers })
  const accept = req.headers.get('accept-encoding') || ''
  const enc = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null
  headers.Vary = 'Accept-Encoding'
  if (!enc) return new Response(f, { headers })
  return new Response(await compressed(file, enc), { headers: { ...headers, 'Content-Encoding': enc } })
}

if (import.meta.main) {
  const server = Bun.serve({ port: Number(Bun.env.PORT ?? 3000), fetch: handle })
  console.log(`Slidecko on http://localhost:${server.port}`)
}
