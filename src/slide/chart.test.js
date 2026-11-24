import assert from 'node:assert/strict'
import { chartSvg, niceScale, pieAngles, slicePath, parseNum, toGrid, fromGrid, applyGrid, inkOn, percentOff, sliceColor, seriesColor } from './chart.js'
import { slideToMarkdown } from '../export/toSlidev.js'
// the store wants a browser: just enough of one
globalThis.document ??= { activeElement: null, createElement: () => ({}), querySelector: () => null }
globalThis.indexedDB ??= { open: () => ({}) }
const { cleanEl } = await import('../core/store.js')

const chart = o => ({ id: 'c', type: 'chart', x: 0, y: 0, w: 600, h: 300, kind: 'column', legend: true, categories: ['A', 'B'], series: [{ name: 'S', values: [10, 20] }], ...o })
const rects = svg => [...svg.matchAll(/<rect data-s="(\d+)" x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/g)].map(m => m.slice(1).map(Number))

test('nice axis steps and fixed ends', () => {
  assert.deepEqual(niceScale(0, 24), { min: 0, max: 25, ticks: [0, 5, 10, 15, 20, 25] })
  assert.deepEqual(niceScale(-7, 12).ticks, [-10, -5, 0, 5, 10, 15])
  assert.equal(niceScale(0, 0.9).ticks.length, 6) // step 0.2
  const s = niceScale(0, 24, 5, 30)
  assert.equal(s.min, 5)
  assert.equal(s.max, 30)
  assert.deepEqual(niceScale(3, 3), niceScale(3, 6)) // a flat range still has an axis
})

test('pie angles follow the shares, non-positive values get none', () => {
  const a = pieAngles([1, 1, 2, -5, 0])
  assert.deepEqual(a.slice(0, 3).map(([s, e]) => Math.round(((e - s) / Math.PI) * 100) / 100), [0.5, 0.5, 1])
  assert.equal(a[3][1] - a[3][0], 0)
  assert.ok(Math.abs(a[2][1] - Math.PI * 2) < 1e-9)
  assert.deepEqual(pieAngles([0, 0]), [[0, 0], [0, 0]])
  // one slice of everything is a full circle (two arcs), not an empty path
  assert.equal((slicePath(50, 50, 40, 0, Math.PI * 2).match(/A/g) || []).length, 2)
  // a quarter from 12 o'clock goes to 3 o'clock
  assert.equal(slicePath(50, 50, 40, 0, Math.PI / 2), 'M50,50L50,10A40,40 0 0 1 90,50Z')
})

test('columns: heights proportional, negatives below the zero line', () => {
  const r = rects(chartSvg(chart({ legend: false, series: [{ name: 'S', values: [10, -5] }] })))
  assert.equal(r.length, 2)
  const [, , y1, , h1] = r[0], [, , y2, , h2] = r[1]
  assert.ok(Math.abs(h1 / h2 - 2) < 0.05, `${h1} ${h2}`)
  assert.ok(Math.abs(y1 + h1 - y2) < 0.2) // the negative bar starts where the positive one ends: at 0
})

test('stacked bars add up; horizontal bars run along x', () => {
  const r = rects(chartSvg(chart({ kind: 'bar', stacked: true, legend: false, series: [{ name: 'a', values: [1, 2] }, { name: 'b', values: [3, 2] }] })))
  assert.equal(r.length, 4)
  const [a0, b0] = [r[0], r[1]] // category A: a then b
  assert.equal(a0[2], b0[2]) // same row
  assert.ok(Math.abs(a0[1] + a0[3] - b0[1]) < 0.2) // b starts where a ends
  assert.ok(Math.abs(b0[3] / a0[3] - 3) < 0.05)
})

test('empty, broken and pie data draw without NaN', () => {
  for (const o of [{ categories: [], series: [] }, { series: [] }, { kind: 'pie', series: [{ name: 's', values: [0, 0] }] }, { kind: 'line', series: [{ name: 's', values: [5, 5] }] }, { w: 4, h: 4 }, { kind: 'donut', title: 'T', values: true }]) {
    const svg = chartSvg(chart(o), '#2563eb')
    assert.ok(svg.startsWith('<svg') && !/NaN|Infinity|undefined/.test(svg), JSON.stringify(o) + svg)
  }
  assert.equal((chartSvg(chart({ kind: 'pie', legend: false }), '#123456').match(/<path data-s/g) || []).length, 2)
  assert.match(chartSvg(chart({}), '#123456'), /fill:#123456/) // the first series takes the accent
})

test('labels are escaped, also "{{" for Vue', () => {
  const svg = chartSvg(chart({ title: '<b>{{x}}</b>', categories: ['a&b', 'B'] }))
  assert.ok(!svg.includes('<b>') && !svg.includes('{{'))
  assert.match(svg, /a&amp;b/)
})

test('text on segments picks black or white', () => {
  assert.equal(inkOn('#ffffff'), '#000000')
  assert.equal(inkOn('#1e3a8a'), '#ffffff')
  assert.equal(inkOn('var(--x)'), 'currentColor')
})

test('grid <-> data, numbers in local formats', () => {
  assert.deepEqual([parseNum('1.234,5'), parseNum('1,234.5'), parseNum('12 %'), parseNum('3,5'), parseNum('1,234,567'), parseNum('x'), parseNum('-2'), parseNum('1.500'), parseNum('0,125')], [1234.5, 1234.5, 12, 3.5, 1234567, 0, -2, 1500, 0.125])
  const d = fromGrid([['', 'Sales', 'Costs'], ['Jan', '10', '4'], ['Feb', '12', '']])
  assert.deepEqual(d, { categories: ['Jan', 'Feb'], series: [{ name: 'Sales', values: [10, 12] }, { name: 'Costs', values: [4, 0] }] })
  const el = { ...d, series: d.series.map((s, i) => (i ? s : { ...s, color: '#f00' })) }
  assert.deepEqual(toGrid(el), [['', 'Sales', 'Costs'], ['Jan', '10', '4'], ['Feb', '12', '0']])
  applyGrid(el, [['', 'A'], ['x', '1']])
  assert.deepEqual(el.series, [{ name: 'A', values: [1], color: '#f00' }]) // colours stay with their position
})

test('cleanEl: chart data checked', () => {
  const c = cleanEl(chart({ kind: 'radar', categories: ['a'.repeat(300), 5, null], series: [{ name: 'x', values: ['3', 'NaN', Infinity, 1e20], color: 'red;x' }, 'nope'], title: '  ', min: 'a', max: '10', values: 'yes' }))
  assert.equal(c.kind, 'column')
  assert.deepEqual(c.categories.map(s => s.length), [100, 1, 0])
  assert.deepEqual(c.series, [{ name: 'x', values: [3, 0, 0] }])
  assert.equal(c.title, undefined)
  assert.equal(c.min, undefined)
  assert.equal(c.max, 10)
  assert.equal(c.values, undefined)
  assert.equal(c.legend, true)
  assert.equal(cleanEl(chart({ series: Array(30).fill({ name: 's', values: [1] }) })).series.length, 20)
})

test('Slidev: the chart as inline SVG with its data, read back the same', () => {
  const el = chart({ kind: 'pie', values: true, title: 'Share', series: [{ name: 'S', values: [3, 1], color: '#ff0000' }] })
  const md = slideToMarkdown({ layout: 'default', elements: [el] })
  assert.match(md, /<div data-chart="[^"]+" style="position:absolute;left:0px;top:0px;width:600px;height:300px"><svg /)
  const attr = md.match(/<div data-chart="([^"]*)"/)[1]
  assert.ok(!/[<>]/.test(attr)) // a ">" would end the tag for the Vue-safety pass
  const data = JSON.parse(attr.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&'))
  const back = cleanEl({ ...data, type: 'chart', x: 0, y: 0, w: 600, h: 300 })
  for (const k of ['kind', 'categories', 'series', 'legend', 'values', 'title']) assert.deepEqual(back[k], el[k], k)
})

test('pie slices take their own colours; values in percent get a % and are checked against 100', () => {
  const pie = chart({ kind: 'pie', values: true, percent: true, categories: ['A', 'B', 'C'], series: [{ name: 'S', values: [50, 30, 15] }], catColors: [null, '#123456'] })
  const svg = chartSvg(pie, '#2563eb')
  assert.ok(svg.includes('fill:#123456'))
  assert.equal(sliceColor(pie, 0, '#2563eb'), '#2563eb')
  assert.ok(svg.includes('>50%<') && svg.includes('>15%<'))
  assert.deepEqual(percentOff(pie), [['S', 95]])
  assert.deepEqual(percentOff({ ...pie, series: [{ name: 'S', values: [50, 30, 20] }] }), [])
  // stacked bars: each category should make 100
  const st = chart({ stacked: true, percent: true, categories: ['A', 'B'], series: [{ name: 'x', values: [40, 70] }, { name: 'y', values: [60, 20] }] })
  assert.deepEqual(percentOff(st), [['B', 90]])
  assert.ok(chartSvg(st).includes('>100%<')) // the axis too
})
test('cleanEl keeps percent and valid slice colours, one per category', () => {
  const c = cleanEl(chart({ percent: true, catColors: ['#ff0000', 'red; x', '#00ff00', '#0000ff'] }))
  assert.equal(c.percent, true)
  assert.deepEqual(c.catColors, ['#ff0000', null])
  assert.equal(cleanEl(chart({ catColors: [null, 'red; x'] })).catColors, undefined)
})

test('a colour preset gives series and slices their colours; single colours still win', () => {
  const el = chart({ palette: 'safe', series: [{ name: 'a', values: [1, 2] }, { name: 'b', values: [1, 2], color: '#123456' }] })
  assert.equal(seriesColor(el, 0, '#2563eb'), '#0072b2')
  assert.equal(seriesColor(el, 1, '#2563eb'), '#123456')
  assert.equal(sliceColor(el, 7, '#2563eb'), '#e69f00') // wraps around
  assert.equal(seriesColor(chart({}), 0, '#2563eb'), '#2563eb') // no preset: the theme's accent
  assert.equal(cleanEl(el).palette, 'safe')
  assert.equal(cleanEl(chart({ palette: 'nope' })).palette, undefined)
})
