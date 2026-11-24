import { LESSONS, typed, tutorial, openTutorial, closeTutorial } from './tutorial.js'
import { LOCALES } from './i18n.js'

test('every lesson: the start text fails its check, the solution passes, in every language', () => {
  for (const l of LESSONS) {
    expect([l.title, l.check(l.start)]).toEqual([l.title, false])
    expect([l.title, l.check(l.solution)]).toEqual([l.title, true])
    for (const [code, { dict }] of Object.entries(LOCALES)) {
      if (code === 'en') continue
      for (const k of ['title', 'text', 'task', 'hint', 'solution', ...(l.start ? ['start'] : [])]) expect([code, l.title, k, l[k] in dict]).toEqual([code, l.title, k, true])
      expect([code, l.title, l.check(dict[l.start] ?? '')]).toEqual([code, l.title, false])
      expect([code, l.title, l.check(dict[l.solution])]).toEqual([code, l.title, true])
    }
  }
})

test('the checks look at structure, not at the exact words', () => {
  const [heading, , emphasis, , slide] = LESSONS
  expect(heading.check('# Anything')).toBe(true)
  expect(heading.check('#NoSpace')).toBe(false)
  expect(emphasis.check('**bold only**')).toBe(false)
  expect(emphasis.check('__bold__ and _italic_')).toBe(true)
  expect(slide.check('# A\n\n---\n\n# B')).toBe(true)
})

test('the challenge wants three slides with headings and a list', () => {
  const c = LESSONS.at(-1)
  expect(c.check('# A\n\n- x\n- y\n\n---\n\n# B\n\n---\n\n# C')).toBe(true)
  expect(c.check('# A\n\n---\n\n# B\n\n---\n\n# C')).toBe(false)
  expect(c.check('# A\n\n- x\n- y\n\n---\n\nno heading\n\n---\n\n# C')).toBe(false)
})

test('typed counts visible characters and non-empty lines', () => {
  expect(typed('# Hi\n\n- a b\n')).toEqual({ chars: 6, lines: 2 })
})

test('openTutorial / closeTutorial report the result once', () => {
  const got = []
  openTutorial({ fromTour: true, onClose: r => got.push(r) })
  expect(tutorial.open && tutorial.fromTour).toBe(true)
  closeTutorial({ finished: true, created: true })
  closeTutorial()
  expect(got).toEqual([{ finished: true, created: true }])
  expect(tutorial.open).toBe(false)
})
