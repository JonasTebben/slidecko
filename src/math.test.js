import assert from 'node:assert/strict'
import { marked } from 'marked'
import { mathParts, hasMath } from './math.js'
import { parseSlidev } from './parseSlidev.js'
import { slideToMarkdown } from './toSlidev.js'
import { checkDeck } from './a11yCheck.js'
// the store wants a browser: just enough of one (as in store.test.js)
globalThis.document ??= { activeElement: null, createElement: () => ({}), querySelector: () => null }
globalThis.indexedDB ??= { open: () => ({}) }
const { cleanEl } = await import('./store.js')

test('$…$ and $$…$$ are found, currency and escaped dollars are not', () => {
  assert.deepEqual(mathParts('a $x^2$ b'), ['a ', { tex: 'x^2', display: false }, ' b'])
  assert.deepEqual(mathParts('$$\\frac{a}{b}$$'), [{ tex: '\\frac{a}{b}', display: true }])
  assert.equal(hasMath('5 $ and 6 $'), false)
  assert.equal(hasMath('costs $5 and $6'), false)
  assert.equal(hasMath('\\$x\\$ is a price'), false)
  assert.deepEqual(mathParts('$a\\$b$'), [{ tex: 'a\\$b', display: false }])
  assert.equal(hasMath('$ x$'), false)
  assert.equal(hasMath('$x $'), false)
  assert.equal(hasMath('$x$1'), false) // closing $ before a digit
})

test('Markdown keeps math as TeX source: no emphasis inside, not in code spans, $$ blocks become formulas', () => {
  assert.equal(marked.parseInline('$a_1 + b_1$ and *x*'), '$a_1 + b_1$ and <em>x</em>')
  assert.equal(marked.parseInline('`$x$` costs \\$5'), '<code>$x$</code> costs \\$5')
  assert.equal(marked.parseInline('$a<b$'), '$a&lt;b$')
  assert.equal(marked.parse('$$\nE = mc^2\n$$\n').trim(), '<p data-math="display">$$E = mc^2$$</p>')
  assert.equal(marked.parse('$$ {1|2}\na\\\\\nb\n$$').trim(), '<p data-math="display">$$a\\\\\nb$$</p>')
})

test('Slidev export writes math back as $…$ and a formula as a $$ block in its box', () => {
  const md = slideToMarkdown({ layout: 'default', elements: [{ id: 't', type: 'text', x: 60, y: 40, w: 400, h: 40, html: '<p>Area $\\pi r_1^2$ for *r* \\$5 a_b</p>' }] })
  assert.match(md, /Area \$\\pi r_1\^2\$ for \\\*r\\\* \\\$5 a\\_b/)
  const el = { id: 'm', type: 'math', tex: 'x = \\frac{-b}{2a}', x: 100, y: 80, w: 500, h: 120, fontSize: 36 }
  const out = slideToMarkdown({ layout: 'default', elements: [el] })
  assert.match(out, /position:absolute;left:100px;top:80px;width:500px;height:120px;font-size:36px/)
  assert.match(out, /\n\n\$\$\nx = \\frac\{-b\}\{2a\}\n\$\$\n\n/)
  const [b] = parseSlidev(out)[0].blocks
  assert.deepEqual(b.box, { x: 100, y: 80, w: 500, h: 120, fontSize: 36 })
  assert.equal(b.html.trim(), '<p data-math="display">$$x = \\frac{-b}{2a}$$</p>')
})

test('an unchanged imported slide with math is written back byte for byte', () => {
  const src = '# Euler\n\nInline $e^{i\\pi} + 1 = 0$, costs 5 $.\n\n$$\n\\int_0^1 x\\,dx\n$$'
  const [s] = parseSlidev(src)
  assert.equal(s.md, src)
})

test('cleanEl keeps the TeX as text, caps it and keeps a valid colour', () => {
  const { id, ...rest } = JSON.parse(JSON.stringify(cleanEl({ type: 'math', tex: 'x^2', color: '#ff0000', x: 1, y: 2, w: 30, h: 40, evil: '<script>' })))
  assert.deepEqual(rest, { type: 'math', tex: 'x^2', color: '#ff0000', x: 1, y: 2, w: 30, h: 40 })
  assert.equal(cleanEl({ type: 'math', tex: 'a'.repeat(9000) }).tex.length, 5000)
  assert.equal(cleanEl({ type: 'math', tex: { evil: 1 } }).tex, '')
  assert.equal(cleanEl({ type: 'math', color: 'red;x' }).color, undefined)
})

test('the accessibility check does not flag formulas, only their contrast', () => {
  const el = { id: 'm', type: 'math', tex: 'x^2', x: 0, y: 200, w: 300, h: 80, fontSize: 36 }
  const slide = { layout: 'default', elements: [{ id: 'h', type: 'text', title: true, html: '<h1>Formulas</h1>', x: 0, y: 0, w: 900, h: 60 }, el] }
  assert.deepEqual(checkDeck({ slides: [slide], theme: 'default' }), [])
  assert.deepEqual(checkDeck({ slides: [{ ...slide, elements: [slide.elements[0], { ...el, color: '#eeeeee' }] }], theme: 'default' }).map(f => f.rule), ['contrast'])
})
