import { reactive, watch, toRaw, computed } from 'vue'
import DOMPurify from 'dompurify'
import { slideHash } from './toSlidev.js'
import { THEMES, fontStack, SHADOWS, DEFAULT_THEME, validThemeId, importTheme, themeFile } from './themes.js'
import { parseRatio, formatSize } from './format.js'
import { t } from './i18n.js'

// Logical slide size (Slidev's canvas). All element coordinates are in these units; editor,
// thumbnails, print and PPTX only scale them. Live bindings: read them at call time; templates use format.
export let W = 980, H = 552
export const format = reactive({ w: W, h: H })
let pageStyle
// Slidev headmatter aspectRatio/canvasWidth; invalid values fall back to Slidev's defaults.
// Elements keep their coordinates: a new format only changes the canvas.
export function setFormat(aspectRatio = '16/9', canvasWidth = 980) {
  const r = parseRatio(aspectRatio)
  const cw = Math.round(+canvasWidth)
  deck.aspectRatio = r ? String(aspectRatio).replace(/\s+/g, '').replace(':', '/') : '16/9'
  deck.canvasWidth = cw >= 100 && cw <= 10000 ? cw : 980
  ;({ w: W, h: H } = formatSize(r || 16 / 9, deck.canvasWidth))
  Object.assign(format, { w: W, h: H })
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--slide-w', W + 'px')
  document.documentElement.style.setProperty('--slide-h', H + 'px')
  // @page can't use var(): one page per slide at the current size (app.css has the 16:9 fallback)
  pageStyle ??= document.head.appendChild(Object.assign(document.createElement('style'), { id: 'slide-format' }))
  pageStyle.textContent = `@page { size: ${W}px ${H}px; margin: 0; }`
}

// The open project. A project is a Slidev project: an entry file (slides.md) plus the decks
// (Foliensätze) it embeds via `src:`. Slides are one flat list; slide.file says which deck file a
// slide belongs to, so "Gesamt" is the list and a deck is a run of slides with the same file.
// assets: { id: dataURL } – kept out of the slides so undo snapshots and duplicates stay small.
// files: other files of the Slidev project (theme/, package.json, global components …) as text or
// data URL, written back unchanged on export so the project keeps working.
export const deck = reactive({ id: '', title: '', source: '', typo: {}, theme: DEFAULT_THEME, aspectRatio: '16/9', canvasWidth: 980, entry: 'slides.md', slides: [], assets: {}, files: {} })
// sel: selected element ids (last = primary); editing: id of the element being typed in
export const ui = reactive({ slide: 0, sel: [], editing: null, status: '', cell: null, cellEnd: null, cellFill: false, crop: null, cropRatio: null, look: null, painting: false, home: false, save: 'saved', yt: false }) // save: saving | saved | failed; yt: YouTube content allowed in this tab (privacy: nothing loads from Google before a click; kept in sessionStorage)
export const library = reactive({ list: [] }) // [{ id, title, theme, slides, decks, updated }]

export const uid = () => Math.random().toString(36).slice(2, 10)
// Slidev's click animations are kept in the markup so they survive a round trip
export const clean = html => DOMPurify.sanitize(String(html ?? ''), { ADD_TAGS: ['v-clicks', 'v-click', 'v-after'], ADD_ATTR: ['at', 'every', 'depth'] })

// --- decks (Foliensätze) ---
export const fileOf = s => s.file || deck.entry
export const deckName = file => file.replace(/^.*\//, '').replace(/\.md$/, '').replace(/^\d+[_-]/, '').replace(/[_-]+/g, ' ')
// consecutive runs of slides of the same file
export const decks = computed(() => {
  const out = []
  deck.slides.forEach((s, i) => {
    const file = fileOf(s)
    if (out.at(-1)?.file !== file) out.push({ file, start: i, count: 0, name: file === deck.entry ? t('Main deck') : deckName(file) })
    out.at(-1).count++
  })
  return out
})
export const deckOfSlide = i => decks.value.find(d => i >= d.start && i < d.start + d.count)

// --- validation of untrusted data (files, IndexedDB, clipboard, import) ---
const str = v => (typeof v === 'string' ? v : undefined)
const num = (v, min = -1e4, max = 1e4) => Math.min(max, Math.max(min, Number(v) || 0))
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%/]+\)|[a-z]{3,20}|none|transparent)$/i
const color = v => (typeof v === 'string' && COLOR.test(v.trim()) ? v.trim() : undefined)
const ALIGN = ['left', 'center', 'right', 'justify']
export const SHAPES = ['rect', 'rounded', 'ellipse', 'triangle', 'arrow', 'line']

// image crop: the visible part as fractions of the picture {x, y, w, h}; the whole picture is no crop
export function cleanCrop(c) {
  if (!c || typeof c !== 'object') return undefined
  const f = v => Math.min(1, Math.max(0, Number(v) || 0))
  const x = f(c.x), y = f(c.y), w = Math.min(f(c.w), 1 - x), h = Math.min(f(c.h), 1 - y)
  if (w < 0.005 || h < 0.005 || (x < 0.0005 && y < 0.0005 && w > 0.9995 && h > 0.9995)) return undefined
  const r = v => Math.round(v * 1e5) / 1e5
  return { x: r(x), y: r(y), w: r(w), h: r(h) }
}
// Normalizes one element; null if it is not usable.
export function cleanEl(e) {
  if (!e || typeof e !== 'object') return null
  const base = { id: uid(), type: e.type, x: num(e.x), y: num(e.y), w: num(e.w, 4), h: num(e.h, 4) }
  if (e.fontSize) base.fontSize = num(e.fontSize, 4, 400)
  if (e.locked) base.locked = true // not moved or resized in the editor
  if (Object.hasOwn(SHADOWS, e.shadow)) base.shadow = e.shadow
  switch (e.type) {
    case 'text': return {
      ...base, html: clean(e.html), ...(e.title && { title: true }), ...(ALIGN.includes(e.align) && { align: e.align }), ...(['middle', 'bottom'].includes(e.valign) && { valign: e.valign }),
      ...(color(e.color) && { color: color(e.color) }), ...(color(e.fill) && { fill: color(e.fill) }), ...(e.fillAlpha != null && { fillAlpha: num(e.fillAlpha, 0, 100) }), ...(fontStack(e.font) && { font: e.font }),
      // border: colour, width in px, line style
      ...(color(e.stroke) && e.stroke !== 'none' && { stroke: color(e.stroke), strokeWidth: num(e.strokeWidth || 1, 0.5, 20), ...(['dashed', 'dotted'].includes(e.strokeStyle) && { strokeStyle: e.strokeStyle }) }),
    }
    case 'code': return {
      ...base, code: String(e.code ?? ''), lang: String(e.lang || 'plaintext').replace(/[^\w+#-]/g, ''), ...(str(e.meta) && { meta: e.meta.replace(/[\n`]/g, '') }),
      // background (undefined = theme), its opacity in % and the corner radius in px
      ...(color(e.fill) && { fill: color(e.fill) }), ...(e.fillAlpha != null && { fillAlpha: num(e.fillAlpha, 0, 100) }), ...(e.radius != null && { radius: num(e.radius, 0, 60) }),
    }
    case 'image': return deck.assets[e.asset] ? {
      ...base, asset: e.asset, src: str(e.src) || '/images/bild.png', ...(str(e.cls) && { cls: e.cls.replace(/[^\w\s:.\-[\]%/]/g, '') }),
      ...(e.radius && { radius: num(e.radius, 0, 500) }), ...(cleanCrop(e.crop) && { crop: cleanCrop(e.crop) }),
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
      strokeWidth: num(e.strokeWidth, 0, 40), radius: num(e.radius, 0, 300), ...(e.fillAlpha != null && { fillAlpha: num(e.fillAlpha, 0, 100) }),
      // text inside the shape (centred), with its own colour
      ...(e.shape !== 'line' && str(e.html)?.trim() && { html: clean(e.html) }), ...(color(e.color) && { color: color(e.color) }), ...(ALIGN.includes(e.align) && { align: e.align }),
    }
    case 'video': return /^[\w-]{6,20}$/.test(e.youtube) ? { ...base, youtube: e.youtube } : null
  }
  return null
}

function cleanSlide(s) {
  return {
    id: uid(),
    layout: /^[\w-]+$/.test(s.layout) ? s.layout : 'default',
    // Slidev source of the slide: frontmatter, original markdown, file it belongs to, speaker notes
    fm: str(s.fm), md: str(s.md), file: str(s.file)?.replace(/^\/+|\.\.\//g, ''), notes: str(s.notes) || '',
    hash: Number.isInteger(s.hash) ? s.hash : undefined,
    gap: Number.isInteger(s.gap) && s.gap >= 0 && s.gap < 20 ? s.gap : undefined,
    elements: (Array.isArray(s.elements) ? s.elements : []).map(cleanEl).filter(Boolean),
  }
}
export const cleanSlides = slides => slides.map(cleanSlide)

// Replaces the open project's content (keeps its id).
export function loadDeck(d) {
  if (!Array.isArray(d?.slides)) throw new Error(t('Not a valid project file'))
  if (d.styles) mergeTextStyles(d.styles)
  for (const [k, v] of Object.entries(d.assets || {})) if (/^data:image\//.test(v)) deck.assets[k] = v
  if (d.files && typeof d.files === 'object') deck.files = Object.fromEntries(Object.entries(d.files).filter(([k, v]) => typeof v === 'string' && /^[\w.@/ -]+$/.test(k) && !k.includes('..')))
  deck.title = String(d.title || t('Presentation')).slice(0, 200)
  deck.source = typeof d.source === 'string' ? d.source.slice(0, 200) : '' // Slidev folder it was imported from
  // an own theme the project file carries joins this browser's unless one with that id exists already;
  // an unknown id stays (shown in the default theme), so importing that theme later brings the look back
  if (d.themeDef && validThemeId(d.theme) && !THEMES[d.theme]) try { importTheme({ ...d.themeDef, id: d.theme }) } catch { /* broken definition: default look */ }
  deck.theme = validThemeId(d.theme) ? d.theme : DEFAULT_THEME
  setFormat(d.aspectRatio, d.canvasWidth)
  // project-wide type sizes in px (text, title, code); anything else is dropped
  // (from: the theme whose sizes were kept on a theme switch; line/liLine are unitless ratios)
  deck.typo = Object.fromEntries(Object.entries(d.typo || {}).filter(([k, v]) => k === 'from' ? validThemeId(v)
    : ['text', 'title', 'titleLine', 'h2', 'h3', 'code', 'codeLine'].includes(k) ? Number.isFinite(v) && v >= 4 && v <= 160
      : ['line', 'liLine'].includes(k) && Number.isFinite(v) && v > 0.5 && v < 4))
  deck.entry = /^[\w./-]+\.md$/.test(d.entry) ? d.entry.replace(/^\/+/, '') : 'slides.md'
  deck.slides = cleanSlides(d.slides)
  // freshly imported slides: remember their content, so the Slidev export can tell if they changed
  for (const s of deck.slides) if (s.md != null) s.hash ??= slideHash(s)
  if (!deck.slides.length) deck.slides.push(newSlide())
  Object.assign(ui, { slide: 0, sel: [], editing: null })
}

export function newSlide(layout = 'default', elements) {
  return {
    id: uid(), layout, notes: '',
    elements: elements || [{ id: uid(), type: 'text', title: true, x: 56, y: 40, w: 868, h: 40, html: `<h1>${t('Title')}</h1>` }],
  }
}

const usedAssets = (slides = deck.slides) => {
  const used = new Set()
  for (const s of slides) for (const e of s.elements) {
    if (e.asset) used.add(e.asset)
    for (const m of JSON.stringify(e.html || e.rows || '').matchAll(/data-asset=\\?"([^"\\]+)/g)) used.add(m[1])
  }
  return Object.fromEntries(Object.entries(toRaw(deck.assets)).filter(([k]) => used.has(k)))
}
// the user's own text styles: kept in this browser for all projects; a project file carries the ones its slides
// use (usedStyles), so a backup or another computer gets them back (mergeTextStyles)
const STYLE_KEY = 'slides-builder:text-presets'
export const textStyles = reactive({ list: (() => { try { return cleanStyles(JSON.parse(localStorage.getItem(STYLE_KEY))) } catch { return [] } })() })
export function saveTextStyles(list) {
  textStyles.list = list
  try { localStorage.setItem(STYLE_KEY, JSON.stringify(list)) } catch {}
}
function cleanStyles(list) {
  return (Array.isArray(list) ? list : []).filter(p => p && typeof p.name === 'string' && p.name.trim()).map(p => ({
    name: p.name.trim().slice(0, 60), tag: /^(h[1-6]|p|blockquote|pre)$/.test(p.tag) ? p.tag : 'p',
    ...(p.fontSize && { fontSize: num(p.fontSize, 4, 400) }), ...(fontStack(p.font) && { font: p.font }),
    ...(color(p.color) && { color: color(p.color) }), ...(color(p.fill) && { fill: color(p.fill) }),
    ...(ALIGN.includes(p.align) && { align: p.align }), ...(['middle', 'bottom'].includes(p.valign) && { valign: p.valign }),
  }))
}
// a text box uses a style while its block format and every style property match it (a box changed afterwards does not)
export const STYLE_PROPS = ['fontSize', 'font', 'color', 'fill', 'align', 'valign']
export const blockTag = el => el.html?.match(/<(h[1-6]|p|blockquote|pre)\b/i)?.[1].toLowerCase()
export const styleMatches = (p, el) => el.type === 'text' && blockTag(el) === p.tag && STYLE_PROPS.every(k => (p[k] ?? undefined) === (el[k] ?? undefined))
// only the styles the slides use go into a project file
// an own theme rides along in the project file, so another browser shows it too
const themeDef = id => (THEMES[id]?.custom ? themeFile(id) : undefined)
const usedStyles = slides => toRaw(textStyles.list).filter(p => slides.some(s => s.elements.some(e => styleMatches(p, e))))
// styles from a file join the browser's; one with a name already taken here keeps the browser's version
export function mergeTextStyles(list) {
  const have = new Set(textStyles.list.map(p => p.name))
  const add = cleanStyles(list).filter(p => !have.has(p.name))
  if (add.length) saveTextStyles([...textStyles.list, ...add])
}
const snapshot = () => JSON.stringify({ title: deck.title, source: deck.source, typo: deck.typo, theme: deck.theme, aspectRatio: deck.aspectRatio, canvasWidth: deck.canvasWidth, entry: deck.entry, slides: deck.slides })
export const deckData = () => JSON.parse(snapshot())
// slides: only these (export of one deck)
export const deckFile = slides => JSON.stringify({ format: 'slides-builder', version: 1, ...JSON.parse(snapshot()), ...(slides && { slides: toRaw(slides) }), assets: usedAssets(slides), files: toRaw(deck.files), styles: usedStyles(slides || deck.slides), themeDef: themeDef(deck.theme) })

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp' }
export const readDataUrl = blob => new Promise((res, rej) => {
  // files from folder picks sometimes come without a type (svg, webp, …): take it from the extension
  const type = !blob.type && MIME[blob.name?.split('.').pop().toLowerCase()]
  if (type) blob = new Blob([blob], { type })
  const r = new FileReader()
  r.onload = () => res(r.result)
  r.onerror = () => rej(r.error)
  r.readAsDataURL(blob)
})
export const imageSize = src => new Promise((res, rej) => {
  const img = new Image()
  img.onload = () => res({ w: img.naturalWidth || 300, h: img.naturalHeight || 200 })
  img.onerror = () => rej(new Error(t('Image could not be read')))
  img.src = src
})
// stores an image file; returns the asset id and the path it gets in a Slidev export
export async function storeImage(file) {
  const data = await readDataUrl(file)
  const size = await imageSize(data)
  const id = uid()
  deck.assets[id] = data
  let path = '/images/' + (file.name || 'bild.png').replace(/[^\w.-]+/g, '_')
  if (deck.slides.some(s => s.elements.some(e => e.src === path))) path = path.replace(/([^/]+)$/, id + '-$1')
  return { id, path, size }
}

// --- undo/redo: snapshots of everything except assets ---
const history = []
let at = -1 // position of the current state in history
export function undo(step = -1) {
  if (!history[at + step]) return
  at += step
  const { title, theme, aspectRatio, canvasWidth, entry, slides } = JSON.parse(history[at])
  Object.assign(deck, { title, theme, entry, slides })
  setFormat(aspectRatio, canvasWidth)
  Object.assign(ui, { slide: Math.min(ui.slide, slides.length - 1), sel: [], editing: null })
}
export const redo = () => undo(1)
// a freshly opened project: its loaded state is the first entry, so the first change can be undone.
// Not left to the watch below: on startup the last project opens before that watch exists.
function startHistory() {
  history.length = 0
  history.push(snapshot())
  at = 0
}
export const canUndo = () => at > 0
export const canRedo = () => at < history.length - 1

// --- persistence: IndexedDB (images blow past localStorage's ~5 MB) ---
const db = new Promise((res, rej) => {
  const r = indexedDB.open('slides-builder', 2)
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv') }
  r.onsuccess = () => res(r.result)
  r.onerror = () => rej(r.error)
})
// Safari otherwise clears site storage after 7 days without a visit
globalThis.navigator?.storage?.persist?.().catch(() => {})
const idb = (mode, fn) => db.then(d => new Promise((res, rej) => {
  const rq = fn(d.transaction('kv', mode).objectStore('kv'))
  rq.onsuccess = () => res(rq.result)
  rq.onerror = () => rej(rq.error)
}))
const get = k => idb('readonly', s => s.get(k))
const put = (k, v) => idb('readwrite', s => s.put(v, k))
const del = k => idb('readwrite', s => s.delete(k))
const saveFailed = e => { ui.save = 'failed'; ui.status = t('Saving in the browser failed – please save as a file! ({0})', e.message) }
const remember = id => { try { localStorage.setItem('slides-builder:last', id) } catch {} }

function meta() {
  return { id: deck.id, title: deck.title, source: deck.source, theme: deck.theme, slides: deck.slides.length, decks: decks.value.filter(d => d.file !== deck.entry).length, updated: Date.now() }
}
async function saveList() {
  await put('projects', JSON.stringify(library.list))
}
let saving = Promise.resolve(), pending = 0
// every write goes through here: the title bar shows whether the browser copy is up to date
const queue = job => {
  pending++
  ui.save = 'saving'
  saving = saving.then(job).then(() => { if (!--pending) ui.save = 'saved' }, e => { pending--; saveFailed(e) })
}
// closing the tab while a write is still running would lose it
globalThis.addEventListener?.('beforeunload', e => { if (pending) e.preventDefault() })
function persist(json) {
  if (!deck.id) return
  const m = meta()
  library.list = [m, ...library.list.filter(p => p.id !== m.id)]
  queue(() => Promise.all([put('p:' + deck.id, json), saveList()]))
}
const persistAssets = () => { if (deck.id) queue(() => Promise.all([put('a:' + deck.id, usedAssets()), put('f:' + deck.id, toRaw(deck.files))])) }

// opens a stored project
export async function openProject(id) {
  const [json, assets, files] = await Promise.all([get('p:' + id), get('a:' + id), get('f:' + id)])
  if (!json) throw new Error(t('Project not found'))
  deck.assets = {}
  deck.files = {}
  deck.id = id
  loadDeck({ ...JSON.parse(json), assets, files })
  startHistory()
  ui.home = false
  remember(id)
}
// creates a project from deck data (import, file, template); replace: id of a project to overwrite
export async function createProject(d, replace) {
  deck.assets = {}
  deck.files = {}
  deck.id = replace || uid()
  loadDeck(d)
  startHistory()
  ui.home = false
  remember(deck.id)
  persist(snapshot())
  persistAssets()
  await saving
}
export async function removeProject(id) {
  library.list = library.list.filter(p => p.id !== id)
  await Promise.all([del('p:' + id), del('a:' + id), del('f:' + id), saveList()])
  if (deck.id === id) { deck.id = ''; ui.home = true }
}
export async function duplicateProject(id) {
  const [json, assets, files] = await Promise.all([get('p:' + id), get('a:' + id), get('f:' + id)])
  const d = JSON.parse(json)
  await createProject({ ...d, title: d.title + ' (Kopie)', assets, files })
}

// renames a stored project without opening it (the open one: through deck.title, saved as usual)
export async function renameProject(id, title) {
  title = String(title).trim().slice(0, 200)
  if (!title) return
  if (id === deck.id) { deck.title = title; return }
  const json = await get('p:' + id)
  if (!json) throw new Error(t('Project not found'))
  library.list = library.list.map(p => (p.id === id ? { ...p, title, updated: Date.now() } : p))
  await Promise.all([put('p:' + id, JSON.stringify({ ...JSON.parse(json), title })), saveList()])
}
// the same .slides.json as deckFile(), read straight from storage without opening the project
export async function projectFile(id) {
  const [json, assets, files] = await Promise.all([get('p:' + id), get('a:' + id), get('f:' + id)])
  if (!json) throw new Error(t('Project not found'))
  const updated = library.list.find(p => p.id === id)?.updated
  const d = JSON.parse(json)
  return JSON.stringify({ format: 'slides-builder', version: 1, id, updated, ...d, assets: assets || {}, files: files || {}, styles: usedStyles(d.slides), themeDef: themeDef(d.theme) })
}
// a .slides.json goes back into the project it was saved from (id) instead of a copy next to it;
// a backup older than the browser copy must not overwrite newer work: it comes in as a separate copy
export async function restoreProject(d) {
  const id = typeof d?.id === 'string' && /^[\w-]{1,64}$/.test(d.id) ? d.id : null
  const have = id && library.list.find(p => p.id === id)
  const older = have && !(d.updated >= have.updated)
  await createProject(older ? { ...d, title: d.title + ' ' + t('(older backup)') } : d, older ? undefined : id || undefined)
  return have ? (older ? 'copy' : 'replaced') : 'new'
}

export async function restore(session = {}) {
  try {
    library.list = JSON.parse((await get('projects')) || '[]')
    // projects saved by the first version (single deck)
    const legacy = await get('deck')
    if (legacy) {
      await createProject({ ...JSON.parse(legacy), assets: await get('assets') })
      await Promise.all([del('deck'), del('assets')])
    }
    // this tab's project (sessionStorage) before the last one opened in any tab
    let last
    try { last = localStorage.getItem('slides-builder:last') } catch {}
    const open = [session.project, last].find(id => id && library.list.some(p => p.id === id))
    if (!deck.id && open) await openProject(open)
  } catch (e) {
    ui.status = t('Saved projects could not be loaded: {0}', e.message)
  }
  if (!deck.id || session.home) ui.home = true

  let timer, due = null
  const flush = () => {
    clearTimeout(timer)
    const json = due
    due = null
    if (json === null || !deck.id) return
    if (json !== history[at]) {
      history.splice(at + 1, Infinity, json) // a new change discards the redo states
      if (history.length > 200) history.shift()
      at = history.length - 1
    }
    persist(json)
  }
  watch(snapshot, json => {
    clearTimeout(timer)
    due = json
    timer = setTimeout(flush, 300)
  })
  // iOS shows no warning when a tab closes and freezes hidden pages: save the moment the page goes away
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
  addEventListener('pagehide', flush)
  addEventListener('beforeunload', flush, true) // runs before the warning check above, so it sees the write as pending
  watch(() => Object.keys(deck.assets).length, persistAssets)
}
