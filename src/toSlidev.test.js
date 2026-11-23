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

test('a new slide in its preset arrangement is plain Markdown until it is moved', async () => {
  const { flowHash, flowable } = await import('./toSlidev.js')
  const s = { layout: 'default', elements: [
    { id: 'b', type: 'text', x: 56, y: 110, w: 868, h: 108, html: '<ul><li>One</li><li>Two</li></ul>' },
    { id: 'a', type: 'text', title: true, x: 56, y: 40, w: 868, h: 40, html: '<h1>Title</h1>' }] }
  assert.ok(flowable(s.elements))
  s.flow = flowHash(s)
  s.elements[0].html = '<ul><li>One</li><li>Two</li><li>Three</li></ul>' // typing keeps it Markdown
  s.elements[0].h = 140
  assert.equal(slideToMarkdown(s), '# Title\n\n-   One\n-   Two\n-   Three\n')
  s.elements[0].x = 80 // rearranged: positioned boxes again
  assert.match(slideToMarkdown(s), /position:absolute/)
  assert.ok(!flowable([{ type: 'text', x: 56, w: 410 }, { type: 'text', x: 514, w: 410 }])) // two columns
})

test('a timer is written with its start value and data-timer for the import', () => {
  const md = slideToMarkdown({ layout: 'default', elements: [{ id: 't', type: 'timer', ...box, seconds: 600 }] })
  assert.match(md, /<div data-timer="600" style="position:absolute[^"]*">\n\n10:00\n\n<\/div>/)
})

test('a picker keeps its names in one escaped data-picks attribute that reads back to the same list', () => {
  const names = ['Ana "A" <b>', 'Ben & Co', '{{ x }}', 'Line\nbreak']
  const md = slideToMarkdown({ layout: 'default', elements: [{ id: 'p', type: 'picker', ...box, names }] })
  const attr = md.match(/<div data-picks="([^"]*)" style="position:absolute[^"]*">/)[1]
  assert.doesNotMatch(attr, /[<>\n]/)
  // what the browser's dataset gives the import
  assert.deepEqual(JSON.parse(attr.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')), names)
  assert.match(md, /🎲 Ana/)
})

test('a notes box keeps its "editable while presenting" flag as --board in its box style', () => {
  const el = { id: 'n', type: 'text', ...box, html: '<ul><li>idea</li></ul>', board: true }
  assert.match(slideToMarkdown({ layout: 'default', elements: [el] }), /<div style="position:absolute[^"]*;--board:1[^"]*">/) // positioned, not flowed
  assert.doesNotMatch(slideToMarkdown({ layout: 'default', elements: [{ ...el, board: undefined }] }), /--board/)
})

test('a quiz is written as text, the correct answer boxed on the next click, and data-quiz brings it back', () => {
  const el = { id: 'q', type: 'quiz', ...box, question: 'Is "a" > b & <c> {{ x }}?', answers: [{ text: 'Yes <i>', correct: true }, { text: 'No' }] }
  const md = slideToMarkdown({ layout: 'default', elements: [el] })
  const attr = md.match(/<div data-quiz="([^"]*)"/)[1]
  assert.ok(!/[<>]/.test(attr)) // a ">" would end the tag for the Vue-safety pass
  const data = JSON.parse(attr.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))
  assert.deepEqual(data, { question: el.question, answers: el.answers })
  assert.match(md, /- <span v-mark\.box\.green>\*\*A\*\* Yes &lt;i><\/span>/)
  assert.match(md, /- \*\*B\*\* No$/m)
})

test('appear on click: the box gets Slidev’s v-click with its step, which the import reads back', async () => {
  const { clickOf } = await import('./parseSlidev.js')
  const md = slideToMarkdown({ layout: 'default', elements: [{ id: 'a', type: 'text', ...box, html: '<p>x</p>', click: 2 }, { id: 'b', type: 'image', ...box, src: '/a.png', click: 1 }, { id: 'c', type: 'shape', shape: 'rect', ...box }] })
  assert.match(md, /<div v-click="2" style="position:absolute/)
  assert.match(md, /<img v-click="1" src="\/a\.png"/)
  assert.equal(md.match(/v-click/g).length, 2)
  assert.deepEqual([...md.matchAll(/v-click="(\d+)"/g)].map(m => clickOf(m[1], 0)), [2, 1])
  // Slidev's relative forms: an empty v-click (and "+1") is the step after the last one
  assert.deepEqual([clickOf('', 0), clickOf('', 3), clickOf('+2', 1), clickOf('4', 9)], [1, 4, 3, 4])
})

test('static exports get each quiz slide twice: as asked and with the solution', async () => {
  const { withSolutions } = await import('./quiz.js')
  const q = { id: 'q', type: 'quiz' }, t = { id: 't', type: 'text' }
  const out = withSolutions([{ id: 'a', elements: [t] }, { id: 'b', elements: [t, q] }])
  assert.deepEqual(out.map(s => s.id), ['a', 'b', 'b-solution'])
  assert.equal(out[1].elements[1].solved, undefined) // the original stays unsolved
  assert.equal(out[2].elements[1].solved, true)
  assert.equal(out[2].elements[0], t)
})

test('fields show the slide number, count and an escaped project title', async () => {
  const { fillFields } = await import('./toSlidev.js')
  assert.equal(fillFields('<p>Slide <span data-field="page">#</span> / <span data-field="total">9</span> · <span data-field="title"></span></p>', { page: 3, total: 12, title: 'A <b> & B' }),
    '<p>Slide <span data-field="page">3</span> / <span data-field="total">12</span> · <span data-field="title">A &lt;b&gt; &amp; B</span></p>')
  assert.equal(fillFields('<p>{{ x }}</p>', { page: 1 }), '<p>{{ x }}</p>')
})

test('Slidev export: the master is global-bottom.vue, a decorated layout layouts/<name>.vue; plain layouts and unchanged slides stay as they are', async () => {
  const { readLayers } = await import('./toSlidev.js')
  const field = { id: 'f', type: 'text', x: 800, y: 500, w: 120, h: 30, html: '<p>{{ <span data-field="page">#</span></p>' }
  const layouts = [
    { id: 'title', name: 'Title slide', layout: 'cover', elements: [{ id: 'p', type: 'text', placeholder: true, ...box, html: '<h1>T</h1>' }] },
    { id: 'brand', name: 'Brand cover', layout: 'cover', elements: [{ id: 'b', type: 'shape', shape: 'rect', x: 0, y: 0, w: 980, h: 20, fill: '#123456', stroke: 'none', strokeWidth: 0, radius: 0 }, field] },
    { id: 'cv', name: 'Cover', layout: 'default', elements: [{ id: 'x', type: 'shape', shape: 'rect', ...box, fill: '#000', stroke: 'none' }] }, // its name is a Slidev layout's
  ]
  const md = '# Hello\n'
  const slides = [
    { layout: 'cover', type: 'title', md, hash: 0, elements: [] },
    { layout: 'cover', type: 'brand', md, elements: [], hideMaster: true },
    { layout: 'default', type: 'cv', elements: [{ id: 'y', type: 'text', ...box, html: '<p>x</p>' }] },
  ]
  const { slideHash } = await import('./toSlidev.js')
  for (const s of slides) s.hash = slideHash(s)
  const { files } = toSlidev({ title: 'T', theme: 'hell', slides, master: [field], layouts }, { 'layouts/old.vue': '<!-- slidecko-layout {} -->', 'layouts/mine.vue': '<template />' })
  const out = parseSlidev(files['slides.md'])
  assert.deepEqual(out.map(s => s.layout), ['cover', 'brand-cover', 'cover-layout'])
  assert.equal(out[0].md.trim(), md.trim()) // unchanged slide: its Markdown as imported
  assert.match(files['slides.md'], /hideMaster: true/)
  assert.ok(!files['layouts/old.vue'] && files['layouts/mine.vue']) // an earlier export's file goes, the project's own stays
  const vue = files['layouts/brand-cover.vue']
  assert.match(vue, /class="slidev-layout cover"[\s\S]*fill="#123456"[\s\S]*<slot \/>/)
  assert.match(vue, /<span v-pre>\{\{<\/span> <span data-field="page">\{\{ \$nav\.currentPage \}\}<\/span>/)
  assert.match(files['global-bottom.vue'], /hideMaster[\s\S]*\$nav\.currentPage/)
  // read back: the editable master and layouts, and which file a slide names
  const back = readLayers(files)
  assert.equal(back.master[0].html, field.html)
  const brand = back.layouts.find(l => l.slug === 'brand-cover')
  assert.deepEqual([brand.id, brand.name, brand.layout, brand.elements.length], ['brand', 'Brand cover', 'cover', 2])
})
