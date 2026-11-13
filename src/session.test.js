import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sessionView, selIndexes, selIds } from './session.js'

const deck = { id: 'p1', entry: 'slides.md', slides: [
  { elements: [{ id: 'a' }] },
  { file: '01_A.md', elements: [{ id: 'b' }, { id: 'c' }] },
] }

test('restores slide, selection and folded decks of the same project', () => {
  assert.deepEqual(sessionView({ project: 'p1', slide: 1, sel: [1], collapsed: ['01_A.md'], listTop: 120 }, deck),
    { slide: 1, sel: [1], collapsed: ['01_A.md'], listTop: 120 })
})

test('the selection survives new element ids by position', () => {
  const idx = selIndexes(deck.slides[1], ['c', 'gone'])
  assert.deepEqual(idx, [1])
  const remeasured = { elements: [{ id: 'x' }, { id: 'y' }] }
  assert.deepEqual(selIds(remeasured, idx), ['y'])
  assert.deepEqual(selIds({ elements: [{ id: 'x' }] }, [1, 0]), ['x']) // positions past the end are dropped
})

test('drops what no longer exists and ignores other projects', () => {
  assert.deepEqual(sessionView({ project: 'p1', slide: 9, sel: [0, -1, 'a'], collapsed: ['old.md'] }, deck),
    { slide: 1, sel: [0], collapsed: [], listTop: 0 }) // slide clamped, invalid positions dropped
  assert.equal(sessionView({ project: 'other', slide: 1 }, deck), null)
  assert.equal(sessionView({}, { ...deck, id: '' }), null)
  assert.equal(sessionView({ project: 'p1', slide: 'x', sel: 'a' }, deck).slide, 0)
})
