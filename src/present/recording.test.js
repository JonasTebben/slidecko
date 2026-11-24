import assert from 'node:assert/strict'
import { pickMime, extOf, recordingName, clock, gridMove } from './recording.js'

test('MP4 is preferred, WebM is the fallback, nothing known leaves the choice to the browser', () => {
  assert.equal(pickMime(m => m.startsWith('video/')), 'video/mp4;codecs=avc1,mp4a.40.2')
  assert.equal(pickMime(m => m.startsWith('video/webm')), 'video/webm;codecs=vp9,opus')
  assert.equal(pickMime(), '')
  assert.equal(extOf('video/mp4;codecs=avc1'), 'mp4')
  assert.equal(extOf(''), 'webm')
})

test('the file name has the project title and the start time', () => {
  const d = new Date(2026, 10, 4, 9, 5)
  assert.equal(recordingName('My talk', d, 'video/mp4'), 'My talk 2026-11-04 09-05.mp4')
  assert.equal(recordingName('A/B: test?', d, 'video/webm'), 'A_B_ test_ 2026-11-04 09-05.webm')
  assert.equal(recordingName('  ', d, ''), 'Recording 2026-11-04 09-05.webm')
})

test('the duration reads as minutes and seconds, hours when needed', () => {
  assert.equal(clock(7400), '0:07')
  assert.equal(clock(754000), '12:34')
  assert.equal(clock(3723000), '1:02:03')
  assert.equal(clock(-5), '0:00')
})

test('arrow keys move through the overview grid and stop at its edges', () => {
  // 10 items in 4 columns: rows 0-3, 4-7, 8-9
  assert.equal(gridMove(0, 'ArrowRight', 4, 10), 1)
  assert.equal(gridMove(3, 'ArrowRight', 4, 10), 4) // wraps into the next row
  assert.equal(gridMove(0, 'ArrowLeft', 4, 10), 0)
  assert.equal(gridMove(1, 'ArrowDown', 4, 10), 5)
  assert.equal(gridMove(6, 'ArrowDown', 4, 10), 9) // short last row
  assert.equal(gridMove(9, 'ArrowDown', 4, 10), 9)
  assert.equal(gridMove(5, 'ArrowUp', 4, 10), 1)
  assert.equal(gridMove(1, 'ArrowUp', 4, 10), 1)
  assert.equal(gridMove(5, 'End', 4, 10), 9)
  assert.equal(gridMove(5, 'Home', 4, 10), 0)
  assert.equal(gridMove(5, 'x', 4, 10), 5)
})
