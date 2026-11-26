import { stayAwake } from './wake.js'

test('presenting takes a screen wake lock once and lets it go at the end', async () => {
  const calls = []
  const sentinel = { released: false, release: async () => { sentinel.released = true; calls.push('release') } }
  globalThis.navigator = { wakeLock: { request: async kind => { calls.push(kind); return sentinel } } }
  await stayAwake(true)
  await stayAwake(true) // still held: not asked again
  stayAwake(false)
  expect(calls).toEqual(['screen', 'release'])
  delete globalThis.navigator.wakeLock
  await stayAwake(true) // no API: nothing happens
})
