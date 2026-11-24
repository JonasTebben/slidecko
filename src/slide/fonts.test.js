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
  const { textStyles, saveTextStyles, mergeTextStyles } = await import('../core/store.js')
  saveTextStyles([{ name: 'Merksatz', tag: 'p', color: '#ff0000' }])
  mergeTextStyles([{ name: 'Merksatz', tag: 'h2' }, { name: 'Zitat groß', tag: 'script', font: 'serif', fontSize: 9999, color: 'url(x)', valign: 'middle' }, { tag: 'p' }])
  assert.deepEqual(textStyles.list, [
    { name: 'Merksatz', tag: 'p', color: '#ff0000' },
    { name: 'Zitat groß', tag: 'p', fontSize: 400, font: 'serif', valign: 'middle' },
  ])
})

test('a project file carries only the styles its slides use', async () => {
  const { saveTextStyles, deckFile, deck } = await import('../core/store.js')
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
  const { cleanCrop } = await import('../core/store.js')
  assert.deepEqual(cleanCrop({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 }), { x: 0.1, y: 0.2, w: 0.5, h: 0.5 })
  assert.deepEqual(cleanCrop({ x: 0.5, y: 0, w: 0.9, h: 1 }), { x: 0.5, y: 0, w: 0.5, h: 1 }) // never past the right edge
  assert.equal(cleanCrop({ x: 0, y: 0, w: 1, h: 1 }), undefined)
  assert.equal(cleanCrop({ x: 0, y: 0, w: 0, h: 1 }), undefined)
  assert.equal(cleanCrop('x'), undefined)
})

test('shapes keep text colour and alignment; lines and blank text get no text', async () => {
  globalThis.document ??= { activeElement: null, createElement: () => ({}), querySelector: () => null }
  globalThis.indexedDB ??= { open: () => ({}) }
  const { cleanEl } = await import('../core/store.js')
  // (text with content goes through DOMPurify, which needs a browser: checked in the editor)
  const rect = cleanEl({ type: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 50, color: '#ff0000', align: 'left' })
  assert.equal(rect.color, '#ff0000'); assert.equal(rect.align, 'left')
  assert.equal(cleanEl({ type: 'shape', shape: 'line', x: 0, y: 0, w: 100, h: 50, html: 'x' }).html, undefined)
  assert.equal(cleanEl({ type: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 50, html: '  ' }).html, undefined)
})

test('slide files and project file keys cannot climb out of the project; real names survive', async () => {
  globalThis.document ??= { activeElement: null, createElement: () => ({}), querySelector: () => null }
  globalThis.indexedDB ??= { open: () => ({}) }
  const { cleanSlides, safePath } = await import('../core/store.js')
  const files = ['....//evil.md', '../x.md', 'a/%2e%2e/x.md', 'a\\..\\x.md', 'a/./x.md', 'x\0.md', 'Größe (1).md', '/pages/my%20deck.md']
  assert.deepEqual(cleanSlides(files.map(file => ({ file }))).map(s => s.file),
    [undefined, undefined, undefined, undefined, undefined, undefined, 'Größe (1).md', 'pages/my%20deck.md'])
  assert.equal(safePath('theme/../../etc'), undefined)
})

test('uploaded fonts are told apart by their first bytes, not by their name', async () => {
  const { fontType, fontLabel, cleanFonts } = await import('./fonts.js')
  const b = s => new Uint8Array([...s].map(c => c.charCodeAt(0)))
  assert.equal(fontType(b('wOF2xxxx')), 'font/woff2')
  assert.equal(fontType(b('wOFFxxxx')), 'font/woff')
  assert.equal(fontType(b('OTTOxxxx')), 'font/otf')
  assert.equal(fontType(b('\0\x01\0\0xxxx')), 'font/ttf')
  assert.equal(fontType(b('true')), 'font/ttf')
  assert.equal(fontType(b('<svg')), undefined)
  assert.equal(fontType(b('PK')), undefined)
  // the name ends up inside CSS quotes: nothing that could leave them
  assert.equal(fontLabel("Roboto_Slab-Bold'};x.ttf"), 'Roboto Slab Bold x')
  assert.equal(fontLabel('Inter.woff2', ['Inter']), 'Inter 2')
  assert.equal(fontLabel('...'), 'Font')
  assert.deepEqual(cleanFonts({ a1: 'Mine', b2: 'No file', c3: 'Image', 'x"y': 'Bad id' }, { a1: 'data:font/woff2;base64,AA', c3: 'data:image/png;base64,AA' }), { a1: 'Mine' })
})

test('@font-face rules: every bundled file exists, loads lazily and covers latin and latin-ext', async () => {
  const { BUNDLED, bundledFaces, fontCss, usesFamily } = await import('./fonts.js')
  const { existsSync } = await import('node:fs')
  for (const k of Object.keys(BUNDLED)) {
    for (const [f] of bundledFaces(k)) assert.ok(existsSync(new URL(`../../public/fonts/${f}`, import.meta.url)), f)
    assert.ok(existsSync(new URL(`../../public/fonts/${k}/OFL.txt`, import.meta.url)), k + ' licence')
  }
  const css = fontCss(['lora'], { a1: 'Mine' }, { a1: 'data:font/woff2;base64,AA' })
  assert.equal(css.match(/@font-face/g).length, 5) // 2 subsets × normal/italic + the own font
  assert.match(css, /font-family: 'Lora'; src: url\("fonts\/lora\/latin-ext-italic\.woff2"\); font-display: swap; font-weight: 400 700; font-style: italic; unicode-range: U\+0100/)
  assert.match(css, /font-family: 'Mine'; src: url\("data:font\/woff2;base64,AA"\)/)
  assert.doesNotMatch(fontCss(['lora'], { a1: 'Mine' }, {}), /Mine/) // no file: no rule
  assert.ok(usesFamily('font-family: "Source Serif 4", Georgia', 'Source Serif 4'))
  assert.ok(!usesFamily('<p>Lora is a font</p>', 'Lora'))
})

test('the Slidev export brings the fonts its slides use, and only those', async () => {
  const { toSlidev } = await import('../export/toSlidev.js')
  const { setOwnFonts } = await import('./themes.js')
  setOwnFonts({ f1: 'My Font', f2: 'Unused' })
  const text = font => ({ type: 'text', x: 0, y: 0, w: 100, h: 40, html: '<p>x</p>', font })
  const d = { title: 'T', theme: 'hell', entry: 'slides.md', slides: [{ layout: 'default', elements: [text('inter'), text('f1')] }], fonts: { f1: 'My Font', f2: 'Unused' } }
  const assets = { f1: 'data:font/ttf;base64,AA', f2: 'data:font/woff2;base64,AA' }
  const { files, fonts } = toSlidev(d, {}, { assets })
  assert.equal(fonts['public/fonts/inter/latin.woff2'], 'fonts/inter/latin.woff2')
  assert.equal(fonts['public/fonts/inter/OFL.txt'], 'fonts/inter/OFL.txt')
  assert.equal(fonts['public/fonts/f1.ttf'], 'f1')
  assert.ok(!Object.keys(fonts).some(p => /lora|f2\./.test(p)))
  assert.match(files['style.css'], /font-family: 'Inter'; src: url\("\/fonts\/inter\/latin\.woff2"\)/)
  assert.match(files['style.css'], /font-family: 'My Font'; src: url\("\/fonts\/f1\.ttf"\)/)
  // exported again from an imported project: the block is replaced, not added twice
  const again = toSlidev(d, { 'style.css': files['style.css'] }, { assets }).files['style.css']
  assert.equal(again.match(/fonts \(Slidecko\)/g).length, 1)
  assert.deepEqual(toSlidev({ ...d, slides: [{ layout: 'default', elements: [text()] }] }, {}, { assets }).fonts, {})
  setOwnFonts({})
})

test("font references: bundled and the project's own are kept, unknown ones fall back to the theme font", async () => {
  globalThis.document ??= { activeElement: null, createElement: () => ({}), querySelector: () => null }
  globalThis.indexedDB ??= { open: () => ({}) }
  const { deck, deckFile } = await import('../core/store.js')
  const { cleanFonts } = await import('./fonts.js')
  const { fontStack } = await import('./themes.js')
  // what cleanEl (and the text styles) keep: e.font only when fontStack knows it (text boxes need DOMPurify, so a browser)
  const el = font => (fontStack(font) ? font : undefined)
  assert.equal(el('inter'), 'inter')
  assert.equal(el('f9'), undefined)
  // as loadDeck does it (the whole of loadDeck needs more of a browser)
  deck.slides = []
  deck.assets = { f9: 'data:font/woff2;base64,AA' }
  deck.fonts = cleanFonts({ f9: 'Mine', g1: 'Gone' }, deck.assets)
  assert.deepEqual(deck.fonts, { f9: 'Mine' })
  assert.equal(el('f9'), 'f9')
  assert.equal(el('g1'), undefined)
  const file = JSON.parse(deckFile())
  assert.deepEqual(file.fonts, { f9: 'Mine' })
  assert.equal(file.assets.f9, 'data:font/woff2;base64,AA') // the .slides.json carries the file
  deck.fonts = cleanFonts(undefined) // another project: its fonts are not offered any more
  assert.equal(el('f9'), undefined)
})
