import { toggleList } from './lists.js'
import { computed, nextTick, ref } from 'vue'
import { W, H, deck, ui, uid, cleanEl, regroup, cleanSlides, newSlide, storeImage, deckData, deckFile, createProject, fileOf, decks, deckName, readDataUrl, imageSize, cleanCrop, library, projectFile, restoreProject, safePath, shownSlides, removeLayout } from './store.js'
import { ELEMENTS } from './presets.js'
import { importSlidev } from './importSlidev.js'
import { formatSize, parseRatio } from './format.js'
import { THEMES } from './themes.js'
import { t, lang } from './i18n.js'
import { toSlidev, slideToMarkdown, slideHash, flowHash, flowable, imagePath, layoutOf } from './toSlidev.js'
import { withSolutions } from './quiz.js'
// import/export libraries load on first use, so they stay out of the startup bundle
const loadZip = async () => (await import('jszip')).default
const importPptx = async (...a) => (await import('./importOffice.js')).importPptx(...a)
const importOdp = async (...a) => (await import('./importOffice.js')).importOdp(...a)
const importPdf = async (...a) => (await import('./importOffice.js')).importPdf(...a)
const exportPptx = async (...a) => (await import('./exportPptx.js')).exportPptx(...a)
const slideImages = async (...a) => (await import('./exportFormats.js')).slideImages(...a)
const htmlDeck = async (...a) => (await import('./exportFormats.js')).htmlDeck(...a)
const htmlZip = async (...a) => (await import('./exportFormats.js')).htmlZip(...a)
const flattenBackgrounds = async (...a) => (await import('./exportFormats.js')).flattenBackgrounds(...a)

// Everything the UI can do. Menus, keyboard shortcuts, the command palette and the inspector all
// call these, so behaviour is the same wherever an action is triggered.

// ui.master: the master ('master') or a layout (its id) is edited instead of the slide: the canvas, selection and
// element tools then work on its elements
export const slide = computed(() => (ui.master === 'master' ? { id: 'master', layout: 'default', elements: deck.master } : ui.master && deck.layouts.find(l => l.id === ui.master)) || deck.slides[ui.slide])
export const selection = computed(() => slide.value?.elements.filter(e => ui.sel.includes(e.id)) || [])
export const primary = computed(() => slide.value?.elements.find(e => e.id === ui.sel.at(-1)))

let toastTimer
export function toast(msg, ms = 4000) {
  ui.status = msg
  clearTimeout(toastTimer)
  if (ms) toastTimer = setTimeout(() => { if (ui.status === msg) ui.status = '' }, ms)
}
// runs a user action; failures are shown instead of swallowed
export async function run(fn) {
  try { return await fn() } catch (e) { console.error(e); toast(t('Error: {0}', e.message), 8000) }
}

// --- elements ---
export function addElement(el) {
  el = { ...el, id: uid() }
  slide.value.elements.push(el)
  ui.sel = [el.id]
  return el
}
export const insert = (kind, ...args) => addElement(ELEMENTS[kind](...args))
export const addImages = files => run(async () => {
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue
    const { id, path, size } = await storeImage(f)
    const k = Math.min(1, 420 / size.w, 320 / size.h)
    const w = Math.round(size.w * k), h = Math.round(size.h * k)
    addElement({ type: 'image', asset: id, src: path, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h })
  }
})
export async function replaceImage(el, file) {
  const { id, path } = await storeImage(file)
  Object.assign(el, { asset: id, src: path })
  delete el.crop // fractions of the old picture mean nothing for the new one
}

// --- image crop ---
// The box shows the visible part; el.crop says which part of the picture that is ({x, y, w, h} as fractions).
// ui.crop: the image in crop mode; ui.cropRatio: the fixed aspect ratio there ('orig', '1:1', '4:3', … or null = free)
export const CROP_RATIOS = [[null, 'Free'], ['orig', 'Original'], ['1:1', '1:1'], ['4:3', '4:3'], ['3:2', '3:2'], ['16:9', '16:9'], ['3:4', '3:4'], ['9:16', '9:16']]
const FULL = { x: 0, y: 0, w: 1, h: 1 }
// the whole picture in slide units, as placed by the current crop
export function cropFull(el) {
  const c = el.crop || FULL, w = el.w / c.w, h = el.h / c.h
  return { x: el.x - c.x * w, y: el.y - c.y * h, w, h }
}
export function cropRatioValue(el, key = ui.cropRatio) {
  if (!key) return null
  if (key === 'orig') { const F = cropFull(el); return F.w / F.h }
  const [a, b] = key.split(':').map(Number)
  return a / b
}
// b: the new visible box (slide units) inside the picture F; the crop follows from the rounded box,
// so the picture keeps its exact size and place
export function applyCrop(el, F, b) {
  const x = Math.round(b.x), y = Math.round(b.y), w = Math.max(8, Math.round(b.w)), h = Math.max(8, Math.round(b.h))
  Object.assign(el, { x, y, w, h, crop: { x: (x - F.x) / F.w, y: (y - F.y) / F.h, w: w / F.w, h: h / F.h } })
}
export async function startCrop(el) {
  if (!el || el.type !== 'image' || el.locked) return
  if (ui.crop && ui.crop !== el.id) endCrop()
  ui.editing = null
  ui.sel = [el.id]
  if (!el.crop) {
    // the picture as shown (object-fit: contain) becomes the box, so cropping starts from what is visible
    const n = await imageSize(deck.assets[el.asset]), k = Math.min(el.w / n.w, el.h / n.h)
    const w = Math.round(n.w * k), h = Math.round(n.h * k)
    Object.assign(el, { x: Math.round(el.x + (el.w - w) / 2), y: Math.round(el.y + (el.h - h) / 2), w, h })
  }
  ui.cropRatio = null
  ui.crop = el.id
}
export function endCrop() {
  const el = [slide.value, ...deck.slides].flatMap(s => s?.elements || []).find(e => e.id === ui.crop)
  if (el) { const c = cleanCrop(el.crop); if (c) el.crop = c; else delete el.crop }
  ui.crop = null
  ui.cropRatio = null
}
// a fixed ratio: the largest box of that shape inside the picture, centred on the current box
export function setCropRatio(el, key) {
  ui.cropRatio = key
  const k = cropRatioValue(el, key)
  if (!k) return
  const F = cropFull(el), w = Math.min(F.w, F.h * k), h = w / k
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b)
  applyCrop(el, F, { x: clamp(el.x + el.w / 2 - w / 2, F.x, F.x + F.w - w), y: clamp(el.y + el.h / 2 - h / 2, F.y, F.y + F.h - h), w, h })
}
// the whole picture again (in crop mode: keep cropping from there; otherwise the crop is gone)
export function resetCrop(el) {
  applyCrop(el, cropFull(el), cropFull(el))
  ui.cropRatio = null
  if (ui.crop !== el.id) delete el.crop
}
function pasteElements(list, offset = 16) {
  const added = regroup(list.map(cleanEl).filter(Boolean).map(e => ({ ...e, x: e.x + offset, y: e.y + offset })))
  slide.value.elements.push(...added)
  ui.sel = added.map(e => e.id)
}
export const duplicate = () => selection.value.length && pasteElements(JSON.parse(JSON.stringify(selection.value)))
export function remove() {
  slide.value.elements = slide.value.elements.filter(e => !ui.sel.includes(e.id))
  ui.sel = []
  ui.editing = null
}
export const selectAll = () => { ui.sel = slide.value.elements.map(e => e.id) }
// a group is a shared id on its members: a click on one selects all, then they act as a multi-selection
export function group() { if (selection.value.length < 2) return; const g = uid(); for (const e of selection.value) e.group = g }
export const ungroup = () => { for (const e of selection.value) delete e.group }

// --- arrangement ---
export function order(where) {
  const els = slide.value.elements, sel = els.filter(e => ui.sel.includes(e.id)), rest = els.filter(e => !ui.sel.includes(e.id))
  if (where === 'front') slide.value.elements = [...rest, ...sel]
  else if (where === 'back') slide.value.elements = [...sel, ...rest]
  else for (const e of where === 'forward' ? [...sel].reverse() : sel) {
    const i = els.indexOf(e), j = i + (where === 'forward' ? 1 : -1)
    if (j >= 0 && j < els.length && !ui.sel.includes(els[j].id)) [els[i], els[j]] = [els[j], els[i]]
  }
}
// --- format painter: the look of one element onto others (⌘⌥C / ⌘⌥V or the brush in the inspector) ---
const LOOK = {
  text: ['shadow', 'font', 'fontSize', 'color', 'fill', 'fillAlpha', 'stroke', 'strokeWidth', 'strokeStyle', 'align', 'valign'],
  shape: ['shadow', 'fill', 'fillAlpha', 'stroke', 'strokeWidth', 'radius'],
  code: ['shadow', 'fontSize', 'fill', 'fillAlpha', 'radius'],
  image: ['shadow', 'radius'],
}
export function copyLook() {
  const e = primary.value
  if (!LOOK[e?.type]) return toast(t('Select a text box, shape, code block or image to copy its formatting.'))
  ui.look = Object.fromEntries(LOOK[e.type].map(k => [k, e[k]]))
  toast(t('Formatting copied – apply it to the selection with ⌘⌥V.'))
}
// only what both kinds have (a text box's fill onto a shape, …); "no fill" is 'none' on shapes, unset elsewhere
export function pasteLook(els = selection.value) {
  if (!ui.look) return toast(t('Copy formatting first.'))
  for (const e of els) for (const k of LOOK[e.type] || []) {
    if (!(k in ui.look)) continue
    let v = ui.look[k]
    if (k === 'fill' && e.type === 'shape') v ??= 'none'
    else if ((k === 'fill' || k === 'stroke') && v === 'none') v = undefined
    if (k === 'stroke' && e.type === 'shape') v ??= 'none'
    if (v === undefined) delete e[k]; else e[k] = v
  }
}
// the brush: copies the selection's format, the next click on an element receives it
export function paint() {
  if (ui.painting) return (ui.painting = false)
  copyLook()
  if (ui.look) { ui.painting = true; toast(t('Click an element to apply the formatting (Esc cancels).')) }
}

// aligns the selection to its common bounds, or to the slide (one element always)
export function align(kind, toSlide = false) {
  const sel = selection.value.filter(e => !e.locked) // locked elements stay put
  if (!sel.length) return
  const b = sel.length > 1 && !toSlide ? bounds(sel) : { x: 0, y: 0, r: W, b: H }
  const before = JSON.stringify(sel.map(e => [e.x, e.y]))
  for (const e of sel) {
    if (kind === 'left') e.x = b.x
    if (kind === 'center') e.x = Math.round((b.x + b.r - e.w) / 2)
    if (kind === 'right') e.x = b.r - e.w
    if (kind === 'top') e.y = b.y
    if (kind === 'middle') e.y = Math.round((b.y + b.b - e.h) / 2)
    if (kind === 'bottom') e.y = b.b - e.h
  }
  // nothing moved (e.g. a full-width box is already centred): say so instead of doing nothing visibly
  if (JSON.stringify(sel.map(e => [e.x, e.y])) === before) toast(t(sel.length > 1 ? 'The elements are already aligned this way.' : 'The element is already aligned this way on the slide.'))
}
const bounds = els => ({ x: Math.min(...els.map(e => e.x)), y: Math.min(...els.map(e => e.y)), r: Math.max(...els.map(e => e.x + e.w)), b: Math.max(...els.map(e => e.y + e.h)) })
export function distribute(axis) {
  const sel = selection.value.filter(e => !e.locked).sort((a, b) => (axis === 'h' ? a.x - b.x : a.y - b.y))
  if (sel.length < 3) return toast(t('Select at least three elements to distribute.'))
  const pos = axis === 'h' ? 'x' : 'y', size = axis === 'h' ? 'w' : 'h'
  const total = sel.reduce((s, e) => s + e[size], 0)
  const span = sel.at(-1)[pos] + sel.at(-1)[size] - sel[0][pos]
  const gap = (span - total) / (sel.length - 1)
  let p = sel[0][pos]
  for (const e of sel) { e[pos] = Math.round(p); p += e[size] + gap }
}
export function nudge(dx, dy) {
  for (const e of selection.value) if (!e.locked) { e.x += dx; e.y += dy }
}

// --- text formatting (execCommand: the built-in editing that keeps arbitrary imported HTML) ---
export function format(cmd, arg) {
  document.execCommand('styleWithCSS', false, cmd === 'foreColor') // colours as <span style>, which the Markdown export keeps
  return document.execCommand(cmd, false, arg)
}
// bullets / numbering for the text being edited (execCommand breaks Markdown lists apart)
export function list(tag) {
  const n = getSelection().anchorNode
  const root = (n?.nodeType === 1 ? n : n?.parentElement)?.closest('[contenteditable=true]')
  if (root) toggleList(root, tag)
}
// after a format change (style, font size): the box's height becomes exactly its text's height
export async function fitHeight(el) {
  await nextTick()
  const c = document.querySelector(`.stage [data-el="${el.id}"] > .content`)
  if (!c) return
  c.style.minHeight = '0'
  const h = Math.ceil(c.offsetHeight)
  c.style.minHeight = ''
  if (h > 8) el.h = h
}

// --- slides ---
// a new slide from a project layout (default: "Title & content"): its placeholders, copied
export function addSlide(l = deck.layouts.find(x => x.id === 'content') || deck.layouts[0]) {
  ui.master = null
  const s = newSlide(l?.layout, l && regroup(l.elements.filter(e => e.placeholder).map(({ placeholder, ...e }) => ({ ...JSON.parse(JSON.stringify(e)), id: uid() }))))
  if (l) s.type = l.id
  if (flowable(s.elements)) s.flow = flowHash(s) // exported as plain Markdown until it is rearranged or styled
  s.file = slide.value ? fileOf(slide.value) : deck.entry // stays in the current deck
  deck.slides.splice(ui.slide + 1, 0, s)
  ui.slide++
  ui.sel = []
}
export function duplicateSlide(i = ui.slide) {
  if (ui.master) return
  const copy = { ...JSON.parse(JSON.stringify(deck.slides[i])), id: uid() }
  copy.elements = copy.elements.map(e => ({ ...e, id: uid() }))
  deck.slides.splice(i + 1, 0, copy)
  ui.slide = i + 1
}
export function toggleHidden(i = ui.slide) {
  const s = deck.slides[i]
  if (s.hidden) delete s.hidden
  else s.hidden = true
}
export function deleteSlide(i = ui.slide) {
  if (ui.master) return // the slide is not in view
  deck.slides.splice(i, 1)
  if (!deck.slides.length) deck.slides.push(newSlide())
  ui.slide = Math.min(i, deck.slides.length - 1)
  ui.sel = []
}
// --- master and layouts ---
export function editMaster(target = 'master') {
  if (ui.crop) endCrop()
  Object.assign(ui, { master: target, sel: [], editing: null })
}
// another layout for a slide: its content stays, its Slidev layout follows
export const setSlideLayout = (s, l) => Object.assign(s, { type: l.id, layout: l.layout })
// a blank layout or a copy of one; the new one is edited
export function addLayout(from) {
  const l = from ? { ...JSON.parse(JSON.stringify(from)), id: uid(), name: t('{0} (copy)', from.name) } : { id: uid(), name: t('New layout'), layout: 'default', elements: [] }
  l.elements = regroup(l.elements.map(e => ({ ...e, id: uid() })))
  deck.layouts.push(l)
  editMaster(l.id)
}
export function deleteLayout(id) {
  removeLayout(id)
  if (ui.master === id) editMaster('master')
}
// the layout's slides follow its new Slidev layout
export function setLayoutBase(l, base) {
  for (const s of deck.slides) if (layoutOf(s, deck.layouts) === l) s.layout = base
  l.layout = base
}
// a text box with a field (slide number, count, project title), bottom right
export const insertField = kind => addElement({ type: 'text', html: `<p><span data-field="${kind}">#</span></p>`, x: W - 216, y: H - 44, w: 160, h: 28, align: 'right', fontSize: 14 })

// file: the deck the slide was dropped into (it becomes part of it)
export function moveSlide(from, to, file) {
  if (to < 0 || to >= deck.slides.length) return
  const [s] = deck.slides.splice(from, 1)
  deck.slides.splice(to, 0, s)
  if (file) s.file = file
  ui.slide = to
}
export const go = i => { ui.slide = Math.max(0, Math.min(deck.slides.length - 1, i)) }

// --- decks (Foliensätze = Markdown files referenced from slides.md) ---
const fileName = name => {
  const used = new Set(deck.slides.map(fileOf))
  const nums = [...used].map(f => +(f.match(/^(\d+)_/)?.[1] || 0))
  const n = String(Math.max(0, ...nums) + 1).padStart(2, '0')
  let f = `${n}_${name.trim().replace(/[^\wäöüÄÖÜß-]+/g, '_') || 'Deck'}.md`
  while (used.has(f)) f = f.replace(/\.md$/, '_2.md')
  return f
}
export function addDeck(name = t('New deck')) {
  const file = fileName(name)
  const s = newSlide('intro', [{ id: uid(), type: 'text', title: true, x: 60, y: 210, w: 860, h: 80, html: `<h1>${name.replace(/</g, '&lt;')}</h1>` }])
  s.file = file
  s.fm = 'layout: intro'
  deck.slides.push(s)
  ui.slide = deck.slides.length - 1
  return file
}
export function renameDeck(file, name) {
  const [, dir = '', num = ''] = file.match(/^(.*\/)?(\d+_)?/)
  let next = dir + num + (name.trim().replace(/[^\wäöüÄÖÜß-]+/g, '_') || 'Deck') + '.md'
  while (next !== file && deck.slides.some(s => fileOf(s) === next)) next = next.replace(/\.md$/, '_2.md')
  for (const s of deck.slides) if (fileOf(s) === file) s.file = next
}
export function moveDeck(file, dir) {
  const list = decks.value
  const i = list.findIndex(d => d.file === file), j = i + dir
  if (j < 0 || j >= list.length || list[j].file === deck.entry) return
  const a = list[Math.min(i, j)], b = list[Math.max(i, j)]
  const sa = deck.slides.slice(a.start, a.start + a.count), sb = deck.slides.slice(b.start, b.start + b.count)
  deck.slides.splice(a.start, a.count + b.count, ...sb, ...sa)
  ui.slide = deck.slides.findIndex(s => fileOf(s) === file)
}
// drag & drop of a whole deck: group i goes in front of group j (j = groups.length: to the end)
export function moveDeckTo(i, j) {
  const list = decks.value, g = list[i]
  if (!g || j === i || j === i + 1) return
  const current = deck.slides[ui.slide]
  const moved = deck.slides.splice(g.start, g.count)
  const at = j >= list.length ? deck.slides.length : list[j].start - (j > i ? g.count : 0)
  deck.slides.splice(at, 0, ...moved)
  ui.slide = Math.max(0, deck.slides.indexOf(current))
}
export function removeDeck(file) {
  deck.slides = deck.slides.filter(s => fileOf(s) !== file)
  if (!deck.slides.length) deck.slides.push(newSlide())
  ui.slide = Math.min(ui.slide, deck.slides.length - 1)
}
export const slidesOf = file => deck.slides.filter(s => fileOf(s) === file)

// --- import ---
// counts: n(1, 'Slide', 'Slides') -> '1 Folie' (translated)
const n = (k, one, many) => { const w = t(k === 1 ? one : many); return `${k} ${lang.value === 'de' ? w : w.toLowerCase()}` } // English count nouns are lowercase
const isMd = f => f.name.endsWith('.md') && !f.webkitRelativePath?.includes('node_modules')
const rel = f => (f.webkitRelativePath ? f.webkitRelativePath.split('/').slice(1).join('/') : f.name)
export const filesMap = files => new Map(files.map(f => [rel(f), f]))
export const markdownFiles = files => files.filter(isMd)

// which files are embedded by others (they are decks, not entries)
export const byName = (a, b) => a.localeCompare(b, 'de', { numeric: true })
export async function entryCandidates(files) {
  const mds = markdownFiles(files)
  const embedded = new Set()
  for (const f of mds) for (const m of (await f.text()).matchAll(/^src:\s*(\S+)/gm)) embedded.add(m[1].replace(/^\.?\//, '').split('#')[0])
  return mds.map(rel).filter(p => !embedded.has(p)).sort((a, b) => (b === 'slides.md') - (a === 'slides.md') || byName(a, b))
}

async function importReport(r) {
  return t('{0} imported', n(r.slides.length, 'Slide', 'Slides')) + (r.missing ? ' · ' + t('{0} not found', n(r.missing, 'Image', 'Images')) : '') +
    (r.missingFiles.length ? ' · ' + t('missing files: {0}', r.missingFiles.join(', ')) : '')
}
// the editor theme matching a Slidev headmatter `theme:`
function detectTheme(md) {
  const head = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || ''
  const t = head.match(/^theme:\s*['"]?([^'"\s]+)/m)?.[1] || 'default'
  // a Slidev theme package one of the editor's themes stands for (e.g. an imported JBT Theme); a project-local theme: the first such theme
  const pkg = Object.keys(THEMES).filter(id => THEMES[id].slidev && !THEMES[id].draft)
  const hit = pkg.find(id => THEMES[id].slidev === t) || ((t.startsWith('.') || t.startsWith('/')) && pkg[0])
  if (hit) return hit
  if (/seriph/.test(t)) return 'serif'
  return /colorSchema:\s*dark/.test(head) ? 'dunkel' : 'hell'
}
const TEXT_FILE = /\.(vue|ts|js|mjs|cjs|css|scss|json|ya?ml|html|txt|md|sh)$|(^|\/)\.(gitignore|editorconfig|npmrc)$/
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|\.idea|\.vscode|pdf)\//
// the other files of a Slidev project (theme, components, package.json …) and the images their
// CSS uses, so an export is a working project again
async function projectFiles(files, slideFiles) {
  const out = {}
  let size = 0
  for (const f of files) {
    const p = rel(f)
    if (SKIP_DIR.test(p) || slideFiles.has(p) || !TEXT_FILE.test(p) || p === 'package-lock.json' || f.size > 500_000) continue
    if ((size += f.size) > 5_000_000) break
    out[p] = await f.text()
  }
  const map = filesMap(files)
  const urls = Object.values(out).join('\n').matchAll(/url\(['"]?\/?([^'")?#]+\.(?:png|jpe?g|svg|gif|webp|avif))/g)
  const favicon = Object.values(out).join('\n').match(/^favicon:\s*['"]?([^'"\s]+)/m)?.[1]
  for (const p of new Set([...[...urls].map(m => m[1]), ...(favicon ? [favicon] : [])])) {
    const f = map.get(p) || map.get('public/' + p)
    if (f) out[map.get(p) ? p : 'public/' + p] = await readDataUrl(f)
  }
  return out
}
// a whole Slidev project (entry file + embedded decks + images) as a new project
// replace: id of the project this import overwrites (same Slidev folder opened again)
export const importProject = (files, entry, replace) => run(async () => {
  toast(t('Importing …'), 0)
  const map = filesMap(files)
  const theme = detectTheme(await map.get(entry).text())
  const r = await importSlidev(entry, map, theme)
  if (r.slides[0]?.transition === r.transition) delete r.slides[0].transition // the headmatter's transition is the project default, not slide 1's own
  const slideFiles = new Set([entry, ...r.slides.map(s => s.file)])
  const source = files[0]?.webkitRelativePath?.split('/')[0] || ''
  await createProject({ title: source || entry.replace(/\.md$/, ''), source, theme, entry, aspectRatio: r.aspectRatio, canvasWidth: r.canvasWidth, transition: r.transition, slides: r.slides, assets: r.assets, files: await projectFiles(files, slideFiles) }, replace)
  toast(await importReport(r), 8000)
})
// presentations from other programs, one new project each: .pptx, .odp, .pdf, .html (own export), images (one slide each)
export const IMPORT_ACCEPT = '.pptx,.potx,.odp,.otp,.pdf,.html,.htm,.zip,image/*'
// what restoreProject did with the projects of one file, as a toast
function restored(name, how) {
  const c = k => how.filter(h => h === k).length
  toast(`${name}: ` + [c('new') && t('{0} loaded', n(c('new'), 'project', 'projects')), c('replaced') && t('{0} updated', n(c('replaced'), 'project', 'projects')),
    c('copy') && t('{0} as a copy (the browser has a newer version)', n(c('copy'), 'older backup', 'older backups'))].filter(Boolean).join(' · '), 8000)
}
export const importPresentations = files => run(async () => {
  const images = files.filter(f => f.type.startsWith('image/'))
  for (const f of files.filter(x => !images.includes(x))) {
    toast(t('Importing {0} …', f.name), 0)
    const ext = f.name.split('.').pop().toLowerCase()
    if (ext === 'json') { restored(f.name, [await restoreProject(JSON.parse(await f.text()))]); continue }
    if (ext === 'html' || ext === 'htm' || ext === 'zip') {
      // HTML export, or its ZIP variant (index.html + images/): images are read back from the ZIP
      const zip = ext === 'zip' && await (await loadZip()).loadAsync(f)
      const page = zip ? Object.values(zip.files).find(z => /(^|\/)index\.html$/.test(z.name)) : null
      // backup of all projects (exportAllProjects): one .slides.json per project
      const saved = zip && !page && Object.values(zip.files).filter(z => z.name.endsWith('.slides.json'))
      if (saved?.length) {
        const how = []
        for (const z of saved) how.push(await restoreProject(JSON.parse(await z.async('text'))))
        ui.home = true
        restored(f.name, how)
        continue
      }
      if (zip && !page) throw new Error(t('{0}: not an HTML presentation from Slidecko (index.html missing)', f.name))
      const html = zip ? await page.async('text') : await f.text()
      const json = new DOMParser().parseFromString(html, 'text/html').getElementById('slides-builder-project')?.textContent
      if (!json) throw new Error(t('{0}: only HTML presentations from Slidecko can be opened', f.name))
      const d = JSON.parse(json)
      for (const [id, v] of Object.entries(d.assets || {})) {
        if (typeof v !== 'string' || v.startsWith('data:')) continue
        const file = zip && zip.file(page.name.replace(/[^/]*$/, '') + v)
        if (!file) throw new Error(t('{0}: images missing – please import the ZIP file of the HTML export', f.name))
        d.assets[id] = await readDataUrl(Object.assign(await file.async('blob'), { name: v }))
      }
      await createProject(d)
      toast(t('{0} opened from {1}', n(d.slides.length, 'Slide', 'Slides'), f.name), 8000)
      continue
    }
    const read = { pptx: importPptx, potx: importPptx, odp: importOdp, otp: importOdp, pdf: file => importPdf(file, (i, k) => toast(t('{0}: page {1} of {2} …', f.name, i, k), 0)) }[ext]
    if (!read) throw new Error(t('{0}: format .{1} is not supported', f.name, ext))
    const r = await read(f)
    await createProject({ ...r, theme: 'hell', entry: 'slides.md', files: {} })
    toast(t('{0} imported from {1}', n(r.slides.length, 'Slide', 'Slides'), f.name) + (ext === 'pdf' ? ' ' + t('(as images)') : ''), 8000)
  }
  if (!images.length) return
  const assets = {}, slides = []
  for (const f of [...images].sort((a, b) => byName(a.name, b.name))) {
    const id = uid(), data = await readDataUrl(f), size = await imageSize(data) // not storeImage: that adds to the open project
    assets[id] = data
    const path = '/images/' + id + '-' + f.name.replace(/[^\w.-]+/g, '_')
    const { w: SW, h: SH } = formatSize(16 / 9, 980) // the new project's default format, not the open project's
    const k = Math.min(SW / size.w, SH / size.h), w = Math.round(size.w * k), h = Math.round(size.h * k)
    slides.push({ layout: 'default', elements: [{ type: 'image', asset: id, src: path, x: Math.round((SW - w) / 2), y: Math.round((SH - h) / 2), w, h }] })
  }
  await createProject({ title: images.length === 1 ? images[0].name.replace(/\.\w+$/, '') : t('Images'), theme: 'hell', slides, assets })
  toast(t('{0} created from images', n(slides.length, 'Slide', 'Slides')), 8000)
})
// presentations dropped into the editor: their slides go in after the current one, in its deck.
// .pptx/.odp/.pdf/.slides.json are appended; HTML exports and ZIPs open as their own project, as on Home
export const appendPresentations = files => run(async () => {
  const read = { pptx: importPptx, potx: importPptx, odp: importOdp, otp: importOdp, pdf: importPdf, json: async f => JSON.parse(await f.text()) }
  let pos = ui.slide + 1
  for (const f of files) {
    const ext = f.name.split('.').pop().toLowerCase()
    if (!read[ext]) { await importPresentations([f]); continue }
    toast(t('Importing {0} …', f.name), 0)
    const r = await read[ext](f, (i, k) => toast(t('{0}: page {1} of {2} …', f.name, i, k), 0))
    if (!Array.isArray(r?.slides)) throw new Error(t('Not a valid project file'))
    for (const [k, v] of Object.entries(r.assets || {})) if (!deck.assets[k] && typeof v === 'string' && /^data:image\//.test(v)) deck.assets[k] = v
    const file = deck.slides[pos - 1]?.file
    const slides = cleanSlides(r.slides).map(s => ({ ...s, file }))
    // another slide size: scaled to fit and centred
    // shortcut: font sizes set inside the text markup do not scale; fine for the usual 4:3 into 16:9
    const src = formatSize(parseRatio(r.aspectRatio) || 16 / 9, +r.canvasWidth || 980)
    const k = Math.min(W / src.w, H / src.h), dx = (W - src.w * k) / 2, dy = (H - src.h * k) / 2
    if (Math.abs(k - 1) > 0.001 || dx || dy) for (const e of slides.flatMap(s => s.elements)) {
      Object.assign(e, { x: Math.round(e.x * k + dx), y: Math.round(e.y * k + dy), w: Math.round(e.w * k), h: Math.round(e.h * k) })
      if (e.fontSize) e.fontSize = Math.round(e.fontSize * k)
    }
    deck.slides.splice(pos, 0, ...slides)
    ui.slide = pos
    pos += slides.length
    toast(t('{0} imported from {1}', n(slides.length, 'Slide', 'Slides'), f.name) + (ext === 'pdf' ? ' ' + t('(as images)') : ''), 8000)
  }
})
// loose markdown files (no slides.md): a new project with one deck per file, in name order
export const importDecksAsProject = (files, paths) => run(async () => {
  const map = filesMap(files), slides = [], assets = {}, format = {}
  let missing = 0
  for (const p of [...paths].sort(byName)) {
    toast(t('Importing {0} …', p), 0)
    const r = await importSlidev(p, map, detectTheme(await map.get(p).text()))
    Object.assign(assets, r.assets)
    format.aspectRatio ??= r.aspectRatio ?? '16/9' // the first deck's format (shortcut: decks of other formats keep their measured coordinates)
    format.canvasWidth ??= r.canvasWidth ?? 980
    missing += r.missing
    slides.push(...r.slides.map(s => ({ ...s, file: s.file === 'slides.md' ? p.replace(/\.md$/, '-1.md') : s.file })))
  }
  const title = files[0]?.webkitRelativePath?.split('/')[0] || (paths.length === 1 ? deckName(paths[0]) : t('Presentation'))
  await createProject({ title, theme: detectTheme(await map.get(paths[0]).text()), entry: 'slides.md', ...format, slides, assets, files: {} })
  toast(t('{0} imported from {1}', n(slides.length, 'Slide', 'Slides'), n(paths.length, 'Deck', 'decks')) + (missing ? ' · ' + t('{0} not found', n(missing, 'Image', 'Images')) : ''), 8000)
})
// markdown files appended to the open project, each one a deck
export const appendDecks = (files, paths) => run(async () => {
  const map = filesMap(files)
  for (const p of [...paths].sort(byName)) {
    toast(t('Importing {0} …', p), 0)
    const r = await importSlidev(p, map, deck.theme)
    Object.assign(deck.assets, r.assets)
    const slides = cleanSlides(r.slides.map(s => ({ ...s, file: s.file === deck.entry ? p.replace(/\.md$/, '-1.md') : s.file })))
    deck.slides.push(...slides)
    ui.slide = deck.slides.length - slides.length
    toast(await importReport(r), 8000)
  }
})
// --- back to the imported state: re-render a slide from the Markdown it was imported from ---
export const canRevert = s => s?.md != null && s.hash !== slideHash(s)
export const revertSlides = (list = deck.slides.filter(canRevert)) => run(async () => {
  if (!list.length) return toast(t('No changed imported slides.'))
  // the project's images by their Slidev path, so the re-import finds them without the original folder
  const paths = {}
  for (const s of deck.slides) for (const e of s.elements) {
    if (e.src && e.asset) paths[imagePath(e.src)] = e.asset
    for (const m of (e.html || '').matchAll(/<img\b[^>]*>/g)) {
      const id = m[0].match(/data-asset="([^"]+)"/)?.[1], src = m[0].match(/data-src="([^"]+)"/)?.[1]
      if (id && src) paths[imagePath(src)] = id
    }
  }
  const images = await Promise.all(Object.entries(paths).filter(([, id]) => deck.assets[id]).map(async ([p, id]) => [p, await (await fetch(deck.assets[id])).blob()]))
  let done = 0
  for (const s of list) {
    const file = fileOf(s)
    const text = s.fm ? `---\n${s.fm}\n---\n\n${s.md}` : s.md
    const r = await importSlidev(file, new Map([...images, [file, text]]), deck.theme)
    Object.assign(deck.assets, r.assets)
    const [n] = cleanSlides(r.slides.slice(0, 1))
    if (!n) continue
    s.layout = n.layout
    s.elements = n.elements
    s.hash = slideHash(s) // unchanged again: the export writes the original Markdown
    done++
  }
  toast(t('{0} reset to the imported state.', n(done, 'Slide', 'Slides')))
})

// markdown typed or pasted (e.g. generated by an AI) -> slides
export async function markdownToSlides(text, file) {
  const r = await importSlidev(file, new Map([[file, text]]), deck.theme)
  Object.assign(deck.assets, r.assets)
  return cleanSlides(r.slides)
}

// --- export ---
export const exportSlides = ref(null) // slides rendered at 1:1 for print/PPTX, null when idle
const safe = s => s.replace(/[\\/:*?"<>|]/g, '_')
export function download(blob, name) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
// all: hidden slides too (the Slidev export keeps them, with hide: true)
const scopeSlides = (file, all) => (all ? s => s : shownSlides)(file ? slidesOf(file) : deck.slides)
const scopeName = file => safe(file ? deckName(file) : deck.title)
async function renderOutput(file, all, solutions) {
  const slides = solutions ? withSolutions(scopeSlides(file, all)) : scopeSlides(file, all)
  if (!slides.length) throw new Error(t('All slides are hidden'))
  exportSlides.value = slides
  await nextTick()
  const out = document.querySelector('.output')
  await Promise.all([...out.querySelectorAll('img')].map(i => i.decode().catch(() => {})))
  await document.fonts.ready
  return out
}
// print CSS: one page per slide at the project format -> vector PDF with selectable text
export const pdf = file => run(async () => {
  await flattenBackgrounds(await renderOutput(file, false, true))
  const title = document.title
  document.title = scopeName(file) // browsers use it as the PDF file name
  addEventListener('afterprint', () => { exportSlides.value = null; document.title = title }, { once: true })
  print()
})
export const pptx = file => exportAs('pptx', file)

// every export format: id -> [label for messages, file extension, build(rendered slides, name, slides)]
const progress = (i, n) => toast(t('Rendering slide {0} of {1} …', i, n), 0)
export const FORMATS = {
  pptx: ['PowerPoint', 'pptx', (out, name, slides) => exportPptx(out, name, slides)],
  'pptx-google': ['PowerPoint for Google Slides', 'pptx', (out, name, slides) => exportPptx(out, name, slides, { forGoogle: true })],
  'pptx-image': ['PowerPoint (true to original)', 'pptx', async (out, name, slides) => exportPptx(out, name, slides, { images: await slideImages(out, 2, progress, true) })],
  odp: ['OpenDocument', 'odp', (out, name, slides) => exportPptx(out, name, slides, { format: 'odp' })],
  html: ['HTML presentation', 'html', (out, name, slides) => htmlDeck(out, name, slides)],
  'html-zip': ['HTML presentation (ZIP)', 'zip', (out, name, slides) => htmlZip(out, name, slides)],
  png: ['Images', 'zip', async (out, name) => {
    const zip = new (await loadZip())()
    const images = await slideImages(out, 2, progress)
    images.forEach((d, i) => zip.file(`${name}-${String(i + 1).padStart(3, '0')}.png`, d.split(',')[1], { base64: true }))
    return zip.generateAsync({ type: 'blob' })
  }],
}
export const exportAs = (format, file) => {
  if (format === 'pdf') return pdf(file)
  if (format === 'slidev') return slidev()
  const [label, ext, build] = FORMATS[format]
  return run(async () => {
    toast(t('Creating {0} …', t(label)), 0)
    try {
      const out = await renderOutput(file, false, !format.startsWith('html')) // the HTML presentation reveals quizzes itself
      download(await build(out, scopeName(file), exportSlides.value), `${scopeName(file)}${format === 'png' ? '-images' : format === 'html-zip' ? '-html' : format === 'pptx-google' ? '-google' : ''}.${ext}`)
    } finally { exportSlides.value = null }
    toast(t('{0} exported.', t(label)))
  })
}
// zip with the Slidev project: entry file, deck files, images (and style.css for generic themes)
export const slidev = () => run(async () => {
  // text that shrinks to fit its shape (shrinkShapeText) keeps that size: Slidev cannot fit text itself
  const shapeFont = {}
  if (deck.slides.some(s => s.elements.some(e => e.type === 'shape' && e.html))) {
    try { for (const c of (await renderOutput(undefined, true)).querySelectorAll('[data-el] > .shape-text > .content')) if (c.style.fontSize) shapeFont[c.closest('[data-el]').dataset.el] = c.style.fontSize }
    finally { exportSlides.value = null }
  }
  const { files, images } = toSlidev(deckData(), deck.files, { shapeFont })
  const zip = new (await loadZip())()
  // nothing may unzip outside the project folder: no absolute paths, no '..' segments
  const inside = p => safePath(p) === p
  for (const [path, text] of Object.entries(files)) if (inside(path) && !text.startsWith('data:')) zip.file(path, text)
  // images keep their project paths (Slidev serves the project root and public/ at /)
  for (const [path, id] of Object.entries(images)) if (inside(path) && deck.assets[id] && !files[path]) zip.file(path, deck.assets[id].split(',')[1], { base64: true })
  for (const [path, text] of Object.entries(files)) if (inside(path) && text.startsWith('data:')) zip.file(path, text.split(',')[1], { base64: true })
  download(await zip.generateAsync({ type: 'blob' }), safe(deck.title) + '-slidev.zip')
  // images the Markdown refers to but the project lacks (e.g. loose .md files without public/): slidev build stops on them
  // relative paths resolve against their .md file; http(s), data: and //host links are skipped
  const raw = Object.entries(files).filter(([p]) => p.endsWith('.md')).flatMap(([p, t]) => [...t.matchAll(/!\[[^\]]*\]\(<?([^)\s>]+)|<img\b[^>]*?\ssrc="([^"]+)"/g)]
    .map(m => [p, m[1] || m[2]]).filter(([, u]) => !/^([a-z][a-z0-9+.-]*:|\/\/|#|\{)/i.test(u)))
  const lacking = [...new Set(raw.map(([p, u]) => decodeURI(new URL(u, 'http://x/' + p).pathname)))].filter(u => !zip.file(u.slice(1)) && !zip.file('public' + u))
  const bare = [...new Set(raw.map(([, u]) => u).filter(u => !/^\.{0,2}\//.test(u)))] // Slidev (Vite) cannot resolve "img/a.png", only "./img/a.png" or "/img/a.png"
  const list = a => a.slice(0, 3).join(', ') + (a.length > 3 ? ' …' : '')
  const issues = [
    lacking.length && t('{0} (put them at this path in the project before “npx slidev”, for /… also in public/): {1}', n(lacking.length, 'image missing', 'images missing'), list(lacking)),
    bare.length && t('Slidev needs “./” before {0}', list(bare)),
  ].filter(Boolean)
  toast(issues.length ? t('Slidev project exported – {0}', issues.join(' · ')) : t('Slidev project exported: unzip and start with “npx slidev”.'), issues.length ? 12000 : undefined)
})
// every stored project as .slides.json in one ZIP; importPresentations reads it back
export const exportAllProjects = () => run(async () => {
  toast(t('Saving all projects …'), 0)
  const zip = new (await loadZip())(), names = new Set()
  for (const p of library.list) {
    let name = safe(p.title) + '.slides.json'
    for (let i = 2; names.has(name); i++) name = `${safe(p.title)} (${i}).slides.json`
    names.add(name)
    zip.file(name, await projectFile(p.id))
  }
  download(await zip.generateAsync({ type: 'blob' }), `Slidecko-projects-${new Date().toISOString().slice(0, 10)}.zip`)
  toast(t('{0} saved.', n(library.list.length, 'project', 'projects')))
})
// id + time: loading the file again updates this project instead of adding a copy (restoreProject)
export const saveFile = () => download(new Blob([JSON.stringify({ ...JSON.parse(deckFile()), id: deck.id, updated: Date.now() })], { type: 'application/json' }), safe(deck.title) + '.slides.json')
export const currentSlideMarkdown = () => slideToMarkdown(deckData().slides[ui.slide])
