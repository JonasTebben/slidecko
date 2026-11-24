import test from 'node:test'
import assert from 'node:assert/strict'
import { find, replace, pattern } from './search.js'

const slides = () => [
  { notes: 'Datenbank erklären', elements: [
    { id: 'a', type: 'text', html: '<p>Die <a href="/datenbank">Datenbank</a> &amp; SQL</p>' },
    { id: 'b', type: 'code', code: 'SELECT * FROM datenbank' },
  ] },
  { notes: '', elements: [{ id: 't', type: 'table', rows: [['Datenbank', 'x'], ['y', 'DATENBANK']] }] },
]
const one = text => [{ notes: text, elements: [] }]
const run = (text, q, r, o = {}, nth) => { const s = one(text); replace(find(s, pattern(q, o)), pattern(q, o), r, o, nth); return s[0].notes }

test('finds text, code, cells and notes, case-insensitive', () => {
  const h = find(slides(), pattern('datenbank'))
  assert.deepEqual(h.map(x => [x.slide, x.el ?? 'notes']), [[0, 'a'], [0, 'b'], [0, 'notes'], [1, 't'], [1, 't']])
  assert.equal(find(slides(), pattern('Datenbank', { cs: true })).length, 3)
  assert.equal(find(slides(), pattern('& sql'))[0].el, 'a')
  assert.equal(find(slides(), pattern('href')).length, 0)
})

test('replaces text only, keeps tags and escapes', () => {
  const s = slides(), rx = pattern('datenbank')
  assert.equal(replace(find(s, rx), rx, 'DB <neu> $&'), 5)
  assert.equal(s[0].elements[0].html, '<p>Die <a href="/datenbank">DB &lt;neu&gt; $&amp;</a> &amp; SQL</p>')
  assert.equal(s[0].elements[1].code, 'SELECT * FROM DB <neu> $&')
  assert.deepEqual(s[1].elements[0].rows, [['DB &lt;neu&gt; $&amp;', 'x'], ['y', 'DB &lt;neu&gt; $&amp;']])
  assert.equal(s[0].notes, 'DB <neu> $& erklären')
})

test('replaces only the nth occurrence', () => assert.equal(run('a a a', 'a', 'X', {}, 1), 'a X a'))

test('whole word, also with umlauts', () => {
  assert.equal(run('Maß Maßband maß', 'maß', 'x', { word: true }), 'x Maßband x')
  assert.equal(find(one('Größe'), pattern('Größ', { word: true })).length, 0)
})

test('regex with groups and escapes; invalid and empty matches', () => {
  assert.equal(run('Jonas Tebben', '(\\w+) (?<n>\\w+)', '$<n>, $1\\n$$', { regex: true }), 'Tebben, Jonas\n$')
  assert.equal(run('a.b', '.', '-'), 'a-b')
  assert.throws(() => pattern('(', { regex: true }))
  assert.equal(find(one('xyz'), pattern('a*', { regex: true })).length, 0)
})

test('preserve case', () => {
  assert.equal(run('Haus haus HAUS', 'haus', 'heim', { keep: true }), 'Heim heim HEIM')
})

test('limits the search to kinds of content', () => {
  const only = kinds => find(slides(), pattern('datenbank'), kinds).map(h => h.el ?? 'notes')
  assert.deepEqual(only({ code: true }), ['b'])
  assert.deepEqual(only({ table: true, notes: true }), ['notes', 't', 't'])
})
