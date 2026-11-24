import assert from 'node:assert/strict'
import { start, visit, pause, resume, onSlide, total, plan, pace, status, record, addRehearsal, cleanRehearsals, parseDuration, slidevDuration } from './rehearse.js'

test('time is counted per slide, pauses are not', () => {
  const r = start(0, 0)
  visit(r, 0, 5000) // a click step on the same slide
  visit(r, 1, 10000)
  pause(r, 13000)
  assert.equal(onSlide(r, 99000), 3000)
  resume(r, 20000)
  visit(r, 0, 22000) // back to slide 1: its time adds up
  assert.equal(onSlide(r, 23000), 11000)
  assert.equal(total(r, 23000), 16000)
  assert.deepEqual(r.ms, [10000, 5000])
})

test('the talk length is shared by the slides without their own time', () => {
  const slides = [{ duration: 60 }, {}, { hidden: true }, {}]
  assert.deepEqual(plan(slides, 300), [60, 120, null, 120])
  assert.deepEqual(plan(slides), [60, null, null, null])
  assert.deepEqual(plan([{ duration: 400 }, {}], 300), [400, null]) // nothing left to share
})

test('pace and slide status', () => {
  assert.equal(pace([60, 60], 0, 70), 10) // 10 s behind
  assert.equal(pace([60, 60], 1, 70), -50)
  assert.equal(pace([null, null], 1, 70), null)
  assert.equal(status(61, 60), 'over')
  assert.equal(status(50, 60), 'near')
  assert.equal(status(10, 60), 'ok')
  assert.equal(status(10, null), null)
})

test('finished runs are kept, five at most, and checked on load', () => {
  const r = start(0, 0)
  visit(r, 2, 1400)
  pause(r, 3000)
  const rec = record(r, [60, null, 30], 123)
  assert.deepEqual(rec, { at: 123, times: [1, null, 2], planned: [60, null, 30] })
  let list = []
  for (let i = 0; i < 7; i++) list = addRehearsal(list, { ...rec, at: i })
  assert.deepEqual(list.map(x => x.at), [6, 5, 4, 3, 2])
  assert.deepEqual(cleanRehearsals([rec, null, { at: 'x', times: [] }, { at: 1, times: [-1, 'a', 5.4, 1e9] }]), [rec, { at: 1, times: [null, null, 5, null], planned: [] }])
  assert.deepEqual(cleanRehearsals('nope'), [])
})

test('Slidev durations', () => {
  assert.equal(parseDuration('30min'), 1800)
  assert.equal(parseDuration('1h 30min'), 5400)
  assert.equal(parseDuration('90s'), 90)
  assert.equal(parseDuration('20'), 1200)
  assert.equal(parseDuration('soon'), null)
  assert.equal(parseDuration('5min later'), null)
  assert.equal(slidevDuration(1200), '20min')
  assert.equal(slidevDuration(90), '90s')
})
