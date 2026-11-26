import assert from 'node:assert/strict'
import { draw, next, reset, picks, cleanLists, lists, saveList, removeList, listsFile, importLists } from './picker.js'

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

test('repeat: every draw takes from all names, the bag never empties', () => {
  const names = ['A', 'B']
  let left
  for (let i = 0; i < 5; i++) ({ left } = draw(names, left, () => 0, true))
  assert.deepEqual(left, names)
  const el = { id: 'r', names: ['X'], repeat: true }
  next(el); next(el)
  assert.equal(picks.r.pick, 'X')
  assert.deepEqual(picks.r.left, ['X'])
})

test('saved name lists: only named, non-empty lists of trimmed strings are kept', () => {
  assert.deepEqual(cleanLists({ ' Group A ': [' Ana ', '', 3, 'Ben'], empty: [], bad: 'x', '': ['a'] }), { 'Group A': ['Ana', 'Ben'] })
  assert.deepEqual(cleanLists(['a']), {})
  assert.deepEqual(cleanLists(null), {})
  assert.equal(saveList('  ', ['a']), false)
  assert.equal(saveList('Class', []), false)
  assert.equal(saveList(' Class ', ['a', 'b']), true)
  assert.deepEqual(lists.Class, ['a', 'b'])
  removeList('Class')
  assert.equal(lists.Class, undefined)
})

test('name lists go out as a file and come back, checked like stored ones', () => {
  saveList('A', ['x'])
  const file = JSON.parse(listsFile())
  removeList('A')
  assert.equal(importLists(file), 1)
  assert.deepEqual(lists.A, ['x'])
  assert.equal(importLists({ B: ['y', 5], C: 'bad' }), 1) // a plain object of lists works too
  assert.equal(importLists('nonsense'), 0)
  removeList('A'); removeList('B')
})
