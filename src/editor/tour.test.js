import { test, expect } from 'bun:test'
import { place, nextStep, stepsFor } from './tour.js'

test('the bubble goes below, above or beside the target and never off screen', () => {
  expect(place(null, 300, 200, 1000, 800)).toEqual({ x: 350, y: 300, side: 'center' })
  // below, pulled in from the right edge
  expect(place({ left: 900, right: 980, top: 10, bottom: 40, width: 80, height: 30 }, 300, 200, 1000, 800)).toEqual({ x: 684, y: 52, side: 'below' })
  // no room below: above
  expect(place({ left: 100, right: 200, top: 700, bottom: 780, width: 100, height: 80 }, 300, 200, 1000, 800).side).toBe('above')
  // a tall target on a phone: over its lower part, inside the margins
  const p = place({ left: 0, right: 375, top: 0, bottom: 700, width: 375, height: 700 }, 343, 220, 375, 700)
  expect(p).toEqual({ x: 16, y: 464, side: 'over' })
  // a bubble wider than the screen still starts at the margin
  expect(place(null, 500, 200, 375, 700).x).toBe(16)
})

test('steps with a hidden anchor are skipped, the short and full tour differ', () => {
  const s = [{}, { target: 'a' }, { target: 'b' }, {}]
  const shown = k => k !== 'b'
  expect(nextStep(s, 1, 1, shown)).toBe(3)
  expect(nextStep(s, 3, -1, shown)).toBe(1)
  expect(nextStep(s, 3, 1, shown)).toBe(-1)
  expect(stepsFor(false).some(x => x.tutorial)).toBe(false)
  expect(stepsFor(true).filter(x => x.after).length).toBe(3)
  expect(stepsFor(false)[0].text).toContain('no tracking')
})
