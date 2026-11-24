import { checkDeck, applyFix, contrast, parseColor, paint, textRuns, visualOrder, readingOrderFix, slideTitle } from './a11yCheck.js'
import de from './locales/de.js'

const title = (html = '<h1>Title</h1>', o = {}) => ({ id: 't', type: 'text', title: true, x: 56, y: 40, w: 868, h: 40, html, ...o })
const text = (id, html, o = {}) => ({ id, type: 'text', x: 56, y: 120, w: 400, h: 60, html, ...o })
const deck = (elements, o = {}) => ({ theme: 'hell', canvasWidth: 980, typo: {}, slides: [{ layout: 'default', elements, ...o }] })
const rules = (d, o) => checkDeck(d, o).map(f => f.rule)
const one = (d, rule) => checkDeck(d).find(f => f.rule === rule)

test('contrast maths follows WCAG 2', () => {
  expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5)
  expect(contrast([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5)
  expect(contrast(parseColor('#777'), parseColor('#fff'))).toBeCloseTo(4.48, 2) // the classic just-failing grey
  expect(contrast(parseColor('#767676'), parseColor('#ffffff'))).toBeCloseTo(4.54, 2)
  expect(parseColor('rgb(255 0 0 / 50%)')).toEqual([255, 0, 0, 0.5])
  expect(parseColor('#0f08')).toEqual([0, 255, 0, 136 / 255])
  expect(parseColor('nonsense')).toBe(null)
  expect(paint('linear-gradient(90deg, #000, #fff)')).toEqual({ colors: [[0, 0, 0, 1], [255, 255, 255, 1]], gradient: true })
  expect(paint('url(x.png)').image).toBe(true)
  // a linear gradient counts with the colours under the box only: black to white from left to right
  expect(paint('linear-gradient(90deg, #000, #fff)', { x: 0, y: 0, w: 98, h: 10 }, 980, 552).colors.map(c => Math.round(c[0] / 5) * 5)).toEqual([0, 25])
  expect(paint('linear-gradient(to right, #000, #fff 50%, #00f)', { x: 0, y: 0, w: 980, h: 10 }, 980, 552).colors.length).toBe(3)
})

test('text runs keep their tags and inline styles', () => {
  const r = textRuns('<p>a <span style="color: #f00; font-size: 12px">b</span></p><br>')
  expect(r.map(x => x.text)).toEqual(['a ', 'b'])
  expect(r[1].stack.map(f => [f.tag, f.color, f.size])).toEqual([['p', undefined, undefined], ['span', '#f00', '12px']])
})

test('a well made slide has no findings', () => {
  expect(checkDeck(deck([title(), text('a', '<p>Plain text</p>')]))).toEqual([])
})

test('pictures need alt text or the decorative mark; the fix marks them decorative', () => {
  const img = { id: 'i', type: 'image', x: 500, y: 120, w: 200, h: 200, asset: 'x' }
  const d = deck([title(), img])
  const f = one(d, 'alt')
  expect([f.severity, f.msg, f.fix, f.el]).toEqual(['error', 'Picture without alt text. Describe it, or mark it as decorative.', 'decorative', 'i'])
  applyFix(d.slides[0], f)
  expect(img.decorative).toBe(true)
  expect(rules(d)).toEqual([])
  expect(one(deck([title(), { ...img, decorative: undefined, alt: 'IMG_2041.jpg' }]), 'alt').params).toEqual(['IMG_2041.jpg'])
  expect(rules(deck([title(), { ...img, decorative: undefined, alt: 'Sales doubled from 2023 to 2024' }]))).toEqual([])
})

test('low contrast against the theme, an own fill, a shape beneath; large text needs 3:1', () => {
  // #999 on white: 2.8:1
  expect(one(deck([title(), text('a', '<p>x</p>', { color: '#999999' })]), 'contrast').params).toEqual([2.8, 4.5])
  // #888 is 3.5:1: fails as body text, passes as a 34 px heading
  expect(one(deck([title(), text('a', '<p>x</p>', { color: '#888888' })]), 'contrast')).toBeTruthy()
  expect(one(deck([title('<h1>Big</h1>', { color: '#888888' })]), 'contrast')).toBeUndefined()
  // white text on its own dark fill is fine, on half transparent yellow over white it is not
  expect(one(deck([title(), text('a', '<p>x</p>', { color: '#ffffff', fill: '#1e3a8a' })]), 'contrast')).toBeUndefined()
  expect(one(deck([title(), text('a', '<p>x</p>', { color: '#ffffff', fill: '#1e3a8a', fillAlpha: 20 })]), 'contrast')).toBeTruthy()
  // the topmost filled shape under the text's centre is its background; an inline colour counts too
  const shape = { id: 's', type: 'shape', shape: 'rect', x: 0, y: 100, w: 980, h: 200, fill: '#111111', stroke: 'none' }
  expect(one(deck([title(), shape, text('a', '<p>dark on dark</p>')]), 'contrast').el).toBe('a')
  expect(one(deck([title(), shape, text('a', '<p><span style="color:#ffffff">light</span></p>')]), 'contrast')).toBeUndefined()
  // the master underneath counts as well
  expect(one(deck([title(), text('a', '<p>x</p>')]), 'contrast')).toBeUndefined()
  expect(checkDeck(deck([title(), text('a', '<p>x</p>')]), { underlay: () => [shape] }).find(f => f.rule === 'contrast')).toBeTruthy()
})

test('pictures and gradients beneath text are only flagged for a check by eye', () => {
  const img = { id: 'i', type: 'image', x: 0, y: 0, w: 980, h: 552, asset: 'x', decorative: true }
  const f = one(deck([img, title(), text('a', '<p>x</p>')]), 'contrast')
  expect([f.severity, f.msg]).toEqual(['tip', 'Text over a picture: check by eye that it is easy to read.'])
  // Ocean's cover is a gradient from dark blue to cyan; dark text fails on part of it
  const g = one({ theme: 'ozean', slides: [{ layout: 'cover', elements: [title('<h1>T</h1>', { color: '#0b2545' })] }] }, 'contrast')
  expect([g.severity, g.msg]).toEqual(['tip', 'Contrast {0}:1 on part of the gradient background (needs {1}:1). Check by eye.'])
})

test('built-in themes pass with their default text on every layout', () => {
  for (const theme of ['hell', 'dunkel', 'ozean', 'sonne', 'business', 'nord', 'neon'])
    for (const layout of ['default', 'cover', 'section', 'quote']) {
      const d = { theme, slides: [{ layout, elements: [title(), text('a', '<p>Text <a href="#">link</a> and <code>code</code></p><blockquote><p>q</p></blockquote>', { fontSize: 18 })] }] }
      expect([theme, layout, checkDeck(d).filter(f => f.rule === 'contrast')]).toEqual([theme, layout, []])
    }
})

test('small text, scaled with the canvas width', () => {
  expect(one(deck([title(), text('a', '<p>tiny</p>', { fontSize: 12 })]), 'size').params).toEqual([12, 16])
  expect(one(deck([title(), text('a', '<p>a <span style="font-size: 10px">b</span></p>')]), 'size').params).toEqual([10, 16])
  expect(one(deck([title(), text('a', '<p>ok</p>', { fontSize: 18 })]), 'size')).toBeUndefined()
  expect(one({ ...deck([title(), text('a', '<p>x</p>', { fontSize: 18 })]), canvasWidth: 1960 }, 'size').params).toEqual([18, 32])
  expect(one(deck([title(), { id: 'c', type: 'code', x: 56, y: 120, w: 400, h: 100, code: 'x', lang: 'js', fontSize: 10 }]), 'size').params).toEqual([10, 12])
})

test('slides need a title; the fix marks the topmost text; duplicate titles are a tip', () => {
  const d = deck([text('b', '<p>Body</p>', { y: 300 }), text('a', '<p>Quarterly results</p>', { y: 30 })])
  const f = one(d, 'title')
  expect([f.el, f.fix, f.msg]).toEqual(['a', 'title', 'No slide title. Mark the text that names the slide as its title.'])
  applyFix(d.slides[0], f)
  expect(slideTitle(d.slides[0])).toBe('Quarterly results')
  expect(one(deck([]), 'title').fix).toBeUndefined()
  // a heading counts as a title without the mark
  expect(one(deck([text('a', '<h2>Agenda</h2>')]), 'title')).toBeUndefined()
  const two = { theme: 'hell', slides: [{ elements: [title('<h1>Agenda</h1>')] }, { hidden: true, elements: [title('<h1>agenda</h1>')] }, { elements: [title('<h1> Agenda </h1>')] }] }
  expect(checkDeck(two).map(f => [f.slide, f.rule, f.params])).toEqual([[2, 'duplicate-title', [1]]])
})

test('reading order: visual order, a fix that keeps overlapping elements stacked, report only when it cannot', () => {
  const a = { id: 'a', type: 'text', x: 56, y: 300, w: 300, h: 40, html: '<p>third</p>' }
  const b = { id: 'b', type: 'text', x: 500, y: 120, w: 300, h: 40, html: '<p>second</p>' }
  const t = title()
  expect(visualOrder([a, b, t]).map(e => e.id)).toEqual(['t', 'b', 'a'])
  const d = deck([a, b, t])
  const f = one(d, 'order')
  expect(f.fix).toBe('order')
  applyFix(d.slides[0], f)
  expect(d.slides[0].elements.map(e => e.id)).toEqual(['t', 'b', 'a'])
  expect(one(d, 'order')).toBeUndefined()
  // a background box under the title must stay below it
  const bg = { id: 'bg', type: 'shape', shape: 'rect', x: 0, y: 0, w: 980, h: 552, fill: '#ffffff', stroke: 'none' }
  expect(readingOrderFix([bg, a, b, t]).map(e => e.id)).toEqual(['bg', 't', 'b', 'a'])
  // a box under the title that it overlaps: the title has to stay on top, so the order can only be reported
  const under = { id: 'u', type: 'text', x: 60, y: 50, w: 400, h: 80, html: '<p>under the title</p>' }
  const g = one(deck([under, t]), 'order')
  expect([g.rule, g.fix]).toEqual(['order', undefined])
})

test('tables without a header row, vague link texts, empty text boxes, videos', () => {
  const tbl = { id: 'tb', type: 'table', x: 56, y: 120, w: 600, h: 100, rows: [['a', 'b'], ['<a href="https://x">click here</a>', '2']], header: false, preset: 'theme' }
  const d = deck([title(), tbl])
  expect(checkDeck(d).map(f => [f.rule, f.params])).toEqual([['table-header', []], ['link', ['click here']]])
  applyFix(d.slides[0], one(d, 'table-header'))
  expect(tbl.header).toBe(true)
  expect(one(deck([title(), text('a', '<p>Mehr dazu <a href="#">hier</a>.</p>')]), 'link').params).toEqual(['hier'])
  expect(one(deck([title(), text('a', '<p><a href="#">Annual report 2024</a></p>')]), 'link')).toBeUndefined()
  const e = deck([title(), text('a', '<p><br></p>'), text('f', '', { fill: '#eeeeee' })])
  expect(checkDeck(e).map(f => [f.rule, f.el])).toEqual([['empty', 'a']])
  applyFix(e.slides[0], one(e, 'empty'))
  expect(e.slides[0].elements.map(x => x.id)).toEqual(['t', 'f'])
  expect(one(deck([title(), { id: 'v', type: 'video', x: 56, y: 120, w: 400, h: 225, youtube: 'abcdefgh' }]), 'captions').severity).toBe('tip')
})

test('every message has a German translation', () => {
  const img = { id: 'i', type: 'image', x: 0, y: 0, w: 980, h: 552, asset: 'x' }
  const all = [
    ...checkDeck(deck([img, text('a', '<p><a href="#">here</a></p>', { fontSize: 10, color: '#eeeeee' }), text('e', ''), { id: 'v', type: 'video', x: 0, y: 0, w: 9, h: 9, youtube: 'abcdefgh' }])),
    ...checkDeck(deck([])), ...checkDeck(deck([title(), { ...img, alt: 'image.png' }, { id: 'tb', type: 'table', x: 0, y: 300, w: 9, h: 9, rows: [['a']], header: false }])),
    ...checkDeck({ theme: 'hell', slides: [{ elements: [title()] }, { elements: [title()] }] }),
    ...checkDeck(deck([{ ...text('z', '<p>z</p>'), y: 400 }, title()])),
    ...checkDeck({ theme: 'ozean', slides: [{ layout: 'cover', elements: [title('<h1>T</h1>', { color: '#0b2545' })] }] }),
  ]
  const msgs = [...new Set(all.map(f => f.msg))]
  expect(msgs.length).toBe(13)
  for (const m of msgs) expect([m, m in de]).toEqual([m, true])
})
