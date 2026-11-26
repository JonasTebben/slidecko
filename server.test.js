import { test, expect } from 'bun:test'
import { resolve, handle, cacheFor } from './server.js'

test('paths stay inside dist', () => {
  expect(resolve('/')).toEndWith('/dist/index.html')
  expect(resolve('/assets/a.js')).toEndWith('/dist/assets/a.js')
  expect(resolve('/../package.json')).toBeNull()
  expect(resolve('/%2e%2e/package.json')).toBeNull()
  expect(resolve('/%E0%A4%A')).toBeNull()
})

test('health check answers without dist', async () => {
  const res = await handle(new Request('http://x/health'))
  expect(await res.text()).toBe('ok')
})

test.skipIf(!(await Bun.file(import.meta.dir + '/dist/index.html').exists()))('serves the build, 404 otherwise (needs a build)', async () => {
  expect((await handle(new Request('http://x/'))).status).toBe(200)
  expect((await handle(new Request('http://x/nope'))).status).toBe(404)
})

test('NUL bytes are a bad request, // paths never redirect off-site', async () => {
  expect(resolve('/%00')).toBeNull()
  expect((await handle(new Request('http://x/%00'))).status).toBe(400)
  const res = await handle(new Request('http://x//evil.com'))
  expect(res.status).toBe(404)
  expect(res.headers.get('location')).toBeNull()
})

test('hashed assets are cached for a year, also below a path; the rest is checked each time', () => {
  expect(cacheFor('/assets/a-1.js')).toContain('immutable')
  expect(cacheFor('/app/assets/a-1.js')).toContain('immutable')
  expect(cacheFor('/app/index.html')).toBe('no-cache')
  expect(cacheFor('/app/sw.js')).toBe('no-cache')
})

test.skipIf(!(await Bun.file(import.meta.dir + '/dist/index.html').exists()))('text goes out compressed when the browser accepts it (needs a build)', async () => {
  const res = await handle(new Request('http://x/', { headers: { 'accept-encoding': 'gzip, deflate, br' } }))
  expect(res.headers.get('content-encoding')).toBe('br')
  expect(res.headers.get('content-type')).toContain('text/html')
  const plain = await handle(new Request('http://x/'))
  expect(plain.headers.get('content-encoding')).toBeNull()
  expect(await plain.text()).toContain('<div id="app">')
})
