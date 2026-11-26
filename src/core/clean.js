// Validation of untrusted data (files, IndexedDB, clipboard, import): every element, slide and HTML string passes here
import DOMPurify from 'dompurify'
import { layoutOf } from '../slide/slidevModel.js'
import { TRANSITIONS, EFFECTS, fmGet } from '../import/parseSlidev.js'
import { fontStack, SHADOWS } from '../slide/themes.js'
import { t } from './i18n.js'
import { remapLinks } from '../slide/links.js'
import { vmarkToData, checkMark } from '../slide/marks.js'
import { ICON_NAME } from '../slide/icons.js'
import { cleanOutput } from '../present/run.js'
import { validDuration } from '../present/rehearse.js'
import { CHART_KINDS, PALETTES } from '../slide/chart.js'
import { uid } from './uid.js'
import { LOOKS, deck } from './state.js'

// Slidev's click animations are kept in the markup so they survive a round trip
// <style> is dropped: its rules would apply to the whole app, not just the box (remote url() in style attributes stays)
// Slidev's v-mark (attribute names with dots, dropped by DOMPurify) becomes data-mark*, whose values are checked;
// a bare or "+1" v-mark takes the click after the previous mark of the same HTML (a whole slide on import)
// shortcut: v-click elements between marks do not count for that, enough for decks that number their marks
let markLast = 0
DOMPurify.addHook?.('beforeSanitizeAttributes', n => { if (n.attributes?.length) markLast = vmarkToData(n, markLast) })
DOMPurify.addHook?.('afterSanitizeAttributes', n => { if (n.hasAttribute?.('data-mark') || n.hasAttribute?.('data-mark-at') || n.hasAttribute?.('data-mark-color')) checkMark(n) })
// :initial: the start state of a v-motion entrance effect, which the import reads
export const clean = html => (markLast = 0, DOMPurify.sanitize(String(html ?? ''), { ADD_TAGS: ['v-clicks', 'v-click', 'v-after'], ADD_ATTR: ['at', 'every', 'depth', 'hide', 'v-click', 'v-click.hide', 'v-after', ':initial'], FORBID_TAGS: ['style', 'form', 'dialog'], FORBID_ATTR: ['popover', 'popovertarget', 'popovertargetaction', 'command', 'commandfor', 'formaction'] })) // a form could post typed text (a fake login) elsewhere; popovers and dialogs would cover the app outside the slide
// a rendered diagram (Mermaid SVG, labels may be HTML in foreignObject) -> sanitized <body> holding it
export const cleanSvg = svg => DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true, html: true }, ADD_TAGS: ['foreignObject'], RETURN_DOM: true })

// --- validation of untrusted data (files, IndexedDB, clipboard, import) ---
const str = v => (typeof v === 'string' ? v : undefined)
export const webUrl = v => { try { const u = new URL(String(v).trim()); return u.protocol === 'https:' && !u.username && !u.password && u.origin !== globalThis.location?.origin ? u.href : undefined } catch { return undefined } } // not the app itself: its sandbox allows same-origin
// a project-relative path (deck file, project file) or undefined: no empty or dots-only segment ('.', '..', also %2e%2e;
// Windows drops trailing dots, so '....' counts too), no backslash or NUL
export function safePath(v) {
  if (typeof v !== 'string' || /[\\\0]/.test(v)) return undefined
  const p = v.replace(/^\/+/, '')
  const seg = x => { try { return decodeURIComponent(x) } catch { return x } }
  return p && !p.split('/').some(x => /^[.\s]*$/.test(seg(x))) ? p : undefined
}
export const num = (v, min = -1e4, max = 1e4) => Math.min(max, Math.max(min, Number(v) || 0))
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%/]+\)|[a-z]{3,20}|none|transparent)$/i
export const color = v => (typeof v === 'string' && COLOR.test(v.trim()) ? v.trim() : undefined)
export const ALIGN = ['left', 'center', 'right', 'justify']
// an icon's SVG body (inside <svg>): no scripts, events, foreign content or links out of the icon, then DOMPurify's SVG profile
// shortcut: DOMPurify drops <use>, so the few icons drawn with it (4 of ~28 000) lose that part; allow it if one matters
const UNSAFE_SVG = /<\s*\/?\s*(script|style|foreignobject|iframe|image|a|animate\w*|set)\b|\bon\w+\s*=|javascript:|\bhref\s*=\s*(?!["']?#)|url\(\s*(?!["']?#)/i
export const cleanIconBody = b => (typeof b === 'string' && b.length < 50000 && !UNSAFE_SVG.test(b)
  ? String(DOMPurify.sanitize(`<svg xmlns="http://www.w3.org/2000/svg">${b}</svg>`, { USE_PROFILES: { svg: true } })).replace(/^<svg[^>]*>|<\/svg>$/g, '') || undefined : undefined)
export const SHAPES = ['rect', 'rounded', 'ellipse', 'triangle', 'arrow', 'line']
export const LINE_SLOPES = ['down', 'up'], LINE_HEADS = ['end', 'start', 'both']

// image crop: the visible part as fractions of the picture {x, y, w, h}; the whole picture is no crop
export function cleanCrop(c) {
  if (!c || typeof c !== 'object') return undefined
  const f = v => Math.min(1, Math.max(0, Number(v) || 0))
  const x = f(c.x), y = f(c.y), w = Math.min(f(c.w), 1 - x), h = Math.min(f(c.h), 1 - y)
  if (w < 0.005 || h < 0.005 || (x < 0.0005 && y < 0.0005 && w > 0.9995 && h > 0.9995)) return undefined
  const r = v => Math.round(v * 1e5) / 1e5
  return { x: r(x), y: r(y), w: r(w), h: r(h) }
}
// ids plus the other members of their groups, the given ids last (the last one is the primary)
export const withGroups = (els, ids) => {
  const g = new Set(els.filter(e => e.group && ids.includes(e.id)).map(e => e.group))
  return [...els.filter(e => g.has(e.group) && !ids.includes(e.id)).map(e => e.id), ...ids]
}
// pasted or duplicated elements get fresh group ids, so copies don't join the original group
export function regroup(els) {
  const ids = new Map()
  for (const e of els) if (e.group) { if (!ids.has(e.group)) ids.set(e.group, uid()); e.group = ids.get(e.group) }
  return els
}
// Normalizes one element; null if it is not usable.
export function cleanEl(e) {
  if (!e || typeof e !== 'object') return null
  const base = { id: uid(), type: e.type, x: num(e.x), y: num(e.y), w: num(e.w, 4), h: num(e.h, 4) }
  if (e.fontSize) base.fontSize = num(e.fontSize, 4, 400)
  if (e.locked) base.locked = true // not moved or resized in the editor
  if (e.placeholder === true) base.placeholder = true // in a layout: copied into new slides instead of drawn behind them
  if (/^[\w-]{1,20}$/.test(e.group ?? '')) base.group = e.group // elements sharing it are selected and moved together
  if (Object.hasOwn(SHADOWS, e.shadow)) base.shadow = e.shadow
  if (/^[\w-]{1,40}$/.test(e.morph ?? '')) base.morph = e.morph // Magic move name: pairs it with the element of that name on the next slide
  if (/^[\w-]{1,20}$/.test(e.mid ?? '')) base.mid = e.mid // kept by a duplicated slide's copy, so Magic move pairs the two
  if (e.click >= 1) base.click = Math.min(99, Math.round(e.click)) // Slidev v-click: hidden while presenting until this step
  // Slidev v-click.hide or the end of a range v-click="[2, 4]": gone from this step on (after it appeared)
  if (e.clickUntil >= 1 && Math.round(e.clickUntil) > (base.click || 0)) base.clickUntil = Math.min(99, Math.round(e.clickUntil))
  if (base.click && Object.hasOwn(EFFECTS, e.effect ?? '')) base.effect = e.effect // how it enters on its click (none: fade)
  switch (e.type) {
    case 'text': return {
      ...base, html: clean(e.html), ...(e.title && { title: true }), ...(ALIGN.includes(e.align) && { align: e.align }), ...(['middle', 'bottom'].includes(e.valign) && { valign: e.valign }),
      ...(color(e.color) && { color: color(e.color) }), ...(color(e.fill) && { fill: color(e.fill) }), ...(e.fillAlpha != null && { fillAlpha: num(e.fillAlpha, 0, 100) }), ...(fontStack(e.font) && { font: e.font }),
      ...(e.prompt === true && { prompt: true }), // a layout's text not yet edited: left out when presenting and exporting
      ...(e.board === true && { board: true }), // notes box: the audience's answers are typed into it while presenting
      ...(e.board === true && e.liveTemp === true && { liveTemp: true }), // what is typed there is gone after the presentation
      ...(e.clickItems === true && { clickItems: true }), // its list items appear one per click while presenting
      // line spacing (a multiple of the font size) and the space between paragraphs and list items in px; unset: the theme's
      ...(e.line != null && { line: num(e.line, 0.8, 3) }), ...(e.para != null && { para: num(e.para, 0, 120) }),
      // border: colour, width in px, line style
      ...(color(e.stroke) && e.stroke !== 'none' && { stroke: color(e.stroke), strokeWidth: num(e.strokeWidth || 1, 0.5, 20), ...(['dashed', 'dotted'].includes(e.strokeStyle) && { strokeStyle: e.strokeStyle }) }),
    }
    case 'code': return {
      ...base, code: String(e.code ?? ''), lang: String(e.lang || 'plaintext').replace(/[^\w+#-]/g, ''), ...(str(e.meta) && { meta: e.meta.replace(/[\n`]/g, '') }),
      // background (undefined = theme), its opacity in % and the corner radius in px
      ...(color(e.fill) && { fill: color(e.fill) }), ...(e.fillAlpha != null && { fillAlpha: num(e.fillAlpha, 0, 100) }), ...(e.radius != null && { radius: num(e.radius, 0, 60) }),
      // runnable code ({monaco-run} in meta): the last kept output (plain text lines, capped), the panel's side and size in px
      // a code group: the element's own code is the first tab (label), more tabs follow
      ...(Array.isArray(e.tabs) && e.tabs.length && {
        tabs: e.tabs.slice(0, 8).filter(tb => tb && typeof tb === 'object').map(tb => ({ code: String(tb.code ?? ''), lang: String(tb.lang || 'plaintext').replace(/[^\w+#-]/g, ''), ...(str(tb.label)?.trim() && { label: tb.label.trim().slice(0, 40) }) })),
      }), ...(str(e.label)?.trim() && Array.isArray(e.tabs) && e.tabs.length && { label: e.label.trim().slice(0, 40) }),
      ...(cleanOutput(e.output)?.length && { output: cleanOutput(e.output) }), ...(e.outPos === 'right' && { outPos: 'right' }), ...(e.outH != null && { outH: num(e.outH, 20, 400) }),
    }
    case 'image': return deck.assets[e.asset] ? {
      ...base, asset: e.asset, ...(SLIDE_ID.test(e.to) && { to: e.to }), src: str(e.src) || '/images/image.png', ...(str(e.cls) && { cls: e.cls.replace(/[^\w\s:.\-[\]%/]/g, '') }),
      ...(e.radius && { radius: num(e.radius, 0, 500) }), ...(cleanCrop(e.crop) && { crop: cleanCrop(e.crop) }),
      // alt text for screen readers and exports; decorative: screen readers skip it (empty alt)
      ...(str(e.alt)?.trim() && { alt: e.alt.trim().slice(0, 2000) }), ...(e.decorative === true && { decorative: true }),
      ...(e.ink === true && { ink: true }), // a drawing kept from presenting: the next one on this slide is added to it
    } : null
    case 'table': {
      const rows = (Array.isArray(e.rows) ? e.rows : []).filter(Array.isArray).map(r => r.map(c => clean(c)))
      const cols = Math.max(1, ...rows.map(r => r.length))
      if (!rows.length) return null
      for (const r of rows) while (r.length < cols) r.push('')
      // cell colours: a grid like rows ('' = none), kept only while some cell has one
      const fills = rows.map((r, i) => r.map((_, j) => color(e.fills?.[i]?.[j]) || ''))
      // cell borders: [top, right, bottom, left] per cell, each "1.3px solid #000" or ''
      const side = v => { const m = typeof v === 'string' && v.match(/^(\d+(?:\.\d+)?)px (solid|dashed|dotted|double) (.+)$/); return m && color(m[3]) ? `${Math.min(+m[1], 20)}px ${m[2]} ${color(m[3])}` : '' }
      const borders = rows.map((r, i) => r.map((_, j) => [0, 1, 2, 3].map(k => side(e.borders?.[i]?.[j]?.[k]))))
      return {
        ...(fills.some(r => r.some(Boolean)) && { fills }), ...(borders.some(r => r.some(b => b.some(Boolean))) && { borders }),
        ...base, rows, header: e.header !== false, preset: typeof e.preset === 'string' ? e.preset.replace(/\W/g, '') : 'theme',
        align: Array.from({ length: cols }, (_, i) => (ALIGN.includes(e.align?.[i]) ? e.align[i] : '')),
        ...(e.firstCol && { firstCol: true }), ...(e.compact && { compact: true }),
        ...(Array.isArray(e.widths) && e.widths.length === cols && { widths: e.widths.map(w => num(w, 2, 100)) }),
      }
    }
    case 'shape': return {
      ...base, shape: SHAPES.includes(e.shape) ? e.shape : 'rect', fill: color(e.fill) || 'none', stroke: color(e.stroke) || 'none',
      strokeWidth: num(e.strokeWidth, 0, 40), radius: num(e.radius, 0, 300),
      // a line: slope down (top left to bottom right) or up (bottom left to top right), else straight; arrowheads at its ends
      ...(e.shape === 'line' && LINE_SLOPES.includes(e.slope) && { slope: e.slope }), ...(e.shape === 'line' && LINE_HEADS.includes(e.head) && { head: e.head }), ...(e.fillAlpha != null && { fillAlpha: num(e.fillAlpha, 0, 100) }), ...(SLIDE_ID.test(e.to) && { to: e.to }), // to: a slide id, jumped to on click
      // text inside the shape (centred), with its own colour
      ...(e.shape !== 'line' && str(e.html)?.trim() && { html: clean(e.html) }), ...(color(e.color) && { color: color(e.color) }), ...(ALIGN.includes(e.align) && { align: e.align }),
    }
    // table of contents (Slidev's <Toc>): heading levels minDepth–maxDepth (1–6), columns, current slide marked
    case 'toc': return {
      ...base, ...(e.minDepth > 1 && { minDepth: Math.min(6, Math.round(e.minDepth)) }), ...(e.maxDepth >= 1 && e.maxDepth < 6 && { maxDepth: Math.round(e.maxDepth) }),
      ...(e.columns > 1 && { columns: Math.min(4, Math.round(e.columns)) }), ...(e.current === true && { current: true }), ...(color(e.color) && { color: color(e.color) }),
      ...(LOOKS.toc.includes(e.look) && { look: e.look }),
    }
    // Mermaid source, rendered (and sanitized) by diagram.js; capped so a pasted file cannot stall the renderer
    case 'diagram': return { ...base, code: (str(e.code) || '').slice(0, 20000) }
    // TeX source of a formula, rendered by KaTeX (math.js, no trust: no links or pictures); capped like typed code
    case 'math': return { ...base, tex: (str(e.tex) || '').slice(0, 5000), ...(color(e.color) && { color: color(e.color) }) }
    // a YouTube video, or a web page (https only) shown in a frame while presenting
    // a video or audio file of the project (stored like an image, so it plays offline); src: its path in a Slidev export
    case 'media': return deck.assets[e.asset] && ['video', 'audio'].includes(e.kind) ? {
      ...base, asset: e.asset, kind: e.kind, src: str(e.src) || '/media/' + e.kind, ...(str(e.name) && { name: e.name.slice(0, 200) }),
    } : null
    case 'video': return /^[\w-]{6,20}$/.test(str(e.youtube) ?? '') ? { ...base, youtube: e.youtube } : webUrl(e.url) ? { ...base, url: webUrl(e.url) } : null
    // countdown length in seconds (0: a stopwatch), started by a click while presenting; face: ring or bar around the digits
    // in accent (default: the theme's), fill: its background, warn: a countdown's last minute in red, auto, silent
    case 'timer': return {
      ...base, seconds: Math.round(num(e.seconds, 0, 359999)), ...(color(e.color) && { color: color(e.color) }),
      ...(['ring', 'bar'].includes(e.face) && { face: e.face }), ...(color(e.accent) && { accent: color(e.accent) }),
      ...(color(e.fill) && { fill: color(e.fill) }), ...(e.warn === true && { warn: true }),
      ...(e.auto === true && { auto: true }), ...(e.silent === true && { silent: true }), // starts when visible; no sound at the end
    }
    // names or groups to draw from while presenting: plain text, trimmed, at most 200 of 100 characters; repeat: a name can come up again
    // look, heading over the card ('' none, unset "Who's next?"), its icon: an Iconify one as for icon elements, noIcon, unset a die
    case 'picker': {
      const body = cleanIconBody(e.body)
      return {
        ...base, names: (Array.isArray(e.names) ? e.names : []).map(n => str(n)?.trim().slice(0, 100)).filter(Boolean).slice(0, 200),
        ...(color(e.color) && { color: color(e.color) }), ...(e.repeat === true && { repeat: true }), ...(LOOKS.picker.includes(e.look) && { look: e.look }),
        ...(typeof e.heading === 'string' && { heading: e.heading.replace(/\s+/g, ' ').trim().slice(0, 100) }),
        ...(e.noIcon === true ? { noIcon: true } : ICON_NAME.test(e.icon) && body && { icon: e.icon, body, view: /^-?[\d.]+( -?[\d.]+){3}$/.test(e.view) ? e.view : '0 0 24 24' }),
      }
    }
    // an Iconify icon (set:name) with its SVG, so it still renders without the set; label: read out (none: decorative)
    case 'icon': {
      const body = cleanIconBody(e.body)
      return ICON_NAME.test(e.icon) && body ? {
        ...base, icon: e.icon, body, view: /^-?[\d.]+( -?[\d.]+){3}$/.test(e.view) ? e.view : '0 0 24 24', ...(color(e.color) && { color: color(e.color) }),
        ...([1, 2, 3].includes(e.rotate) && { rotate: e.rotate }), ...(['h', 'v', 'hv'].includes(e.flip) && { flip: e.flip }), ...(str(e.label)?.trim() && { label: e.label.trim().slice(0, 200) }),
      } : null
    }
    // plain text (rendered as text, never as HTML) on one line, 2–6 answers, any of them correct
    case 'quiz': {
      const line = (v, n) => (str(v) || '').replace(/\s+/g, ' ').trim().slice(0, n)
      const answers = (Array.isArray(e.answers) ? e.answers : []).filter(a => a && typeof a === 'object').slice(0, 6).map(a => ({ text: line(a.text, 200), ...(a.correct === true && { correct: true }) }))
      while (answers.length < 2) answers.push({ text: '' })
      return { ...base, question: line(e.question, 300), answers, ...(LOOKS.quiz.includes(e.look) && { look: e.look }) }
    }
    // chart data from files or the clipboard: finite numbers, short plain-text labels, at most 100 categories and 20 series
    case 'chart': {
      const line = (v, n) => (str(v) ?? (typeof v === 'number' ? String(v) : '')).replace(/\s+/g, ' ').trim().slice(0, n)
      const categories = (Array.isArray(e.categories) ? e.categories : []).slice(0, 100).map(c => line(c, 100))
      const series = (Array.isArray(e.series) ? e.series : []).filter(s => s && typeof s === 'object').slice(0, 20).map(s => ({
        name: line(s.name, 100), values: categories.map((_, j) => (Number.isFinite(+s.values?.[j]) && s.values[j] !== null ? Math.min(1e12, Math.max(-1e12, +s.values[j])) : 0)), ...(color(s.color) && { color: color(s.color) }),
      }))
      const lim = v => (v != null && v !== '' && Number.isFinite(+v) ? +v : undefined)
      return {
        ...base, kind: Object.hasOwn(CHART_KINDS, e.kind) ? e.kind : 'column', categories, series, legend: e.legend !== false, ...(e.values === true && { values: true }),
        ...(e.stacked === true && { stacked: true }), ...(e.percent === true && { percent: true }), ...(Object.hasOwn(PALETTES, e.palette) && { palette: e.palette }),
        ...(Array.isArray(e.catColors) && e.catColors.some(color) && { catColors: categories.map((_, j) => color(e.catColors[j]) || null) }), ...(line(e.title, 200) && { title: line(e.title, 200) }), ...(lim(e.min) != null && { min: lim(e.min) }), ...(lim(e.max) != null && { max: lim(e.max) }),
      }
    }
  }
  return null
}

// slide background picture: an asset, cover (default) or contain, darkened by dim % for readable text
function cleanBg(b) {
  if (!b || typeof b !== 'object' || !deck.assets[b.asset]) return undefined
  return { asset: b.asset, src: str(b.src) || '/images/background.png', ...(b.fit === 'contain' && { fit: 'contain' }), ...(b.dim > 0 && { dim: Math.round(num(b.dim, 0, 90)) }) }
}
const SLIDE_ID = /^[\w-]{1,40}$/
function cleanSlide(s) {
  return {
    id: uid(),
    layout: /^[\w-]+$/.test(str(s.layout) ?? '') ? s.layout : 'default', // test(undefined) would pass: it tests the string 'undefined'
    transition: TRANSITIONS.includes(s.transition) ? s.transition : undefined, // undefined: the project's default
    // Slidev source of the slide: frontmatter, original markdown, file it belongs to, speaker notes
    fm: str(s.fm), md: str(s.md), file: safePath(s.file), notes: str(s.notes) || '',
    hash: Number.isInteger(s.hash) ? s.hash : undefined,
    flow: Number.isInteger(s.flow) ? s.flow : undefined, // arrangement of a new slide, see flowHash
    gap: Number.isInteger(s.gap) && s.gap >= 0 && s.gap < 20 ? s.gap : undefined,
    ...(s.hidden === true && { hidden: true }), // skipped when presenting and exporting
    ...(s.hideMaster === true && { hideMaster: true }), // the master's elements are not drawn on it
    // left out of tables of contents (Slidev's hideInToc); without the field (older projects) the frontmatter says it
    ...((s.hideInToc ?? fmGet(str(s.fm), 'hideInToc') === 'true') === true && { hideInToc: true }),
    ...(cleanBg(s.bg) && { bg: cleanBg(s.bg) }),
    ...(c => str(c)?.trim() && { cls: c.replace(/[^\w\s:.\-[\]%/!#()]/g, '').trim().slice(0, 300) })(s.cls ?? fmGet(str(s.fm), 'class')), // Slidev's class: frontmatter, kept for the export
    ...(validDuration(s.duration) && { duration: Math.round(s.duration) }), // planned seconds for rehearsing
    type: /^[\w-]{1,40}$/.test(str(s.type) ?? '') ? s.type : undefined, // its project layout (see layoutOf)
    elements: (Array.isArray(s.elements) ? s.elements : []).map(cleanEl).filter(Boolean),
  }
}
// slides keep their id (links name slides by it) unless it is taken (taken: ids of the open project); links within the
// batch follow a slide that got a new one
export function cleanSlides(slides, taken = new Set(deck.slides.map(s => s.id))) {
  const map = {}, seen = new Set() // seen: a second slide with the same id is a copy, links stay with the first
  const out = slides.filter(s => s && typeof s === 'object').map(s => {
    const c = cleanSlide(s)
    if (SLIDE_ID.test(s.id) && !seen.has(s.id)) { if (!taken.has(s.id)) c.id = s.id; else map[s.id] = c.id }
    seen.add(s.id)
    taken.add(c.id)
    return c
  })
  if (Object.keys(map).length) remapLinks(out.flatMap(s => s.elements), map)
  return out
}
export const cleanEls = list => (Array.isArray(list) ? list : []).map(cleanEl).filter(Boolean)
export function cleanLayouts(list) {
  const ids = new Set()
  return (Array.isArray(list) ? list : []).filter(l => l && typeof l === 'object').map(l => {
    const id = /^[\w-]{1,40}$/.test(str(l.id) ?? '') && !ids.has(l.id) ? l.id : uid()
    ids.add(id)
    return { id, name: (str(l.name) || '').trim().slice(0, 60) || t('Layout'), layout: /^[\w-]+$/.test(str(l.layout) ?? '') ? l.layout : 'default', elements: cleanEls(l.elements) }
  })
}
