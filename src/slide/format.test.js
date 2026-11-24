import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRatio, formatSize } from './format.js'

test('parseRatio reads numbers and Slidev ratio strings', () => {
  assert.equal(parseRatio(16 / 9), 16 / 9)
  assert.equal(parseRatio('16/9'), 16 / 9)
  assert.equal(parseRatio('16:9'), 16 / 9)
  assert.equal(parseRatio(' 4 / 3 '), 4 / 3)
  assert.equal(parseRatio('1.6'), 1.6)
  assert.equal(parseRatio('21:9'), 21 / 9)
})

test('parseRatio rejects garbage and absurd ratios', () => {
  for (const v of [undefined, null, '', 'abc', '16/0', '0', 0, -1, '-4/3', NaN, Infinity, '1/10', 10, '16/9px', {}, '4//3'])
    assert.equal(parseRatio(v), null, String(v))
})

test('formatSize follows Slidev: height = ceil(width / ratio)', () => {
  assert.deepEqual(formatSize(16 / 9, 980), { w: 980, h: 552 })
  assert.deepEqual(formatSize(4 / 3, 980), { w: 980, h: 735 })
  assert.deepEqual(formatSize(16 / 10, 980), { w: 980, h: 613 })
  assert.deepEqual(formatSize(3 / 2, 980), { w: 980, h: 654 })
  assert.deepEqual(formatSize(1, 1200), { w: 1200, h: 1200 })
})
