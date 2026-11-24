import assert from 'node:assert/strict'
import { parseSlidev, codeEl } from '../import/parseSlidev.js'
import { slideToMarkdown } from '../export/toSlidev.js'
// the store wants a browser: just enough of one (as in store.test.js)
globalThis.document ??= { activeElement: null, createElement: () => ({}), querySelector: () => null }
globalThis.indexedDB ??= { open: () => ({}) }
const { cleanEl } = await import('../core/store.js')

const code = 'flowchart LR\n  A[Start] --> B{Ok?}\n  B -->|`yes`| C'

test('a ```mermaid block becomes a diagram, other fences stay code', () => {
  const [b] = parseSlidev('# T\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n')[0].blocks.filter(x => x.type === 'code')
  assert.deepEqual(codeEl(b.code, b.lang), { type: 'diagram', code: 'sequenceDiagram\n  A->>B: hi' })
  assert.deepEqual(codeEl('x = 1', 'py'), { type: 'code', code: 'x = 1', lang: 'py' })
  assert.equal(codeEl('x').lang, 'plaintext')
})

test('Slidev export writes a ```mermaid block in its box, the import reads position, size and code back', () => {
  const el = { id: 'd', type: 'diagram', x: 100, y: 80, w: 600, h: 320, code }
  const md = slideToMarkdown({ layout: 'default', elements: [el] })
  assert.match(md, /position:absolute;left:100px;top:80px;width:600px;height:320px/)
  assert.match(md, /```mermaid\n/)
  const [b] = parseSlidev(md)[0].blocks
  assert.deepEqual(b.box, { x: 100, y: 80, w: 600, h: 320 })
  assert.deepEqual(codeEl(b.code, b.lang), { type: 'diagram', code })
})

test('cleanEl keeps the code as text and caps its length', () => {
  assert.equal(cleanEl({ type: 'diagram', code }).code, code)
  assert.equal(cleanEl({ type: 'diagram', code: 'a'.repeat(30000) }).code.length, 20000)
  assert.equal(cleanEl({ type: 'diagram', code: { evil: 1 } }).code, '')
  assert.equal(cleanEl({ type: 'diagram' }).code, '')
})
