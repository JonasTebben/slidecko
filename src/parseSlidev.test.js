import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseSlidev, headFormat } from './parseSlidev.js'
import { toSlidev, slideHash, slideToMarkdown, escapeMustache } from './toSlidev.js'
import { importTheme } from './themes.js'

// the JBT Theme is no built-in theme: the tests use it the way a user does, imported from its file
importTheme(JSON.parse(readFileSync(new URL('../themes/jbt.theme.json', import.meta.url), 'utf8')))

const md = `---
theme: ./theme
layout: intro
---

# Astro

## Erste Schritte

---

# Code

**Fett**

\`\`\`js {1,2}
const a = 1
---
const b = 2
\`\`\`

→ Ende

---
layout: quiz
---

# Spalten

<div class="flex gap-16 -mt-4">
<div>

**Links**

- a

</div>
<div>

![alt](/images/x.png)

</div>
</div>

<img src="./images/y.svg" class="w-40" />

<!-- Notiz -->
`

test('splits slides, frontmatter and blocks', () => {
  const s = parseSlidev(md)
  assert.equal(s.length, 3)
  assert.equal(s[0].layout, 'intro')
  assert.deepEqual(s[0].blocks.map(b => [b.type, !!b.title]), [['text', true], ['text', false]])

  // the --- inside the code fence is not a slide separator
  assert.deepEqual(s[1].blocks.map(b => b.type), ['text', 'text', 'code', 'text'])
  assert.deepEqual([s[1].blocks[2].lang, s[1].blocks[2].code], ['js', 'const a = 1\n---\nconst b = 2'])

  assert.equal(s[2].layout, 'quiz')
  const [, left, right, img] = s[2].blocks
  assert.deepEqual([left.type, left.col], ['text', { group: 1, index: 0 }])
  assert.deepEqual([right.type, right.src, right.col], ['image', '/images/x.png', { group: 1, index: 1 }])
  assert.deepEqual([img.type, img.src, img.col], ['image', './images/y.svg', undefined])
  assert.equal(s[2].notes, 'Notiz')
  assert.ok(!JSON.stringify(s[2].blocks).includes('Notiz'))
})

test('embeds files referenced via src', () => {
  const files = {
    'deck/a.md': '# A1\n\n---\n\n# A2\n\n---\nsrc: ../b.md\n---\n',
    'b.md': '---\nlayout: intro\n---\n\n# B\n\n---\nsrc: /deck/a.md\n---\n', // cycle back to a.md
  }
  const requested = []
  const read = p => (requested.push(p), files[p])
  const s = parseSlidev('---\ntheme: x\nlayout: cover\n---\n\n# Start\n\n---\nsrc: ./a.md#1-2\n---\n\n---\nsrc: ./missing.md\n---\n', read, 'deck/slides.md')
  assert.deepEqual(s.map(x => [x.layout, x.blocks[0].html.trim()]), [['cover', '<h1>Start</h1>'], ['default', '<h1>A1</h1>'], ['default', '<h1>A2</h1>'], ['intro', '<h1>B</h1>']])
  assert.deepEqual(requested, ['deck/a.md', 'b.md', 'deck/missing.md'])
})

test('edited slides are written as positioned boxes that parse back identically', () => {
  const elements = [
    { id: 'a', type: 'text', title: true, x: 56, y: 24, w: 868, h: 44, html: '<h1>Titel</h1>' },
    { id: 'b', type: 'text', x: 60, y: 110.4, w: 400, h: 200, fontSize: 20, html: '<p><strong>Fett</strong> und <a href="https://sli.dev">Link</a></p><ul><li>a</li><li>b</li></ul><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>' },
    { id: 'c', type: 'code', x: 500, y: 110, w: 400, h: 120, lang: 'js', meta: '{1,2}', code: 'const a = `x`\n---\n```' },
    { id: 'd', type: 'image', x: 500, y: 300, w: 200, h: 100, src: '/images/x.png', asset: 'A1' },
  ]
  const { files, images } = toSlidev({ title: 'T', theme: 'hell', slides: [{ layout: 'default', elements }, { layout: 'cover', fm: 'layout: default\nclass: x', notes: 'Notiz', elements: [] }] })
  assert.deepEqual(images, { 'images/x.png': 'A1' })
  const md = files['slides.md']
  assert.match(md, /^---\ntitle: "T"\ntheme: default\n---\n/)
  assert.ok(files['style.css'].includes('.slidev-layout'))
  const [one, two] = parseSlidev(md)
  assert.deepEqual([two.fm, two.layout, two.notes], ['class: x\nlayout: cover', 'cover', 'Notiz'])
  const [t, text, code, img] = one.blocks
  assert.deepEqual([t.title, t.html.trim(), t.box], [true, '<h1>Titel</h1>', { x: 56, y: 24, w: 868, h: 44 }])
  assert.deepEqual(text.box, { x: 60, y: 110, w: 400, h: 200, fontSize: 20 })
  for (const part of ['<strong>Fett</strong>', '<a href="https://sli.dev">Link</a>', '<li>a</li>', '<th>A</th>', '<td>2</td>']) assert.ok(text.html.includes(part), part)
  assert.deepEqual([code.code, code.lang, code.meta, code.box.x], [elements[2].code, 'js', '{1,2}', 500])
  assert.deepEqual([img.src, img.box], ['/images/x.png', { x: 500, y: 300, w: 200, h: 100 }])
})

test('escapes Vue mustaches in text but not in code', () => {
  const elements = [
    { id: 'a', type: 'text', x: 0, y: 0, w: 400, h: 100, html: '<p>Hello {{name}} and <code>{{inline}}</code></p>' },
    { id: 'b', type: 'code', x: 0, y: 200, w: 400, h: 100, lang: 'vue', code: '<p>{{ msg }}</p>' },
  ]
  const md = toSlidev({ title: 'T', theme: 'hell', entry: 'slides.md', slides: [{ layout: 'default', elements }] }, {}).files['slides.md']
  assert.match(md, /Hello <span v-pre>\{\{<\/span>name\}\}/)
  assert.match(md, /`\{\{inline\}\}`/)
  assert.match(md, /```vue\n<p>\{\{ msg \}\}<\/p>\n```/)
  // Turndown's escaped backticks are text, not a code span
  assert.equal(escapeMustache('Use \\` quotes {{name}} and \\` here'), 'Use \\` quotes <span v-pre>{{</span>name}} and \\` here')
  // an unchanged imported slide stays byte for byte
  const kept = { layout: 'default', md: 'Raw {{x}}', elements: [] }
  kept.hash = slideHash(kept)
  assert.match(toSlidev({ title: 'T', theme: 'hell', entry: 'slides.md', slides: [kept] }, {}).files['slides.md'], /Raw \{\{x\}\}/)
})

test('exports tables, shapes and decks in slide order', () => {
  const tbl = { id: 't', type: 'table', x: 56, y: 110, w: 600, h: 120, preset: 'striped', header: true, align: ['', 'right'], rows: [['Code', 'Text'], ['404', 'Not Found']] }
  const shape = { id: 's', type: 'shape', shape: 'ellipse', x: 700, y: 110, w: 100, h: 80, fill: '#2563eb', stroke: 'none' }
  const title = (id, t) => ({ id, type: 'text', title: true, x: 56, y: 40, w: 868, h: 40, html: `<h1>${t}</h1>` })
  const { files } = toSlidev({ title: 'T', theme: 'hell', entry: 'slides.md', slides: [
    { id: 'a', layout: 'cover', elements: [title('x', 'Start')] },
    { id: 'b', layout: 'default', file: '02_B.md', elements: [title('y', 'B'), tbl, shape] },
    { id: 'c', layout: 'default', file: '01_A.md', elements: [title('z', 'A')] },
  ] }, {})
  // decks keep the order of the slide list, not of their names
  assert.ok(files['slides.md'].indexOf('src: ./02_B.md') < files['slides.md'].indexOf('src: ./01_A.md'))
  const b = files['02_B.md']
  assert.match(b, /data-table="striped"/)
  assert.match(b, /\| Code \| Text \|/)
  assert.match(b, /\| --- \| ---: \|/)
  assert.match(b, /data-shape="ellipse"/)
  assert.match(b, /<ellipse /)
})

test('project-wide font sizes are exported to style.css', () => {
  const slides = [{ id: 'a', layout: 'default', elements: [{ id: 'x', type: 'text', x: 0, y: 0, w: 100, h: 40, html: '<p>Hi</p>' }] }]
  const own = toSlidev({ title: 'T', theme: 'jbt', entry: 'slides.md', slides, typo: { text: 20, code: 12 } }, { 'style.css': '.mine { color: red }', 'theme/package.json': '{}' }).files['style.css']
  assert.match(own, /^\.mine \{ color: red \}/) // the project's own style.css is kept
  assert.match(own, /\.slidev-layout \{ font-size: 20px !important; \}/)
  assert.match(own, /--slidev-code-font-size: 12px/)
  assert.doesNotMatch(own, /h1 \{ font-size/) // no title size chosen
  assert.equal(toSlidev({ title: 'T', theme: 'jbt', entry: 'slides.md', slides }, { 'theme/package.json': '{}' }).files['style.css'], undefined)
  // the JBT Theme is a package: named in the headmatter and installable via package.json, no generated CSS
  const loose = toSlidev({ title: 'T', theme: 'jbt', entry: 'slides.md', slides }, {}).files
  assert.match(loose['slides.md'], /theme: jbt-theme/)
  assert.equal(loose['style.css'], undefined)
  assert.equal(JSON.parse(loose['package.json']).dependencies['jbt-theme'], 'github:JonasTebben/jbt-theme#v1.1.4')
  // a project that still uses its own ./theme folder keeps it, and gets no theme dependency
  const legacy = [{ ...slides[0], fm: 'theme: ./theme' }]
  const old = toSlidev({ title: 'T', theme: 'jbt', entry: 'slides.md', slides: legacy }, { 'package.json': '{"dependencies":{}}\n' }).files
  assert.match(old['slides.md'], /theme: \.\/theme/)
  assert.equal(old['package.json'], '{"dependencies":{}}\n')
  assert.match(toSlidev({ title: 'T', theme: 'hell', entry: 'slides.md', slides }, { 'style.css': '.mine {}' }).files['style.css'], /\.mine \{\}/) // generated theme CSS keeps the project's rules
})

test('a list in a table cell stays a list in the Markdown table', () => {
  const el = { id: 't', type: 'table', x: 0, y: 0, w: 400, h: 100, header: true, rows: [['Schritte', 'B'], ['<ol start="2">\n<li>eins</li>\n<li>a | b</li></ol>', 'x']] }
  const md = slideToMarkdown({ layout: 'default', elements: [el] })
  assert.match(md, /\| <ol start="2"><li>eins<\/li><li>a \\\| b<\/li><\/ol> \| x \|/)
})

test('a table with cell colours is exported as an HTML table that keeps them', () => {
  const tbl = { id: 't', type: 'table', x: 56, y: 110, w: 600, h: 120, preset: 'theme', header: true, align: ['', 'right'], rows: [['Code', 'Text'], ['404', 'Not Found']], fills: [['#006b96', '#006b96'], ['', '#fee2e2']] }
  const { files } = toSlidev({ title: 'T', theme: 'hell', entry: 'slides.md', slides: [{ id: 'a', layout: 'default', elements: [tbl] }] }, {})
  const md = files['slides.md']
  assert.match(md, /<thead><tr><th style="background:#006b96">Code<\/th><th align="right" style="background:#006b96">Text<\/th><\/tr><\/thead>/)
  assert.match(md, /<td>404<\/td><td align="right" style="background:#fee2e2">Not Found<\/td>/)
  assert.doesNotMatch(md, /\| Code \|/)
})

test('a table with cell borders is exported as an HTML table that keeps them', () => {
  const tbl = { id: 't', type: 'table', x: 56, y: 110, w: 600, h: 120, preset: 'theme', header: true, align: ['', ''], rows: [['A', 'B'], ['1', '2']], borders: [[['1px solid #000000', '', '3px solid #FFFFFF', ''], ['', '', '', '']], [['', '', '', ''], ['', '', '', '']]] }
  const { files } = toSlidev({ title: 'T', theme: 'hell', entry: 'slides.md', slides: [{ id: 'a', layout: 'default', elements: [tbl] }] }, {})
  const md = files['slides.md']
  assert.match(md, /data-borders/)
  assert.match(md, /<th style="border-top:1px solid #000000;border-bottom:3px solid #FFFFFF">A<\/th><th>B<\/th>/)
  assert.match(md, /\[data-borders\] table/) // the reset of the theme's row lines travels with the project
})

test('slide format: headmatter aspectRatio/canvasWidth are read and written back', () => {
  assert.deepEqual(headFormat("---\ntheme: default\naspectRatio: '4:3'\ncanvasWidth: 1024\n---\n\n# A\n"), { aspectRatio: '4/3', canvasWidth: 1024 })
  assert.deepEqual(headFormat('---\naspectRatio: 1.6\n---\n\n# A\n'), { aspectRatio: '1.6' })
  assert.deepEqual(headFormat('# no headmatter\n'), {})
  const slides = [{ id: 'a', layout: 'default', elements: [] }]
  const head = d => toSlidev({ title: 'T', theme: 'hell', entry: 'slides.md', slides, ...d }).files['slides.md'].match(/^---\n([\s\S]*?)\n---/)[1]
  assert.doesNotMatch(head({ aspectRatio: '16/9', canvasWidth: 980 }), /aspectRatio|canvasWidth/) // default project: neither key
  assert.doesNotMatch(head({}), /aspectRatio|canvasWidth/)
  assert.match(head({ aspectRatio: '4/3', canvasWidth: 1024 }), /\naspectRatio: 4\/3\ncanvasWidth: 1024$/)
  // imported headmatter: kept as written when it means the same, replaced when the format changed, never duplicated
  const kept = [{ id: 'a', layout: 'default', fm: "aspectRatio: '4:3'\ncanvasWidth: 980", elements: [] }]
  const out = d => toSlidev({ title: 'T', theme: 'hell', entry: 'slides.md', slides: kept, ...d }).files['slides.md']
  assert.match(out({ aspectRatio: '4/3', canvasWidth: 980 }), /aspectRatio: '4:3'\ncanvasWidth: 980\n/)
  const changed = out({ aspectRatio: '16/10', canvasWidth: 1200 })
  assert.equal(changed.match(/aspectRatio/g).length, 1)
  assert.match(changed, /aspectRatio: 16\/10\ncanvasWidth: 1200\n/)
  assert.deepEqual(headFormat(changed), { aspectRatio: '16/10', canvasWidth: 1200 })
})

test('stripNonContent keeps comments and <style> inside code', async () => {
  const { stripNonContent } = await import('./parseSlidev.js')
  const md = '<!-- note -->\n# T\n<style>h1{color:red}</style>\nUse `<style></style>` here\n\n```html\n<!-- 2. Template -->\n<style>\nh1 { color: red; }\n</style>\n```\n<!-- end -->'
  assert.equal(stripNonContent(md), '\n# T\n\nUse `<style></style>` here\n\n```html\n<!-- 2. Template -->\n<style>\nh1 { color: red; }\n</style>\n```\n')
})

test('toSlidev keeps the shrunken size of shape text', () => {
  const el = { id: 's1', type: 'shape', shape: 'rect', x: 0, y: 0, w: 100, h: 40, fill: '#fff', stroke: '#000', html: 'Langer Text' }
  const md = o => Object.values(toSlidev({ title: 'T', theme: 'hell', slides: [{ layout: 'default', elements: [el] }] }, {}, o).files).join('')
  assert.match(md({ shapeFont: { s1: '9.5px' } }), /<div style="font-size:9.5px">Langer Text<\/div>/)
  assert.match(md(), /<div>Langer Text<\/div>/)
})
