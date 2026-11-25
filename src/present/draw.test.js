import assert from 'node:assert/strict'
import { slidePoint, inkSvg } from './draw.js'

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

test('a drawing becomes an SVG of the whole slide, arrows with their head', () => {
  const svg = inkSvg([{ pts: [[1, 2], [3, 4]], color: '#e5202a', width: 6 }, { pts: [[0, 0], [100, 0]], color: '#2563eb', width: 3, arrow: true }], 980, 551)
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 980 551"/)
  assert.match(svg, /<g stroke="#e5202a" stroke-width="6"><polyline points="1,2 3,4"\/><\/g>/)
  assert.equal(svg.match(/<polyline/g).length, 3)
})

test('new strokes go into the drawing a slide already has', () => {
  const first = inkSvg([{ pts: [[1, 2], [3, 4]], color: '#e5202a', width: 6 }], 980, 551)
  const both = inkSvg([{ pts: [[5, 6], [7, 8]], color: '#2563eb', width: 3 }], 980, 551, first)
  assert.equal(both.match(/<svg/g).length, 1)
  assert.equal(both.match(/<polyline/g).length, 2)
  assert.ok(both.endsWith('<polyline points="5,6 7,8"/></g></svg>'))
})
