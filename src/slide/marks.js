// Slidev's v-mark (Rough Notation): hand-drawn marks on a span of text, stored in the text HTML as
// <span data-mark="circle" data-mark-color="orange" data-mark-at="2">. Parsing and writing the directive,
// checking the attributes and drawing the strokes are pure; the strokes are seeded, so the editor,
// thumbnails, PDF, pictures and every export draw the same lines.

export const MARKS = ['underline', 'circle', 'box', 'highlight', 'strike-through', 'crossed-off', 'bracket']
export const MARK_NAMES = { underline: 'Underline', circle: 'Circle', box: 'Box', highlight: 'Highlight', 'strike-through': 'Strike through', 'crossed-off': 'Cross out', bracket: 'Bracket' }
const ALIAS = { strike: 'strike-through', linethrough: 'strike-through', 'line-through': 'strike-through', cross: 'crossed-off', crossed: 'crossed-off' }
// Slidev's colour modifiers are UnoCSS text colours (their default shade)
export const MARK_COLORS = { black: '#000', blue: '#60a5fa', cyan: '#22d3ee', gray: '#9ca3af', green: '#4ade80', indigo: '#818cf8', lime: '#a3e635', orange: '#fb923c', pink: '#f472b6', purple: '#c084fc', red: '#f87171', teal: '#2dd4bf', white: '#fff', yellow: '#facc15' }
const HEX = /^#[0-9a-f]{3,8}$/i
const kind = m => ALIAS[m] || m

// the valid part of a mark's attributes { mark, color, at }; null without a known type
export function markAttrs({ mark, color, at } = {}) {
  if (!MARKS.includes(mark)) return null
  return { mark, ...((Object.hasOwn(MARK_COLORS, color) || HEX.test(color || '')) && { color }), ...(/^\d{1,2}$/.test(at || '') && +at >= 1 && { at: String(+at) }) }
}
// the CSS colour of a stored mark colour; none: the theme's accent
export const markColor = c => MARK_COLORS[c] || (HEX.test(c || '') ? c : 'var(--accent)')

// v-mark attribute -> { mark, color, at }: at is the click ('2'), relative ('+1', also for a bare v-mark) or
// null (v-mark="false": drawn from the start). Modifiers name the type and colour; an options object
// ({ at: 2, color: '#f00', type: 'circle' }) wins over them. Delay and opacity are not kept.
export function parseVMark(name, value) {
  let mark, color
  for (const m of name.toLowerCase().split('.').slice(1)) {
    if (MARKS.includes(kind(m))) mark = kind(m)
    else if (Object.hasOwn(MARK_COLORS, m)) color = m
  }
  let v = String(value ?? '').trim()
  if (v.startsWith('{')) {
    const get = k => (m => m && (m[2] ?? m[3]))(v.match(new RegExp(`\\b${k}\\s*:\\s*(?:(['"\`])(.*?)\\1|([^,}\\s]+))`)))
    mark = get('type') ? kind(get('type')) : mark
    color = get('color') ?? color
    v = get('at') ?? ''
  }
  v = v.replace(/^(['"`])(.*)\1$/, '$2').trim()
  const at = v === 'false' ? null : /^\d+$/.test(v) ? String(Math.max(1, +v)) : /^[+-]\d+$/.test(v) ? v : '+1'
  return { mark: MARKS.includes(mark) ? mark : 'underline', ...(color && { color }), at }
}
// { mark, color, at } -> the v-mark attribute: a palette colour as modifier, any other in the options
export function toVMark({ mark, color, at }) {
  const mods = `v-mark.${mark}${Object.hasOwn(MARK_COLORS, color || '') ? '.' + color : ''}`
  if (color && !Object.hasOwn(MARK_COLORS, color)) return `${mods}="{ at: ${at || 'false'}, color: '${color}' }"`
  return `${mods}="${at || 'false'}"`
}
// click steps used by marks in a box's HTML
export const markSteps = html => [...String(html || '').matchAll(/data-mark-at="(\d+)"/g)].map(m => +m[1])

// v-mark attributes of a DOM element -> data-mark (in place); relative clicks count on from last (Slidev's
// "+1" after the previous click). Returns the last click used.
export function vmarkToData(node, last = 0) {
  for (const a of [...(node.attributes || [])]) {
    if (!/^v-mark(\.|$)/i.test(a.name)) continue
    node.removeAttribute(a.name)
    const m = parseVMark(a.name, a.value)
    const at = m.at == null ? undefined : /^\d+$/.test(m.at) ? +m.at : Math.max(1, last + +m.at)
    if (at) last = Math.max(last, at)
    const ok = markAttrs({ ...m, at: at && String(at) })
    for (const [k, v] of Object.entries(ok)) node.setAttribute(k === 'mark' ? 'data-mark' : 'data-mark-' + k, v)
  }
  return last
}
// data-mark* of a DOM element (after sanitizing): invalid values dropped, a mark without type loses them all
export function checkMark(node) {
  const ok = markAttrs({ mark: node.getAttribute('data-mark'), color: node.getAttribute('data-mark-color'), at: node.getAttribute('data-mark-at') }) || {}
  for (const k of ['mark', 'color', 'at']) {
    const n = k === 'mark' ? 'data-mark' : 'data-mark-' + k
    if (ok[k]) node.setAttribute(n, ok[k])
    else node.removeAttribute(n)
  }
}

// --- strokes ---
// seeded random numbers (mulberry32) and a string hash for the seed
const rng = s => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
export const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0 }
// a hand-drawn line: ends a little off, slightly bowed (a sampled quadratic curve)
function line(r, x1, y1, x2, y2) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1, off = Math.min(1 + len * 0.02, 3), j = k => (r() - 0.5) * 2 * off * k
  const ax = x1 + j(0.6), ay = y1 + j(0.6), bx = x2 + j(0.6), by = y2 + j(0.6), bow = j(1)
  const mx = (ax + bx) / 2 - ((by - ay) / len) * bow, my = (ay + by) / 2 + ((bx - ax) / len) * bow
  return Array.from({ length: 9 }, (_, i) => { const t = i / 8, u = 1 - t; return [u * u * ax + 2 * u * t * mx + t * t * bx, u * u * ay + 2 * u * t * my + t * t * by] })
}
// a hand-drawn ellipse: starts anywhere, overshoots its start, the radius wobbles
function ellipse(r, cx, cy, rx, ry) {
  const a0 = r() * Math.PI * 2, sweep = Math.PI * 2 + 0.3 + r() * 0.4, ph = r() * 6, amp = 0.04 + r() * 0.04
  return Array.from({ length: 49 }, (_, i) => {
    const a = a0 + (sweep * i) / 48, k = 1 + amp * Math.sin(a * 2 + ph) + (i / 48) * 0.05
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]
  })
}
const union = rs => { const x = Math.min(...rs.map(q => q.x)), y = Math.min(...rs.map(q => q.y)); return { x, y, w: Math.max(...rs.map(q => q.x + q.w)) - x, h: Math.max(...rs.map(q => q.y + q.h)) - y } }
const PAD = 5 // Rough Notation's padding around box, circle and bracket

// strokes of a mark over the line boxes of its text (rects in slide units): [{ p: [[x, y] …], w: width, o: opacity }]
// underline, strike-through and highlight follow each line; the others enclose all of them
export function roughMark(mark, rects, seed) {
  const r = rng(seed), out = [], two = (f, w = 2, o) => { for (let i = 0; i < 2; i++) out.push({ p: f(), w, ...(o && { o }) }) }
  const u = rects.length && union(rects)
  if (!u) return out
  if (mark === 'underline') for (const q of rects) two(() => line(r, q.x, q.y + q.h + 2, q.x + q.w, q.y + q.h + 2))
  else if (mark === 'strike-through') for (const q of rects) two(() => line(r, q.x, q.y + q.h / 2, q.x + q.w, q.y + q.h / 2))
  else if (mark === 'highlight') for (const q of rects) out.push({ p: line(r, q.x, q.y + q.h / 2, q.x + q.w, q.y + q.h / 2), w: q.h * 0.9, o: 0.45 })
  else if (mark === 'crossed-off') { two(() => line(r, u.x, u.y, u.x + u.w, u.y + u.h)); two(() => line(r, u.x + u.w, u.y, u.x, u.y + u.h)) }
  else if (mark === 'circle') two(() => ellipse(r, u.x + u.w / 2, u.y + u.h / 2, u.w / 2 + PAD * 1.5, u.h / 2 + PAD))
  else {
    const L = u.x - PAD, T = u.y - PAD, R = u.x + u.w + PAD, B = u.y + u.h + PAD
    const sides = mark === 'bracket' ? [[R - PAD, T, R, T], [R, T, R, B], [R, B, R - PAD, B]] : [[L, T, R, T], [R, T, R, B], [R, B, L, B], [L, B, L, T]]
    for (let i = 0; i < 2; i++) for (const s of sides) out.push({ p: line(r, ...s), w: 2 })
  }
  return out
}
const n1 = v => Math.round(v * 10) / 10
export const svgPath = p => 'M' + p.map(([x, y]) => `${n1(x)} ${n1(y)}`).join('L')
// the points of an "M x y L x y …" path (as svgPath writes them), for the PowerPoint and OpenDocument shapes
export const pathPoints = d => [...String(d).matchAll(/[ML]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g)].map(m => [+m[1], +m[2]])

// a mark span as laid out in the browser (box: its element's client rect, k: client px per slide unit)
// the seed comes from the mark itself (type, text, position in its box): element ids change on every load
export function measureMark(span, i, box, k) {
  const mark = span.getAttribute('data-mark')
  if (!MARKS.includes(mark)) return null
  const rects = [...span.getClientRects()].filter(q => q.width > 0.5).map(q => ({ x: (q.left - box.left) / k, y: (q.top - box.top) / k, w: q.width / k, h: q.height / k }))
  if (!rects.length) return null
  const at = +span.getAttribute('data-mark-at') || 0
  return { mark, at, color: markColor(span.getAttribute('data-mark-color')), x: rects[0].x, y: rects[0].y, paths: roughMark(mark, rects, hash(`${mark}|${i}|${span.textContent}`)).map(s => ({ d: svgPath(s.p), w: n1(s.w), ...(s.o && { o: s.o }) })) }
}

// --- editing: the mark around the caret, setting and removing marks in the box being typed in ---
const editable = n => (n?.nodeType === 1 ? n : n?.parentElement)?.closest('[contenteditable=true]')
export const markAt = () => { const n = getSelection()?.anchorNode; return editable(n) ? (n.nodeType === 1 ? n : n.parentElement).closest('[data-mark]') : null }
const tell = n => { n?.dispatchEvent(new Event('marks', { bubbles: true })); return true } // the slide view measures again
const attr = k => (k === 'mark' ? 'data-mark' : 'data-mark-' + k)
// a: { mark, color, at } (a missing key keeps the mark's own); null removes the mark at the caret.
// Without a mark there, the selected words get one; false when nothing (or more than one paragraph) was selected.
export function setMark(a) {
  const s = getSelection(), cur = markAt(), box = editable(s?.anchorNode)
  if (cur) {
    if (!a) cur.replaceWith(...cur.childNodes)
    else for (const k of ['mark', 'color', 'at']) if (k in a) a[k] ? cur.setAttribute(attr(k), a[k]) : cur.removeAttribute(attr(k))
    return tell(box)
  }
  if (!a?.mark || !box || !s.rangeCount || s.isCollapsed) return false
  const r = s.getRangeAt(0)
  if (r.cloneContents().querySelector('p, li, div, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, table')) return false // marks are inline
  const span = document.createElement('span')
  for (const [k, v] of Object.entries(markAttrs(a))) span.setAttribute(attr(k), v)
  // by hand: insertHTML merges the span into a neighbouring one and drops spaces (the box's undo after editing still works)
  span.append(r.extractContents())
  r.insertNode(span)
  s.selectAllChildren(span)
  return tell(box)
}
