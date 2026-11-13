import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sessionView, selIndexes, selIds, viewHash, parseViewHash } from './session.js'

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

test('view hash: #home for the overview, a project shows the slide number from 1, and it reads back', () => {
  assert.equal(viewHash(true, 'abc123', 4), '#home')
  assert.equal(viewHash(false, '', 0), '#home')
  assert.deepEqual(parseViewHash('#home'), { home: true })
  assert.equal(viewHash(false, 'abc123', 4), '#abc123/5')
  assert.deepEqual(parseViewHash('#abc123/5'), { project: 'abc123', slide: 4 })
  assert.deepEqual(parseViewHash('#abc123/0'), { project: 'abc123', slide: 0 })
  for (const h of ['', '#', '#privacy', '#abc/x', '#ABC/1']) assert.equal(parseViewHash(h), null)
})
