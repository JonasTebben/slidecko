import assert from 'node:assert/strict'
import { draw, next, reset, picks } from './picker.js'

test('everyone is drawn once before the bag starts over', () => {
  const names = ['Ana', 'Ben', 'Cem', 'Dia']
  let left, seen = []
  for (let i = 0; i < names.length; i++) ({ pick: seen[i], left } = draw(names, left))
  assert.deepEqual([...seen].sort(), names)
  assert.deepEqual(left, [])
  const again = draw(names, left, () => 0.99)
  assert.equal(again.pick, 'Dia')
  assert.equal(again.left.length, 3)
})

test('the same name twice in the list is drawn twice', () => {
  const { pick, left } = draw(['A', 'A'], null, () => 0)
  assert.equal(pick, 'A')
  assert.deepEqual(left, ['A'])
})

test('a click draws, a double click starts fresh, an empty list does nothing', () => {
  const el = { id: 'p', names: ['X', 'Y'] }
  next(el)
  next(el)
  assert.equal(picks.p.left.length, 0)
  assert.equal(picks.p.n, 2)
  reset('p')
  assert.equal(picks.p, undefined)
  next({ id: 'q', names: [] })
  assert.equal(picks.q, undefined)
})
