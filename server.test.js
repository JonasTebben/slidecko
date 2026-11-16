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

test.skipIf(!(await Bun.file(import.meta.dir + '/dist/index.html').exists()))('serves the build, 404 otherwise (needs a build)', async () => {
  expect((await handle(new Request('http://x/'))).status).toBe(200)
  expect((await handle(new Request('http://x/nope'))).status).toBe(404)
})
