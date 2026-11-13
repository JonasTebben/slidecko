import { test, expect } from 'bun:test'
import { resolve, handle } from './server.js'

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

test.skipIf(!(await Bun.file(import.meta.dir + '/dist/app/index.html').exists()))('/app redirects to /app/ (needs a build)', async () => {
  const res = await handle(new Request('http://x/app'))
  expect(res.status).toBe(301)
  expect(res.headers.get('location')).toBe('/app/')
  expect((await handle(new Request('http://x/nope'))).status).toBe(404)
})
