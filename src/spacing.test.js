import assert from 'node:assert/strict'
import { gapSnaps, nearestGap } from './spacing.js'

test('a moved box snaps to the gap of two boxes in its row: after, before and between them', () => {
  const a = { x: 0, y: 0, w: 100, h: 50 }, b = { x: 140, y: 0, w: 100, h: 50 } // gap 40
  const snaps = gapSnaps([a, b], 60, 'x')
  assert.deepEqual(snaps.map(s => s.pos).sort((p, q) => p - q), [-100, 280])
  assert.deepEqual(nearestGap(snaps, 283, [10, 40], 6).gaps, [[100, 140], [240, 280]])
  assert.equal(nearestGap(snaps, 283, [60, 90], 6), null) // below the row: no snap
  const wide = gapSnaps([a, { ...b, x: 300 }], 60, 'x') // gap 200: room in the middle
  assert.equal(nearestGap(wide, 172, [0, 50], 6).pos, 170)
  assert.deepEqual(gapSnaps([a, { ...b, y: 80 }], 60, 'x'), []) // not side by side
})
