// Click steps while presenting (Slidev's v-click, v-click.hide and ranges, v-clicks for "list items one by one",
// code line steps, [click] markers in the notes). Pure: used by the store, the slide view and the exports.
import { markSteps } from './marks.js'

// top-level items of the lists in a text box's HTML (a nested list belongs to its item)
export function listItems(html) {
  let depth = 0, n = 0
  for (const [, end, tag] of String(html || '').matchAll(/<(\/?)(ul|ol|li)\b/gi)) {
    if (tag.toLowerCase() !== 'li') depth += end ? -1 : 1
    else if (!end && depth === 1) n++
  }
  return n
}
// Slidev's code line steps "{1|3-4|all}": the number of highlight stages (1 is a fixed highlight)
export const codeStages = el => (el.type === 'code' && el.meta?.match(/\{(?!monaco)([^}:]*)\}/)?.[1].split('|').length) || 0
// steps an element takes from its key on: each list item, or each further code stage (plus appearing, with a number)
const parts = e => (e.clickItems ? listItems(e.html) : codeStages(e) > 1 ? codeStages(e) - (e.click ? 0 : 1) : 1)
// list items or code stages without a click number of their own
const loose = e => !e.click && (e.clickItems ? listItems(e.html) > 0 : codeStages(e) > 1)
// key of an element's first step: its click number; list items or code stages without one come after all
// numbered steps (like a new v-click), in slide order (100+: numbers stop at 99)
function keyOf(els, e) {
  if (e.click) return e.click
  const j = loose(e) ? els.filter(loose).indexOf(e) : -1
  return j < 0 ? 0 : 100 + j
}
// click steps of a slide, ascending: each click number (to appear or to disappear) once, repeated for every
// further list item or code stage, so later numbers move back (step k shows what is due up to the k-th)
export function clickSteps(slide) {
  const els = slide?.elements || [], n = new Map()
  for (const e of els) {
    const k = keyOf(els, e)
    if (k) n.set(k, Math.max(n.get(k) || 1, parts(e)))
    if (e.clickUntil) n.set(e.clickUntil, n.get(e.clickUntil) || 1)
    for (const a of markSteps(e.html)) if (!n.has(a)) n.set(a, 1) // v-mark: drawn at its click
  }
  return [...n.keys()].sort((a, b) => a - b).flatMap(k => Array(n.get(k)).fill(k))
}
// shown after k steps: appeared (click) and not gone yet (clickUntil: Slidev's v-click.hide, or the end of a range)
export function revealed(el, steps, k) {
  const cur = steps[Math.min(k, steps.length) - 1] || 0
  return (!el.click || el.click <= cur) && !(el.clickUntil && el.clickUntil <= cur)
}
// 1-based step at which an element (or its first list item or code stage) appears; 0: none
export const stepOf = (slide, el, steps = clickSteps(slide)) => steps.indexOf(keyOf(slide?.elements || [], el)) + 1
// 1-based step at which an element disappears; 0: never
export const untilOf = (el, steps) => (el.clickUntil ? steps.indexOf(el.clickUntil) + 1 : 0)
// code stage (0-based) shown after k steps (Infinity: the last); with a click number the first stage comes with the block
export function codeStage(slide, el, k, steps = clickSteps(slide)) {
  const n = codeStages(el)
  if (n < 2) return 0
  const r = Math.max(0, k - stepOf(slide, el, steps) + 1)
  return Math.min(n - 1, el.click ? Math.max(0, r - 1) : r)
}
// Slidev's [click] / [click:3] markers in speaker notes: the parts of the notes with the step each belongs to
// (all parts' text, markers included, is the notes as written)
export function notesParts(notes = '') {
  const out = [{ step: 0, text: '' }]
  for (const p of String(notes).split(/(\[click(?::\d+)?\])/)) {
    const m = p.match(/^\[click(?::(\d+))?\]$/)
    if (m) out.push({ step: m[1] ? +m[1] : out.at(-1).step + 1, text: p })
    else out.at(-1).text += p
  }
  return out
}
// static exports with "one page per click step" (Slidev's --with-clicks): a slide with n steps becomes n + 1 pages,
// before the first click up to all shown (step: what SlideView reveals, no: the slide's page number)
export const perClick = slides => slides.flatMap((s, no) => (s.id?.endsWith('-solution') || !clickSteps(s).length ? [s]
  : Array.from({ length: clickSteps(s).length + 1 }, (_, step) => ({ ...s, id: `${s.id}-click${step}`, step, no }))))
// list items one by one: each top-level <li> gets its step (data-click, read by the HTML presentation)
// and data-unshown from the shown-th one on
export function markItems(html, from, shown = Infinity) {
  let depth = 0, i = 0
  return html.replace(/<(\/?)(ul|ol|li)\b/gi, (m, end, tag) => {
    if (tag.toLowerCase() !== 'li') depth += end ? -1 : 1
    else if (!end && depth === 1) return `${m} data-click="${from + i}"${i++ >= shown ? ' data-unshown' : ''}`
    return m
  })
}
