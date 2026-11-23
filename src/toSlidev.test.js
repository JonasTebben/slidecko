import assert from 'node:assert/strict'
import { parseSlidev, headFormat } from './parseSlidev.js'
import { toSlidev, slideToMarkdown, imagePath } from './toSlidev.js'

const box = { x: 0, y: 0, w: 400, h: 100 }

test('text "<" and entity-like text stay text, code stays code', () => {
  const el = { id: 'a', type: 'text', ...box, html: '<p>List&lt;T&gt; and &lt;div&gt;, &amp;lt; literal, <code>&lt;b&gt;</code></p>' }
  const md = slideToMarkdown({ layout: 'default', elements: [el] })
  assert.ok(!/<T>|<div>,/.test(md), md) // raw tags would break Slidev's Vue compile
  assert.match(md, /`<b>`/)
  assert.equal(parseSlidev(md)[0].blocks[0].html.trim(), el.html)
  const tbl = { id: 't', type: 'table', ...box, header: true, preset: 'theme', rows: [['a&lt;b', 'x'], ['1', '2']] }
  assert.match(slideToMarkdown({ layout: 'default', elements: [tbl] }), /\| a&lt;b \| x \|/)
})

test('img attributes with quotes stay one attribute', () => {
  const el = { id: 'a', type: 'text', ...box, html: '<p><img src="./x.png" style="font-family: &quot;A B&quot;"></p>' }
  assert.match(slideToMarkdown({ layout: 'default', elements: [el] }), /<img src="\.\/x\.png" style="font-family: &quot;A B&quot;" \/>/)
})

test('a "---" line in the notes does not split the slide', () => {
  const md = toSlidev({ title: 'T', theme: 'hell', slides: [{ layout: 'default', notes: 'a\n---\nb', elements: [{ id: 'a', type: 'text', ...box, html: '<p>x</p>' }] }] }).files['slides.md']
  const s = parseSlidev(md)
  assert.equal(s.length, 1)
  assert.match(s[0].notes, /a\n ?---\nb/)
})

test('a malformed escape in an image path does not throw', () => {
  assert.equal(imagePath('/images/100%.png'), 'images/100%.png')
  assert.equal(imagePath('./images/a%20b.png'), 'images/a b.png')
})

test('transitions: project default in the headmatter, own ones in the slide frontmatter, read back', () => {
  const hi = { id: 'a', type: 'text', ...box, html: '<p>Hi</p>' }
  const slides = [{ layout: 'default', elements: [hi] }, { layout: 'default', transition: 'slide-up', elements: [hi] }, { layout: 'default', transition: 'none', elements: [hi] }, { layout: 'default', fm: 'transition: fade', elements: [hi] }]
  const md = toSlidev({ title: 'T', theme: 'hell', entry: 'slides.md', transition: 'slide-left', slides }, {}).files['slides.md']
  assert.equal(headFormat(md).transition, 'slide-left')
  // slide 4 follows the default again: its old `transition: fade` is gone
  assert.deepEqual(parseSlidev(md).map(s => s.transition), ['slide-left', 'slide-up', 'none', undefined])
  // no default: nothing written; a Slidev transition the editor does not offer stays
  const plain = toSlidev({ title: 'T', theme: 'hell', entry: 'slides.md', transition: 'none', slides: [{ layout: 'default', fm: 'transition: slide-right', elements: [hi] }, { layout: 'default', elements: [hi] }] }, {}).files['slides.md']
  assert.deepEqual(parseSlidev(plain).map(s => s.transition), ['slide-right', undefined])
  assert.equal(headFormat(plain).transition, undefined)
})
