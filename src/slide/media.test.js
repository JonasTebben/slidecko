import assert from 'node:assert/strict'
import { mediaUrl } from './media.js'

test('media plays from one blob: URL per file; other addresses stay', async () => {
  const data = 'data:audio/wav;base64,' + btoa('RIFF1234')
  const u = mediaUrl(data)
  assert.match(u, /^blob:/)
  assert.equal(mediaUrl(data), u)
  assert.equal(await (await fetch(u)).text(), 'RIFF1234')
  assert.equal(mediaUrl('/media/clip.mp4'), '/media/clip.mp4')
  assert.equal(mediaUrl(undefined), undefined)
})
