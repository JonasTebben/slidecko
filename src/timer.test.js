import assert from 'node:assert/strict'
import { parseClock, clock, toggle, shown, done, reset, running, face, progress, warning, autostart } from './timer.js'

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

test('a stopwatch shows tenths, ring and bar follow the time, the last minute warns', () => {
  assert.equal(clock(7.34, true), '0:07.3')
  assert.equal(clock(0, true), '0:00.0')
  assert.equal(clock(3725.99, true), '1:02:05.9')
  assert.equal(face({ seconds: 0 }), '0:00.0')
  assert.equal(face({ seconds: 600 }), '10:00')
  assert.equal(progress({ seconds: 600 }), 1) // a countdown starts full
  assert.equal(progress({ seconds: 0 }), 0)
  assert.equal(warning({ id: 'w', seconds: 600, warn: true }, true), false) // ten minutes left
  assert.equal(warning({ id: 'w', seconds: 45, warn: true }, true), true)
  assert.equal(warning({ id: 'w', seconds: 45 }, true), false) // switched off
  assert.equal(warning({ id: 'w', seconds: 45, warn: true }, false), false) // only while presenting
})

test('auto timers start once when their slide appears', () => {
  const el = { id: 'a', type: 'timer', seconds: 60, auto: true }, off = { id: 'b', type: 'timer', seconds: 60 }
  autostart([el, off])
  assert.ok(running('a') && !running('b'))
  toggle(el) // paused by hand
  autostart([el]) // back on the slide: stays paused
  assert.ok(!running('a'))
  reset('a')
})
