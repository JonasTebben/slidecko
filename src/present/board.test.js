import assert from 'node:assert/strict'
import { liveText, resetLiveText, keepTyped } from './board.js'

test('typing goes into the project, or with liveTemp only into this presentation', () => {
  const kept = { id: 'k', html: '<p>a</p>' }, temp = { id: 't', html: '<p>a</p>', liveTemp: true }
  keepTyped(kept, '<p>b</p>')
  keepTyped(temp, '<p>b</p>')
  assert.equal(kept.html, '<p>b</p>')
  assert.equal(temp.html, '<p>a</p>')
  assert.equal(liveText.t, '<p>b</p>')
  resetLiveText()
  assert.equal(liveText.t, undefined)
})
