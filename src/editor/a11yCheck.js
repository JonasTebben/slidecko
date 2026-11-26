// Accessibility check of a presentation, like PowerPoint's "Check Accessibility": deck -> findings.
// Pure (no DOM): colours and sizes are worked out from the element model, the theme and the editor's slide CSS
// (slide.css, themeCss), so own theme CSS that changes colours is not seen.
// A finding: { slide, el, rule, severity: 'error' | 'warning' | 'tip', msg (English, the t() key), params, fix? }
import { themeOf, CENTERED } from '../slide/themes.js'
import { parseRatio } from '../slide/format.js'

// thresholds in logical px of a 980 px wide slide (Slidev's canvas), scaled with the canvas width
export const BASE_W = 980
export const MIN_TEXT = 16 // Slidev's body text is 17.6 px; flagging that would flag every slide
export const MIN_CODE = 12 // the code size of the built-in themes
export const LARGE = 24, LARGE_BOLD = 18.66 // WCAG large text: 18 pt, or 14 pt bold
export const AA = 4.5, AA_LARGE = 3
export const ORDER_TOLERANCE = 0.25 // share of element pairs read out of visual order before the order counts as off
const BAR_H = 85 // the theme's title bar (themeCss)
export const SEVERITIES = ['error', 'warning', 'tip']

// --- colours ---
// [r, g, b, a] (0–255, a 0–1) of a hex, rgb()/rgba() or a few names; null when unknown
const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0], none: [0, 0, 0, 0] }
export function parseColor(c) {
  c = String(c ?? '').trim().toLowerCase()
  if (NAMED[c]) return NAMED[c]
  let h = /^#([\da-f]{3,8})$/.exec(c)?.[1]
  if (h) {
    if (h.length < 6) h = [...h].map(x => x + x).join('')
    if (h.length !== 6 && h.length !== 8) return null
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1)
  }
  const m = /^rgba?\(([^)]*)\)$/.exec(c)
  if (!m) return null
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map((v, i) => (v.endsWith('%') ? parseFloat(v) * (i < 3 ? 2.55 : 0.01) : +v))
  return p.length < 3 || p.some(Number.isNaN) ? null : [...p.slice(0, 3), p[3] ?? 1]
}
// WCAG relative luminance and contrast ratio
const lin = v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
export const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const blend = (top, below) => [0, 1, 2].map(i => top[i] * top[3] + below[i] * (1 - top[3])).concat(1)
const WHITE = [255, 255, 255, 1]
// a CSS background as paint: { colors: opaque colours it shows under box, gradient, image }.
// A linear gradient counts with the colours it has across the box (W×H: the area it is drawn on), other gradients with all stops
const STOP = /(#[\da-f]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b)\s*(-?[\d.]+%)?/gi
const SIDES = { top: 0, right: 90, bottom: 180, left: 270, 'top right': 45, 'right top': 45, 'bottom right': 135, 'right bottom': 135, 'bottom left': 225, 'left bottom': 225, 'top left': 315, 'left top': 315 }
export function paint(v, box, W = 980, H = 552) {
  v = String(v ?? '')
  if (/url\(/i.test(v)) return { colors: [], image: true }
  if (/gradient\(/i.test(v)) {
    const stops = [...v.matchAll(STOP)].map(m => ({ c: parseColor(m[1]), at: m[2] && parseFloat(m[2]) / 100 })).filter(x => x.c)
    const lin = /^\s*linear-gradient\(\s*(?:(-?[\d.]+)deg|to ([a-z ]+?))?\s*,/i.exec(v)
    if (!lin || !box || stops.length < 2) return { colors: stops.map(x => blend(x.c, WHITE)), gradient: true }
    // stops without a position share the room between their neighbours (as in CSS)
    stops[0].at ??= 0; stops.at(-1).at ??= 1
    stops.forEach((x, i) => { if (x.at == null) { const j = stops.findIndex((y, k) => k > i && y.at != null); x.at = stops[i - 1].at + (stops[j].at - stops[i - 1].at) / (j - i + 1) } })
    const a = (lin[1] != null ? +lin[1] : SIDES[lin[2]?.trim()] ?? 180) * Math.PI / 180, sin = Math.sin(a), cos = Math.cos(a)
    const len = Math.abs(W * sin) + Math.abs(H * cos)
    const pos = (x, y) => ((x - W / 2) * sin - (y - H / 2) * cos) / len + 0.5
    const ts = [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]].map(([x, y]) => pos(x, y))
    const lo = Math.min(...ts), hi = Math.max(...ts)
    const at = t => {
      const j = stops.findIndex(x => x.at >= t)
      if (j <= 0) return stops[j < 0 ? stops.length - 1 : 0].c
      const p = stops[j - 1], q = stops[j], f = q.at > p.at ? (t - p.at) / (q.at - p.at) : 1
      return p.c.map((c, i) => c + (q.c[i] - c) * f)
    }
    return { colors: [at(lo), at(hi), ...stops.filter(x => x.at > lo && x.at < hi).map(x => x.c)].map(c => blend(c, WHITE)), gradient: true }
  }
  const c = parseColor(v)
  return c ? { colors: [blend(c, WHITE)] } : { colors: [WHITE] }
}
// a colour with alpha over the paint below it
const over = (c, below) => (c[3] >= 1 || !below ? { colors: [c] } : { ...below, colors: below.colors.map(b => blend(c, b)) })
const withAlpha = (fill, pct) => { const c = parseColor(fill); return c && [c[0], c[1], c[2], c[3] * (pct ?? 100) / 100] }

// --- the theme as the slide CSS uses it ---
const DEFAULTS = { bg: '#ffffff', fg: '#181818', accent: '#3ab9d5', 'accent-fg': '#ffffff', 'code-bg': '#f5f5f5', 'code-fg': '#1b1b1b' }
const vars = id => { const v = { ...DEFAULTS, ...themeOf(id).vars }; if (!v.title || v.title === 'inherit') v.title = v.fg; return v }

// --- text of an HTML fragment as runs with their tag stack ---
const TAG = /(<(?:[^>"']|"[^"]*"|'[^']*')*>)/
const VOID = new Set(['br', 'img', 'hr', 'input', 'wbr'])
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }
const decode = s => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, k) => ENT[k])
const styleOf = (tag, k) => new RegExp(`(?:^|[;"'\\s])${k}\\s*:\\s*([^;"']+)`, 'i').exec(/\bstyle\s*=\s*("[^"]*"|'[^']*')/i.exec(tag)?.[1] || '')?.[1].trim()
export function textRuns(html) {
  const stack = [], out = []
  String(html ?? '').split(TAG).forEach((p, i) => {
    if (!(i % 2)) { const text = decode(p); if (text.trim()) out.push({ text, stack: [...stack] }); return }
    const m = /^<(\/?)([a-z][\w-]*)/i.exec(p)
    if (!m) return
    const name = m[2].toLowerCase()
    if (m[1]) { const k = stack.map(f => f.tag).lastIndexOf(name); if (k >= 0) stack.length = k; return }
    if (VOID.has(name) || p.endsWith('/>')) return
    stack.push({ tag: name, color: styleOf(p, 'color'), bg: styleOf(p, 'background-color') || styleOf(p, 'background'), size: styleOf(p, 'font-size'), weight: styleOf(p, 'font-weight') })
  })
  return out
}
export const plainText = html => textRuns(html).map(r => r.text).join('').replace(/\s+/g, ' ').trim()

// --- what a text run looks like: colour, size in px, bold, background colour of its own (code, quotes, marks) ---
const HEAD = { h1: 36, h2: 30, h3: 24, h4: 20, h5: 16, h6: 14 }
function headSize(tag, layout, typo) {
  const plain = !CENTERED.includes(layout)
  if (tag === 'h1') return ({ cover: 56, intro: 56, section: 52, statement: 52, fact: 96 })[layout] || (plain && typo.title) || 34
  if (tag === 'h2' && ['cover', 'intro'].includes(layout)) return 26
  return (plain && typo[tag]) || HEAD[tag]
}
function look(run, ctx) {
  const { v, el, layout, typo } = ctx, centered = CENTERED.includes(layout)
  let size = el.fontSize || typo.text || 17.6, bold = false, color, bg
  for (const f of run.stack) {
    if (HEAD[f.tag]) { size = headSize(f.tag, layout, typo); bold = f.tag === 'h1' && layout === 'fact' ? true : +(v['heading-weight'] || 600) >= 700 }
    if (f.tag === 'blockquote' && layout !== 'quote') { size = 14; bg ??= v['code-bg'] }
    if (f.tag === 'blockquote' && layout === 'quote') size = 30
    if (f.tag === 'code') { size *= 0.9; bg = v['code-bg'] }
    const s = f.size && /^([\d.]+)(px|em|rem|pt|%)$/.exec(f.size)
    if (s) size = { px: +s[1], em: size * s[1], rem: 17.6 * s[1], pt: s[1] * 4 / 3, '%': size * s[1] / 100 }[s[2]]
    if (f.weight && (/bold/.test(f.weight) || +f.weight >= 700)) bold = true
    if (f.bg && parseColor(f.bg)) bg = f.bg
  }
  // the innermost rule that sets a colour wins: inline colour, link, inline code, quote, heading
  for (const f of [...run.stack].reverse()) {
    if (f.color && parseColor(f.color)) { color = f.color; break }
    if (f.tag === 'a') { color = centered ? v['cover-fg'] || v.accent : v.accent; break }
    if (f.tag === 'code') { color = v['code-fg']; break }
    if (el.color) continue // a colour for the whole box beats the theme's text colours (.colored in slide.css)
    if (f.tag === 'blockquote' && layout !== 'quote') { color = v['code-fg']; break }
    if (/^h[1-4]$/.test(f.tag)) { color = centered && f.tag !== 'h4' ? v['cover-fg'] || v.title : f.tag === 'h1' && !centered ? v['bar-fg'] || v.title : v.title; break }
  }
  return { size, bold, color: color || ctx.color || el.color || (centered ? v['cover-fg'] || v.fg : v.fg), bg }
}

// --- what lies under a point of the slide ---
const inside = (e, x, y) => x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h
function ownPaint(e, v) {
  if (e.type === 'image') return { image: true }
  if (e.type === 'code') return withAlpha(e.fill || v['code-bg'], e.fillAlpha)
  if ((e.type === 'shape' && e.shape !== 'line') || e.type === 'text') return e.fill && e.fill !== 'none' ? withAlpha(e.fill, e.fillAlpha) : null
  return null
}
function paintAt(stack, x, y, ctx) {
  for (let i = stack.length - 1; i >= 0; i--) {
    const e = stack[i], p = inside(e, x, y) && ownPaint(e, ctx.v)
    if (!p || (!p.image && !p[3])) continue
    if (p.image) return { colors: [], image: true }
    return over(p, p[3] < 1 ? paintAt(stack.slice(0, i), x, y, ctx) : null)
  }
  if (ctx.bgImage) return { colors: [], image: true } // the slide's background picture: checked by eye
  const centered = CENTERED.includes(ctx.layout)
  if (!centered && ctx.v.bar && y < BAR_H) return paint(ctx.v.bar, ctx.el, ctx.W, BAR_H)
  return paint(centered ? ctx.v['cover-bg'] || ctx.v.bg : ctx.v.bg, ctx.el, ctx.W, ctx.H)
}

// --- the text of an element as [{ size, bold, color, paint }] ---
function looks(el, below, slide, d) {
  const v = vars(d.theme), typo = d.typo || {}, layout = slide.layout || 'default'
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2
  const W = d.canvasWidth || BASE_W, base = { v, el, layout, typo, bgImage: !!slide.bg, W, H: Math.ceil(W / (parseRatio(d.aspectRatio) || 16 / 9)) }
  const under = () => paintAt(below, cx, cy, base)
  const own = ownPaint(el, v)
  const bgOf = () => (own && !own.image && own[3] ? over(own, own[3] < 1 ? under() : null) : under())
  const of = (html, ctx, bg) => textRuns(html).map(r => { const l = look(r, ctx); return { ...l, paint: l.bg ? over(withAlpha(l.bg), bg) : bg } })
  if (el.type === 'text' || el.type === 'shape') return of(el.html, base, bgOf())
  // a formula: one run in the box's size and colour (screen readers get KaTeX's MathML, no alt text needed)
  if (el.type === 'math') return el.tex?.trim() ? [{ ...look({ stack: [] }, base), paint: bgOf() }] : []
  if (el.type === 'code') {
    if (!el.code?.trim()) return []
    // own background: the editor switches the text to a light or dark colour (SlideView codeVars)
    const bg = bgOf(), dark = luminance(bg.colors[0] || WHITE) < 0.18
    return [{ size: el.fontSize || typo.code || 12, bold: false, color: el.fill ? (dark ? '#e6edf3' : '#1f2328') : v['code-fg'], paint: bg }]
  }
  if (el.type === 'table') {
    const bg = under(), out = []
    el.rows.forEach((row, i) => row.forEach((cell, j) => {
      const head = i === 0 && el.header
      // header row colours of the presets (themes.js TABLE_RULES)
      let hb, hf
      if (head && ['theme', 'striped', 'accent'].includes(el.preset || 'theme')) [hb, hf] = [v.accent, v['accent-fg']]
      if (head && el.preset === 'bold') [hb, hf] = [v.fg, v.bg]
      const fill = el.fills?.[i]?.[j] || hb
      out.push(...of(cell, { ...base, color: hf }, fill ? over(withAlpha(fill), bg) : bg))
    }))
    return out
  }
  return []
}

// --- titles, links, reading order ---
const isHeading = el => el.type === 'text' && /<h[12][\s>]/i.test(el.html || '')
const titleEl = s => s.elements.find(e => e.type === 'text' && e.title && plainText(e.html)) || s.elements.find(e => isHeading(e) && plainText(e.html))
export function slideTitle(s) {
  const e = titleEl(s)
  if (!e) return ''
  const h = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/i.exec(e.html)
  return plainText(h ? h[2] : e.html)
}
// link texts that say nothing out of context (screen readers list the links of a page)
const VAGUE = /^(click here|click|here|this|this link|more|read more|learn more|link|details|hier|hier klicken|klicken sie hier|klick hier|mehr|weiter|weiterlesen|mehr erfahren|dies|link hier)$/i
const vagueLinks = html => [...String(html ?? '').matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map(m => plainText(m[1])).filter(x => VAGUE.test(x.replace(/[.!:…»>→]+$/g, '').trim()))

// what a screen reader reads: everything but plain shapes, decorative pictures and icons without a label (decorative by default)
const content = e => !(e.type === 'shape' && !e.html) && !(e.type === 'image' && e.decorative) && !(e.type === 'icon' && !e.label)
// top to bottom in rows (an element starting above the middle of a row's first one joins that row), each row left to right
export function visualOrder(els) {
  const rows = []
  for (const e of [...els].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const r = rows.at(-1)
    if (r && e.y < r.y + r.h / 2) r.items.push(e)
    else rows.push({ y: e.y, h: e.h, items: [e] })
  }
  return rows.flatMap(r => r.items.sort((a, b) => a.x - b.x))
}
// share of pairs whose reading order is the other way round than on screen
function disorder(els) {
  const rank = new Map(visualOrder(els).map((e, i) => [e, i]))
  let bad = 0, n = 0
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { n++; if (rank.get(els[i]) > rank.get(els[j])) bad++ }
  return n ? bad / n : 0
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
// the elements in visual order as far as possible without changing which of two overlapping elements is on top
// (array order is both stacking and reading order): a topological sort that always takes the visually first free one
export function readingOrderFix(els) {
  const rank = new Map(visualOrder(els).map((e, i) => [e, i]))
  const left = [...els], out = []
  while (left.length) {
    const free = left.filter((e, i) => !left.slice(0, i).some(b => overlap(b, e)))
    const next = free.reduce((a, b) => (rank.get(b) < rank.get(a) ? b : a))
    out.push(next)
    left.splice(left.indexOf(next), 1)
  }
  return out
}
const readOff = (els, title) => { const c = els.filter(content); return c.length > 1 && ((title && c[0] !== title) || disorder(c) > ORDER_TOLERANCE) }

// --- the check ---
// d: { slides, theme, typo, canvasWidth }; underlay(slide): master and layout elements drawn behind it (store.js)
export function checkDeck(d, { underlay = () => [] } = {}) {
  const k = (d.canvasWidth || BASE_W) / BASE_W, out = [], titles = new Map()
  d.slides.forEach((s, i) => {
    if (s.hidden) return // not presented and not exported
    const add = (el, rule, severity, msg, params = [], fix) => out.push({ slide: i, el: el?.id ?? null, rule, severity, msg, params, ...(fix && { fix }) })
    const title = titleEl(s)
    if (!title) {
      const cand = s.elements.filter(e => e.type === 'text' && plainText(e.html) && plainText(e.html).length <= 120).sort((a, b) => a.y - b.y)[0]
      add(cand, 'title', 'warning', cand ? 'No slide title. Mark the text that names the slide as its title.' : 'No slide title. Add a heading that names the slide.', [], cand && 'title')
    } else {
      const name = slideTitle(s).toLowerCase()
      if (titles.has(name)) add(title, 'duplicate-title', 'tip', 'Same title as slide {0}. Tell the slides apart, e.g. with “(2)”.', [titles.get(name) + 1])
      else titles.set(name, i)
    }
    if (readOff(s.elements, title)) {
      const fixed = readingOrderFix(s.elements)
      add(null, 'order', 'warning', 'Screen readers and exports read this slide in another order than it shows (top to bottom, left to right).', [], fixed.some((e, j) => e !== s.elements[j]) && !readOff(fixed, title) ? 'order' : undefined)
    }
    const under = underlay(s) || []
    s.elements.forEach((el, j) => {
      if (el.type === 'image') {
        if (el.decorative) return
        const alt = el.alt?.trim()
        if (!alt) add(el, 'alt', 'error', 'Picture without alt text. Describe it, or mark it as decorative.', [], 'decorative')
        else if (/\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i.test(alt) || /^(image|picture|bild|foto|photo|grafik)\s*\d*$/i.test(alt)) add(el, 'alt', 'warning', 'The alt text “{0}” does not describe the picture.', [alt])
        return
      }
      if (el.type === 'video' && el.youtube) return add(el, 'captions', 'tip', 'Video: make sure it has captions (they are set on YouTube).')
      if (el.type === 'table' && !el.header) add(el, 'table-header', 'warning', 'Table without a header row. Screen readers use it to name the columns.', [], 'header')
      if (el.type === 'text' && !el.board && !el.fill && !el.stroke && !plainText(el.html) && !/<img\b/i.test(el.html || '')) return add(el, 'empty', 'tip', 'Empty text box. Screen readers announce it anyway.', [], 'delete')
      for (const x of [el.html, ...(el.rows || []).flat()].flatMap(vagueLinks)) add(el, 'link', 'warning', 'The link text “{0}” does not say where it leads.', [x])
      const ls = looks(el, [...under, ...s.elements.slice(0, j)], s, d)
      if (!ls.length) return
      const min = Math.min(...ls.map(l => l.size)), limit = (el.type === 'code' ? MIN_CODE : MIN_TEXT) * k
      if (min < limit - 0.05) add(el, 'size', 'warning', 'Text of {0} px is hard to read from a distance (at least {1} px).', [Math.round(min * 10) / 10, Math.round(limit * 10) / 10])
      // the worst run decides; pictures underneath cannot be checked, gradients by their stops
      let worst = null
      for (const l of ls) {
        const fg = parseColor(l.color)
        if (!fg) continue
        const need = l.size >= LARGE * k || (l.bold && l.size >= LARGE_BOLD * k) ? AA_LARGE : AA
        if (l.paint.image) { worst ??= { image: true }; continue }
        for (const b of l.paint.colors) {
          const r = contrast(blend(fg, b), b)
          if (r < need && (!worst || worst.image || r / need < worst.r / worst.need)) worst = { r, need, gradient: l.paint.gradient }
        }
      }
      if (worst?.image) add(el, 'contrast', 'tip', 'Text over a picture: check by eye that it is easy to read.')
      else if (worst) add(el, 'contrast', worst.gradient ? 'tip' : 'error', worst.gradient ? 'Contrast {0}:1 on part of the gradient background (needs {1}:1). Check by eye.' : 'Contrast {0}:1 is too low (needs {1}:1).', [Math.floor(worst.r * 10) / 10, worst.need])
    })
  })
  return out.sort((a, b) => a.slide - b.slide || SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity))
}

// a quick fix on the slide it belongs to (a normal edit: undo takes it back)
export function applyFix(slide, f) {
  const el = slide.elements.find(e => e.id === f.el)
  if (f.fix === 'decorative' && el) el.decorative = true
  else if (f.fix === 'title' && el) el.title = true
  else if (f.fix === 'header' && el) el.header = true
  else if (f.fix === 'delete') slide.elements = slide.elements.filter(e => e.id !== f.el)
  else if (f.fix === 'order') slide.elements = readingOrderFix(slide.elements)
}
