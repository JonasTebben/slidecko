import test from 'node:test'
import assert from 'node:assert/strict'
import { clickSteps, revealed, stepOf, untilOf, codeStage, codeStages, notesParts, perClick, plainNotes } from './clicks.js'
import { codeOpts } from '../slide/hl.js'
import { clickAttrs } from '../import/parseSlidev.js'

test('disappear on click and ranges: gone from their step on, the step counts like any other', () => {
  const appear = { click: 1 }, hide = { clickUntil: 2 }, range = { click: 2, clickUntil: 4 }
  const s = { elements: [appear, hide, range] }
  const steps = clickSteps(s)
  assert.deepEqual(steps, [1, 2, 4])
  const shown = k => s.elements.map(e => revealed(e, steps, k))
  assert.deepEqual([0, 1, 2, 3].map(shown), [[false, true, false], [true, true, false], [true, false, true], [true, false, false]])
  assert.deepEqual([stepOf(s, range, steps), untilOf(range, steps), untilOf(appear, steps)], [2, 3, 0])
  assert.deepEqual(shown(9), shown(3)) // past the end: all done
})
test('code line steps: each further stage is a click, a numbered block shows its first stage when it appears', () => {
  const free = { type: 'code', meta: '{1|3-4|all}' }, numbered = { type: 'code', meta: '{lines:true}{2|5}', click: 2 }, fixed = { type: 'code', meta: '{2,4}' }
  const s = { elements: [free, numbered, fixed, { click: 1 }] }
  assert.deepEqual([free, numbered, fixed].map(codeStages), [3, 2, 1])
  const steps = clickSteps(s)
  assert.deepEqual(steps, [1, 2, 2, 100, 100])
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(k => codeStage(s, numbered, k, steps)), [0, 0, 0, 1, 1, 1])
  assert.deepEqual([0, 3, 4, 5, Infinity].map(k => codeStage(s, free, k, steps)), [0, 0, 1, 2, 2])
  assert.equal(codeStage(s, fixed, 3, steps), 0)
  assert.deepEqual([0, 1, 2, 9].map(st => [...(codeOpts('{1|3-4|all}', st).marked || ['all'])]), [[1], [3, 4], ['all'], ['all']])
})
test('notes: [click] markers split the notes into the parts of each step, the text stays as written', () => {
  const notes = 'Intro\n[click] first\n[click:3] third\n[click] fourth'
  const parts = notesParts(notes)
  assert.deepEqual(parts.map(p => p.step), [0, 1, 3, 4])
  assert.equal(parts.map(p => p.text).join(''), notes)
  assert.deepEqual(notesParts('plain').map(p => p.step), [0])
})
test('Slidev click attributes: absolute, relative, ranges, hide and v-after', () => {
  const read = (attrs, last = 0) => clickAttrs(k => attrs[k] ?? null, last)
  assert.deepEqual(read({ 'v-click': '' }, 2), { click: 3, last: 3 })
  assert.deepEqual(read({ 'v-click': "'+2'" }, 1), { click: 3, last: 3 })
  assert.deepEqual(read({ 'v-click': '4' }, 9), { click: 4, last: 9 })
  assert.deepEqual(read({ 'v-click': '[2, 4]' }), { click: 2, clickUntil: 4, last: 2 })
  assert.deepEqual(read({ 'v-click': "['+1', '+2']" }, 1), { click: 2, clickUntil: 4, last: 2 })
  assert.deepEqual(read({ 'v-click.hide': '3' }), { clickUntil: 3, last: 3 })
  assert.deepEqual(read({ 'v-click.hide': '' }, 1), { clickUntil: 2, last: 2 })
  assert.deepEqual(read({ 'v-after': '' }, 2), { click: 2, last: 2 })
  assert.deepEqual(read({ 'v-after': '' }, 0), { last: 0 }) // nothing before: always shown
  assert.deepEqual(read({ 'v-click': '[3, 2]' }), { click: 3, last: 3 }) // an end before the start is dropped
})
test('one page per click step: a slide with n steps becomes n + 1 pages, quiz solutions stay one', () => {
  const pages = perClick([{ id: 'a', elements: [{ click: 1 }, { click: 2 }] }, { id: 'b', elements: [] }, { id: 'c-solution', elements: [{ click: 1 }] }])
  assert.deepEqual(pages.map(p => [p.id, p.step, p.no]), [['a-click0', 0, 0], ['a-click1', 1, 0], ['a-click2', 2, 0], ['b', undefined, undefined], ['c-solution', undefined, undefined]])
})

test('runnable code: {monaco-run} is not a highlight step', () => {
  assert.equal(codeStages({ type: 'code', meta: '{monaco-run} {autorun:false}' }), 0)
  assert.equal(codeStages({ type: 'code', meta: '{monaco-run} {1|3}' }), 2)
})

test('notes for the handout: the [click] markers go, the text stays', () => {
  assert.equal(plainNotes('Start here.\n[click] The first point.\n[click:3] Later.'), 'Start here.\n\nThe first point.\n\nLater.')
  assert.equal(plainNotes(undefined), '')
})
