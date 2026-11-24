import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import PptxGenJS from 'pptxgenjs'
import { slideNumbers, tocEntries, tocHtml, remapLinks } from './links.js'
import { toSlidev, slideToMarkdown, slideHash } from './toSlidev.js'
import { parseSlidev, slidevTags } from './parseSlidev.js'
import { OdpDoc } from './exportOdp.js'
// the store wants a browser: just enough of one
globalThis.document ??= { activeElement: null, createElement: () => ({}), querySelector: () => null }
globalThis.indexedDB ??= { open: () => ({}) }
const { cleanSlides, deck } = await import('./store.js')

const box = { x: 0, y: 0, w: 400, h: 100 }
const text = (html, o) => ({ id: 'e' + Math.random(), type: 'text', ...box, html, ...o })
const slide = (id, title, o = {}) => ({ id, layout: 'default', elements: [text(`<h1>${title}</h1>`, { title: true }), ...(o.els || [])], ...o })

test('slides keep their ids; a taken id gets a new one and links in the batch follow it', () => {
  const sh = to => ({ type: 'shape', ...box, to })
  const raw = () => [{ id: 'a', elements: [sh('b')] }, { id: 'b', elements: [] }]
  const [a, b] = cleanSlides(raw(), new Set())
  assert.deepEqual([a.id, b.id, a.elements[0].to], ['a', 'b', 'b'])
  const [c, d] = cleanSlides(raw(), new Set(['b'])) // pasted into a project that has a slide "b"
  assert.equal(c.id, 'a')
  assert.notEqual(d.id, 'b')
  assert.equal(c.elements[0].to, d.id)
  const [, , copy] = cleanSlides([{ id: 'x', elements: [] }, { id: 'y', elements: [] }, { id: 'x', elements: [] }], new Set())
  assert.notEqual(copy.id, 'x') // a duplicate id in one file: the copy gets its own
  const els = [{ html: '<p><a href="#slide-b">b</a> <a href="#slide-z">z</a></p>' }]
  remapLinks(els, { b: 'n' })
  assert.equal(els[0].html, '<p><a href="#slide-n">b</a> <a href="#slide-z">z</a></p>')
})

test('shapes keep their slide target, background and toc options are validated', () => {
  deck.assets.pic = 'data:image/png;base64,AA=='
  const [s] = cleanSlides([{ id: 's', hideInToc: true, cls: 'text-white <x>', bg: { asset: 'pic', src: '/images/p.png', fit: 'contain', dim: 300 },
    elements: [{ type: 'shape', ...box, to: 'other' }, { type: 'toc', ...box, minDepth: 2, maxDepth: 9, columns: 2, current: true }] }], new Set())
  assert.equal(s.hideInToc, true)
  assert.equal(s.cls, 'text-white x')
  assert.deepEqual(s.bg, { asset: 'pic', src: '/images/p.png', fit: 'contain', dim: 90 })
  assert.equal(s.elements[0].to, 'other')
  assert.deepEqual([s.elements[1].minDepth, s.elements[1].maxDepth, s.elements[1].columns, s.elements[1].current], [2, undefined, 2, true])
  assert.equal(cleanSlides([{ bg: { asset: 'missing' }, elements: [] }], new Set())[0].bg, undefined)
})

test('the table of contents lists shown slides by heading level, nested', () => {
  const slides = [slide('a', 'Intro'), slide('b', 'Part'), { id: 'c', elements: [text('<h2>Detail &amp; more</h2>')] }, slide('d', 'Secret', { hidden: true }), slide('e', 'Skip', { hideInToc: true })]
  const e = tocEntries(slides)
  assert.deepEqual(e.map(x => [x.id, x.level]), [['a', 1], ['b', 1], ['c', 2]])
  assert.equal(tocHtml(e, { current: true }, 'b'), '<ul><li><a href="#slide-a">Intro</a></li><li><a href="#slide-b" class="toc-current" aria-current="page">Part</a><ul><li><a href="#slide-c">Detail &amp; more</a></li></ul></li></ul>')
  assert.deepEqual(tocEntries(slides, { minDepth: 2 }).map(x => x.id), ['c'])
  assert.deepEqual(tocEntries(slides, { maxDepth: 1 }).map(x => x.id), ['a', 'b'])
})

test('Slidev export: links get the current numbers, a link to a deleted slide stays text', () => {
  const link = text('<p>See <a href="#slide-c">the end</a> and <a href="#slide-gone">nothing</a></p>')
  const slides = [slide('a', 'A', { els: [link, { id: 'sh', type: 'shape', shape: 'rect', ...box, fill: '#f00', stroke: 'none', strokeWidth: 0, radius: 0, to: 'c' }] }), slide('h', 'Hidden', { hidden: true }), slide('c', 'C')]
  const md = toSlidev({ title: 'T', theme: 'hell', slides }).files['slides.md']
  assert.match(md, /See <Link to="2">the end<\/Link> and nothing/) // the hidden slide is not counted (Slidev leaves it out)
  assert.match(md, /<div data-to="2" @click="\$nav\.go\(2\)" data-shape/)
  // reordered: the number follows the slide
  const again = toSlidev({ title: 'T', theme: 'hell', slides: [slides[2], slides[0]] }).files['slides.md']
  assert.match(again, /<Link to="1">the end<\/Link>/)
  assert.deepEqual([...slideNumbers(slides)], [['a', 1], ['c', 2]])
})

test('an unchanged imported slide gets its link numbers renumbered', () => {
  const s = { id: 'a', layout: 'default', md: 'Go to <Link to="2">two</Link> or [three](/3)', elements: [text('<p>Go to <a href="#slide-c">two</a> or <a href="#slide-b">three</a></p>')] }
  s.hash = slideHash(s)
  assert.equal(slideToMarkdown(s, [s, { id: 'b', elements: [] }, { id: 'c', elements: [] }]), 'Go to <Link to="3">two</Link> or [three](/2)\n')
})

test('Slidev export and import of toc, hideInToc, background and class', () => {
  const slides = [slide('a', 'A', { hideInToc: true, cls: 'text-white', bg: { asset: 'pic', src: '/images/p.png', fit: 'contain', dim: 40 }, els: [{ id: 't', type: 'toc', ...box, maxDepth: 2, columns: 2, current: true }] })]
  const r = toSlidev({ title: 'T', theme: 'hell', slides })
  const md = r.files['slides.md']
  for (const line of ['hideInToc: true', 'background: /images/p.png', 'backgroundSize: contain', 'backgroundDim: 40', 'class: text-white']) assert.ok(md.includes(line), line)
  assert.match(md, /<Toc columns="2" maxDepth="2" \/>/)
  assert.equal(r.images['images/p.png'], 'pic')
  // the slide's frontmatter (here the headmatter) is read back by the parser; the import turns <Toc> and <Link> into editor HTML
  assert.match(parseSlidev(md)[0].fm, /background: \/images\/p\.png/)
  assert.match(slidevTags('<Toc maxDepth="2" columns="3"/>'), /data-toc="\{&quot;maxDepth&quot;:2,&quot;columns&quot;:3\}"/)
  assert.equal(slidevTags('<Link to="4">go</Link> `<Link to="1">x</Link>`'), '<a href="#4">go</a> `<Link to="1">x</Link>`')
  assert.equal(slidevTags('<Link to="4" title="Four"/>'), '<a href="#4">Four</a>')
})

test('PPTX and ODP: slide jumps on text, shapes and pictures', async () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const p = new PptxGenJS()
  const s1 = p.addSlide()
  p.addSlide()
  s1.addText([{ text: 'go', options: { hyperlink: { slide: 2 } } }], { x: 1, y: 1, w: 2, h: 1 })
  s1.addShape('rect', { x: 1, y: 2, w: 1, h: 1, hyperlink: { slide: 2 } })
  const zip = await JSZip.loadAsync(await p.write({ outputType: 'arraybuffer' }))
  assert.equal((await zip.file('ppt/slides/slide1.xml').async('string')).match(/action="ppaction:\/\/hlinksldjump"/g).length, 2)
  assert.match(await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string'), /relationships\/slide" Target="slide2\.xml"/)

  const d = new OdpDoc()
  const o = d.addSlide()
  d.addSlide()
  o.addText([{ text: 'go', options: { hyperlink: { slide: 2 } } }], { x: 1, y: 1, w: 2, h: 1 })
  o.addShape('rect', { x: 1, y: 2, w: 1, h: 1, hyperlink: { slide: 2 } })
  o.addImage({ data: PNG, x: 0, y: 0, w: 1, h: 1, hyperlink: { slide: 2 } })
  const content = await (await JSZip.loadAsync(await (await d.write()).arrayBuffer())).file('content.xml').async('string')
  assert.match(content, /<text:a xlink:type="simple" xlink:href="#Slide 2">go<\/text:a>/)
  assert.equal(content.match(/presentation:action="show" xlink:href="#Slide 2"/g).length, 2)
  assert.match(content, /<draw:rect [^>]*><office:event-listeners>/)
})
