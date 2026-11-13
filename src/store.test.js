import test from 'node:test'
import assert from 'node:assert/strict'
// the store wants a browser: just enough of one
globalThis.document ??= { activeElement: null, createElement: () => ({}), querySelector: () => null }
globalThis.indexedDB ??= { open: () => ({}) }
const { mergeList } = await import('./store.js')

const p = (id, updated, title = id) => ({ id, title, updated })
const merge = (stored, mine, o = {}) => mergeList(stored, new Map(mine.map(x => [x.id, x])), { added: new Set(o.added), removed: new Set(o.removed), own: o.own || (() => false) }).map(x => x.id + ':' + x.title)

test('mergeList keeps what other tabs stored and adds this tab’s new projects', () => {
  // B created Q; A only has P in memory and created R
  assert.deepEqual(merge([p('Q', 3), p('P', 1)], [p('P', 1), p('R', 2)], { added: ['R'] }), ['Q:Q', 'R:R', 'P:P'])
})
test('mergeList never writes back a project deleted in another tab', () => {
  // P was deleted elsewhere; this tab still lists it in memory
  assert.deepEqual(merge([p('Q', 3)], [p('P', 5), p('Q', 3)]), ['Q:Q'])
})
test('mergeList drops what this tab deleted and replaces only its own entries', () => {
  const stored = [p('P', 1, 'old'), p('Q', 2, 'theirs'), p('X', 0)]
  const mine = [p('P', 4, 'new'), p('Q', 1, 'stale')]
  assert.deepEqual(merge(stored, mine, { removed: ['X'], own: id => id === 'P' }), ['P:new', 'Q:theirs'])
})
