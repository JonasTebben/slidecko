import test from 'node:test'
import assert from 'node:assert/strict'
import { FONTS, fontKey, fontStack } from './themes.js'

test('font stacks map back to their key, also as the browser serializes them', () => {
  for (const [k, [, stack]] of Object.entries(FONTS)) {
    assert.equal(fontKey(stack), k)
    assert.equal(fontKey(stack.replace(/'/g, '"').replace(/, /g, ',')), k)
  }
  assert.equal(fontKey('Comic Sans MS'), undefined)
  assert.equal(fontStack('toString'), undefined)
})

test('text styles from a file join the browser ones, are cleaned and never replace a local one', async () => {
  // the store wants a browser: just enough of one (as in tableOps.test.js)
  globalThis.document ??= { activeElement: null, createElement: () => ({}), querySelector: () => null }
  globalThis.indexedDB ??= { open: () => ({}) }
  const { textStyles, saveTextStyles, mergeTextStyles } = await import('./store.js')
  saveTextStyles([{ name: 'Merksatz', tag: 'p', color: '#ff0000' }])
  mergeTextStyles([{ name: 'Merksatz', tag: 'h2' }, { name: 'Zitat groß', tag: 'script', font: 'serif', fontSize: 9999, color: 'url(x)', valign: 'middle' }, { tag: 'p' }])
  assert.deepEqual(textStyles.list, [
    { name: 'Merksatz', tag: 'p', color: '#ff0000' },
    { name: 'Zitat groß', tag: 'p', fontSize: 400, font: 'serif', valign: 'middle' },
  ])
})

test('a project file carries only the styles its slides use', async () => {
  const { saveTextStyles, deckFile, deck } = await import('./store.js')
  saveTextStyles([{ name: 'Rot', tag: 'p', color: '#ff0000' }, { name: 'Groß', tag: 'h2', fontSize: 48 }, { name: 'Serif', tag: 'p', font: 'serif' }])
  deck.slides = [{ elements: [
    { type: 'text', html: '<p>a</p>', color: '#ff0000' },
    { type: 'text', html: '<p>b</p>', font: 'serif', color: '#00ff00' }, // changed after applying: not a use
  ] }]
  assert.deepEqual(JSON.parse(deckFile()).styles.map(p => p.name), ['Rot'])
})

test('toggleMarked adds, merges and removes highlighted code lines', async () => {
  const { toggleMarked } = await import('./hl.js')
  assert.equal(toggleMarked('', 2, 3), '{2-3}')
  assert.equal(toggleMarked('{2-3}', 4, 4), '{2-4}')
  assert.equal(toggleMarked('{2-4}', 3, 3), '{2,4}')
  assert.equal(toggleMarked('{2,4}{lines:true}', 2, 2), '{4}{lines:true}')
  assert.equal(toggleMarked('{4}', 4, 4), undefined)
  assert.equal(toggleMarked('{lines:true}', 1, 1), '{1}{lines:true}')
  assert.equal(toggleMarked('{1|3}', 2, 2), '{1-2|3}')
})

test('cleanCrop keeps a valid crop, clamps it into the picture and drops "no crop"', async () => {
  globalThis.document ??= { activeElement: null, createElement: () => ({}), querySelector: () => null }
  globalThis.indexedDB ??= { open: () => ({}) }
  const { cleanCrop } = await import('./store.js')
  assert.deepEqual(cleanCrop({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 }), { x: 0.1, y: 0.2, w: 0.5, h: 0.5 })
  assert.deepEqual(cleanCrop({ x: 0.5, y: 0, w: 0.9, h: 1 }), { x: 0.5, y: 0, w: 0.5, h: 1 }) // never past the right edge
  assert.equal(cleanCrop({ x: 0, y: 0, w: 1, h: 1 }), undefined)
  assert.equal(cleanCrop({ x: 0, y: 0, w: 0, h: 1 }), undefined)
  assert.equal(cleanCrop('x'), undefined)
})

test('shapes keep text colour and alignment; lines and blank text get no text', async () => {
  globalThis.document ??= { activeElement: null, createElement: () => ({}), querySelector: () => null }
  globalThis.indexedDB ??= { open: () => ({}) }
  const { cleanEl } = await import('./store.js')
  // (text with content goes through DOMPurify, which needs a browser: checked in the editor)
  const rect = cleanEl({ type: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 50, color: '#ff0000', align: 'left' })
  assert.equal(rect.color, '#ff0000'); assert.equal(rect.align, 'left')
  assert.equal(cleanEl({ type: 'shape', shape: 'line', x: 0, y: 0, w: 100, h: 50, html: 'x' }).html, undefined)
  assert.equal(cleanEl({ type: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 50, html: '  ' }).html, undefined)
})

test('slide files and project file keys cannot climb out of the project; real names survive', async () => {
  globalThis.document ??= { activeElement: null, createElement: () => ({}), querySelector: () => null }
  globalThis.indexedDB ??= { open: () => ({}) }
  const { cleanSlides, safePath } = await import('./store.js')
  const files = ['....//evil.md', '../x.md', 'a/%2e%2e/x.md', 'a\\..\\x.md', 'a/./x.md', 'x\0.md', 'Größe (1).md', '/pages/my%20deck.md']
  assert.deepEqual(cleanSlides(files.map(file => ({ file }))).map(s => s.file),
    [undefined, undefined, undefined, undefined, undefined, undefined, 'Größe (1).md', 'pages/my%20deck.md'])
  assert.equal(safePath('theme/../../etc'), undefined)
})
