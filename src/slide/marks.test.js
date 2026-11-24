import assert from 'node:assert/strict'
import { parseVMark, toVMark, markAttrs, roughMark, svgPath, pathPoints, markSteps, hash } from './marks.js'
import { slideToMarkdown, slideHash } from '../export/toSlidev.js'
import { clickSteps } from '../present/clicks.js'

test('parseVMark reads every type, alias, colour and click form', () => {
  assert.deepEqual(parseVMark('v-mark.circle.orange', '2'), { mark: 'circle', color: 'orange', at: '2' })
  assert.deepEqual(parseVMark('v-mark', ''), { mark: 'underline', at: '+1' }) // bare: the next click, underline
  for (const m of ['underline', 'box', 'highlight', 'strike-through', 'crossed-off', 'bracket']) assert.equal(parseVMark('v-mark.' + m, '1').mark, m)
  assert.equal(parseVMark('v-mark.strike', '1').mark, 'strike-through')
  assert.equal(parseVMark('v-mark.cross', '1').mark, 'crossed-off')
  assert.equal(parseVMark('v-mark.box', 'false').at, null)
  assert.equal(parseVMark('v-mark.box', "'+2'").at, '+2')
  assert.equal(parseVMark('v-mark.red.delay300.op50', '3').color, 'red') // unknown modifiers are dropped
  assert.deepEqual(parseVMark('v-mark', "{ at: 2, color: '#f00', type: 'circle' }"), { mark: 'circle', color: '#f00', at: '2' })
  assert.deepEqual(parseVMark('v-mark.underline.blue', '{ color: "#123456" }'), { mark: 'underline', color: '#123456', at: '+1' })
})

test('toVMark writes palette colours as modifiers, others as options', () => {
  assert.equal(toVMark({ mark: 'circle', color: 'orange', at: '2' }), 'v-mark.circle.orange="2"')
  assert.equal(toVMark({ mark: 'box' }), 'v-mark.box="false"')
  assert.equal(toVMark({ mark: 'underline', color: '#f00', at: '3' }), `v-mark.underline="{ at: 3, color: '#f00' }"`)
  for (const a of [{ mark: 'highlight', color: 'yellow', at: '1' }, { mark: 'bracket', color: '#00ff00', at: '4' }]) {
    const [, name, value] = toVMark(a).match(/^([^=]+)="(.*)"$/)
    assert.deepEqual(parseVMark(name, value), a)
  }
})

test('markAttrs keeps only known types, colours and click numbers', () => {
  assert.equal(markAttrs({ mark: 'scribble' }), null)
  assert.deepEqual(markAttrs({ mark: 'box', color: 'red;background:url(x)', at: '1 onclick' }), { mark: 'box' })
  assert.deepEqual(markAttrs({ mark: 'box', color: 'expression(x)', at: '0' }), { mark: 'box' })
  assert.deepEqual(markAttrs({ mark: 'circle', color: '#abc', at: '07' }), { mark: 'circle', color: '#abc', at: '7' })
})

test('rough strokes are deterministic for a seed and differ between seeds', () => {
  const rects = [{ x: 10, y: 20, w: 120, h: 24 }, { x: 10, y: 50, w: 60, h: 24 }]
  for (const m of ['underline', 'circle', 'box', 'highlight', 'strike-through', 'crossed-off', 'bracket']) {
    const a = roughMark(m, rects, hash(m)), b = roughMark(m, rects, hash(m))
    assert.ok(a.length > 0, m)
    assert.deepEqual(a, b, m)
    assert.notDeepEqual(a, roughMark(m, rects, hash(m) + 1), m)
  }
  assert.equal(roughMark('underline', rects, 1).length, 4) // two strokes per line
  const p = roughMark('box', rects, 5)[0].p, d = svgPath(p)
  assert.equal(pathPoints(d).length, p.length)
})

test('marks with a click add their step; the Slidev export writes v-mark', () => {
  const html = '<p>A <span data-mark="circle" data-mark-color="orange" data-mark-at="2">key</span> and <span data-mark="underline">this</span></p>'
  assert.deepEqual(markSteps(html), [2])
  const slide = { layout: 'default', elements: [{ id: 'a', type: 'text', x: 0, y: 0, w: 400, h: 100, html }, { id: 'b', type: 'text', x: 0, y: 200, w: 400, h: 100, html: '<p>x</p>', click: 1 }] }
  assert.deepEqual(clickSteps(slide), [1, 2])
  const md = slideToMarkdown(slide)
  assert.match(md, /A <span v-mark\.circle\.orange="2">key<\/span> and <span v-mark\.underline="false">this<\/span>/)
  // an imported slide that was not changed is written back as it was
  const orig = '# T\n\nSee <span v-mark.circle.red="1">this</span>\n'
  const s = { ...slide, md: orig }
  assert.equal(slideToMarkdown({ ...s, hash: slideHash(s) }), orig)
})
