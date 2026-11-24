import assert from 'node:assert/strict'
import { slidePoint } from './draw.js'

test('a pointer position becomes slide units, whatever the scale', () => {
  const rect = { left: 100, top: 50, width: 490, height: 276 } // a 980×552 slide shown at half size
  assert.deepEqual(slidePoint(100, 50, rect, 980, 552), [0, 0])
  assert.deepEqual(slidePoint(590, 326, rect, 980, 552), [980, 552])
  assert.deepEqual(slidePoint(345, 188, rect, 980, 552), [490, 276])
  assert.deepEqual(slidePoint(100.05, 50, { ...rect, width: 980 * 3 }, 980, 552), [0, 0]) // rounded to 0.1
})

test('an arrow head has its tip at the end and its barbs behind it, symmetric', async () => {
  const { arrowHead } = await import('./draw.js')
  const [l, tip, r] = arrowHead([0, 0], [100, 0], 6)
  assert.deepEqual(tip, [100, 0])
  assert.ok(l[0] < 100 && r[0] < 100) // behind the tip
  assert.equal(l[0], r[0])
  assert.equal(l[1], -r[1])
})
