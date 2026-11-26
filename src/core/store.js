import { reactive, watch, toRaw, computed } from 'vue'
import { slideHash, layoutOf, decorations, readLayers } from '../export/toSlidev.js'
import { TRANSITIONS } from '../import/parseSlidev.js'
import { THEMES, FONTS, fontStack, setOwnFonts, DEFAULT_THEME, validThemeId, importTheme, themeFile, themeLayouts } from '../slide/themes.js'
import { SLIDE_PRESETS } from '../slide/presets.js'
import { parseRatio, formatSize } from '../slide/format.js'
import { t } from './i18n.js'
import { clickSteps } from '../present/clicks.js'
import { cleanRehearsals, validDuration } from '../present/rehearse.js'
import { cleanFonts, fontType, fontLabel, FONT_MAX } from '../slide/fonts.js'
import { ALIGN, cleanEls, cleanLayouts, cleanSlides, color, num, safePath } from './clean.js'
import { deck, library, ui } from './state.js'
import { uid } from './uid.js'
export * from './clean.js'
export * from './state.js'
export { uid } from './uid.js'

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

// the starting layouts of a project: today's "New slide" presets, their elements as placeholders (translated when created)
export const presetLayouts = () => SLIDE_PRESETS.map(p => ({ id: p.id, name: t(p.name), layout: p.layout, elements: p.make().map(e => ({ ...e, placeholder: true })) }))
// project layouts for loaded data: stored ones; else read back from a Slidev export of Slidecko (layouts/*.vue, whose
// slides name the file) plus the presets; every Slidev layout a slide uses gets one, and every slide its type
export function setupLayouts(d, slides, files = {}, theme = DEFAULT_THEME) {
  const read = Array.isArray(d.layouts) ? null : readLayers(files)
  const own = read?.layouts || []
  for (const s of slides) {
    const l = own.find(l => l.slug === s.layout)
    if (l) Object.assign(s, { type: l.id, layout: /^[\w-]+$/.test(l.layout) ? l.layout : 'default' })
  }
  const layouts = cleanLayouts(read ? [...own, ...presetLayouts().filter(p => !own.some(l => l.id === p.id))] : d.layouts)
  for (const s of slides) {
    if (!layoutOf(s, layouts)) layouts.push({ id: layouts.some(l => l.id === s.layout) ? uid() : s.layout, name: t(themeLayouts(theme).find(x => x[0] === s.layout)?.[1] || s.layout), layout: s.layout, elements: [] })
    s.type = layoutOf(s, layouts).id
  }
  return { layouts, master: cleanEls(Array.isArray(d.master) ? d.master : read?.master) }
}
// what is drawn behind a slide: the master (unless switched off on it) and its layout's decorations;
// a layout shows the master behind it, the master nothing
export function underlay(s, d = deck) {
  if (!s || s.id === 'master') return []
  if (d.layouts.includes(s)) return d.master
  return [...(s.hideMaster ? [] : d.master), ...decorations(layoutOf(s, d.layouts))]
}
// a layout is removed: its slides go to the first layout with Slidev's default layout (or the first one), keeping their content
export function removeLayout(id, d = deck) {
  if (d.layouts.length < 2) return
  d.layouts = d.layouts.filter(l => l.id !== id)
  const to = d.layouts.find(l => l.layout === 'default') || d.layouts[0]
  for (const s of d.slides) if (s.type === id) Object.assign(s, { type: to.id, layout: to.layout })
}
// hidden slides: left out of exports, skipped when presenting
export const shownSlides = slides => slides.filter(s => !s.hidden)
// index of the next slide not hidden in direction d (+1/-1), or i when there is none
export function nextShown(slides, i, d) {
  for (let j = i + d; j >= 0 && j < slides.length; j += d) if (!slides[j].hidden) return j
  return i
}
export { clickSteps, revealed, stepOf, untilOf, markItems, codeStage, codeStages, notesParts } from '../present/clicks.js'
// next (d = 1) or back (-1) while presenting: reveal or hide a step first, then change the slide;
// arriving backwards shows all of the slide's steps (as in Slidev)
export function stepMove(slides, i, k, d) {
  const n = clickSteps(slides[i]).length
  k = Math.min(k, n)
  if (d > 0 ? k < n : k > 0) return { slide: i, step: k + d }
  const j = nextShown(slides, i, d)
  return { slide: j, step: j === i ? k : d > 0 ? 0 : clickSteps(slides[j]).length }
}

// Replaces the open project's content (keeps its id).
export function loadDeck(d) {
  if (!Array.isArray(d?.slides)) throw new Error(t('Not a valid project file'))
  if (d.styles) mergeTextStyles(d.styles)
  for (const [k, v] of Object.entries(d.assets || {})) if (/^data:(image|font|video|audio)\//.test(v)) deck.assets[k] = v
  deck.fonts = cleanFonts(d.fonts, deck.assets) // before the slides: their font references are checked against it
  if (d.files && typeof d.files === 'object') deck.files = Object.fromEntries(Object.entries(d.files).filter(([k, v]) => typeof v === 'string' && /^[\w.@/ -]+$/.test(k) && safePath(k)).map(([k, v]) => [safePath(k), v]))
  deck.title = String(d.title || t('Presentation')).slice(0, 200)
  deck.source = typeof d.source === 'string' ? d.source.slice(0, 200) : '' // Slidev folder it was imported from
  // an own theme the project file carries joins this browser's unless one with that id exists already;
  // an unknown id stays (shown in the default theme), so importing that theme later brings the look back
  if (d.themeDef && validThemeId(d.theme) && !THEMES[d.theme]) try { importTheme({ ...d.themeDef, id: d.theme }) } catch { /* broken definition: default look */ }
  deck.theme = validThemeId(d.theme) ? d.theme : DEFAULT_THEME
  setFormat(d.aspectRatio, d.canvasWidth)
  deck.transition = TRANSITIONS.includes(d.transition) ? d.transition : 'none'
  deck.duration = validDuration(d.duration) ? Math.round(d.duration) : 0 // planned talk length in seconds
  deck.rehearsals = cleanRehearsals(d.rehearsals)
  // project-wide type sizes in px (text, title, code); anything else is dropped
  // (from: the theme whose sizes were kept on a theme switch; line/liLine are unitless ratios)
  deck.typo = Object.fromEntries(Object.entries(d.typo || {}).filter(([k, v]) => k === 'from' ? validThemeId(v)
    : ['text', 'title', 'titleLine', 'h2', 'h3', 'code', 'codeLine'].includes(k) ? Number.isFinite(v) && v >= 4 && v <= 160
      : ['line', 'liLine'].includes(k) && Number.isFinite(v) && v > 0.5 && v < 4))
  deck.entry = /^[\w./-]+\.md$/.test(d.entry) ? d.entry.replace(/^\/+/, '') : 'slides.md'
  deck.slides = cleanSlides(d.slides, new Set())
  Object.assign(deck, setupLayouts(d, deck.slides, deck.files, deck.theme))
  // freshly imported slides: remember their content, so the Slidev export can tell if they changed
  for (const s of deck.slides) if (s.md != null) s.hash ??= slideHash(s)
  if (!deck.slides.length) deck.slides.push(newSlide())
  Object.assign(ui, { slide: 0, sel: [], editing: null, master: null })
}

export function newSlide(layout = 'default', elements) {
  return {
    id: uid(), layout, notes: '',
    elements: elements || [{ id: uid(), type: 'text', title: true, x: 56, y: 40, w: 868, h: 40, html: `<h1>${t('Title')}</h1>` }],
  }
}

// slides plus the master and the layouts: their images count as used too, and so do the project's fonts
const withLayers = d => [...d.slides, { elements: d.master || [] }, ...(d.layouts || []), { elements: Object.keys(d.fonts || {}).map(asset => ({ asset })) }]
const assetIds = slides => {
  const used = new Set()
  for (const s of slides) if (s.bg?.asset) used.add(s.bg.asset)
  for (const s of slides) for (const e of s.elements || []) {
    if (e.asset) used.add(e.asset)
    for (const m of JSON.stringify(e.html || e.rows || '').matchAll(/data-asset=\\?"([^"\\]+)/g)) used.add(m[1])
  }
  return used
}
export const usedAssets = (slides = deck.slides) => {
  const used = assetIds(withLayers({ ...deck, slides }))
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
const snapshot = () => JSON.stringify({ title: deck.title, source: deck.source, typo: deck.typo, theme: deck.theme, aspectRatio: deck.aspectRatio, canvasWidth: deck.canvasWidth, transition: deck.transition, duration: deck.duration, rehearsals: deck.rehearsals, entry: deck.entry, slides: deck.slides, master: deck.master, layouts: deck.layouts, fonts: deck.fonts })
export const deckData = () => JSON.parse(snapshot())
// slides: only these (export of one deck)
export const deckFile = slides => JSON.stringify({ format: 'slides-builder', version: 1, ...JSON.parse(snapshot()), ...(slides && { slides: toRaw(slides) }), assets: usedAssets(slides), files: toRaw(deck.files), styles: usedStyles(slides || deck.slides), themeDef: themeDef(deck.theme) })

const MIME = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp' }
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
  let path = '/images/' + (file.name || 'image.png').replace(/[^\w.-]+/g, '_')
  if (deck.slides.some(s => s.elements.some(e => e.src === path))) path = path.replace(/([^/]+)$/, id + '-$1')
  return { id, path, size }
}
// stores a video or audio file (at most MEDIA_MAX: it lives in the browser's storage and in every saved file)
export const MEDIA_MAX = 50 * 1024 * 1024
export async function storeMedia(file) {
  if (file.size > MEDIA_MAX) throw new Error(t('{0}: video and audio files can be at most 50 MB', file.name))
  const id = uid(), name = (file.name || 'media').replace(/[^\w.-]+/g, '_')
  deck.assets[id] = await readDataUrl(file)
  let path = '/media/' + name
  if (deck.slides.some(s => s.elements.some(e => e.src === path))) path = '/media/' + id + '-' + name
  return { id, path, name: file.name || name }
}
// stores an uploaded font in the project (checked: font file, at most FONT_MAX); returns its FONTS key
export async function storeFont(file) {
  if (file.size > FONT_MAX) throw new Error(t('{0}: font files can be at most 5 MB', file.name))
  const bytes = new Uint8Array(await file.arrayBuffer()), type = fontType(bytes)
  const bad = () => new Error(t('{0}: not a font file (.woff2, .woff, .ttf or .otf)', file.name))
  if (!type) throw bad()
  await new FontFace('check', bytes).load().catch(() => { throw bad() }) // the right first bytes, but a broken file
  const id = uid()
  deck.assets[id] = await readDataUrl(new Blob([bytes], { type }))
  deck.fonts = { ...deck.fonts, [id]: fontLabel(file.name, Object.values(FONTS).map(f => f[0])) }
  return id
}
export const removeFont = id => { const { [id]: _, ...rest } = deck.fonts; deck.fonts = rest }
// FONTS lists the open project's fonts; sync: loadDeck checks the slides' font references right after setting them
watch(() => deck.fonts, setOwnFonts, { flush: 'sync' })

// --- undo/redo: snapshots of everything except assets ---
const history = []
let at = -1 // position of the current state in history
// a change is written (history + IndexedDB) 300 ms after the last edit; flush() writes it now.
// The watch only sets `due`: the snapshot (JSON of the whole deck) is built here, not on every pointermove
let timer, due = false
// used assets of the last asset write: images come and go with edits and undo, so a changed set is written again
let assetKey = null
let quiet = false // undo/redo just set the deck to a history state
const usedKey = () => Object.keys(usedAssets()).sort().join('\0')
function flush() {
  clearTimeout(timer)
  if (!due || !deck.id) { due = false; return }
  due = false
  const json = snapshot()
  if (json !== history[at]) {
    // the state before this change, at most every SNAP_EVERY while editing
    if (history[at] && Date.now() - lastSnap >= SNAP_EVERY) saveSnapshot(history[at]).catch(snapFailed)
    history.splice(at + 1, Infinity, json) // a new change discards the redo states
    if (history.length > 200) history.shift()
    at = history.length - 1
  }
  persist(json)
  if (usedKey() !== assetKey) persistAssets()
}
const dirty = () => due // an edit not yet in history (may turn out to change nothing)
export function undo(step = -1) {
  flush() // an edit of the last 300 ms is its own step
  if (!history[at + step]) return
  at += step
  const d = JSON.parse(history[at])
  // show what changed: the first slide that differs, with its changed elements selected
  const old = deck.slides.map(s => JSON.stringify(s))
  let i = 0
  while (i < Math.max(old.length, d.slides.length) && JSON.stringify(d.slides[i]) === old[i]) i++
  const changed = i < Math.max(old.length, d.slides.length)
  i = Math.max(0, Math.min(changed ? i : ui.slide, d.slides.length - 1))
  const before = deck.slides[i], after = d.slides[i]
  const prev = new Map(before?.id === after?.id ? before.elements.map(e => [e.id, JSON.stringify(e)]) : [])
  const sel = changed && prev.size ? after.elements.filter(e => JSON.stringify(e) !== prev.get(e.id)).map(e => e.id) : []
  for (const k of ['title', 'source', 'typo', 'theme', 'transition', 'duration', 'rehearsals', 'entry', 'slides', 'master', 'layouts', 'fonts']) if (k in d) deck[k] = d[k]
  if (ui.master && ui.master !== 'master' && !deck.layouts.some(l => l.id === ui.master)) ui.master = 'master' // the layout being edited is gone
  setFormat(d.aspectRatio, d.canvasWidth)
  Object.assign(ui, { slide: i, sel, editing: null })
  // saved right away; the watch must not count this as a new edit (it would grey out Redo for 300 ms)
  persist(history[at])
  if (usedKey() !== assetKey) persistAssets()
  quiet = true
  Promise.resolve().then(() => { quiet = false }) // after Vue's watcher flush, which was queued by the changes above
}
export const redo = () => undo(1)
// a freshly opened project: its loaded state is the first entry, so the first change can be undone.
// Not left to the watch below: on startup the last project opens before that watch exists.
function startHistory() {
  history.length = 0
  history.push(snapshot())
  at = 0
  lastSnap = 0 // the first change keeps the state the project was opened with
}
export const canUndo = () => at > 0 || dirty()
export const canRedo = () => !dirty() && at < history.length - 1

// --- persistence: IndexedDB (images blow past localStorage's ~5 MB) ---
const db = new Promise((res, rej) => {
  const r = indexedDB.open('slides-builder', 2)
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv') }
  r.onsuccess = () => res(r.result)
  r.onerror = () => rej(r.error)
})
// Safari otherwise clears site storage after 7 days without a visit
globalThis.navigator?.storage?.persist?.().catch(() => {})
// done when the transaction commits: a full disk (QuotaExceededError) aborts it after the request already succeeded
const idb = (mode, fn) => db.then(d => new Promise((res, rej) => {
  const tx = d.transaction('kv', mode), rq = fn(tx.objectStore('kv'))
  tx.oncomplete = () => res(rq.result)
  tx.onerror = tx.onabort = () => rej(tx.error || rq.error)
}))
const get = k => idb('readonly', s => s.get(k))
const put = (k, v) => idb('readwrite', s => s.put(v, k))
const del = k => idb('readwrite', s => s.delete(k))
const saveFailed = e => { ui.save = 'failed'; ui.status = t('Saving in the browser failed – please save as a file! ({0})', e.message) }
// the open project holds a lock: a second tab with the same project says so (both would save over each other)
let unlock = () => {}
const claim = id => {
  unlock()
  navigator.locks?.request('slidecko:' + id, { ifAvailable: true }, lock => {
    if (!lock) { ui.status = t('This project is also open in another tab. Edit it in one tab only: each tab saves its own state.'); return }
    return new Promise(r => { unlock = r })
  }).catch(() => {})
}
const remember = id => { try { localStorage.setItem('slides-builder:last', id) } catch {} claim(id) }

function meta() {
  return { id: deck.id, title: deck.title, source: deck.source, theme: deck.theme, slides: deck.slides.length, decks: decks.value.filter(d => d.file !== deck.entry).length, updated: Date.now() }
}
// The project list is shared by all tabs: each write merges into the stored list in one transaction,
// adding what this tab created and dropping what it deleted. Entries this tab only has in memory are
// never written back, so a project deleted in another tab stays deleted.
const added = new Set(), removed = new Set()
// stored ∪ added − removed; own(id): this tab's meta replaces the stored one (open or renamed project)
export function mergeList(stored, mine, { added, removed, own }) {
  const have = new Set(stored.map(p => p?.id))
  return [
    ...[...added].filter(id => id && !have.has(id) && mine.has(id) && !removed.has(id)).map(id => mine.get(id)),
    ...stored.filter(p => p && !removed.has(p.id)).map(p => (own(p.id) && mine.has(p.id) ? mine.get(p.id) : p)),
  ].sort((a, b) => (b.updated || 0) - (a.updated || 0))
}
async function saveList(changed) { // changed: meta of a project this tab renamed
  const d = await db
  await new Promise((res, rej) => {
    const tx = d.transaction('kv', 'readwrite'), store = tx.objectStore('kv'), rq = store.get('projects')
    rq.onsuccess = () => {
      let stored
      try { stored = JSON.parse(rq.result || '[]') } catch { stored = [] }
      if (!Array.isArray(stored)) stored = []
      const mine = new Map(library.list.map(p => [p.id, p]))
      if (changed) mine.set(changed.id, changed)
      const list = mergeList(stored, mine, { added: new Set([...added, deck.id]), removed, own: id => id === deck.id || id === changed?.id })
      const written = [...added]
      // deleted in another tab while still open here: its images and files were deleted too
      const revived = deck.id && !added.has(deck.id) && !removed.has(deck.id) && !stored.some(p => p?.id === deck.id)
      store.put(JSON.stringify(list), 'projects')
      tx.oncomplete = () => {
        if (revived) persistAssets()
        for (const id of written) added.delete(id)
        const now = library.list.find(p => p.id === deck.id) // may be newer than the one just written
        library.list = list.map(p => (p.id === deck.id && now) || p)
        res()
      }
    }
    tx.onerror = tx.onabort = () => rej(tx.error || rq.error)
  })
}
const reloadList = async () => { try { library.list = JSON.parse((await get('projects')) || '[]') } catch {} }
let saving = Promise.resolve(), pending = 0, assetsFailed = false
// every write goes through here: the title bar shows whether the browser copy is up to date.
// A failed image write stays visible until a later image write succeeds (a slide save does not cover it)
const queue = (job, assets) => {
  pending++
  ui.save = 'saving'
  saving = saving.then(job).then(() => {
    if (assets) assetsFailed = false
    if (!--pending) ui.save = assetsFailed ? 'failed' : 'saved'
  }, e => {
    pending--
    if (assets) { assetsFailed = true; assetKey = null } // written again with the next change
    saveFailed(e)
  })
}
// closing the tab while a write is still running would lose it
globalThis.addEventListener?.('beforeunload', e => { if (pending || ui.save === 'failed') e.preventDefault() }) // failed: the only current copy is in this tab
// after a release an open page asks for code files that are gone (new names): save, then reload once to get the
// new ones; false when it just did (within a minute), so a real outage does not reload forever
export function reloadForUpdate() {
  if (navigator.onLine === false) return false // offline a part is missing because of the connection, not a release
  try {
    if (+sessionStorage.getItem('slides-builder:reloaded') > Date.now() - 60000) return false
    sessionStorage.setItem('slides-builder:reloaded', Date.now())
  } catch { return false }
  flush()
  const go = () => (pending ? setTimeout(go, 100) : location.reload())
  go()
  return true
}
// the browsers' messages for a module that could not be loaded
export const staleChunk = e => /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(String(e?.message || e))
function persist(json) {
  if (!deck.id) return
  const m = meta(), id = m.id // the job may run after a switch to another project
  library.list = [m, ...library.list.filter(p => p.id !== id)]
  queue(() => Promise.all([put('p:' + id, json), saveList(m)]))
}
function persistAssets() {
  if (!deck.id) return
  const assets = usedAssets(), id = deck.id, files = toRaw(deck.files)
  assetKey = Object.keys(assets).sort().join('\0')
  queue(() => Promise.all([put('a:' + id, assets), put('f:' + id, files)]), true)
}

// opens a stored project
// returns false (and drops it from the list) when the project is gone, e.g. deleted in another tab
export async function openProject(id) {
  flush() // the last 300 ms of edits belong to the project being left
  await saving // a read started before the queued writes would get the old state (the same project opened again)
  const [json, assets, files] = await Promise.all([get('p:' + id), get('a:' + id), get('f:' + id)])
  if (!json) {
    library.list = library.list.filter(p => p.id !== id)
    removed.add(id)
    ui.status = t('Project not found')
    await saveList().catch(saveFailed)
    return false
  }
  const data = JSON.parse(json) // a broken record throws here, before the open project is touched
  deck.assets = {}
  deck.files = {}
  deck.id = id
  loadDeck({ ...data, assets, files })
  startHistory()
  assetKey = usedKey() // what a: holds
  ui.home = false
  remember(id)
  return true
}
// creates a project from deck data (import, file, template); replace: id of a project to overwrite
export async function createProject(d, replace) {
  flush()
  deck.assets = {}
  deck.files = {}
  deck.id = replace || uid()
  added.add(deck.id)
  removed.delete(deck.id)
  loadDeck(d)
  startHistory()
  ui.home = false
  remember(deck.id)
  persist(snapshot())
  persistAssets()
  await saving
}
export async function removeProject(id) {
  if (deck.id === id) {
    // no pending or running write may bring it back after the delete
    clearTimeout(timer)
    due = false
    deck.id = ''
    unlock()
    ui.home = true
    await saving
  }
  library.list = library.list.filter(p => p.id !== id)
  removed.add(id)
  added.delete(id)
  await Promise.all([del('p:' + id), del('a:' + id), del('f:' + id), del('s:' + id), saveList()])
}
// the open project's latest edits must be in storage before it is read from there
const settled = () => { flush(); return saving }
export async function duplicateProject(id) {
  await settled()
  const [json, assets, files] = await Promise.all([get('p:' + id), get('a:' + id), get('f:' + id)])
  if (!json) throw new Error(t('Project not found'))
  const d = JSON.parse(json)
  await createProject({ ...d, title: t('{0} (copy)', d.title || t('Presentation')), assets, files })
}

// renames a stored project without opening it (the open one: through deck.title, saved as usual)
export async function renameProject(id, title) {
  title = String(title).trim().slice(0, 200)
  if (!title) return
  if (id === deck.id) { deck.title = title; return }
  const json = await get('p:' + id)
  if (!json) throw new Error(t('Project not found'))
  const m = { ...library.list.find(p => p.id === id), id, title, updated: Date.now() }
  library.list = library.list.map(p => (p.id === id ? m : p))
  await Promise.all([put('p:' + id, JSON.stringify({ ...JSON.parse(json), title })), saveList(m)])
}
// the same .slides.json as deckFile(), read straight from storage without opening the project
export async function projectFile(id) {
  await settled()
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
  await createProject(older ? { ...d, title: (d.title || t('Presentation')) + ' ' + t('(older backup)') } : d, older ? undefined : id || undefined)
  return have ? (older ? 'copy' : 'replaced') : 'new'
}

// --- snapshots (version history): s:<id> = { list: [{ at, slides, json }] newest first, assets: the images they use } ---
export const SNAP_MAX = 30, SNAP_EVERY = 5 * 60e3
let lastSnap = 0
// newest first, at most max; the same content as the newest one is not kept twice
export const addSnap = (list, s, max = SNAP_MAX) => (list[0]?.json === s.json ? list : [s, ...list]).sort((a, b) => b.at - a.at).slice(0, max)
// only the images a kept snapshot still uses (a deleted image stays restorable while one does)
export const snapAssets = (list, assets) => {
  const used = new Set(list.flatMap(s => { const d = JSON.parse(s.json); return [...assetIds(withLayers({ ...d, slides: d.slides || [] }))] }))
  return Object.fromEntries(Object.entries(assets || {}).filter(([k]) => used.has(k)))
}
const snapFailed = e => { ui.status = t('Snapshot could not be stored ({0}). The project itself is saved as usual.', e.message) }
const readSnaps = async id => { const v = await get('s:' + id); return { list: Array.isArray(v?.list) ? v.list : [], assets: v?.assets || {} } }
// its own record and transaction: a full disk fails the snapshot, never the project save.
// After the queued project writes, so a delete of the project cannot be undone by a late snapshot.
// shortcut: read-modify-write, two tabs snapshotting the same project at once can drop one snapshot
function changeSnaps(fn, extra = {}) {
  const id = deck.id, mine = { ...toRaw(deck.assets), ...extra } // in memory: also images deleted since the snapshot's state
  const p = saving.then(async () => {
    const v = await readSnaps(id), list = fn(v.list)
    await put('s:' + id, { list, assets: snapAssets(list, { ...v.assets, ...mine }) })
  })
  saving = p.catch(() => {})
  return p
}
export function saveSnapshot(json = snapshot()) {
  if (!deck.id) return Promise.resolve()
  lastSnap = Date.now()
  return changeSnaps(list => addSnap(list, { at: lastSnap, slides: JSON.parse(json).slides.length, json }))
}
export async function listSnapshots() {
  await saving
  return deck.id ? (await readSnaps(deck.id)).list.map(({ at, slides }) => ({ at, slides })) : []
}
// every snapshot with its JSON, oldest first, and the images they use (the Git export makes a commit of each)
export async function snapshotsWithData() {
  await saving
  const v = deck.id ? await readSnaps(deck.id) : { list: [], assets: {} }
  return { list: [...v.list].sort((a, b) => a.at - b.at), assets: v.assets }
}
// older versions from elsewhere (a Git history) as snapshots of the open project, with the images they use
export const importSnapshots = (snaps, assets) => changeSnaps(list => snaps.reduce((l, s) => addSnap(l, s), list), assets)
export const deleteSnapshot = at => changeSnaps(list => list.filter(s => s.at !== at))
// the current state becomes a snapshot first, so a restore can itself be restored (and undone: it is a normal edit)
export async function restoreSnapshot(at) {
  await settled()
  const id = deck.id, v = await readSnaps(id), s = v.list.find(s => s.at === at)
  if (!s) throw new Error(t('Snapshot not found'))
  await saveSnapshot() // read before: this may drop the oldest one, the one being restored
  if (deck.id !== id) return
  const slide = ui.slide
  loadDeck({ ...JSON.parse(s.json), assets: v.assets, files: toRaw(deck.files) })
  ui.slide = Math.min(slide, deck.slides.length - 1)
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
    if (!deck.id && open && !(await openProject(open))) ui.status = '' // gone: the overview, no message on startup
  } catch (e) {
    ui.status = t('Saved projects could not be loaded: {0}', e.message)
  }
  if (!deck.id || session.home) ui.home = true

  // only marks the change: serializing the deck on every drag frame would be too slow (flush does it)
  watch(() => [deck.title, deck.source, deck.typo, deck.theme, deck.aspectRatio, deck.canvasWidth, deck.transition, deck.duration, deck.rehearsals, deck.entry, deck.slides, deck.master, deck.layouts, deck.fonts], () => {
    if (quiet) return
    clearTimeout(timer)
    due = true
    timer = setTimeout(flush, 300)
  }, { deep: true })
  // iOS shows no warning when a tab closes and freezes hidden pages: save the moment the page goes away
  // back on the overview: other tabs may have added or deleted projects meanwhile
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); else if (ui.home) reloadList() })
  addEventListener('pagehide', flush)
  addEventListener('beforeunload', flush, true) // runs before the warning check above, so it sees the write as pending
}
