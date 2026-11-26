import assert from 'node:assert/strict'
import { gapSnaps, nearestGap, freeSpot } from './spacing.js'

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

test('freeSpot: a new box keeps its spot when free, moves to the nearest free place otherwise', () => {
  const box = { x: 360, y: 180, w: 220, h: 140 }
  expect(freeSpot(box, [], 980, 552)).toEqual({ x: 360, y: 180 })
  const title = { x: 56, y: 40, w: 868, h: 40 }, list = { x: 56, y: 110, w: 868, h: 108 }
  const p = freeSpot(box, [title, list], 980, 552)
  expect(p.y).toBeGreaterThanOrEqual(218) // below the list
  expect(p.y + box.h).toBeLessThanOrEqual(552 - 24)
  // a slide full from edge to edge: the place covering least, still on the slide
  const full = freeSpot(box, [{ x: 0, y: 0, w: 980, h: 552 }], 980, 552)
  expect(full.x).toBeGreaterThanOrEqual(24)
})
