import assert from 'node:assert/strict'
import { parseClock, clock, toggle, shown, done, reset, running } from './timer.js'

test('durations are read and shown like a clock', () => {
  assert.equal(parseClock('10'), 600)
  assert.equal(parseClock('1:30'), 90)
  assert.equal(parseClock(' 1:00:05 '), 3605)
  assert.equal(parseClock('0'), 0)
  assert.equal(parseClock('abc'), null)
  assert.equal(parseClock('1:2:3:4'), null)
  assert.equal(clock(600), '10:00')
  assert.equal(clock(65.2), '1:06') // a countdown shows the second it is in
  assert.equal(clock(3725), '1:02:05')
  assert.equal(clock(-3), '0:00')
})

test('a click starts and pauses, a finished countdown starts over', () => {
  const el = { id: 't', seconds: 60 }
  toggle(el)
  assert.ok(running('t'))
  toggle(el) // pauses
  assert.ok(!running('t') && !done(el) && shown(el) <= 60)
  const short = { id: 'u', seconds: 0.001 }
  toggle(short)
  const until = Date.now() + 20
  while (Date.now() < until) { /* let the countdown run out */ }
  toggle(short) // ran out: starts over
  assert.ok(running('u') && !done(short))
  reset('t'); reset('u')
  assert.ok(!running('u') && shown(el) === 60)
})
