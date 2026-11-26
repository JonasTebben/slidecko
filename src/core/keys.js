// Keyboard shortcuts: the defaults per stable command id, the user's overrides (localStorage) and the pure helpers.
// A shortcut is spelled 'mod+shift+alt+key' in that order (mod = ⌘ on Mac, Ctrl elsewhere), '' = none.
import { ref } from 'vue'
import { t } from './i18n.js'

export const DEFAULTS = {
  newSlide: 'n', duplicateSlide: 'mod+shift+d', deleteSlide: 'mod+shift+backspace', moveSlideUp: 'alt+arrowup', moveSlideDown: 'alt+arrowdown', editMaster: '',
  insertText: 't', insertHeading: 'h', insertList: 'l', insertOlist: 'shift+l', insertQuote: 'q', insertCode: 'c', insertImage: 'i', insertTable: 'b',
  'shape-rect': 'r', 'shape-rounded': '', 'shape-ellipse': 'o', 'shape-triangle': '', 'shape-arrow': 'a', 'shape-line': '',
  insertVideo: 'y', insertChart: '', insertDiagram: '', insertToc: '', insertMath: '', insertIcon: '', insertTimer: '', insertQuiz: '', insertPicker: '', insertBoard: '',
  toggleHidden: '', editMarkdown: 'm', markdownSlides: 'shift+m', markdownTutorial: '', sourceEditor: 'alt+m', newDeck: 'shift+n',
  present: 'p', presentStart: 'shift+p', presenterView: 'alt+p', rehearse: '', record: '',
  toggleSlides: 'alt+b', toggleProps: 'alt+e', undo: 'mod+z', redo: 'mod+shift+z',
  zoomIn: 'mod+=', zoomOut: 'mod+-', zoom100: 'shift+0', fitWindow: 'mod+0', zoomFit: 'shift+1',
  find: 'mod+f', replace: 'mod+alt+f', a11y: '', selectAll: 'mod+a', copyLook: 'mod+alt+c', pasteLook: 'mod+alt+v', duplicate: 'mod+d',
  forward: 'mod+arrowup', backward: 'mod+arrowdown', front: 'mod+shift+arrowup', back: 'mod+shift+arrowdown', group: 'mod+g', ungroup: 'mod+shift+g',
  export: 'mod+e', exportPdf: 'mod+p', exportPptx: 'mod+shift+e', exportSlidev: 'mod+alt+s',
  exportPptxImage: '', exportOdp: '', exportGoogle: '', exportHtml: '', exportPng: '',
  saveFile: 'mod+s', home: '', snapshot: '', versions: '', palette: 'mod+k', shortcuts: '', tour: '', tourFull: '', install: '',
  revertSlide: '', revertAll: '', editTheme: '', importTheme: '', importThemeUrl: '',
  // while presenting (handled separately, so the same key can mean something else there)
  'present-view': 'p', 'present-black': 'b', 'present-white': 'w', 'present-timer': 'r', 'present-quiz': 'q', 'present-laser': 'l',
  'present-draw': 'd', 'present-arrow': 'a', 'present-erase': 'e', 'present-undo': 'z', 'present-overview': 'o', 'present-help': 'h',
}
// labels of the presenting keys (English t() keys); the editor ones come from the command list
export const PRESENT_LABELS = {
  'present-view': 'Presenter view', 'present-black': 'Black screen', 'present-white': 'White screen', 'present-timer': 'Reset the talk timer',
  'present-quiz': 'Show the quiz solution', 'present-laser': 'Laser pointer', 'present-draw': 'Draw', 'present-arrow': 'Draw an arrow',
  'present-erase': 'Erase the drawing', 'present-undo': 'Take back the last stroke', 'present-overview': 'Slide overview', 'present-help': 'Keys while presenting',
}
export const isPresent = id => id.startsWith('present-')
// these also work while typing in a field, so a plain letter would swallow that letter
export const GLOBAL = ['saveFile', 'find', 'replace', 'palette', 'exportPdf', 'exportPptx', 'exportSlidev']
// the browser or the OS takes these before the page sees them
const BROWSER = ['mod+w', 'mod+t', 'mod+n', 'mod+q', 'mod+h', 'mod+m', 'mod+shift+w', 'mod+shift+t', 'mod+shift+n', 'mod+tab', 'mod+shift+tab', 'mod+l', 'mod+r', 'mod+shift+r']
// keys with a fixed meaning (moving, deleting, clipboard, Esc …), kept out of reach
const FIXED_EDITOR = ['escape', 'enter', 'tab', 'shift+tab', 'space', 'delete', 'backspace', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift+arrowup', 'shift+arrowdown', 'shift+arrowleft', 'shift+arrowright', 'f5', 'shift+f5', 'mod+enter', 'mod+shift+enter', 'mod+c', 'mod+x', 'mod+v', 'mod+y', '?', 'shift+?']
const FIXED_PRESENT = ['escape', 'enter', 'tab', 'shift+tab', 'space', 'backspace', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'pageup', 'pagedown', 'home', 'end', '.', ',', 'g', 'c', '?', 'shift+?', ...'0123456789']
const MODIFIERS = ['shift', 'control', 'alt', 'meta', 'altgraph', 'capslock', 'fn', 'os', 'dead', 'unidentified', 'process']

const SPEC = /^(mod\+)?(shift\+)?(alt\+)?([^+\s]+)$/
export const validSpec = s => typeof s === 'string' && SPEC.test(s) && !MODIFIERS.includes(s.split('+').at(-1))

// the combination of a keydown, or null for a lone modifier
export function comboOf(e) {
  const k = e.key?.toLowerCase() || ''
  if (!k || MODIFIERS.includes(k)) return null
  // letters and digits by position: Alt/Option changes e.key (⌥P = π, Shift+0 = "="); "+" as "=" (⌘+ on German keyboards)
  const name = /^Key[A-Z]$/.test(e.code) ? e.code[3].toLowerCase() : /^Digit\d$/.test(e.code) ? e.code[5] : k === '+' ? '=' : k === ' ' ? 'space' : k
  return [(e.metaKey || e.ctrlKey) && 'mod', e.shiftKey && 'shift', e.altKey && 'alt', name].filter(Boolean).join('+')
}

const NAMES = { arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', backspace: '⌫', delete: '⌦', enter: '↵', escape: 'Esc', pageup: 'PgUp', pagedown: 'PgDn' }
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
// ⌘⇧⌥D on a Mac, Ctrl+Shift+Alt+D elsewhere
export function format(spec, mac = isMac) {
  if (!spec) return ''
  const mods = mac ? { mod: '⌘', shift: '⇧', alt: '⌥' } : { mod: t('Ctrl+'), shift: t('Shift+'), alt: 'Alt+' }
  return spec.split('+').map(k => mods[k] || (k === 'space' ? t('Space') : NAMES[k] || (k.length > 1 ? k[0].toUpperCase() + k.slice(1) : k.toUpperCase()))).join('')
}

// why a combination can't be used for a command, or '' if it can
export function problem(id, spec) {
  if (!validSpec(spec)) return t('This key can’t be used.')
  if (BROWSER.includes(spec)) return t('The browser keeps {0} for itself. Please choose another combination.', format(spec))
  if ((isPresent(id) ? FIXED_PRESENT : FIXED_EDITOR).includes(spec)) return t('{0} has a fixed meaning and can’t be assigned.', format(spec))
  if (GLOBAL.includes(id) && !spec.startsWith('mod+')) return t('This command also works while typing, so it needs {0}.', format('mod').replace(/\+$/, ''))
  return ''
}

// the stored overrides, cleaned: unknown commands and unusable combinations are dropped ('' = shortcut removed)
export function cleanOverrides(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [id, spec] of Object.entries(raw)) if (id in DEFAULTS && (spec === '' || (typeof spec === 'string' && !problem(id, spec)))) out[id] = spec
  return out
}
export const keyIn = (over, id) => (id ? over[id] ?? DEFAULTS[id] ?? '' : '')
// the other command in the same section (editor or presenting) that already has this combination
export const conflictOf = (over, id, spec) => (spec ? Object.keys(DEFAULTS).find(o => o !== id && isPresent(o) === isPresent(id) && keyIn(over, o) === spec) : undefined)
// one change, as a new overrides object: a value equal to the default is not stored
export function withKey(over, id, spec) {
  const out = { ...over }
  if (spec === DEFAULTS[id] || spec == null) delete out[id]
  else out[id] = spec
  return out
}

// --- the live state (one per tab) ---
const STORE = 'slides-builder:keys'
export const overrides = ref((() => { try { return cleanOverrides(JSON.parse(localStorage.getItem(STORE))) } catch { return {} } })())
const save = () => { try { Object.keys(overrides.value).length ? localStorage.setItem(STORE, JSON.stringify(overrides.value)) : localStorage.removeItem(STORE) } catch { /* private mode */ } }
export const keyOf = id => keyIn(overrides.value, id)
export const kbd = id => format(keyOf(id))
export const setKey = (id, spec) => { overrides.value = withKey(overrides.value, id, spec); save() }
export const resetKeys = () => { overrides.value = {}; save() }
