import { comboOf, format, problem, cleanOverrides, conflictOf, withKey, keyIn, validSpec, DEFAULTS } from './keys.js'

const ev = (key, code, mods = {}) => ({ key, code, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods })

test('comboOf normalises a keydown', () => {
  expect(comboOf(ev('f', 'KeyF', { metaKey: true, shiftKey: true }))).toBe('mod+shift+f')
  expect(comboOf(ev('π', 'KeyP', { altKey: true }))).toBe('alt+p') // ⌥P on a Mac
  expect(comboOf(ev('=', 'Digit0', { shiftKey: true }))).toBe('shift+0') // German Shift+0
  expect(comboOf(ev('+', 'BracketRight', { ctrlKey: true }))).toBe('mod+=')
  expect(comboOf(ev(' ', 'Space'))).toBe('space')
  expect(comboOf(ev('ArrowUp', 'ArrowUp', { altKey: true }))).toBe('alt+arrowup')
  expect(comboOf(ev('Shift', 'ShiftLeft', { shiftKey: true }))).toBe(null)
  expect(comboOf(ev('Meta', 'MetaLeft', { metaKey: true }))).toBe(null)
})

test('format per platform', () => {
  expect(format('mod+shift+f', true)).toBe('⌘⇧F')
  expect(format('mod+shift+f', false)).toBe('Ctrl+Shift+F')
  expect(format('alt+arrowup', false)).toBe('Alt+↑')
  expect(format('space', true)).toBe('Space')
  expect(format('f5', true)).toBe('F5')
  expect(format('', true)).toBe('')
})

test('problem rejects reserved, fixed and typing-breaking keys', () => {
  expect(problem('find', 'mod+shift+f')).toBe('')
  expect(problem('insertChart', 'x')).toBe('')
  expect(problem('find', 'mod+w')).toContain('The browser keeps')
  expect(problem('insertChart', 'escape')).toContain('fixed meaning')
  expect(problem('insertChart', 'mod+c')).toContain('fixed meaning')
  expect(problem('find', 'f')).toContain('works while typing')
  expect(problem('present-laser', 'x')).toBe('')
  expect(problem('present-laser', '5')).toContain('fixed meaning')
  expect(problem('present-laser', 'escape')).toContain('fixed meaning')
  expect(validSpec('shift+mod+f')).toBe(false) // canonical order only
  expect(validSpec('mod+shift')).toBe(false)
})

test('cleanOverrides keeps only known commands with usable keys', () => {
  expect(cleanOverrides({ find: 'mod+shift+f', nope: 'x', undo: '', replace: 'mod+w', palette: 3, redo: 'f' })).toEqual({ find: 'mod+shift+f', undo: '', redo: 'f' })
  expect(cleanOverrides(null)).toEqual({})
  expect(cleanOverrides(['a'])).toEqual({})
})

test('conflicts stay within editor or presenting keys', () => {
  expect(conflictOf({}, 'insertChart', 'mod+f')).toBe('find')
  expect(conflictOf({}, 'insertChart', 'p')).toBe('present') // not present-view
  expect(conflictOf({}, 'present-laser', 'b')).toBe('present-black')
  expect(conflictOf({ find: '' }, 'insertChart', 'mod+f')).toBe(undefined)
  expect(conflictOf({}, 'find', 'mod+f')).toBe(undefined)
})

test('withKey stores only differences from the default', () => {
  const o = withKey({}, 'find', 'mod+shift+f')
  expect(o).toEqual({ find: 'mod+shift+f' })
  expect(keyIn(o, 'find')).toBe('mod+shift+f')
  expect(withKey(o, 'find', DEFAULTS.find)).toEqual({})
  expect(keyIn(withKey({}, 'undo', ''), 'undo')).toBe('')
  expect(keyIn({}, undefined)).toBe('')
})
