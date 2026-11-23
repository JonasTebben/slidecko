<script setup>
import { ref, reactive, computed, watch, watchEffect, nextTick, onMounted, defineAsyncComponent } from 'vue'
import Icon from './Icon.vue'
import AppFooter from './AppFooter.vue'
import Menu from './Menu.vue'
import SlideView from './SlideView.vue'
import Inspector from './Inspector.vue'
import Home from './Home.vue'
import ThemeEditor from './ThemeEditor.vue'
import MasterPanel from './MasterPanel.vue'
import { tour, begin } from './tour.js'
const Tour = defineAsyncComponent(() => import('./Tour.vue')) // loaded only when someone takes the tour
import { tutorial, openTutorial } from './tutorial.js'
const MarkdownTutorial = defineAsyncComponent(() => import('./MarkdownTutorial.vue')) // loaded on first open
import { t, lang } from './i18n.js'
import { format, setFormat, deck, ui, decks, library, openProject, fileOf, restore, undo, redo, canUndo, canRedo, newSlide, cleanSlides, usedAssets, withGroups, regroup, saveSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot, SNAP_MAX, SNAP_EVERY, nextShown, stepMove, clickSteps } from './store.js'
import { parseRatio } from './format.js'
import { slidePoint, arrowHead } from './draw.js'
import { toggleSolution, resetQuiz } from './quiz.js'
import { THEMES, TABLE_PRESETS, CALLOUTS, editorCss, typoCss, themeStyle, themeOf, themeIds, importTheme } from './themes.js'
import { PALETTE, FILLS } from './presets.js'
import { shapeSvg } from './toSlidev.js'
import { applyUno } from './uno.js'
import * as A from './actions.js'
import { insertRow, insertCol, deleteRow, deleteCol, area, setAlign, clearCells } from './tableOps.js'
import { toggleMarked, codeOpts, withLines, highlight } from './hl.js'
import { find, replace, ranges, pattern } from './search.js'
import { loadSession, saveSession, sessionView, selIds, selIndexes, viewHash, parseViewHash } from './session.js'

const { slide, selection, primary } = A
const ready = ref(false)
const stage = ref(), view = ref(), fitScale = ref(1)
// canvas zoom: null = fit the stage; SlideView divides pointer movement by scale either way
const zoom = ref(null), scale = computed(() => zoom.value ?? fitScale.value)
const presenter = ref(), presenting = ref(false), presenterView = ref(false), presentScale = ref(1), started = ref(0), now = ref(Date.now())
const linkDialog = ref(), linkUrl = ref('')
const importDialog = ref(), importFiles = ref([]), importEntries = ref([]), importPick = ref([]), importMode = ref('project')
const mdDialog = ref(), mdText = ref(''), mdTarget = ref('slide')
const paletteDialog = ref(), paletteQuery = ref(''), paletteIndex = ref(0)
const deckDialog = ref(), deckNameInput = ref(''), deckRenaming = ref(null)
const confirmDialog = ref(), confirmText = ref(''), confirmAction = ref(null)
const ytDialog = ref(), ytUrl = ref('')
// version history of the open project
const snapDialog = ref(), snaps = ref([])
const snapTime = d => new Intl.DateTimeFormat(lang.value, { dateStyle: 'medium', timeStyle: 'short' }).format(d)
const reloadSnaps = async () => { snaps.value = await listSnapshots() }
const openSnaps = () => A.run(async () => { await reloadSnaps(); openDlg(snapDialog.value) })
const snapNow = () => A.run(async () => { await saveSnapshot(); await reloadSnaps(); A.toast(t('Snapshot saved')) })
const restoreSnap = at => A.run(async () => { await restoreSnapshot(at); snapDialog.value.close(); A.toast(t('Snapshot restored – the state before is a snapshot too, and Undo brings it back.')) })
const deleteSnap = at => ask(t('Delete the snapshot from {0}?', snapTime(at)), () => A.run(async () => { await deleteSnapshot(at); await reloadSnaps() }), t('Delete'), false)
// returnValue keeps the last button pressed: cleared, so Esc (no button) never repeats a previous OK
const openDlg = d => { d.returnValue = ''; d.showModal() }

const collapsed = ref(new Set()) // decks folded in the slide list
// sidebars folded away (wide screens only: the phone layout stacks them and ignores this)
const PANELS = 'slides-builder:panels'
const panels = reactive((() => { try { return { slides: true, props: true, ...JSON.parse(localStorage.getItem(PANELS)) } } catch { return { slides: true, props: true } } })())
watch(panels, v => { try { localStorage.setItem(PANELS, JSON.stringify(v)) } catch {} })

// --- find & replace, like VS Code's find widget: non-modal, replace row folded away ---
// while the markdown editor is open, find works on its text (the editor is modal, the slides are out of reach)
const mdOpen = ref(false)
const findDialog = ref(), findInput = ref(), findQ = ref(''), findR = ref(''), findAt = ref(-1), findOpen = ref(false), replacing = ref(false)
// cs = match case, word = whole word, regex, keep = preserve case (on replace)
const findOpt = reactive({ cs: false, word: false, regex: false, keep: false })
const rx = computed(() => { try { return findQ.value ? pattern(findQ.value, findOpt) : null } catch { return false } }) // false: invalid regex
// where to search: all slides, this deck or this slide; and which contents
const findScope = ref('all'), findKinds = reactive({ text: true, table: true, code: true, notes: true }), filtering = ref(false)
const KINDS = [['text', 'Text'], ['table', 'Tables'], ['code', 'Code'], ['notes', 'Notes']]
// the toggles are remembered per browser, like VS Code keeps them; the search text only for this tab (session.js),
// it may contain slide content. Read defensively, it is untrusted input
const FIND_PREFS = 'slides-builder:find'
try {
  const p = JSON.parse(localStorage.getItem(FIND_PREFS)) || {}
  if (['all', 'deck', 'slide'].includes(p.scope)) findScope.value = p.scope
  for (const [obj, saved] of [[findKinds, p.kinds], [findOpt, p.opt]]) for (const k in obj) if (typeof saved?.[k] === 'boolean') obj[k] = saved[k]
} catch {}
watch([findScope, findKinds, findOpt], () => {
  try { localStorage.setItem(FIND_PREFS, JSON.stringify({ scope: findScope.value, kinds: findKinds, opt: findOpt })) } catch {}
}, { deep: true })
const filtered_ = computed(() => findScope.value !== 'all' || KINDS.some(([k]) => !findKinds[k]))
function inScope(i) {
  if (findScope.value === 'slide') return i === ui.slide
  if (findScope.value === 'deck') { const d = decks.value.find(d => ui.slide >= d.start && ui.slide < d.start + d.count); return i >= d.start && i < d.start + d.count }
  return true
}
const hits = computed(() => {
  if (!findOpen.value && !mdOpen.value) return [] // closed: no search on every edit
  if (!mdOpen.value) return find(deck.slides, rx.value, findKinds).filter(h => inScope(h.slide))
  const [h] = find([{ notes: mdText.value, elements: [] }], rx.value)
  return h ? [{ ...h, obj: mdText, key: 'value', md: true, notes: false, slide: -1 }] : []
})
const hitsOn = computed(() => hits.value.reduce((m, h) => (m[h.slide] = (m[h.slide] || 0) + h.count, m), {}))
const deckHits = g => (findOpen.value ? Object.entries(hitsOn.value).reduce((n, [i, c]) => (i >= g.start && i < g.start + g.count ? n + c : n), 0) : 0)
const FIND_KEYS = { c: 'cs', w: 'word', r: 'regex', p: 'keep' } // ⌥⌘C/W/R/P, as in VS Code
function findKey(e) {
  const k = FIND_KEYS[e.code.slice(3).toLowerCase()]
  if (!k || !e.altKey || !(e.metaKey || e.ctrlKey) || !e.code.startsWith('Key')) return
  e.preventDefault()
  findOpt[k] = !findOpt[k]
}
// one entry per occurrence; n = index within its field, k = index within its element (for the slide highlight)
const occ = computed(() => {
  const out = [], seen = {}
  for (const h of hits.value) for (let n = 0; n < h.count; n++) out.push({ h, n, k: h.el ? (seen[h.el] = (seen[h.el] ?? -1) + 1) : -1 })
  return out
})
function openFind(withReplace = false) {
  const a = document.activeElement // textareas keep their selection to themselves
  const t = (a?.setSelectionRange && a.type !== 'checkbox' ? a.value.slice(a.selectionStart, a.selectionEnd) : getSelection().toString()).trim()
  if (t && !t.includes('\n')) findQ.value = t
  if (withReplace) replacing.value = true
  findFrom = ui.slide
  findOpen.value = true
  findDialog.value.show()
  first() // the remembered term: start at its first hit from here
  nextTick(() => findInput.value.select())
}
function closeFind() { findDialog.value.close(); findOpen.value = false }
// first occurrence on or after the current slide, as VS Code starts at the cursor
// while typing, show the first occurrence from the slide the search started on, as VS Code does:
// the counter then names the hit on screen, and Enter goes on from there
let findFrom = 0
function first() {
  findAt.value = occ.value.length ? Math.max(0, occ.value.findIndex(o => o.h.slide >= findFrom)) : -1
  if (findOpen.value) reveal()
}
watch([rx, mdOpen, findScope, () => ({ ...findKinds })], first)
function reveal() {
  const h = occ.value[findAt.value]?.h
  if (!h || h.md) return
  A.go(h.slide)
  nextTick(() => { ui.sel = h.el ? [h.el] : [] })
}
function step(d) {
  const len = occ.value.length
  if (!len) return
  findAt.value = (Math.max(findAt.value, d > 0 ? -1 : 0) + d + len) % len
  reveal()
}
function replaceOne() {
  const o = occ.value[findAt.value]
  if (!o) return step(1)
  ui.editing = null // a text box being typed in would write its old content back
  replace([o.h], rx.value, findR.value, findOpt, o.n)
  // the next occurrence moves into this index, like in VS Code; unless the replacement matches again (a → aa)
  const again = find([{ notes: findR.value, elements: [] }], rx.value).length
  nextTick(() => { if (!again) findAt.value--; step(1) })
}
function replaceAll() {
  ui.editing = null
  const n = replace(hits.value, rx.value, findR.value, findOpt)
  A.toast(t('{0} matches replaced', n))
}
// marks in the text copy behind a textarea; scrolls the textarea to the current hit (the copy follows its scroll)
function mirror(node, isCurrent, all, cur) {
  if (node) ranges(node, rx.value).forEach((r, k) => {
    if (!isCurrent(k)) return all.add(r)
    cur.add(r)
    const ta = node.nextElementSibling, y = r.getBoundingClientRect().top - node.getBoundingClientRect().top + node.scrollTop
    if (y < ta.scrollTop || y > ta.scrollTop + ta.clientHeight - 20) ta.scrollTop = y - ta.clientHeight / 2
  })
}
// subtle marks on the slide via the CSS Custom Highlight API: no DOM changes, so editing is unaffected
const hl = typeof CSS !== 'undefined' && CSS.highlights
watch([findOpen, occ, findAt, () => ui.slide, () => ui.editing, collapsed, mdOpen, presenting, presenterView], async () => {
  if (!hl) return
  await nextTick()
  const all = new Highlight(), cur = new Highlight(), thumbs = new Highlight()
  const o = occ.value[findAt.value]
  if (findOpen.value && rx.value) {
    // only what the search covers (scope and kinds), so the marks agree with the counter
    const els = new Set(hits.value.map(h => h.el)), notesHit = hits.value.some(h => h.notes && h.slide === ui.slide)
    const marked = sel => [...document.querySelectorAll(sel)].filter(n => els.has(n.dataset.el))
    for (const node of marked('.stage [data-el]')) {
      ranges(node, rx.value).forEach((r, k) => (o?.h.el === node.dataset.el && o.h.slide === ui.slide && o.k === k ? cur : all).add(r))
    }
    for (const node of marked('.thumb [data-el]')) for (const r of ranges(node, rx.value)) thumbs.add(r)
    // deck names are not searched (renaming changes file names), only marked
    if (!mdOpen.value) for (const node of document.querySelectorAll('.deck-name')) for (const r of ranges(node, rx.value)) all.add(r)
    // presenting: the search stays marked on the slide, the next-slide preview and the speaker notes
    for (const node of [...marked('.presenter [data-el]'), notesHit && document.querySelector('.pv-notes')].filter(Boolean)) for (const r of ranges(node, rx.value)) all.add(r)
    if (notesHit) mirror(document.querySelector('.notes-mirror'), k => o?.h.notes && o.h.slide === ui.slide && o.n === k, all, cur)
    mirror(document.querySelector('.md-mirror'), k => o?.h.md && o.n === k, all, cur)
  }
  hl.set('find', all); hl.set('find-current', cur); hl.set('find-thumb', thumbs)
}, { flush: 'post' })

// --- export dialog: one place for every format, for the whole project or one deck ---
const EXPORTS = [
  { id: 'pdf', name: 'PDF', ext: '.pdf', apps: 'For sharing, printing and archiving', note: 'Vector PDF, selectable text', exact: true },
  { id: 'pptx', name: 'PowerPoint', ext: '.pptx', apps: 'PowerPoint · Keynote · LibreOffice', note: 'Text, tables and shapes stay editable. Not for Google Slides – text shifts there; use its own variant instead.', editable: true },
  { id: 'pptx-google', name: 'Google Slides', ext: '.pptx', apps: 'Google Slides (File → Import)', note: 'Editable; line spacing written the way Google reads it', editable: true },
  { id: 'pptx-image', name: 'PowerPoint exact copy', ext: '.pptx', apps: 'PowerPoint · Keynote · Google Slides · LibreOffice', note: 'Each slide as a high-resolution image – looks exactly like here everywhere. Notes are kept.', exact: true },
  { id: 'odp', name: 'OpenDocument', ext: '.odp', apps: 'LibreOffice Impress · OpenOffice · Collabora', note: 'Open format, editable', editable: true },
  { id: 'html', name: 'HTML presentation', ext: '.html', apps: 'Any browser, also offline', note: 'A single file. Present with the arrow keys, F for fullscreen.', exact: true },
  { id: 'html-zip', name: 'HTML presentation (ZIP)', ext: '.zip', apps: 'Web servers, learning platforms, any browser', note: 'index.html with images as separate files – smaller than the single file', exact: true },
  { id: 'png', name: 'Images', ext: '.png (ZIP)', apps: 'Web, learning platforms, social media', note: 'One PNG file per slide, 1960 × 1104 px', exact: true },
  { id: 'slidev', name: 'Slidev project', ext: '.zip', apps: 'Slidev (npx slidev)', note: 'Markdown with all decks, images and theme', editable: true, project: true },
]
const exportDialog = ref(), exportScope = ref(''), exportFormat = ref((() => { try { return localStorage.getItem('slides-builder:export') } catch {} })() || 'pptx') // storage can throw (blocked site data)
function openExport(scope = '', format) {
  exportScope.value = scope
  if (format) exportFormat.value = format
  openDlg(exportDialog.value)
}
function doExport() {
  if (exportDialog.value.returnValue !== 'ok') return
  try { localStorage.setItem('slides-builder:export', exportFormat.value) } catch { /* private mode */ }
  A.exportAs(exportFormat.value, exportScope.value || undefined)
}
const THUMB = computed(() => 176 / format.w)
// one style object for all thumbnails: a new object per render would re-render every thumbnail
const thumbStyle = computed(() => ({ transform: `scale(${THUMB.value})` }))

// theme, table and callout rules, generated from the same source as the Slidev export
// (rebuilt when own themes change)
const themeRules = document.head.appendChild(document.createElement('style'))
watchEffect(() => { themeRules.textContent = editorCss() })
// --- own themes: editor, import ---
const themeEditor = ref()
const themeName = id => (THEMES[id]?.custom ? THEMES[id].name : t(themeOf(id).name))
async function importThemeFiles(files) {
  for (const f of files) {
    try { const id = importTheme(JSON.parse(await f.text())); setTheme(id); A.toast(t('Theme “{0}” imported', THEMES[id].name)) }
    catch { A.toast(t('{0} is not a valid theme file', f.name)) }
  }
}
// --- theme switch: keep the type sizes of the current theme, so boxes and line breaks stay put ---
const keepSizes = ref((() => { try { return localStorage.getItem('slides-builder:keep-sizes') !== '0' } catch { return true } })())
watch(keepSizes, v => { try { localStorage.setItem('slides-builder:keep-sizes', v ? '1' : '0') } catch {} })
function themeMetrics(id) {
  const saved = typoStyle.textContent
  typoStyle.textContent = '' // measure the theme itself, not the current overrides
  const s = Object.assign(document.createElement('div'), { className: `slide theme-${id} layout-default` })
  Object.entries(themeStyle(id)).forEach(([k, v]) => s.style.setProperty(k, v))
  s.style.cssText += ';position:absolute;left:-99999px;top:0;visibility:hidden'
  s.innerHTML = '<h1>A</h1><h2>A</h2><h3>A</h3><p>A</p><ul><li>A</li></ul><pre class="code">A</pre>'
  document.body.appendChild(s)
  const cs = sel => getComputedStyle(s.querySelector(sel)), px = v => Math.round(parseFloat(v) * 10) / 10
  const ratio = n => Math.round((parseFloat(cs(n).lineHeight) / parseFloat(cs(n).fontSize)) * 100) / 100
  const m = {
    text: px(getComputedStyle(s).fontSize), title: px(cs('h1').fontSize), titleLine: px(cs('h1').lineHeight), h2: px(cs('h2').fontSize), h3: px(cs('h3').fontSize),
    line: ratio('p'), liLine: ratio('li'), code: px(cs('pre').fontSize), codeLine: px(cs('pre').lineHeight),
  }
  s.remove()
  typoStyle.textContent = saved
  return Object.fromEntries(Object.entries(m).filter(([, v]) => Number.isFinite(v)))
}
function setTheme(id) {
  if (id === deck.theme) return
  if (deck.typo.from === id) deck.typo = {} // back to the theme the sizes came from: its own sizes again
  else if (keepSizes.value && !deck.typo.from) deck.typo = { ...themeMetrics(deck.theme), ...deck.typo, from: deck.theme }
  deck.theme = id
}
// --- slide format (Slidev aspectRatio): only the canvas changes, elements keep their coordinates ---
const FORMATS = ['16/9', '16/10', '4/3', '3/2', '1/1']
const formats = computed(() => FORMATS.includes(deck.aspectRatio) ? FORMATS : [...FORMATS, deck.aspectRatio])
const ratioLabel = r => r.replace('/', ':')
const formatMenu = ref(), customRatio = ref('')
function setCustomRatio() {
  if (!parseRatio(customRatio.value)) return A.toast(t('Invalid format – e.g. 21:9 or 1.6'))
  setFormat(customRatio.value, deck.canvasWidth)
  customRatio.value = ''
  formatMenu.value.close()
}
// project-wide font sizes (Inspector › Schrift für alle Folien)
const typoStyle = document.head.appendChild(document.createElement('style'))
watchEffect(() => { typoStyle.textContent = typoCss('.slide', deck.typo) })
// utility classes (Slidev's UnoCSS) of everything on the slides
let unoTimer
// keyed on the markup only: moving or resizing elements does not touch it
const unoKey = () => deck.slides.map(s => s.elements.map(e => (e.html || '') + '\x01' + (e.cls ? `class="${e.cls}"` : '') + '\x01' + (e.rows ? e.rows.map(r => r.join('\x02')).join('\x02') : '')).join('\0')).join('\0')
watch(unoKey, markup => {
  clearTimeout(unoTimer)
  unoTimer = setTimeout(() => applyUno(markup), 200)
}, { immediate: true })
watchEffect(() => { document.title = ui.home ? 'Slidecko' : `${deck.title} – Slidecko` })
const sessionState = () => ({ project: deck.id, slide: ui.slide, sel: selIndexes(deck.slides[ui.slide], ui.sel), collapsed: [...collapsed.value], find: findQ.value, yt: ui.yt, listTop: document.querySelector('.slide-list')?.scrollTop || 0 })

onMounted(async () => {
  const session = loadSession()
  if (typeof session.find === 'string') findQ.value = session.find.slice(0, 500)
  ui.yt = session.yt === true // YouTube allowed in this tab: survives a reload, not a new tab
  // the view comes from the URL (a reload keeps it, a link can choose it); without one the last project opens
  const view = parseViewHash(location.hash)
  await restore({ project: view?.project, home: view?.home })
  if (view?.project && view.project === deck.id) ui.slide = Math.max(0, Math.min(view.slide, deck.slides.length - 1))
  const back = sessionView(session, deck) // what the URL does not hold
  if (back) {
    collapsed.value = new Set(back.collapsed)
    await nextTick() // the slide watcher clears the selection first
    // untouched imported slides get their elements only once rendered and measured
    if (back.sel.length && back.slide === ui.slide) {
      const stop = watch(() => deck.slides[back.slide]?.elements.length, n => {
        if (ui.slide !== back.slide) return stop()
        if (n) { ui.sel = selIds(deck.slides[back.slide], back.sel); stop() }
      })
      if (deck.slides[back.slide]?.elements.length) { ui.sel = selIds(deck.slides[back.slide], back.sel); stop() }
    }
  }
  ready.value = true
  // overview, project and slide go into the browser history: back and forward step through them
  const viewUrl = () => location.pathname + location.search + viewHash(ui.home, deck.id, ui.slide)
  let popping = false
  window.history.replaceState(window.history.state, '', viewUrl())
  watch(() => viewHash(ui.home, deck.id, ui.slide), h => {
    if (h !== location.hash) window.history[popping ? 'replaceState' : 'pushState'](null, '', viewUrl())
  })
  addEventListener('popstate', async () => {
    popping = true
    await showView(parseViewHash(location.hash))
    await nextTick()
    popping = false
  })
  if (back?.listTop) nextTick(() => { const l = document.querySelector('.slide-list'); if (l) l.scrollTop = back.listTop })
  watchEffect(() => saveSession(sessionState()))
  addEventListener('pagehide', () => saveSession(sessionState())) // the list's scroll position is not reactive
  addEventListener('keydown', onKey)
  for (const type of ['copy', 'cut', 'paste']) addEventListener(type, onClipboard)
  addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault() })
  addEventListener('drop', onWindowDrop)
  addEventListener('resize', fitPresenter)
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) presenting.value = false })
  setInterval(() => { now.value = Date.now() }, 1000)
})
const stageObserver = new ResizeObserver(([e]) => { stageBox = e.contentRect; fitStage() })
watch([() => ui.home, ready], async () => {
  await nextTick()
  stageObserver.disconnect() // the stage is a new element after each visit to the overview
  if (stage.value) stageObserver.observe(stage.value)
})
let stageBox
const fitStage = () => {
  if (!stageBox) return
  const pad = stageBox.width < 600 ? 24 : 64 // phones: the slide takes the width
  fitScale.value = Math.max(0.1, Math.min((stageBox.width - pad) / format.w, (stageBox.height - pad) / format.h))
}
watch(format, () => { zoom.value = null; fitStage(); fitPresenter() })
watch(() => deck.id, () => { zoom.value = null })
// z: the new zoom (null = fit); the point at clientX/Y (default: the stage's centre) stays where it is
const scroller = ref()
async function setZoom(z, cx, cy) {
  if (z != null) z = Math.min(4, Math.max(0.25, z))
  const el = scroller.value, frame = el?.firstElementChild, old = scale.value
  zoom.value = z
  if (!frame || z == null) return
  const box = el.getBoundingClientRect(), f = frame.getBoundingClientRect()
  cx ??= box.left + box.width / 2; cy ??= box.top + box.height / 2
  const u = (cx - f.left) / old, v = (cy - f.top) / old // that point in slide units
  await nextTick()
  const g = frame.getBoundingClientRect()
  el.scrollLeft += g.left + u * z - cx
  el.scrollTop += g.top + v * z - cy
}
const zoomBy = (k, cx, cy) => setZoom(scale.value * k, cx, cy)
const cycleZoom = () => setZoom(zoom.value == null ? 1 : zoom.value === 1 ? 2 : null)
function stageWheel(e) {
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault() // not the browser's page zoom (trackpad pinch arrives as Ctrl+wheel too)
  zoomBy(Math.exp(-Math.max(-25, Math.min(25, e.deltaY)) * 0.01), e.clientX, e.clientY) // a wheel notch ≈ ×1.25, a trackpad pinch stays smooth
}
// touch: two fingers pinch the slide; a second finger cancels an element drag (SlideView's track)
const fingers = new Map()
let pinch = null
const spread = () => { const [a, b] = [...fingers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
function fingerDown(e) {
  if (e.pointerType !== 'touch') return
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (fingers.size === 2) pinch = { d: spread().d || 1, z: scale.value }
}
function fingerMove(e) {
  if (!fingers.has(e.pointerId)) return
  fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (!pinch || fingers.size !== 2) return
  const m = spread()
  setZoom(pinch.z * m.d / pinch.d, m.x, m.y)
}
function fingerUp(e) {
  fingers.delete(e.pointerId)
  if (fingers.size < 2) pinch = null
}
// another slide: its elements only (undo selects what it changed on the slide it jumps to)
watch(() => ui.slide, () => { ui.sel = ui.sel.filter(id => slide.value?.elements.some(e => e.id === id)); ui.editing = null })
// beside the slide: a mouse clears the selection at once; a finger only on a tap, so scrolling keeps it
let lastTap = 0
function stageDown(e) {
  if (!e.isPrimary) return
  if (e.pointerType !== 'touch') { ui.sel = []; return }
  const up = ev => {
    if (ev.pointerId !== e.pointerId) return
    removeEventListener('pointerup', up); removeEventListener('pointercancel', up)
    if (ev.type !== 'pointerup' || Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) >= 8) return
    ui.sel = []
    if (ev.timeStamp - lastTap < 350) { zoom.value = null; lastTap = 0 } else lastTap = ev.timeStamp // double tap: fit again
  }
  addEventListener('pointerup', up)
  addEventListener('pointercancel', up)
}
async function showView(v) {
  if (!v) return
  if (v.home) { ui.home = true; return }
  if (v.project !== deck.id) {
    if (!library.list.some(p => p.id === v.project)) return // deleted or from another browser: stay where we are
    try { if (!(await openProject(v.project))) return } catch { return }
  }
  ui.home = false
  ui.slide = Math.max(0, Math.min(v.slide, deck.slides.length - 1))
}

// a closed dialog can keep the focus (palette input): that is not typing
const inField = e => e.target.closest?.('input, textarea, select, dialog[open], [contenteditable=true]') && !e.target.closest('dialog:not([open])')
const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = computed(() => isMac ? '⌘' : t('Ctrl+'))

// --- slide list (decks) ---
const groups = computed(() => decks.value.map(d => ({ ...d, slides: deck.slides.slice(d.start, d.start + d.count) })))
const toggle = file => { const s = new Set(collapsed.value); s.has(file) ? s.delete(file) : s.add(file); collapsed.value = s }
let dragFrom = null, deckFrom = null
const dropDeck = ref(null) // group index the dragged deck would land in front of
const dragStart = (e, i) => { dragFrom = i; deckFrom = null; e.dataTransfer.effectAllowed = 'move' }
function drop(e, i, file) {
  if (deckFrom != null) return dropDeckAt(groups.value.findIndex(g => file === g.file && i >= g.start && i < g.start + g.count))
  if (dragFrom == null) return
  A.moveSlide(dragFrom, i, file)
  dragFrom = null
}
// decks are dragged by their name; dropping on a deck puts it in front, below the middle of the last one: at the end
function deckDragStart(e, gi) {
  deckFrom = gi; dragFrom = null
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', groups.value[gi].name)
}
function deckOver(e, gi) {
  if (deckFrom == null) return
  const r = e.currentTarget.getBoundingClientRect()
  dropDeck.value = gi === groups.value.length - 1 && e.clientY > r.top + r.height / 2 ? gi + 1 : gi
}
function dropDeckAt(gi = dropDeck.value) {
  if (deckFrom != null && gi != null && gi >= 0) A.moveDeckTo(deckFrom, gi)
  deckFrom = null
  dropDeck.value = null
}

// --- dialogs ---
function openLink() {
  const s = getSelection()
  if (!s.rangeCount) return
  const n = s.anchorNode?.nodeType === 1 ? s.anchorNode : s.anchorNode?.parentElement
  const a = n?.closest('a')
  if (a) s.selectAllChildren(a)
  linkRange = s.getRangeAt(0).cloneRange() // the dialog takes the focus, and with it the selection
  linkUrl.value = a?.getAttribute('href') || 'https://'
  openDlg(linkDialog.value)
}
let linkRange
function applyLink() {
  if (linkDialog.value.returnValue !== 'ok') return
  const s = getSelection(), url = linkUrl.value.trim()
  s.removeAllRanges()
  s.addRange(linkRange)
  if (!url || url === 'https://') A.format('unlink')
  else if (s.isCollapsed) A.format('insertHTML', `<a href="${url.replace(/"/g, '%22')}">${url.replace(/</g, '&lt;')}</a>`)
  else A.format('createLink', url)
}
const confirmLabel = ref(''), confirmUndo = ref(true)
// undoable: the note that Undo brings it back (not for things outside the project, like unsaved Markdown)
function ask(text, action, label = t('Remove'), undoable = true) {
  confirmLabel.value = label
  confirmUndo.value = undoable
  confirmText.value = text
  confirmAction.value = action
  openDlg(confirmDialog.value)
}

async function pickImport(files, mode) {
  if (!A.markdownFiles(files).length) return A.toast(t('No Markdown files found.'))
  const paths = [...A.filesMap(A.markdownFiles(files)).keys()]
  // a Slidev project folder is loaded through its slides.md, like Slidev does
  if (mode === 'project' && paths.includes('slides.md')) {
    const source = files[0]?.webkitRelativePath?.split('/')[0]
    dupOf.value = source && library.list.find(p => p.source === source)
    if (!dupOf.value) return A.importProject(files, 'slides.md')
    importFiles.value = files
    return openDlg(dupDialog.value)
  }
  importFiles.value = files
  // loose .md files: each becomes a deck of a new project (or of the open one), in name order
  importMode.value = mode === 'project' ? 'new' : mode
  importEntries.value = (mode === 'project' ? await A.entryCandidates(files) : paths).sort(A.byName)
  importPick.value = [...importEntries.value]
  if (mode === 'project' && importEntries.value.length === 1) return A.importDecksAsProject(files, importPick.value)
  openDlg(importDialog.value)
}
const dupDialog = ref(), dupOf = ref(null)
function dupChoice() {
  const v = dupDialog.value.returnValue
  if (v === 'open') A.run(() => openProject(dupOf.value.id))
  else if (v === 'copy') A.importProject(importFiles.value, 'slides.md')
  else if (v === 'replace') A.importProject(importFiles.value, 'slides.md', dupOf.value.id)
}
// files dropped anywhere in the editor: images onto the slide, presentations appended, Markdown as decks
const PRESENTATION = /\.(pptx|potx|odp|otp|pdf|md|json|zip|html?)$/i // what Home accepts besides images
function dropFiles(files) {
  const images = files.filter(f => f.type.startsWith('image/')), rest = files.filter(f => !images.includes(f))
  const md = rest.filter(f => /\.md$/i.test(f.name)), pres = rest.filter(f => PRESENTATION.test(f.name) && !md.includes(f))
  if (images.length) A.addImages(images)
  if (md.length) pickImport(md, 'decks')
  if (pres.length) A.appendPresentations(pres)
  if (rest.length > md.length + pres.length) A.toast(t('This file type cannot be inserted.'))
}
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files') // slide and deck drags carry no files
function onWindowDrop(e) {
  if (!hasFiles(e)) return
  const done = e.defaultPrevented // the stage, thumbnails, decks or Home handled it
  e.preventDefault() // never let the browser open the file instead of the app
  if (done || ui.home || !ready.value) return
  dropFiles([...e.dataTransfer.files])
}
function doImport() {
  if (importDialog.value.returnValue !== 'ok' || !importPick.value.length) return
  if (importMode.value === 'new') A.importDecksAsProject(importFiles.value, importPick.value)
  else A.appendDecks(importFiles.value, importPick.value)
}

function openMarkdown(target = 'slide') {
  mdTarget.value = target
  mdText.value = target === 'slide' ? A.currentSlideMarkdown() : t('---\nlayout: cover\n---\n\n# Title\n\n## Subtitle\n\n---\n\n# First slide\n\n- Item one\n- Item two\n')
  mdOpen.value = true
  mdStart = mdText.value
  openDlg(mdDialog.value)
}
let mdStart = '' // the text the Markdown dialog opened with: Esc after edits asks first
function mdCancel(e) {
  if (mdText.value === mdStart) return
  e.preventDefault()
  ask(t('Discard your Markdown changes?'), () => mdDialog.value.close(), t('Discard'), false)
}
const applyMarkdown = () => A.run(async () => {
  mdOpen.value = false
  if (mdDialog.value.returnValue !== 'ok') return
  const file = mdTarget.value === 'slide' ? fileOf(slide.value) : `${String(decks.value.length).padStart(2, '0')}_New.md`
  const slides = await A.markdownToSlides(mdText.value, file)
  if (!slides.length) return A.toast(t('No slide content found.'))
  if (mdTarget.value === 'slide') {
    for (const s of slides) s.file = slide.value.file
    deck.slides.splice(ui.slide, 1, ...slides)
  } else {
    deck.slides.splice(ui.slide + 1, 0, ...slides.map(s => ({ ...s, file: slide.value.file })))
    ui.slide++
  }
  A.toast(t(slides.length > 1 ? '{0} slides applied.' : '{0} slide applied.', slides.length))
})

function newDeck() { deckRenaming.value = null; deckNameInput.value = ''; openDlg(deckDialog.value) }
function renameDeckAsk(d) { deckRenaming.value = d.file; deckNameInput.value = d.name; openDlg(deckDialog.value) }
function applyDeck() {
  if (deckDialog.value.returnValue !== 'ok' || !deckNameInput.value.trim()) return
  if (deckRenaming.value) A.renameDeck(deckRenaming.value, deckNameInput.value)
  else A.addDeck(deckNameInput.value)
}
function addVideo() {
  if (ytDialog.value.returnValue !== 'ok') return
  const id = ytUrl.value.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{6,20})/)?.[1] || (/^[\w-]{6,20}$/.test(ytUrl.value.trim()) ? ytUrl.value.trim() : null)
  id ? A.insert('video', id) : A.toast(t('Not a valid YouTube link.'))
}

// --- presenting ---
// the same query as the phone layout in app.css: narrow screens and phones held sideways
const phone = matchMedia('(max-width: 760px), (max-height: 500px) and (pointer: coarse)')
const fitPresenter = () => {
  const narrow = phone.matches // phones: presenter view stacks slide, next slide and notes
  presentScale.value = presenterView.value ? Math.min((innerWidth * (narrow ? 1 : 0.62) - (narrow ? 32 : 0)) / format.w, (innerHeight * (narrow ? 0.4 : 0.7)) / format.h) : Math.min(innerWidth / format.w, innerHeight / format.h)
}
async function present(from = ui.slide) {
  ui.master = null
  ui.sel = []
  ui.editing = null
  A.go(deck.slides[from]?.hidden ? nextShown(deck.slides, from, 1) : from) // a hidden slide is skipped, unless nothing follows it
  presenting.value = true
  blank.value = null
  jump.value = ''
  tool.value = null
  strokes.value = []
  resetQuiz()
  clickStep.value = 0
  started.value = Date.now()
  await nextTick()
  presenter.value.focus()
  await presenter.value.requestFullscreen?.().catch(() => {}) // without fullscreen it fills the window
  fitPresenter()
}
function stopPresenting() {
  presenting.value = false
  tool.value = null
  if (document.fullscreenElement) document.exitFullscreen()
}
// laser pointer and pen: the drawing is for this slide only, a slide change wipes it (not saved)
const tool = ref(null), strokes = ref([]), laser = ref(null) // 'laser' | 'pen' | 'arrow'; strokes in slide units; laser at screen [x, y]
// pen colours readable on light and dark slides, stroke widths in slide units
const INKS = ['#e5202a', '#facc15', '#16a34a', '#2563eb', '#ffffff'], WIDTHS = [3, 6, 12]
const ink = reactive({ color: INKS[0], width: 6 })
const drawing = computed(() => tool.value === 'pen' || tool.value === 'arrow')
const setTool = n => { tool.value = tool.value === n ? null : n; laser.value = null }
watch(() => ui.slide, () => { strokes.value = [] })
// Chrome: a short Esc reaches the page in full screen (holding it still leaves), so Esc can drop the tool first
watch(tool, v => v ? navigator.keyboard?.lock?.(['Escape'])?.catch(() => {}) : navigator.keyboard?.unlock?.())
let stroke = null
function penDown(e) {
  if (!e.isPrimary || e.button > 0) return
  e.currentTarget.setPointerCapture(e.pointerId)
  const p = slidePoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), format.w, format.h)
  strokes.value.push({ pts: [p, p], color: ink.color, width: ink.width, arrow: tool.value === 'arrow' }) // two points: a tap leaves a dot
  stroke = strokes.value.at(-1)
}
function penMove(e) {
  if (!stroke || !e.isPrimary) return
  const p = slidePoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), format.w, format.h)
  if (stroke.arrow) stroke.pts[1] = p // an arrow is a straight line from where the drag began
  else stroke.pts.push(p)
}
const penUp = () => { stroke = null }
const blank = ref(null) // 'black' | 'white': the screen goes blank while the audience should look at the speaker
const jump = ref('') // typed slide number, Enter jumps there
let jumpTimer = 0
// hidden slides are skipped (a typed slide number still shows them)
const clickStep = ref(0) // click steps revealed on the current slide
const presentGo = (i, k = 0) => { blank.value = null; jump.value = ''; A.go(i); clickStep.value = k }
// next/back: click steps first, then the slide (hidden slides are skipped)
const presentStep = d => { const m = stepMove(deck.slides, ui.slide, clickStep.value, d); presentGo(m.slide, m.step) }
const upNext = computed(() => stepMove(deck.slides, ui.slide, clickStep.value, 1))
// Slidev: the earlier slide's transition plays between two slides, reversed when going back
const transition = ref('none')
watch(() => ui.slide, (n, o) => {
  const name = deck.slides[Math.min(n, o)]?.transition || deck.transition
  transition.value = n < o ? { 'slide-left': 'slide-right', 'slide-up': 'slide-down' }[name] || name : name
})
const resetTimer = () => { started.value = Date.now(); now.value = started.value }
// every presenting key, shown with ? or H and the keyboard button (one list, so help and handler stay in step)
const PRESENT_KEYS = [
  ['→  Space  Enter', 'Next step or slide'], ['←  Backspace', 'Previous step or slide'], ['Home  End', 'First / last slide'],
  ['12 Enter', 'Jump to slide 12'], ['P', 'Presenter view'], ['B  W', 'Black / white screen'], ['R', 'Reset the talk timer'],
  ['Q', 'Show the quiz solution'], ['L', 'Laser pointer'], ['D', 'Draw'], ['A', 'Draw an arrow'], ['E', 'Erase the drawing'],
  ['?  H', 'This list'], ['Esc', 'Put the tool away, then end presenting'],
]
const keysHelp = ref(false)
function presentKey(e) {
  if (e.target.closest?.('.el.board')) return // typing into a notes box (Esc first ends the typing there)
  const plain = !e.metaKey && !e.ctrlKey && !e.altKey
  if (plain && /^[0-9]$/.test(e.key)) {
    jump.value += e.key
    clearTimeout(jumpTimer)
    jumpTimer = setTimeout(() => { jump.value = '' }, 2000)
    return e.preventDefault()
  }
  if (e.key === 'Enter' && jump.value) { clearTimeout(jumpTimer); presentGo(+jump.value - 1); return e.preventDefault() }
  const k = e.key.toLowerCase()
  if (plain && (k === 'b' || k === '.' || k === 'w' || k === ',')) {
    const want = k === 'b' || k === '.' ? 'black' : 'white'
    blank.value = blank.value === want ? null : want
    return e.preventDefault()
  }
  if (plain && k === 'r') { resetTimer(); return e.preventDefault() }
  if (plain && k === 'q') { for (const el of deck.slides[ui.slide]?.elements || []) if (el.type === 'quiz') toggleSolution(el.id); return e.preventDefault() }
  if (plain && (k === 'l' || k === 'd' || k === 'a')) { setTool({ l: 'laser', d: 'pen', a: 'arrow' }[k]); return e.preventDefault() }
  if (plain && (k === 'e' || k === 'c')) { strokes.value = []; return e.preventDefault() }
  if (e.key === '?' || (plain && k === 'h')) { keysHelp.value = !keysHelp.value; return e.preventDefault() }
  if (e.key === 'Escape' && keysHelp.value) { keysHelp.value = false; return e.preventDefault() }
  if (e.key === 'Escape' && tool.value) { tool.value = null; return e.preventDefault() }
  const d = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, Enter: 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1, Backspace: -1 }[e.key]
  if (d) presentStep(d)
  else if (e.key === 'Home') presentGo(nextShown(deck.slides, -1, 1))
  else if (e.key === 'End') presentGo(nextShown(deck.slides, deck.slides.length, -1))
  else if (e.key === 'Escape') stopPresenting()
  else if (plain && k === 'p') { presenterView.value = !presenterView.value; fitPresenter() }
  else return
  e.preventDefault()
}
// touch: a horizontal swipe changes the slide, and the click that may follow it does not advance again
let swipe = null, swiped = false
function swipeDown(e) {
  swiped = false
  swipe = !tool.value && e.pointerType === 'touch' && e.isPrimary ? { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 } : null
}
function swipeMove(e) { if (swipe?.id === e.pointerId) Object.assign(swipe, { dx: e.clientX - swipe.x, dy: e.clientY - swipe.y }) }
function swipeUp(e) {
  if (swipe?.id !== e.pointerId) return
  const { dx, dy } = swipe
  swipe = null
  if (Math.abs(dx) <= 40 || Math.abs(dx) <= Math.abs(dy)) return
  swiped = true
  presentStep(dx < 0 ? 1 : -1)
}
function presentClick(e) {
  if (swiped) { swiped = false; return }
  const a = e.target.closest('a[href]')
  if (a) return window.open(a.href, '_blank', 'noopener')
  if (tool.value) return // pointing or drawing does not turn the slide
  if (e.target.closest('iframe, .pv-side, .pv-bar, .timer-face, .picker-face, .el.board, .quiz-tile, .quiz-reveal')) return // a timer click starts the timer, a picker click draws, not the next slide
  presentStep(e.clientX < innerWidth / 4 ? -1 : 1) // the left edge goes back: touch screens have no arrow keys
}
const elapsed = computed(() => { const s = Math.max(0, Math.floor((now.value - started.value) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` })

// --- command palette ---
// [label, action, shortcut]: shortcuts are spelled 'mod+shift+alt+key' (mod = ⌘ on Mac, Strg elsewhere);
// the same list drives the command palette, its hints and the keyboard handling
// what the theme gallery shows: big enough to read at 13 %
// menu previews: built once (again on a language switch), not on every render
const PREVIEW_STYLE = { transform: 'scale(0.13)' }
const THEME_PREVIEW = computed(() => ({ layout: 'default', elements: [
  { id: 't', type: 'text', title: true, x: 56, y: 30, w: 868, h: 60, html: `<h1>${t('Title')}</h1>`, fontSize: 30 },
  { id: 'l', type: 'text', x: 56, y: 130, w: 520, h: 300, html: `<ul><li>${t('Item one')}</li><li>${t('Item')} <a href="#">${t('two')}</a></li><li><code>code</code></li></ul>`, fontSize: 40 },
  { id: 'c', type: 'code', x: 620, y: 140, w: 300, h: 220, lang: 'js', code: 'const a = 1\nlog(a)', fontSize: 30 },
] }))
const SHAPE_NAMES = { rect: ['Rectangle', 'r'], rounded: ['Rounded'], ellipse: ['Ellipse', 'o'], triangle: ['Triangle'], arrow: ['Arrow', 'a'], line: ['Line'] }
const pickImage = () => document.querySelector('.topbar input[type=file][accept^="image"]')?.click()
const commands = computed(() => [
  [t('New slide'), () => A.addSlide(), 'n'], [t('Duplicate slide'), () => A.duplicateSlide(), 'mod+shift+d'], [t('Delete slide'), () => A.deleteSlide(), 'mod+shift+backspace'],
  [t('Move slide up'), () => A.moveSlide(ui.slide, ui.slide - 1), 'alt+arrowup'], [t('Move slide down'), () => A.moveSlide(ui.slide, ui.slide + 1), 'alt+arrowdown'],
  ...deck.layouts.map(l => [t('New slide: {0}', l.name), () => A.addSlide(l)]), [t('Edit master and layouts'), () => A.editMaster()],
  [t('Insert text'), () => A.insert('text'), 't'], [t('Insert heading'), () => A.insert('heading'), 'h'], [t('Insert bullet list'), () => A.insert('list'), 'l'],
  [t('Insert numbered list'), () => A.insert('olist'), 'shift+l'], [t('Insert quote'), () => A.insert('quote'), 'q'], [t('Insert code'), () => A.insert('code'), 'c'],
  [t('Insert image'), pickImage, 'i'],
  ...TABLE_PRESETS.map(([id, n], i) => [t('Insert table: {0}', t(n)), () => A.insert('table', id), i ? undefined : 'b']),
  ...CALLOUTS.map(([k, n]) => [t('Callout: {0}', t(n)), () => A.insert('callout', k)]),
  ...Object.entries(SHAPE_NAMES).map(([s, [n, key]]) => [t('Insert shape: {0}', t(n)), () => A.insert('shape', s), key]),
  [t('Insert YouTube video'), () => { ytUrl.value = ''; openDlg(ytDialog.value) }, 'y'], [t('Insert timer'), () => A.insert('timer')], [t('Insert quiz'), () => A.insert('quiz')], [t('Insert random picker'), () => A.insert('picker')], [t('Notes box for the class'), () => A.insert('board')],
  [t('Hide/show slide'), () => A.toggleHidden()], [t('Edit this slide’s Markdown'), () => openMarkdown('slide'), 'm'], [t('Insert slides from Markdown (e.g. from AI)'), () => openMarkdown('new'), 'shift+m'], [t('Markdown tutorial'), () => openTutorial()],
  [t('New deck'), newDeck, 'shift+n'],
  [t('Present from current slide'), () => present(), 'p'], [t('Present from beginning'), () => present(0), 'shift+p'],
  [t('Presenter view'), () => { presenterView.value = true; present() }, 'alt+p'],
  [t('Show/hide slide list'), () => (panels.slides = !panels.slides), 'alt+b'], [t('Show/hide properties'), () => (panels.props = !panels.props), 'alt+e'],
  [t('Undo'), () => undo(), 'mod+z'], [t('Redo'), redo, 'mod+shift+z'],
  [t('Zoom in'), () => zoomBy(1.25), 'mod+='], [t('Zoom out'), () => zoomBy(1 / 1.25), 'mod+-'], [t('Zoom to 100 %'), () => setZoom(1), 'shift+0'],
  [t('Fit slide to window'), () => setZoom(null), 'mod+0'], [t('Zoom to fit'), () => setZoom(null), 'shift+1'],
  [t('Find'), () => openFind(), 'mod+f'], [t('Replace'), () => openFind(true), 'mod+alt+f'],
  [t('Select all'), A.selectAll, 'mod+a'], [t('Copy formatting'), A.copyLook, 'mod+alt+c'], [t('Paste formatting'), () => A.pasteLook(), 'mod+alt+v'], [t('Duplicate'), () => (selection.value.length ? A.duplicate() : A.duplicateSlide()), 'mod+d'],
  [t('Bring forward'), () => A.order('forward'), 'mod+arrowup'], [t('Send backward'), () => A.order('backward'), 'mod+arrowdown'],
  [t('Bring to front'), () => A.order('front'), 'mod+shift+arrowup'], [t('Send to back'), () => A.order('back'), 'mod+shift+arrowdown'],
  [t('Group'), A.group, 'mod+g'], [t('Ungroup'), A.ungroup, 'mod+shift+g'],
  [t('Export …'), () => openExport(), 'mod+e'],
  [t('Export: PDF (all)'), () => A.pdf(), 'mod+p'], [t('Export: PowerPoint (all)'), () => A.pptx(), 'mod+shift+e'], [t('Export: Slidev project (ZIP)'), A.slidev, 'mod+alt+s'],
  [t('Export: PowerPoint exact copy (all)'), () => A.exportAs('pptx-image')], [t('Export: OpenDocument .odp (all)'), () => A.exportAs('odp')], [t('Export: PowerPoint for Google Slides (all)'), () => A.exportAs('pptx-google')],
  [t('Export: HTML presentation (all)'), () => A.exportAs('html')], [t('Export: PNG images (all)'), () => A.exportAs('png')],
  ...decks.value.filter(d => d.file !== deck.entry).map(d => [t('Export: deck “{0}” …', d.name), () => openExport(d.file)]),
  [t('Save project as file'), A.saveFile, 'mod+s'], [t('Go to project overview'), () => { ui.home = true }],
  [t('Save snapshot'), snapNow], [t('Version history …'), openSnaps],
  [t('All commands and shortcuts'), openPalette, 'mod+k'],
  [t('Take the tour'), () => begin(false)], [t('Full tour incl. Markdown (~5 min)'), () => begin(true)],
  [t('Revert this slide to imported version'), () => A.revertSlides([slide.value])],
  [t('Revert all changed slides to imported version'), () => ask(t('Revert {0} changed imported slides? Your changes to them will be lost.', deck.slides.filter(A.canRevert).length), () => A.revertSlides(), t('Revert'))],
  ...[...themeIds(false), ...themeIds(true)].map(id => [`Theme: ${themeName(id)}`, () => setTheme(id)]),
  [t('Edit theme …'), () => themeEditor.value.open(deck.theme)], [t('Import theme …'), () => document.querySelector('[data-theme-import]')?.click()],
])
const KEY_NAMES = { arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', backspace: '⌫', enter: '↵' }
const keyLabel = spec => spec && spec.split('+').map(k => ({ mod: isMac ? '⌘' : t('Ctrl+'), shift: '⇧', alt: isMac ? '⌥' : 'Alt+' }[k] || KEY_NAMES[k] || k.toUpperCase())).join('')
const filtered = computed(() => {
  const q = paletteQuery.value.toLowerCase().split(/\s+/).filter(Boolean)
  // without a query: everything that has a shortcut first, as a cheat sheet
  if (!q.length) return [...commands.value].sort((a, b) => !a[2] - !b[2])
  return commands.value.filter(([n, , k]) => q.every(w => n.toLowerCase().includes(w) || keyLabel(k)?.toLowerCase() === w)).slice(0, 30)
})
function openPalette() { paletteQuery.value = ''; paletteIndex.value = 0; openDlg(paletteDialog.value) }
function paletteKey(e) {
  if (e.key === 'ArrowDown') paletteIndex.value = Math.min(filtered.value.length - 1, paletteIndex.value + 1)
  else if (e.key === 'ArrowUp') paletteIndex.value = Math.max(0, paletteIndex.value - 1)
  else if (e.key === 'Enter') runCommand(filtered.value[paletteIndex.value])
  else return
  e.preventDefault()
}
function runCommand(c) {
  if (!c) return
  paletteDialog.value.close()
  A.run(c[1])
}

// --- keyboard & clipboard ---
function onKey(e) {
  // handled already (menu arrows, palette Enter, ⌘↵ in the Markdown editor): not a second time as a shortcut
  if (presenting.value || ui.home || e.defaultPrevented) return
  const k = e.key.toLowerCase(), cmd = e.metaKey || e.ctrlKey
  // letters by position: Alt/Option changes e.key (⌥P = π)
  // digits by position too (Shift+0 is ")" or "="), and "+" as "=" (⌘+ on German keyboards)
  const name = /^Key[A-Z]$/.test(e.code) ? e.code[3].toLowerCase() : /^Digit\d$/.test(e.code) ? e.code[5] : k === '+' ? '=' : k
  if (cmd && k === 'k' && ui.editing) { e.preventDefault(); return openLink() }
  // crop mode: Enter or Esc finishes it (before anything else uses those keys)
  if (ui.crop && (k === 'escape' || k === 'enter') && !inField(e)) { e.preventDefault(); return A.endCrop() }
  if (e.key === 'F5' || (cmd && e.key === 'Enter')) { e.preventDefault(); return present(e.shiftKey ? 0 : ui.slide) }
  // shortcuts that also work while typing
  const global = ['mod+s', 'mod+f', 'mod+alt+f', 'mod+k', 'mod+p', 'mod+shift+e', 'mod+alt+s']
  const typing = inField(e)
  if (e.key === '?' && !typing) { e.preventDefault(); return openPalette() }
  for (const c of commands.value) {
    const parts = c[2]?.split('+')
    if (!parts || parts.at(-1) !== name || parts.includes('mod') !== cmd || parts.includes('shift') !== e.shiftKey || parts.includes('alt') !== e.altKey) continue
    if (typing && !global.includes(c[2])) return
    e.preventDefault()
    return A.run(c[1])
  }
  if (typing) return
  if (cmd && k === 'y') { e.preventDefault(); return redo() }
  const sel = selection.value.length
  const step = e.shiftKey ? 10 : 1
  const move = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[k]
  if (move && sel && !cmd && !e.altKey) { e.preventDefault(); return A.nudge(...move) }
  if (move && !sel && !cmd && !e.altKey) { e.preventDefault(); return A.go(ui.slide + (move[0] || move[1] > 0 ? Math.sign(move[0] + move[1]) : -1)) }
  if ((k === 'delete' || k === 'backspace') && sel) { e.preventDefault(); return A.remove() }
  if ((k === 'delete' || k === 'backspace') && !sel && e.target.closest?.('.thumb')) { e.preventDefault(); return A.deleteSlide() }
  if (k === 'escape' && ui.painting) return (ui.painting = false)
  if (k === 'escape') return (ui.sel = [])
  if (k === 'enter' && primary.value) { e.preventDefault(); return view.value?.edit({ currentTarget: document.querySelector(`.stage [data-el="${primary.value.id}"]`), target: document.body, clientX: -1, clientY: -1 }, primary.value) }
}
// --- context menu on the slide: element actions, or slide actions on the background ---
// while typing in a box the browser's own menu (spelling, copy, paste) stays
const ctx = ref(), ctxAt = ref(null) // { el, cell, event } of the right-click
function onContext(e) {
  const box = e.target.closest('[data-el]')
  // crop mode: on the picture or its box the crop menu, anywhere else cropping ends first
  const cropping = ui.crop && slide.value.elements.find(x => x.id === ui.crop)
  if (cropping && (e.target.closest('.crop-ghost') || box?.dataset.el === ui.crop)) {
    e.preventDefault()
    ctxAt.value = { cropEl: cropping }
    return ctx.value.openAt(e.clientX, e.clientY)
  }
  if (ui.crop) A.endCrop()
  const el = box && slide.value.elements.find(x => x.id === box.dataset.el)
  const cell = el?.type === 'table' && e.target.closest('[data-r]')
  // typing in a table cell or a code block gets its own menu; in text boxes the browser's menu stays
  const editingCell = !!cell && ui.editing === el.id
  const code = el?.type === 'code' && ui.editing === el.id && box.querySelector('textarea')
  if (code) {
    e.preventDefault()
    ctxAt.value = { el, code, hasSel: code.selectionStart !== code.selectionEnd }
    return ctx.value.openAt(e.clientX, e.clientY, true) // the textarea keeps the focus: editing ends on blur
  }
  // typing in a shape: a small format menu; the text keeps the focus and its selection
  if (el?.type === 'shape' && ui.editing === el.id) {
    e.preventDefault()
    ctxAt.value = { el, shapeText: box.querySelector('.shape-text > .content'), text: getSelection().toString() }
    return ctx.value.openAt(e.clientX, e.clientY, true)
  }
  if (el && ui.editing === el.id && !editingCell) return
  e.preventDefault()
  if (!editingCell) ui.editing = null
  if (!el) ui.sel = []
  else if (!ui.sel.includes(el.id)) ui.sel = withGroups(slide.value.elements, [el.id])
  if (cell) {
    // a click inside the marked cells keeps the marking, anywhere else it moves to that cell
    const r = +cell.dataset.r, c = +cell.dataset.c, [r0, r9, c0, c9] = ui.cellEnd ? area(el) : []
    if (!ui.cellEnd || r < r0 || r > r9 || c < c0 || c > c9) { ui.cell = { r, c }; ui.cellEnd = null }
  }
  ctxAt.value = { el, cell: !!cell, editingCell, text: editingCell ? getSelection().toString() : '', event: { currentTarget: box, target: e.target, clientX: e.clientX, clientY: e.clientY } }
  ctx.value.openAt(e.clientX, e.clientY)
}
// right-click on a thumbnail: that slide becomes the current one, the menu acts on it
function onThumbContext(e, i) {
  e.preventDefault()
  ui.slide = i
  ui.sel = []
  ctxAt.value = { thumb: i }
  ctx.value.openAt(e.clientX, e.clientY)
}
// "⋯" on a thumbnail: the same menu, below the button
function openThumbMenu(e, i) {
  const r = e.currentTarget.getBoundingClientRect()
  Object.assign(ui, { slide: i, sel: [] })
  ctxAt.value = { thumb: i }
  ctx.value.openAt(r.left, r.bottom)
}
// right-click on a deck header: the deck's actions (the entry deck can't be renamed, moved or removed)
function onDeckContext(e, g) {
  e.preventDefault()
  ctxAt.value = { group: g }
  ctx.value.openAt(e.clientX, e.clientY)
}
// same rule as A.moveDeck: within the list and never past the entry deck
const canMoveDeck = (g, dir) => { const j = decks.value.findIndex(d => d.file === g.file) + dir; return j >= 0 && j < decks.value.length && decks.value[j].file !== deck.entry }
const ctxEdit = () => view.value?.edit(ctxAt.value.event, ctxAt.value.el)
// copy/cut go through the clipboard event, so the system clipboard gets them like with ⌘C
const clip = kind => document.execCommand(kind)
const copyText = s => navigator.clipboard.writeText(s).then(() => A.toast(t('Copied.')), () => A.toast(t('Copying not allowed – please use ⌘C/Ctrl+C.')))
// code block being edited: work on the textarea, its input event keeps v-model (and undo) in step
const taReplace = (ta, text, mode = 'end') => { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, mode); ta.dispatchEvent(new Event('input')) }
const taText = ta => ta.value.slice(ta.selectionStart, ta.selectionEnd)
const lineAt = (v, i) => v.slice(0, i).split('\n').length
function taLines(ta, fn) { // every line the selection touches
  const v = ta.value, a = v.lastIndexOf('\n', ta.selectionStart - 1) + 1
  let b = v.indexOf('\n', Math.max(ta.selectionStart, ta.selectionEnd - 1))
  if (b < 0) b = v.length
  ta.setSelectionRange(a, b)
  taReplace(ta, v.slice(a, b).split('\n').map(fn).join('\n'), 'select')
}
function markLines(ta, el) {
  const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd > s && v[ta.selectionEnd - 1] === '\n' ? ta.selectionEnd - 1 : ta.selectionEnd
  el.meta = toggleMarked(el.meta, lineAt(v, s), lineAt(v, e))
}
const codeCut = ta => navigator.clipboard.writeText(taText(ta)).then(() => taReplace(ta, ''), () => A.toast(t('Cut not allowed – please use ⌘X/Ctrl+X.')))
const codePaste = ta => navigator.clipboard.readText().then(s => taReplace(ta, s), () => A.toast(t('Paste not allowed – please use ⌘V/Ctrl+V.')))
const ctxTable = (fn, where) => A.run(() => fn(ctxAt.value.el, where))
const CLIP = 'application/x-slides-builder'
function onClipboard(e) {
  if (presenting.value || ui.home || inField(e)) return
  if (e.type !== 'paste') {
    if (!selection.value.length) return
    // the images ride along, so pasting into another project keeps them (also those inside text)
    e.clipboardData.setData(CLIP, JSON.stringify({ elements: selection.value, assets: usedAssets([{ elements: selection.value }]) }))
    e.clipboardData.setData('text/plain', selection.value.map(el => el.code || el.html?.replace(/<[^>]+>/g, '') || '').join('\n'))
    if (e.type === 'cut') A.remove()
  } else if (e.clipboardData.getData(CLIP)) {
    A.run(() => {
      const d = JSON.parse(e.clipboardData.getData(CLIP)) // untrusted: an old array of elements or { elements, assets }
      const list = Array.isArray(d) ? d : Array.isArray(d?.elements) ? d.elements : []
      // only images this project lacks, and only image data (the loadDeck rule)
      for (const [k, v] of Object.entries(Array.isArray(d) ? {} : d?.assets || {})) if (!deck.assets[k] && typeof v === 'string' && /^data:image\//.test(v)) deck.assets[k] = v
      const els = regroup(cleanSlides([{ elements: list }])[0].elements.map(el => ({ ...el, x: el.x + 16, y: el.y + 16 })))
      slide.value.elements.push(...els)
      ui.sel = els.map(el => el.id)
      if (els.length < list.length) A.toast(t('{0} elements could not be pasted.', list.length - els.length))
    })
  } else if ([...e.clipboardData.files].some(f => f.type.startsWith('image/'))) {
    A.addImages([...e.clipboardData.files])
  } else {
    const text = e.clipboardData.getData('text/plain')
    if (!text.trim()) return
    // markdown pasted onto the canvas becomes slides when it looks like Slidev, otherwise text
    if (/^---\s*$/m.test(text) || /^#\s/m.test(text)) { mdTarget.value = 'new'; mdText.value = mdStart = text; mdOpen.value = true; openDlg(mdDialog.value) }
    else A.addElement({ type: 'text', x: 120, y: 140, w: 600, h: 40, html: text.split(/\n{2,}/).map(p => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('') })
  }
  e.preventDefault()
}
</script>

<template>
  <Home v-if="ready && ui.home" @import="pickImport($event, 'project')" />

  <div v-else-if="ready" class="app" :inert="presenting">
    <header class="topbar">
      <button class="logo" :title="t('Project overview')" @click="ui.home = true"><Icon name="slides" :size="20" /></button>
      <div class="doc">
        <div class="doc-row">
          <input v-model="deck.title" class="doc-title" :aria-label="t('Project title')" spellcheck="false" />
          <span class="save-state" :class="ui.save" role="status" :title="ui.save === 'failed' ? ui.status : t('All changes are stored in this browser (IndexedDB)')">
            <Icon v-if="ui.save === 'saved'" name="check" :size="14" />{{ { saving: t('Saving …'), saved: t('Saved'), failed: t('Not saved – save as file') }[ui.save] }}
          </span>
        </div>
        <div class="menubar">
          <Menu :label="t('File')">
            <button class="mi" @click="ui.home = true"><Icon name="home" />{{ t('All projects') }}</button>
            <hr />
            <label class="mi"><Icon name="folder" />{{ t('Open Slidev project …') }}<input type="file" webkitdirectory hidden @change="pickImport([...$event.target.files], 'project'); $event.target.value = ''" /></label>
            <label class="mi"><Icon name="upload" />{{ t('Add decks (.md) …') }}<input type="file" accept=".md,text/markdown" multiple hidden @change="pickImport([...$event.target.files], 'decks'); $event.target.value = ''" /></label>
            <label class="mi"><Icon name="upload" />{{ t('Add decks from folder …') }}<input type="file" webkitdirectory hidden @change="pickImport([...$event.target.files], 'decks'); $event.target.value = ''" /></label>
            <button class="mi" @click="openMarkdown('new')"><Icon name="markdown" />{{ t('Insert slides from Markdown …') }}</button>
            <button class="mi" @click="openTutorial()"><Icon name="book" />{{ t('Markdown tutorial …') }}</button>
            <hr />
            <button class="mi" @click="A.saveFile"><Icon name="save" />{{ t('Save project as file') }}<kbd>{{ mod }}S</kbd></button>
            <button class="mi" @click="openSnaps"><Icon name="history" />{{ t('Version history …') }}</button>
          </Menu>
          <Menu :label="t('Edit')">
            <button class="mi" :disabled="!canUndo()" @click="undo()"><Icon name="undo" />{{ t('Undo') }}<kbd>{{ mod }}Z</kbd></button>
            <button class="mi" :disabled="!canRedo()" @click="redo"><Icon name="redo" />{{ t('Redo') }}<kbd>{{ mod }}⇧Z</kbd></button>
            <hr />
            <button class="mi" @click="openFind()"><Icon name="search" />{{ t('Find …') }}<kbd>{{ mod }}F</kbd></button>
            <button class="mi" @click="openFind(true)"><Icon name="search" />{{ t('Replace …') }}<kbd>{{ keyLabel('mod+alt+f') }}</kbd></button>
            <hr />
            <button class="mi" @click="A.selectAll"><Icon name="selectAll" />{{ t('Select all') }}<kbd>{{ mod }}A</kbd></button>
            <button class="mi" :disabled="!selection.length" @click="A.duplicate"><Icon name="copy" />{{ t('Duplicate') }}<kbd>{{ mod }}D</kbd></button>
            <button class="mi" :disabled="!selection.length" @click="A.remove"><Icon name="trash" />{{ t('Delete') }}<kbd>⌫</kbd></button>
            <hr />
            <button class="mi" @click="openPalette"><Icon name="keyboard" />{{ t('All commands & shortcuts …') }}<kbd>{{ mod }}K</kbd></button>
            <button class="mi" @click="begin(false)"><Icon name="info" />{{ t('Take the tour') }}</button>
          </Menu>
          <Menu :label="t('Insert')">
            <button class="mi" @click="A.insert('text')"><Icon name="text" />{{ t('Text') }}<kbd>{{ keyLabel('t') }}</kbd></button>
            <button class="mi" @click="A.insert('heading')"><Icon name="heading" />{{ t('Heading') }}<kbd>{{ keyLabel('h') }}</kbd></button>
            <button class="mi" @click="A.insert('list')"><Icon name="list" />{{ t('Bullet list') }}<kbd>{{ keyLabel('l') }}</kbd></button>
            <button class="mi" @click="A.insert('olist')"><Icon name="olist" />{{ t('Numbered list') }}<kbd>{{ keyLabel('shift+l') }}</kbd></button>
            <button class="mi" @click="A.insert('quote')"><Icon name="quote" />{{ t('Quote') }}<kbd>{{ keyLabel('q') }}</kbd></button>
            <button class="mi" @click="A.insert('code')"><Icon name="code" />{{ t('Code') }}<kbd>{{ keyLabel('c') }}</kbd></button>
            <button class="mi" @click="pickImage"><Icon name="image" />{{ t('Image …') }}<kbd>{{ keyLabel('i') }}</kbd></button>
            <hr />
            <button class="mi" @click="A.insert('table', TABLE_PRESETS[0][0])"><Icon name="table" />{{ t('Table') }}<kbd>{{ keyLabel('b') }}</kbd></button>
            <div class="shape-row">
              <button v-for="s in ['rect', 'rounded', 'ellipse', 'triangle', 'arrow', 'line']" :key="s" class="shape-btn" :aria-label="t(SHAPE_NAMES[s][0])" :title="SHAPE_NAMES[s][1] ? `${t(SHAPE_NAMES[s][0])} (${keyLabel(SHAPE_NAMES[s][1])})` : t(SHAPE_NAMES[s][0])" @click="A.insert('shape', s)">
                <svg viewBox="0 0 40 28"><rect v-if="s === 'rect'" x="4" y="4" width="32" height="20" /><rect v-if="s === 'rounded'" x="4" y="4" width="32" height="20" rx="6" /><ellipse v-if="s === 'ellipse'" cx="20" cy="14" rx="16" ry="10" /><polygon v-if="s === 'triangle'" points="20,3 36,25 4,25" /><polygon v-if="s === 'arrow'" points="3,9 24,9 24,3 37,14 24,25 24,19 3,19" /><line v-if="s === 'line'" x1="4" y1="14" x2="36" y2="14" /></svg>
              </button>
            </div>
            <hr />
            <button v-for="[k, n, c] in CALLOUTS" :key="k" class="mi" @click="A.insert('callout', k)"><i class="dot" :style="{ background: c }" />{{ t('Callout: {0}', t(n)) }}</button>
            <hr />
            <button class="mi" @click="ytUrl = ''; openDlg(ytDialog)"><Icon name="video" />{{ t('YouTube video …') }}<kbd>{{ keyLabel('y') }}</kbd></button>
            <button class="mi" @click="A.insert('timer')"><Icon name="timer" />{{ t('Timer') }}</button>
            <button class="mi" @click="A.insert('quiz')"><Icon name="quiz" />{{ t('Quiz') }}</button>
            <button class="mi" @click="A.insert('picker')"><Icon name="dice" />{{ t('Random picker') }}</button>
            <button class="mi" @click="A.insert('board')"><Icon name="list" />{{ t('Notes box for the class') }}</button>
            <button class="mi" @click="openMarkdown('new')"><Icon name="markdown" />{{ t('Markdown / AI slides …') }}<kbd>{{ keyLabel('shift+m') }}</kbd></button>
          </Menu>
          <Menu :label="t('Arrange')">
            <button class="mi" :disabled="!selection.length" @click="A.order('front')"><Icon name="toFront" />{{ t('Bring to front') }}<kbd>{{ keyLabel('mod+shift+arrowup') }}</kbd></button>
            <button class="mi" :disabled="!selection.length" @click="A.order('forward')"><Icon name="forward" />{{ t('Bring forward') }}<kbd>{{ keyLabel('mod+arrowup') }}</kbd></button>
            <button class="mi" :disabled="!selection.length" @click="A.order('backward')"><Icon name="backward" />{{ t('Send backward') }}<kbd>{{ keyLabel('mod+arrowdown') }}</kbd></button>
            <button class="mi" :disabled="!selection.length" @click="A.order('back')"><Icon name="toBack" />{{ t('Send to back') }}<kbd>{{ keyLabel('mod+shift+arrowdown') }}</kbd></button>
            <hr />
            <button class="mi" :disabled="selection.length < 2" @click="A.group"><Icon name="group" />{{ t('Group') }}<kbd>{{ keyLabel('mod+g') }}</kbd></button>
            <button class="mi" :disabled="!selection.some(e => e.group)" @click="A.ungroup"><Icon name="ungroup" />{{ t('Ungroup') }}<kbd>{{ keyLabel('mod+shift+g') }}</kbd></button>
            <hr />
            <div class="mi-row" role="group" :aria-label="selection.length > 1 ? t('Align to each other') : t('Align on slide')">
              <button v-for="[a, i, tip] in [['left', 'alignL', 'Left'], ['center', 'alignC', 'Center horizontally'], ['right', 'alignR', 'Right'], ['top', 'alignT', 'Top'], ['middle', 'alignM', 'Center vertically'], ['bottom', 'alignB', 'Bottom']]" :key="a"
                class="mi" :disabled="!selection.length" :title="t(selection.length > 1 ? '{0} (to each other)' : '{0} (on slide)', t(tip))" :aria-label="t(tip)" @click="A.align(a)"><Icon :name="i" /></button>
            </div>
            <button class="mi" :disabled="selection.length < 3" @click="A.distribute('h')"><Icon name="distH" />{{ t('Distribute horizontally') }}</button>
            <button class="mi" :disabled="selection.length < 3" @click="A.distribute('v')"><Icon name="distV" />{{ t('Distribute vertically') }}</button>
          </Menu>
          <Menu :label="t('View')">
            <button class="mi" @click="present()"><Icon name="play" />{{ t('Present') }}<kbd>P</kbd></button>
            <button class="mi" @click="present(0)"><Icon name="play" />{{ t('Present from beginning') }}<kbd>⇧P</kbd></button>
            <button class="mi" @click="presenterView = true; present()"><Icon name="presenter" />{{ t('Presenter view') }}<kbd>{{ keyLabel('alt+p') }}</kbd></button>
            <hr />
            <button class="mi" @click="zoomBy(1.25)"><Icon name="zoomIn" />{{ t('Zoom in') }}<kbd>{{ keyLabel('mod+=') }}</kbd></button>
            <button class="mi" @click="zoomBy(1 / 1.25)"><Icon name="zoomOut" />{{ t('Zoom out') }}<kbd>{{ keyLabel('mod+-') }}</kbd></button>
            <button class="mi" @click="setZoom(null)"><Icon name="fullscreen" />{{ t('Fit slide to window') }}<kbd>{{ keyLabel('mod+0') }}</kbd></button>
            <button class="mi" @click="setZoom(1)"><Icon name="check" :style="{ visibility: zoom === 1 ? null : 'hidden' }" />{{ t('Zoom to 100 %') }}<kbd>{{ keyLabel('shift+0') }}</kbd></button>
            <hr />
            <button class="mi" :aria-pressed="panels.slides" @click="panels.slides = !panels.slides"><Icon name="slides" />{{ t('Show/hide slide list') }}<kbd>{{ keyLabel('alt+b') }}</kbd></button>
            <button class="mi" :aria-pressed="panels.props" @click="panels.props = !panels.props"><Icon name="layout" />{{ t('Show/hide properties') }}<kbd>{{ keyLabel('alt+e') }}</kbd></button>
            <hr />
            <button class="mi" :aria-pressed="!!ui.master" @click="ui.master ? (ui.master = null) : A.editMaster()"><Icon name="slides" />{{ t('Edit master and layouts') }}</button>
          </Menu>
        </div>
      </div>

      <div class="bar">
      <div class="tools">
        <Menu v-slot="{ open }" icon="slidePlus" :label="t('Slide')" :title="t('New slide (N)')" wide>
          <div class="preset-grid">
            <button v-for="l in deck.layouts" :key="l.id" class="preset-card" @click="A.addSlide(l)">
              <span class="mini-slide"><SlideView v-if="open" :slide="l" :index="0" :style="PREVIEW_STYLE" inert /></span>
              {{ l.name }}
            </button>
          </div>
        </Menu>
        <span class="divider" />
        <button class="tb" :title="t('Text (T)')" @click="A.insert('text')"><Icon name="text" /><span>{{ t('Text') }}</span></button>
        <label class="tb" :title="t('Image (I) – also via drag & drop or paste')"><Icon name="image" /><span>{{ t('Image') }}</span><input type="file" accept="image/*" multiple hidden @change="A.addImages([...$event.target.files]); $event.target.value = ''" /></label>
        <Menu icon="table" :label="t('Table')" :title="t('Table')">
          <button v-for="[id, n] in TABLE_PRESETS" :key="id" class="mi" @click="A.insert('table', id)">
            <span class="slide mini-tbl" :class="`theme-${deck.theme}`"><span class="tbl-wrap" :data-table="id"><table><thead><tr><th /><th /><th /></tr></thead><tbody><tr><td /><td /><td /></tr><tr><td /><td /><td /></tr></tbody></table></span></span>{{ t(n) }}
          </button>
        </Menu>
        <Menu icon="shapes" :label="t('Shape')" :title="t('Shape')">
          <div class="shape-row shape-grid">
            <button v-for="s in ['rect', 'rounded', 'ellipse', 'triangle', 'arrow', 'line']" :key="s" class="shape-btn" :aria-label="t(SHAPE_NAMES[s][0])" :title="SHAPE_NAMES[s][1] ? `${t(SHAPE_NAMES[s][0])} (${keyLabel(SHAPE_NAMES[s][1])})` : t(SHAPE_NAMES[s][0])" @click="A.insert('shape', s)">
              <svg viewBox="0 0 40 28"><rect v-if="s === 'rect'" x="4" y="4" width="32" height="20" /><rect v-if="s === 'rounded'" x="4" y="4" width="32" height="20" rx="6" /><ellipse v-if="s === 'ellipse'" cx="20" cy="14" rx="16" ry="10" /><polygon v-if="s === 'triangle'" points="20,3 36,25 4,25" /><polygon v-if="s === 'arrow'" points="3,9 24,9 24,3 37,14 24,25 24,19 3,19" /><line v-if="s === 'line'" x1="4" y1="14" x2="36" y2="14" /></svg>
            </button>
          </div>
        </Menu>
        <span data-tour="insert" class="tour-anchor"><Menu icon="insert" :label="t('Insert')" :title="t('Insert')">
          <button class="mi" @click="A.insert('heading')"><Icon name="heading" />{{ t('Heading') }}<kbd>{{ keyLabel('h') }}</kbd></button>
          <button class="mi" @click="A.insert('list')"><Icon name="list" />{{ t('Bullet list') }}<kbd>{{ keyLabel('l') }}</kbd></button>
          <button class="mi" @click="A.insert('olist')"><Icon name="olist" />{{ t('Numbered list') }}<kbd>{{ keyLabel('shift+l') }}</kbd></button>
          <button class="mi" @click="A.insert('quote')"><Icon name="quote" />{{ t('Quote') }}<kbd>{{ keyLabel('q') }}</kbd></button>
          <button class="mi" @click="A.insert('code')"><Icon name="code" />{{ t('Code') }}<kbd>{{ keyLabel('c') }}</kbd></button>
          <hr />
          <button v-for="[k, n, c] in CALLOUTS" :key="k" class="mi" @click="A.insert('callout', k)"><i class="dot" :style="{ background: c }" />{{ t('Callout: {0}', t(n)) }}</button>
          <hr />
          <button class="mi" @click="ytUrl = ''; openDlg(ytDialog)"><Icon name="video" />{{ t('YouTube video …') }}<kbd>Y</kbd></button>
          <button class="mi" @click="A.insert('timer')"><Icon name="timer" />{{ t('Timer') }}</button>
          <button class="mi" @click="A.insert('quiz')"><Icon name="quiz" />{{ t('Quiz') }}</button>
          <button class="mi" @click="A.insert('picker')"><Icon name="dice" />{{ t('Random picker') }}</button>
          <button class="mi" @click="A.insert('board')"><Icon name="list" />{{ t('Notes box for the class') }}</button>
          <button class="mi" @click="openMarkdown('new')"><Icon name="markdown" />{{ t('Markdown / AI slides …') }}<kbd>⇧M</kbd></button>
        </Menu></span>
        <span class="divider" />
        <button class="tb icon" :disabled="!canUndo()" :title="`${t('Undo')} (${mod}Z)`" @click="undo()"><Icon name="undo" /></button>
        <button class="tb icon" :disabled="!canRedo()" :title="`${t('Redo')} (${mod}⇧Z)`" @click="redo"><Icon name="redo" /></button>
      </div>

      <div class="right">
        <button class="tb icon" data-tour="palette" :title="`${t('Search commands')} (${mod}K)`" @click="openPalette"><Icon name="search" /></button>
        <div class="zoom-ctl" role="group" :aria-label="t('Zoom')">
          <button class="tb icon small" :aria-label="t('Zoom out')" :title="`${t('Zoom out')} (${keyLabel('mod+-')})`" @click="zoomBy(1 / 1.25)"><Icon name="zoomOut" :size="16" /></button>
          <Menu :label="`${Math.round(scale * 100)} %`" :title="t('Zoom')">
            <button class="mi" @click="zoomBy(1.25)"><Icon name="zoomIn" />{{ t('Zoom in') }}<kbd>{{ keyLabel('mod+=') }}</kbd></button>
            <button class="mi" @click="zoomBy(1 / 1.25)"><Icon name="zoomOut" />{{ t('Zoom out') }}<kbd>{{ keyLabel('mod+-') }}</kbd></button>
            <hr />
            <button class="mi" @click="setZoom(null)"><Icon name="fullscreen" />{{ t('Fit slide to window') }}<kbd>{{ keyLabel('mod+0') }}</kbd></button>
            <button class="mi" @click="setZoom(1)"><Icon name="check" :style="{ visibility: zoom === 1 ? null : 'hidden' }" />100 %<kbd>{{ keyLabel('shift+0') }}</kbd></button>
            <button class="mi" @click="setZoom(2)"><Icon name="check" :style="{ visibility: zoom === 2 ? null : 'hidden' }" />200 %</button>
          </Menu>
          <button class="tb icon small" :aria-label="t('Zoom in')" :title="`${t('Zoom in')} (${keyLabel('mod+=')})`" @click="zoomBy(1.25)"><Icon name="zoomIn" :size="16" /></button>
        </div>
        <span data-tour="theme" class="tour-anchor"><Menu v-slot="{ open }" icon="palette" :label="themeName(deck.theme)" title="Theme" wide>
          <template v-for="own in [false, true]" :key="own">
            <h4 class="mh">{{ own ? t('Own themes') : t('Built-in themes') }}</h4>
            <div class="theme-grid">
              <button v-for="id in themeIds(own)" :key="id" class="theme-card" :class="{ on: deck.theme === id }" @click="setTheme(id)">
                <span class="mini-slide"><SlideView v-if="open" :slide="THEME_PREVIEW" :index="0" :theme="id" :style="PREVIEW_STYLE" inert /></span>
                {{ themeName(id) }}
              </button>
            </div>
            <p v-if="own && !themeIds(true).length" class="mh-note">{{ t('None yet – edit a theme or import a .theme.json.') }}</p>
          </template>
          <div class="mi-row theme-actions">
            <button class="mi" @click="themeEditor.open(deck.theme)"><Icon name="pen" />{{ THEMES[deck.theme]?.custom ? t('Edit theme …') : t('Customize as own theme …') }}</button>
            <label class="mi"><Icon name="upload" />{{ t('Import …') }}<input data-theme-import type="file" accept=".json,application/json" multiple hidden @change="importThemeFiles([...$event.target.files]); $event.target.value = ''" /></label>
          </div>
          <label class="check keep-sizes" data-keep :title="t('The new theme brings its colors and fonts but keeps the current font sizes – so no layout shifts')"><input v-model="keepSizes" type="checkbox" /> {{ t('Keep font sizes when switching') }}<small v-if="deck.typo.from">{{ t('currently: sizes from “{0}”', themeName(deck.typo.from)) }}</small></label>
        </Menu></span>
        <Menu ref="formatMenu" icon="fullscreen" :label="ratioLabel(deck.aspectRatio)" :title="t('Slide format (aspect ratio)')">
          <h4 class="mh">Format</h4>
          <button v-for="r in formats" :key="r" class="mi" :aria-pressed="deck.aspectRatio === r" @click="setFormat(r, deck.canvasWidth)">
            <Icon name="check" :style="{ visibility: deck.aspectRatio === r ? null : 'hidden' }" />{{ ratioLabel(r) }}
          </button>
          <hr />
          <div class="mi-row format-custom" data-keep>
            <input v-model="customRatio" :placeholder="t('Custom …, e.g. 21:9')" :aria-label="t('Custom aspect ratio')" @keydown.enter.prevent="setCustomRatio" />
            <button class="mi" @click="setCustomRatio">OK</button>
          </div>
        </Menu>
        <span data-tour="export" class="tour-anchor"><Menu icon="download" label="Export">
          <h4 class="mh">{{ t('Everything · {0} slides', deck.slides.length) }}</h4>
          <button v-for="f in EXPORTS" :key="f.id" class="mi" @click="A.exportAs(f.id)"><Icon :name="f.id === 'slidev' ? 'markdown' : 'file'" />{{ t(f.name) }} <small class="mi-ext">{{ f.ext }}</small></button>
          <hr />
          <button class="mi" @click="openExport()"><Icon name="download" />{{ t('Export …') }}<kbd>{{ keyLabel('mod+e') }}</kbd></button>
          <button v-if="decks.length > 1" class="mi" @click="openExport(decks.find(d => d.file !== deck.entry)?.file)"><Icon name="file" />{{ t('Export single deck …') }}</button>
        </Menu></span>
        <button class="tb primary" data-tour="present" :title="t('Present (F5)')" @click="present()"><Icon name="play" /><span>{{ t('Present') }}</span></button>
      </div>
      </div>
    </header>

    <main :class="{ 'no-slides': !panels.slides, 'no-props': !panels.props }">
      <MasterPanel v-if="ui.master" @ask="ask" />
      <nav v-else class="slides-panel" data-tour="slides" :aria-label="t('Slides')">
        <div class="panel-head">
          <span>{{ groups.length > 1 ? t('Decks') : t('Slides') }}</span>
          <span class="panel-actions">
            <button class="tb icon small" :aria-label="t('New slide')" :title="`${t('New slide')} (N)`" @click="A.addSlide()"><Icon name="slidePlus" :size="16" /></button>
            <button class="tb icon small" :aria-label="t('New deck')" :title="`${t('New deck')} (${keyLabel('shift+n')})`" @click="newDeck"><Icon name="folder" :size="16" /></button>
          </span>
        </div>
        <div class="slide-list">
          <section v-for="(g, gi) in groups" :key="g.file + gi" class="deck-group"
            :class="{ 'drop-before': dropDeck === gi && deckFrom !== gi, 'drop-after': dropDeck === gi + 1 && gi === groups.length - 1 }"
            @dragover.prevent="deckOver($event, gi)" @drop.prevent="dropDeckAt()">
            <header v-if="groups.length > 1" class="deck-head" :class="{ entry: g.file === deck.entry }" draggable="true" :title="t('Drag to move the deck')"
              @dragstart="deckDragStart($event, gi)" @dragend="deckFrom = null; dropDeck = null" @contextmenu="onDeckContext($event, g)">
              <button class="tb icon small" :aria-expanded="!collapsed.has(g.file)" :aria-label="t(collapsed.has(g.file) ? 'Expand {0}' : 'Collapse {0}', g.name || t('Deck'))" :title="collapsed.has(g.file) ? t('Expand') : t('Collapse')" @click="toggle(g.file)"><Icon :name="collapsed.has(g.file) ? 'chevronR' : 'chevron'" :size="14" /></button>
              <span class="deck-name" :title="g.file">{{ g.name }}</span>
              <span v-if="deckHits(g)" class="find-badge inline" :title="t('{0} matches in this deck', deckHits(g))">{{ deckHits(g) }}</span>
              <span class="count">{{ g.count }}</span>
              <Menu icon="more" :title="t('Deck actions')">
                <template v-if="g.file !== deck.entry">
                  <button class="mi" @click="renameDeckAsk(g)"><Icon name="pen" />{{ t('Rename …') }}</button>
                  <button class="mi" :disabled="!canMoveDeck(g, -1)" @click="A.moveDeck(g.file, -1)"><Icon name="up" />{{ t('Move up') }}</button>
                  <button class="mi" :disabled="!canMoveDeck(g, 1)" @click="A.moveDeck(g.file, 1)"><Icon name="down" />{{ t('Move down') }}</button>
                  <hr />
                </template>
                <button class="mi" @click="A.pdf(g.file)"><Icon name="file" />{{ t('Export as PDF') }}</button>
                <button class="mi" @click="A.pptx(g.file)"><Icon name="file" />{{ t('Export as PPTX') }}</button>
                <button class="mi" @click="openExport(g.file)"><Icon name="download" />{{ t('More formats …') }}</button>
                <template v-if="g.file !== deck.entry">
                  <hr />
                  <button class="mi danger" @click="ask(t('Remove deck “{0}” with {1} slides?', g.name, g.count), () => A.removeDeck(g.file))"><Icon name="trash" />{{ t('Remove') }}</button>
                </template>
              </Menu>
            </header>
            <div v-if="groups.length === 1 || !collapsed.has(g.file)" class="thumbs">
              <div v-for="(s, j) in g.slides" :key="s.id" class="thumb-row" @dragover.prevent @drop.prevent="drop($event, g.start + j, g.file)">
                <span class="num">{{ g.start + j + 1 }}</span>
                <button class="thumb" :class="{ 'is-hidden': s.hidden }" :style="{ height: Math.round(format.h * THUMB) + 4 + 'px' }" :aria-current="g.start + j === ui.slide" :aria-label="t('Slide {0}', g.start + j + 1) + (s.hidden ? ` (${t('hidden')})` : '')" draggable="true"
                  @click="ui.slide = g.start + j" @dblclick="present(g.start + j)" @contextmenu="onThumbContext($event, g.start + j)" @dragstart="dragStart($event, g.start + j)">
                  <SlideView :slide="s" :index="g.start + j" :style="thumbStyle" inert aria-hidden="true" />
                  <span v-if="s.hidden" class="hidden-badge" :title="t('Hidden: skipped when presenting and exporting')"><Icon name="eyeOff" :size="14" /></span>
                  <span v-if="findOpen && hitsOn[g.start + j]" class="find-badge" :title="t('{0} matches', hitsOn[g.start + j])">{{ hitsOn[g.start + j] }}</span>
                </button>
                <div class="thumb-actions" role="group" :aria-label="t('Slide {0}', g.start + j + 1)">
                  <button class="tb icon small" :aria-label="s.hidden ? t('Show slide') : t('Hide slide')" :title="s.hidden ? t('Show slide') : t('Hide slide')" :aria-pressed="!!s.hidden" @click="A.toggleHidden(g.start + j)"><Icon :name="s.hidden ? 'eye' : 'eyeOff'" :size="14" /></button>
                  <button class="tb icon small" :aria-label="t('Duplicate slide')" :title="`${t('Duplicate slide')} (${keyLabel('mod+shift+d')})`" @click="A.duplicateSlide(g.start + j)"><Icon name="copy" :size="14" /></button>
                  <button class="tb icon small" :aria-label="t('More actions')" :title="t('More actions')" @click="openThumbMenu($event, g.start + j)"><Icon name="more" :size="14" /></button>
                </div>
              </div>
            </div>
          </section>
          <div class="add-slide-split">
            <button class="add-slide" :title="`${t('New slide')} (N)`" @click="A.addSlide()"><Icon name="slidePlus" :size="16" /> {{ t('New slide') }}</button>
            <!-- the project's layouts (store.js setupLayouts), the same list "New slide" uses -->
            <Menu v-slot="{ open }" icon="layout" :title="t('New slide with layout')" wide>
              <div class="preset-grid">
                <button v-for="l in deck.layouts" :key="l.id" class="preset-card" @click="A.addSlide(l)">
                  <span class="mini-slide"><SlideView v-if="open" :slide="l" :index="0" :style="PREVIEW_STYLE" inert /></span>
                  {{ l.name }}
                </button>
              </div>
            </Menu>
          </div>
        </div>
      </nav>

      <section ref="stage" class="stage" data-tour="canvas" :aria-label="t('Slide {0}', ui.slide + 1)" @dragover.prevent @drop.prevent="dropFiles([...$event.dataTransfer.files])" @wheel="stageWheel"
        @pointerdown.capture="fingerDown" @pointermove="fingerMove" @pointerup="fingerUp" @pointercancel="fingerUp"
        @touchmove="$event.touches.length > 1 && $event.preventDefault()">
        <button class="tb icon small panel-toggle left" :aria-expanded="panels.slides" :aria-label="t('Show/hide slide list')" :title="`${t('Show/hide slide list')} (${keyLabel('alt+b')})`" @click="panels.slides = !panels.slides"><Icon :name="panels.slides ? 'chevronL' : 'chevronR'" :size="16" /></button>
        <button class="tb icon small panel-toggle right" :aria-expanded="panels.props" :aria-label="t('Show/hide properties')" :title="`${t('Show/hide properties')} (${keyLabel('alt+e')})`" @click="panels.props = !panels.props"><Icon :name="panels.props ? 'chevronR' : 'chevronL'" :size="16" /></button>
        <Teleport defer :to="mdOpen ? '.md-wrap' : '.stage'">
        <dialog ref="findDialog" class="find" :class="{ replacing }" :aria-label="t('Find and replace')" @keydown.esc.stop.prevent="closeFind" @keydown="findKey" @close="findOpen = false">
          <button type="button" class="tb icon small find-fold" :title="replacing ? t('Hide replace') : t('Show replace')" :aria-expanded="replacing" @click="replacing = !replacing"><Icon :name="replacing ? 'chevron' : 'chevronR'" :size="14" /></button>
          <div class="find-row">
            <span class="find-field">
              <input ref="findInput" v-model="findQ" :placeholder="t('Find')" :aria-label="t('Find')" :aria-invalid="rx === false" @keydown.enter.prevent="step($event.shiftKey ? -1 : 1)" />
              <span class="find-toggles">
                <button v-for="[k, label, name] in [['cs', 'Aa', 'Match case'], ['word', 'ab', 'Match whole word'], ['regex', '.*', 'Use regular expression']]" :key="k"
                  type="button" class="find-toggle" :class="[k, { on: findOpt[k] }]" :title="`${t(name)} (${keyLabel('mod+alt+' + { cs: 'c', word: 'w', regex: 'r' }[k])})`" :aria-pressed="findOpt[k]" @click="findOpt[k] = !findOpt[k]">{{ label }}</button>
              </span>
            </span>
            <span class="find-count" role="status" :class="{ none: findQ && !occ.length }">{{ !findQ ? '' : rx === false ? t('Invalid expression') : occ.length ? t('{0} of {1}', findAt + 1 || '?', occ.length) : t('No results') }}<template v-if="occ[findAt]?.h.notes"> · {{ t('Notes') }}</template></span>
            <button type="button" class="tb icon small" :title="t('Previous match (⇧↵)')" :aria-label="t('Previous match')" :disabled="!occ.length" @click="step(-1)"><Icon name="up" :size="14" /></button>
            <button type="button" class="tb icon small" :title="t('Next match (↵)')" :aria-label="t('Next match')" :disabled="!occ.length" @click="step(1)"><Icon name="down" :size="14" /></button>
            <button type="button" class="tb icon small find-filter" :class="{ on: filtered_ }" :title="t('Narrow search scope')" :aria-label="t('Narrow search scope')" :aria-expanded="filtering" @click="filtering = !filtering"><Icon name="filter" :size="14" /></button>
            <button type="button" class="tb icon small" :title="t('Close (Esc)')" :aria-label="t('Close')" @click="closeFind"><Icon name="x" :size="14" /></button>
          </div>
          <div v-if="filtering && !mdOpen" class="find-row find-scope">
            <select v-model="findScope" :aria-label="t('Scope')">
              <option value="all">{{ t('All slides') }}</option>
              <option value="deck">{{ t('This deck') }}</option>
              <option value="slide">{{ t('This slide') }}</option>
            </select>
            <label v-for="[k, name] in KINDS" :key="k" class="check"><input v-model="findKinds[k]" type="checkbox" />{{ t(name) }}</label>
          </div>
          <div v-if="replacing" class="find-row">
            <span class="find-field">
              <input v-model="findR" :placeholder="t('Replace')" :aria-label="t('Replace with')" :title="findOpt.regex ? t('$1, $<name>, $& and \\n use groups of the expression') : null" @keydown.enter.prevent="$event.metaKey || $event.ctrlKey ? replaceAll() : replaceOne()" />
              <span class="find-toggles">
                <button type="button" class="find-toggle" :class="{ on: findOpt.keep }" :title="`${t('Preserve case')} (${keyLabel('mod+alt+p')})`" :aria-pressed="findOpt.keep" @click="findOpt.keep = !findOpt.keep">AB</button>
              </span>
            </span>
            <button type="button" class="tb small" :title="t('Replace (↵)')" :disabled="!occ.length" @click="replaceOne">{{ t('Replace') }}</button>
            <button type="button" class="tb small" :title="`${t('Replace all')} (${mod}↵)`" :disabled="!occ.length" @click="replaceAll">{{ t('All') }}</button>
          </div>
        </dialog>
        </Teleport>
        <div ref="scroller" class="stage-scroll" :class="{ zoomed: zoom != null }" @pointerdown.self="stageDown">
          <div class="frame" :style="{ width: format.w * scale + 'px', height: format.h * scale + 'px', '--s': scale }" @contextmenu="onContext">
            <SlideView ref="view" :key="slide.id" :slide="slide" :index="ui.slide" editable :scale="scale" :style="{ transform: `scale(${scale})` }" />
          </div>
        </div>
        <Menu ref="ctx" manual>
          <template v-if="ctxAt?.group">
            <template v-for="g in [ctxAt.group]" :key="g.file">
              <button class="mi" :disabled="!g.count" @click="present(g.start)"><Icon name="play" />{{ t('Present from this deck') }}</button>
              <button class="mi" @click="toggle(g.file)"><Icon :name="collapsed.has(g.file) ? 'chevronR' : 'chevron'" />{{ collapsed.has(g.file) ? t('Expand') : t('Collapse') }}</button>
              <template v-if="g.file !== deck.entry">
                <button class="mi" @click="renameDeckAsk(g)"><Icon name="pen" />{{ t('Rename …') }}</button>
                <button class="mi" :disabled="!canMoveDeck(g, -1)" @click="A.moveDeck(g.file, -1)"><Icon name="up" />{{ t('Move up') }}</button>
                <button class="mi" :disabled="!canMoveDeck(g, 1)" @click="A.moveDeck(g.file, 1)"><Icon name="down" />{{ t('Move down') }}</button>
              </template>
              <button class="mi" @click="newDeck"><Icon name="folder" />{{ t('New deck') }}<kbd>{{ keyLabel('shift+n') }}</kbd></button>
              <hr />
              <button class="mi" :disabled="!g.count" @click="A.pdf(g.file)"><Icon name="file" />{{ t('Export as PDF') }}</button>
              <button class="mi" :disabled="!g.count" @click="A.pptx(g.file)"><Icon name="file" />{{ t('Export as PPTX') }}</button>
              <button class="mi" :disabled="!g.count" @click="openExport(g.file)"><Icon name="download" />{{ t('More formats …') }}</button>
              <template v-if="g.file !== deck.entry">
                <hr />
                <button class="mi danger" @click="ask(t('Remove deck “{0}” with {1} slides?', g.name, g.count), () => A.removeDeck(g.file))"><Icon name="trash" />{{ t('Remove …') }}</button>
              </template>
            </template>
          </template>
          <template v-else-if="ctxAt?.thumb != null">
            <button class="mi" @click="present(ui.slide)"><Icon name="play" />{{ t('Present from this slide') }}<kbd>P</kbd></button>
            <button class="mi" :aria-pressed="!!slide.hidden" @click="A.toggleHidden()"><Icon :name="slide.hidden ? 'eye' : 'eyeOff'" />{{ slide.hidden ? t('Show slide') : t('Hide slide') }}</button>
            <hr />
            <button class="mi" @click="A.addSlide()"><Icon name="slidePlus" />{{ t('New slide after') }}<kbd>N</kbd></button>
            <button class="mi" @click="A.duplicateSlide()"><Icon name="copy" />{{ t('Duplicate slide') }}<kbd>{{ keyLabel('mod+shift+d') }}</kbd></button>
            <button class="mi" @click="openMarkdown('slide')"><Icon name="markdown" />{{ t('Edit this slide’s Markdown') }}<kbd>M</kbd></button>
            <button v-if="A.canRevert(slide)" class="mi" @click="A.revertSlides([slide])"><Icon name="undo" />{{ t('Revert to imported version') }}</button>
            <hr />
            <button class="mi" :disabled="ui.slide === 0" @click="A.moveSlide(ui.slide, ui.slide - 1)"><Icon name="up" />{{ t('Move up') }}<kbd>{{ keyLabel('alt+arrowup') }}</kbd></button>
            <button class="mi" :disabled="ui.slide === deck.slides.length - 1" @click="A.moveSlide(ui.slide, ui.slide + 1)"><Icon name="down" />{{ t('Move down') }}<kbd>{{ keyLabel('alt+arrowdown') }}</kbd></button>
            <hr />
            <button class="mi danger" :disabled="deck.slides.length < 2" @click="A.deleteSlide()"><Icon name="trash" />{{ t('Delete slide') }}<kbd>{{ keyLabel('mod+shift+backspace') }}</kbd></button>
          </template>
          <template v-else-if="ctxAt?.cropEl">
            <div class="mh">{{ t('Aspect ratio') }}</div>
            <button v-for="[k, n] in A.CROP_RATIOS" :key="n" class="mi" :class="{ on: ui.cropRatio === k }" :aria-pressed="ui.cropRatio === k" @click="A.setCropRatio(ctxAt.cropEl, k)"><Icon name="check" :style="{ visibility: ui.cropRatio === k ? null : 'hidden' }" />{{ t(n) }}</button>
            <hr />
            <button class="mi" @click="A.resetCrop(ctxAt.cropEl)"><Icon name="undo" />{{ t('Reset crop') }}</button>
            <button class="mi" @click="A.endCrop()"><Icon name="crop" />{{ t('Finish cropping') }}<kbd>↵</kbd></button>
          </template>
          <template v-else-if="ctxAt?.shapeText !== undefined && ctxAt?.el?.type === 'shape'">
            <button class="mi" :disabled="!ctxAt.text" @click="copyText(ctxAt.text)"><Icon name="copy" />{{ t('Copy selection') }}<kbd>{{ mod }}C</kbd></button>
            <hr />
            <div class="mi-row" data-keep role="group" :aria-label="t('Format')">
              <button class="mi" :title="t('Bold')" :aria-label="t('Bold')" @click="A.format('bold')"><Icon name="bold" /></button>
              <button class="mi" :title="t('Italic')" :aria-label="t('Italic')" @click="A.format('italic')"><Icon name="italic" /></button>
              <button class="mi" :title="t('Underline')" :aria-label="t('Underline')" @click="A.format('underline')"><Icon name="underline" /></button>
              <button class="mi" :title="t('Strikethrough')" :aria-label="t('Strikethrough')" @click="A.format('strikeThrough')"><Icon name="strike" /></button>
            </div>
            <div class="mi-row" data-keep role="group" :aria-label="t('Alignment')">
              <button v-for="[a, i, n] in [['left', 'textL', 'Align left'], ['center', 'textC', 'Centered'], ['right', 'textR', 'Align right']]" :key="a" class="mi" :class="{ on: (ctxAt.el.align || 'center') === a }" :title="t(n)" :aria-label="t(n)" :aria-pressed="(ctxAt.el.align || 'center') === a" @click="ctxAt.el.align = a === 'center' ? undefined : a"><Icon :name="i" /></button>
            </div>
            <h4 class="mh">{{ t('Selection color') }}</h4>
            <div class="swatches ctx-sw" data-keep>
              <button v-for="c in PALETTE" :key="c" class="sw" :style="{ background: c }" :title="c" :aria-label="c" @click="A.format('foreColor', c)" />
              <button class="sw none" :title="t('Theme color')" :aria-label="t('Theme color')" @click="A.format('removeFormat')" />
            </div>
            <hr />
            <button class="mi" @click="ctxAt.shapeText && (ctxAt.shapeText.innerHTML = ''); ctxAt.shapeText?.blur()"><Icon name="trash" />{{ t('Remove text') }}</button>
            <button class="mi" @click="ctxAt.shapeText?.blur()"><Icon name="x" />{{ t('Stop editing') }}<kbd>Esc</kbd></button>
          </template>
          <template v-else-if="ctxAt?.code">
            <button class="mi" :disabled="!ctxAt.hasSel" @click="codeCut(ctxAt.code)"><Icon name="cut" />{{ t('Cut') }}<kbd>{{ mod }}X</kbd></button>
            <button class="mi" :disabled="!ctxAt.hasSel" @click="copyText(taText(ctxAt.code))"><Icon name="copy" />{{ t('Copy') }}<kbd>{{ mod }}C</kbd></button>
            <button class="mi" @click="codePaste(ctxAt.code)"><Icon name="clipboard" />{{ t('Paste') }}<kbd>{{ mod }}V</kbd></button>
            <button class="mi" @click="ctxAt.code.select()"><Icon name="selectAll" />{{ t('Select all') }}<kbd>{{ mod }}A</kbd></button>
            <hr />
            <button class="mi" @click="taLines(ctxAt.code, l => '  ' + l)"><Icon name="chevronR" />{{ t('Indent') }}<kbd>Tab</kbd></button>
            <button class="mi" @click="taLines(ctxAt.code, l => l.replace(/^( {1,2}|\t)/, ''))"><Icon name="chevronL" />{{ t('Outdent') }}</button>
            <button class="mi" @click="markLines(ctxAt.code, ctxAt.el)"><Icon name="filter" />{{ ctxAt.hasSel ? t('Highlight selected lines') : t('Highlight line') }}</button>
            <button class="mi" @click="ctxAt.el.meta = withLines(ctxAt.el.meta, !codeOpts(ctxAt.el.meta).lines)"><Icon name="olist" />{{ codeOpts(ctxAt.el.meta).lines ? t('Hide line numbers') : t('Show line numbers') }}</button>
            <hr />
            <button class="mi" @click="ctxAt.code.blur()"><Icon name="x" />{{ t('Stop editing') }}<kbd>Esc</kbd></button>
          </template>
          <template v-else-if="ctxAt?.editingCell">
            <button class="mi" :disabled="!ctxAt.text" @click="copyText(ctxAt.text)"><Icon name="copy" />{{ t('Copy selection') }}<kbd>{{ mod }}C</kbd></button>
            <button class="mi" @click="ctxTable(clearCells)"><Icon name="x" />{{ ui.cellEnd ? t('Clear selected cells') : t('Clear cell') }}</button>
            <hr />
            <button class="mi" @click="ctxTable(insertRow, 'above')"><Icon name="rowAbove" />{{ t('Insert row above') }}</button>
            <button class="mi" @click="ctxTable(insertRow, 'below')"><Icon name="rowBelow" />{{ t('Insert row below') }}</button>
            <button class="mi" @click="ctxTable(insertCol, 'left')"><Icon name="colLeft" />{{ t('Insert column left') }}</button>
            <button class="mi" @click="ctxTable(insertCol, 'right')"><Icon name="colRight" />{{ t('Insert column right') }}</button>
            <button class="mi" @click="ctxTable(deleteRow)"><Icon name="rowDel" />{{ ui.cellEnd ? t('Delete selected rows') : t('Delete row') }}</button>
            <button class="mi" @click="ctxTable(deleteCol)"><Icon name="colDel" />{{ ui.cellEnd ? t('Delete selected columns') : t('Delete column') }}</button>
            <hr />
            <div class="mi-row" role="group" :aria-label="t('Align column')">
              <button v-for="[a, i, tip] in [['left', 'textL', 'Align column left'], ['center', 'textC', 'Center column'], ['right', 'textR', 'Align column right']]" :key="a"
                class="mi" :class="{ on: ctxAt.el.align[ui.cell?.c] === a }" :title="t(tip)" :aria-label="t(tip)" :aria-pressed="ctxAt.el.align[ui.cell?.c] === a" @click="ctxTable(setAlign, a)"><Icon :name="i" /></button>
            </div>
            <hr />
            <button class="mi" @click="ui.editing = null"><Icon name="x" />{{ t('Stop editing') }}<kbd>Esc</kbd></button>
          </template>
          <template v-else-if="ctxAt?.el">
            <button v-if="selection.length === 1 && ['text', 'code', 'table'].includes(ctxAt.el.type)" class="mi" @click="ctxEdit"><Icon name="pen" />{{ ctxAt.el.type === 'table' ? t('Edit cell') : t('Edit') }}<kbd>↵</kbd></button>
            <label v-if="selection.length === 1 && ctxAt.el.type === 'image'" class="mi"><Icon name="image" />{{ t('Replace image …') }}<input type="file" accept="image/*" hidden @change="A.run(() => A.replaceImage(ctxAt.el, $event.target.files[0]))" /></label>
            <template v-if="selection.length === 1 && ctxAt.el.type === 'image' && !ctxAt.el.locked">
              <button class="mi" @click="A.run(() => A.startCrop(ctxAt.el))"><Icon name="crop" />{{ t('Crop') }}</button>
              <button v-if="ctxAt.el.crop" class="mi" @click="A.resetCrop(ctxAt.el)"><Icon name="undo" />{{ t('Remove crop') }}</button>
            </template>
            <button v-if="selection.length === 1 && ctxAt.el.type === 'text'" class="mi" @click="A.fitHeight(ctxAt.el)"><Icon name="alignB" />{{ t('Fit height to text') }}</button>
            <template v-if="ctxAt.cell">
              <hr />
              <button class="mi" @click="ctxTable(insertRow, 'above')"><Icon name="rowAbove" />{{ t('Insert row above') }}</button>
              <button class="mi" @click="ctxTable(insertRow, 'below')"><Icon name="rowBelow" />{{ t('Insert row below') }}</button>
              <button class="mi" @click="ctxTable(insertCol, 'left')"><Icon name="colLeft" />{{ t('Insert column left') }}</button>
              <button class="mi" @click="ctxTable(insertCol, 'right')"><Icon name="colRight" />{{ t('Insert column right') }}</button>
              <button class="mi" @click="ctxTable(deleteRow)"><Icon name="rowDel" />{{ ui.cellEnd ? t('Delete selected rows') : t('Delete row') }}</button>
              <button class="mi" @click="ctxTable(deleteCol)"><Icon name="colDel" />{{ ui.cellEnd ? t('Delete selected columns') : t('Delete column') }}</button>
            </template>
            <!-- shapes: form, fill and outline right here; colour clicks keep the menu open to try them -->
            <template v-if="selection.length === 1 && ctxAt.el.type === 'shape'">
              <h4 class="mh">{{ t('Shape') }}</h4>
              <div class="mi-row" data-keep role="group" :aria-label="t('Shape')">
                <button v-for="([n], s) in SHAPE_NAMES" :key="s" class="mi" :class="{ on: ctxAt.el.shape === s }" :title="t(n)" :aria-label="t(n)" :aria-pressed="ctxAt.el.shape === s" @click="ctxAt.el.shape = s">
                  <span class="shape-ico" v-html="shapeSvg({ shape: s, w: 22, h: 14, fill: s === 'line' ? 'none' : 'currentColor', stroke: 'currentColor', strokeWidth: s === 'line' ? 2 : 0, radius: 2 })" />
                </button>
              </div>
              <template v-if="ctxAt.el.shape !== 'line'">
                <h4 class="mh"><Icon name="fill" :size="14" />{{ t('Fill') }}</h4>
                <div class="swatches ctx-sw" data-keep>
                  <button v-for="c in FILLS" :key="c" class="sw" :class="{ on: ctxAt.el.fill === c }" :style="{ background: c }" :title="c" :aria-label="c" @click="ctxAt.el.fill = c" />
                  <button class="sw none" :title="t('No fill')" :aria-label="t('No fill')" @click="ctxAt.el.fill = 'none'" />
                </div>
              </template>
              <h4 class="mh"><Icon name="outline" :size="14" />{{ t('Outline') }}</h4>
              <div class="swatches ctx-sw" data-keep>
                <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: ctxAt.el.stroke === c }" :style="{ background: c }" :title="c" :aria-label="c" @click="ctxAt.el.stroke = c; ctxAt.el.strokeWidth ||= 2" />
                <button class="sw none" :title="t('No outline')" :aria-label="t('No outline')" @click="ctxAt.el.stroke = 'none'" />
              </div>
              <div v-if="ctxAt.el.stroke !== 'none'" class="mi-row" data-keep role="group" :aria-label="t('Outline width')">
                <button v-for="w in [1, 2, 4, 8]" :key="w" class="mi" :class="{ on: ctxAt.el.strokeWidth === w }" :aria-pressed="ctxAt.el.strokeWidth === w" @click="ctxAt.el.strokeWidth = w">{{ w }} px</button>
              </div>
              <hr />
            </template>
            <hr v-if="selection.length === 1 && ctxAt.el.type !== 'shape' && ctxAt.el.type !== 'video'" />
            <button class="mi" @click="clip('cut')"><Icon name="cut" />{{ t('Cut') }}<kbd>{{ mod }}X</kbd></button>
            <button class="mi" @click="clip('copy')"><Icon name="copy" />{{ t('Copy') }}<kbd>{{ mod }}C</kbd></button>
            <button class="mi" @click="A.duplicate"><Icon name="copy" />{{ t('Duplicate') }}<kbd>{{ mod }}D</kbd></button>
            <button class="mi" @click="A.remove"><Icon name="trash" />{{ selection.length > 1 ? t('Delete {0} elements', selection.length) : t('Delete') }}<kbd>⌫</kbd></button>
            <button v-if="selection.some(e => e.group)" class="mi" @click="A.ungroup"><Icon name="ungroup" />{{ t('Ungroup') }}<kbd>{{ keyLabel('mod+shift+g') }}</kbd></button>
            <button v-else-if="selection.length > 1" class="mi" @click="A.group"><Icon name="group" />{{ t('Group') }}<kbd>{{ keyLabel('mod+g') }}</kbd></button>
            <hr />
            <button class="mi" @click="A.order('front')"><Icon name="toFront" />{{ t('Bring to front') }}<kbd>{{ keyLabel('mod+shift+arrowup') }}</kbd></button>
            <button class="mi" @click="A.order('forward')"><Icon name="forward" />{{ t('Bring forward') }}<kbd>{{ keyLabel('mod+arrowup') }}</kbd></button>
            <button class="mi" @click="A.order('backward')"><Icon name="backward" />{{ t('Send backward') }}<kbd>{{ keyLabel('mod+arrowdown') }}</kbd></button>
            <button class="mi" @click="A.order('back')"><Icon name="toBack" />{{ t('Send to back') }}<kbd>{{ keyLabel('mod+shift+arrowdown') }}</kbd></button>
            <hr />
            <div class="mi-row" role="group" :aria-label="selection.length > 1 ? t('Align to each other') : t('Align on slide')">
              <button v-for="[a, i, tip] in [['left', 'alignL', 'Left'], ['center', 'alignC', 'Center horizontally'], ['right', 'alignR', 'Right'], ['top', 'alignT', 'Top'], ['middle', 'alignM', 'Center vertically'], ['bottom', 'alignB', 'Bottom']]" :key="a"
                class="mi" :title="t(selection.length > 1 ? '{0} (to each other)' : '{0} (on slide)', t(tip))" :aria-label="t(tip)" @click="A.align(a)"><Icon :name="i" /></button>
            </div>
            <template v-if="selection.length > 2">
              <button class="mi" @click="A.distribute('h')"><Icon name="distH" />{{ t('Distribute horizontally') }}</button>
              <button class="mi" @click="A.distribute('v')"><Icon name="distV" />{{ t('Distribute vertically') }}</button>
            </template>
          </template>
          <template v-else>
            <button class="mi" @click="A.insert('text')"><Icon name="text" />{{ t('Insert text') }}<kbd>T</kbd></button>
            <button class="mi" @click="A.insert('heading')"><Icon name="heading" />{{ t('Insert heading') }}<kbd>H</kbd></button>
            <button class="mi" @click="pickImage"><Icon name="image" />{{ t('Insert image …') }}<kbd>I</kbd></button>
            <button class="mi" :disabled="!slide.elements.length" @click="A.selectAll"><Icon name="selectAll" />{{ t('Select all') }}<kbd>{{ mod }}A</kbd></button>
            <hr />
            <button class="mi" @click="A.addSlide()"><Icon name="slidePlus" />{{ t('New slide') }}<kbd>N</kbd></button>
            <button class="mi" @click="A.duplicateSlide()"><Icon name="copy" />{{ t('Duplicate slide') }}<kbd>{{ keyLabel('mod+shift+d') }}</kbd></button>
            <button class="mi" @click="openMarkdown('slide')"><Icon name="markdown" />{{ t('Edit this slide’s Markdown') }}<kbd>M</kbd></button>
            <button class="mi" :disabled="deck.slides.length < 2" @click="A.deleteSlide()"><Icon name="trash" />{{ t('Delete slide') }}</button>
          </template>
        </Menu>
        <div class="stage-info" :class="{ zoomed: zoom != null }">{{ ui.slide + 1 }} / {{ deck.slides.length }}<span class="stage-zoom"> · </span><button type="button" class="zoom-btn stage-zoom" :aria-label="`${t('Zoom')}: ${Math.round(scale * 100)} %`" :title="t('Zoom')" @click="cycleZoom">{{ Math.round(scale * 100) }} %</button></div>
      </section>

      <Inspector data-tour="inspector" @link="openLink" @markdown="openMarkdown('slide')" />
    </main>
    <AppFooter />
  </div>

  <template v-if="ready">

    <Tour v-if="tour.on" />
    <MarkdownTutorial v-if="tutorial.open" />
    <div v-if="ui.status" class="toast" role="status">{{ ui.status }}<button class="tb icon small" :aria-label="t('Close')" @click="ui.status = ''"><Icon name="x" :size="14" /></button></div>

    <!-- dialogs -->
    <ThemeEditor ref="themeEditor" @saved="id => { setTheme(id); A.toast(t('Theme “{0}” saved', THEMES[id].name)) }" @deleted="id => A.toast(t('Theme deleted'))" />
    <dialog ref="dupDialog" @close="dupChoice">
      <form method="dialog">
        <h2>{{ t('Project already exists') }}</h2>
        <p>{{ t('The folder “{0}” was already opened as project “{1}” ({2} slides). Changes there will be lost if you overwrite it.', dupOf?.source, dupOf?.title, dupOf?.slides) }}</p>
        <menu><button value="">{{ t('Cancel') }}</button><button value="open">{{ t('Open existing') }}</button><button value="copy">{{ t('Create copy') }}</button><button class="primary danger" value="replace">{{ t('Overwrite') }}</button></menu>
      </form>
    </dialog>

    <dialog ref="importDialog" @close="doImport">
      <form method="dialog">
        <h2>{{ importMode === 'new' ? t('New project from decks') : t('Add decks') }}</h2>
        <p v-if="importMode === 'new'">{{ t('No file') }} <code>slides.md</code> {{ t('found. Each selected file becomes a deck – sorted by name – and is included on export in a new') }} <code>slides.md</code>{{ t('.') }}</p>
        <p v-else>{{ t('Each selected file becomes – sorted by name – a deck of its own at the end of the project and is included in the export of') }} <code>{{ deck.entry }}</code>{{ t('.') }}</p>
        <div class="pick-list">
          <label v-for="p in importEntries" :key="p" class="check">
            <input v-model="importPick" type="checkbox" :value="p" />
            {{ p }}
          </label>
        </div>
        <menu><button value="">{{ t('Cancel') }}</button><button class="primary" value="ok">{{ importMode === 'new' ? t('Create project') : t('Add') }}</button></menu>
      </form>
    </dialog>

    <dialog ref="mdDialog" class="wide" @close="applyMarkdown" @cancel="mdCancel">
      <form method="dialog">
        <h2>{{ mdTarget === 'slide' ? t('Markdown of slide {0}', ui.slide + 1) : t('Slides from Markdown') }}</h2>
        <p>{{ t('Slidev Markdown: separate slides with') }} <code>---</code> {{ t(', set the layout via frontmatter (') }}<code>layout: cover</code>{{ t('). Ideal for slides generated by AI.') }}</p>
        <div class="md-wrap">
          <!-- the highlighted copy shows through the transparent textarea text; highlight() escapes the HTML -->
          <div class="md-mirror text-mirror" aria-hidden="true" v-html="highlight(mdText, 'markdown') + '\u200b'" />
          <textarea v-model="mdText" class="md-editor" spellcheck="false" aria-label="Markdown" @keydown.meta.enter.prevent="mdDialog.close('ok')" @keydown.ctrl.enter.prevent="mdDialog.close('ok')" @scroll="$event.target.previousElementSibling.scrollTop = $event.target.scrollTop" />
        </div>
        <menu><button value="">{{ t('Cancel') }}</button><button class="primary" value="ok">{{ mdTarget === 'slide' ? t('Replace slide') : t('Insert slides') }}</button></menu>
      </form>
    </dialog>

    <dialog ref="linkDialog" @close="applyLink">
      <form method="dialog">
        <h2>{{ t('Link') }}</h2>
        <input v-model="linkUrl" :aria-label="t('Address')" :placeholder="t('https://… (empty = remove link)')" autofocus />
        <menu><button value="">{{ t('Cancel') }}</button><button class="primary" value="ok">{{ t('Apply') }}</button></menu>
      </form>
    </dialog>

    <dialog ref="ytDialog" @close="addVideo">
      <form method="dialog">
        <h2>{{ t('YouTube video') }}</h2>
        <input v-model="ytUrl" :aria-label="t('YouTube link')" placeholder="https://www.youtube.com/watch?v=…" autofocus />
        <menu><button value="">{{ t('Cancel') }}</button><button class="primary" value="ok">{{ t('Insert') }}</button></menu>
      </form>
    </dialog>

    <dialog ref="deckDialog" @close="applyDeck">
      <form method="dialog">
        <h2>{{ deckRenaming ? t('Rename deck') : t('New deck') }}</h2>
        <p>{{ t('Saved as its own Markdown file and included in') }} <code>{{ deck.entry }}</code>{{ t('.') }}</p>
        <input v-model="deckNameInput" aria-label="Name" :placeholder="t('e.g. Databases')" autofocus />
        <menu><button value="">{{ t('Cancel') }}</button><button class="primary" value="ok">{{ deckRenaming ? t('Rename') : t('Create') }}</button></menu>
      </form>
    </dialog>

    <dialog ref="exportDialog" class="wide export-dlg" @close="doExport">
      <form method="dialog">
        <h2>{{ t('Export') }}</h2>
        <label class="export-scope">{{ t('Scope') }}
          <select v-model="exportScope">
            <option value="">{{ t('Entire project · {0} slides', deck.slides.length) }}</option>
            <option v-for="d in decks.filter(d => d.file !== deck.entry)" :key="d.file" :value="d.file">{{ t('Deck “{0}” · {1} slides', d.name, d.count) }}</option>
          </select>
        </label>
        <div class="export-grid" role="radiogroup" aria-label="Format">
          <label v-for="f in EXPORTS" :key="f.id" class="export-card" :class="{ on: exportFormat === f.id, off: f.project && exportScope }">
            <input v-model="exportFormat" type="radio" name="export-format" :value="f.id" :disabled="f.project && !!exportScope" />
            <strong>{{ t(f.name) }} <small>{{ f.ext }}</small></strong>
            <span class="apps">{{ t(f.apps) }}</span>
            <span class="note">{{ t(f.note) }}</span>
            <span class="badges"><em v-if="f.editable" class="b-edit">{{ t('editable') }}</em><em v-if="f.exact" class="b-exact">{{ t('pixel-perfect') }}</em><em v-if="f.project">{{ t('whole project only') }}</em></span>
          </label>
        </div>
        <p class="export-hint">{{ t('Keynote opens') }} <code>.pptx</code> {{ t('directly. For Google Slides pick its own variant and open it there via “File → Import”. For an exact look there, choose “exact copy”.') }}</p>
        <menu><button value="">{{ t('Cancel') }}</button><button class="primary" value="ok" :disabled="EXPORTS.find(f => f.id === exportFormat)?.project && !!exportScope">{{ t('Export') }}</button></menu>
      </form>
    </dialog>

    <dialog ref="snapDialog">
      <form method="dialog">
        <h2>{{ t('Version history') }}</h2>
        <p>{{ t('While you edit, a snapshot is kept every {0} minutes, up to {1} per project (the oldest are dropped). Snapshots stay in this browser and are deleted with the project.', SNAP_EVERY / 60e3, SNAP_MAX) }}</p>
        <ul v-if="snaps.length" class="pick-list snap-list">
          <li v-for="s in snaps" :key="s.at">
            <span>{{ snapTime(s.at) }} · {{ t('{0} slides', s.slides) }}</span>
            <button type="button" @click="restoreSnap(s.at)">{{ t('Restore') }}</button>
            <button type="button" :title="t('Delete')" :aria-label="t('Delete')" @click="deleteSnap(s.at)"><Icon name="trash" /></button>
          </li>
        </ul>
        <p v-else>{{ t('No snapshots yet.') }}</p>
        <menu><button type="button" @click="snapNow">{{ t('Save snapshot') }}</button><button class="primary" value="">{{ t('Close') }}</button></menu>
      </form>
    </dialog>

    <dialog ref="confirmDialog" @close="confirmDialog.returnValue === 'ok' && confirmAction?.()">
      <form method="dialog">
        <h2>{{ t('Are you sure?') }}</h2>
        <p>{{ confirmText }} <template v-if="confirmUndo">{{ t('You can get it back with “Undo”.') }}</template></p>
        <menu><button value="">{{ t('Cancel') }}</button><button class="primary danger" value="ok">{{ confirmLabel }}</button></menu>
      </form>
    </dialog>

    <dialog ref="paletteDialog" class="palette" @keydown="paletteKey">
      <input v-model="paletteQuery" class="palette-input" :placeholder="t('Search commands … (e.g. “table”, “pdf”, “theme”)')" :aria-label="t('Search commands')" autofocus role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="palette-list" :aria-activedescendant="filtered.length ? 'cmd-' + paletteIndex : null" @input="paletteIndex = 0" />
      <ul id="palette-list" role="listbox" :aria-label="t('Commands')">
        <li v-for="(c, i) in filtered" :id="'cmd-' + i" :key="c[0]" role="option" :aria-selected="i === paletteIndex" @click="runCommand(c)" @mousemove="paletteIndex = i">
          {{ c[0] }}<kbd v-if="c[2]">{{ keyLabel(c[2]) }}</kbd>
        </li>
        <li v-if="!filtered.length" class="empty">{{ t('No command found') }}</li>
      </ul>
    </dialog>
  </template>

  <div v-if="presenting" ref="presenter" class="presenter" :class="{ pv: presenterView, laser: tool === 'laser' }" tabindex="0" role="application" :aria-label="t('Slide {0} of {1}', ui.slide + 1, deck.slides.length)" @keydown="presentKey" @click="presentClick"
    @pointerdown="swipeDown" @pointermove="e => { swipeMove(e); if (tool === 'laser') laser = [e.clientX, e.clientY] }" @pointerup="swipeUp" @pointercancel="swipeUp">
    <div class="pv-main" :style="{ width: format.w * presentScale + 'px', height: format.h * presentScale + 'px' }">
      <Transition :name="'tr-' + transition" :css="transition !== 'none'">
        <div :key="ui.slide" class="pv-slide"><SlideView :slide="slide" :index="ui.slide" live :step="clickStep" :style="{ transform: `scale(${presentScale})` }" /></div>
      </Transition>
      <!-- [[x, y], …].join(' ') is SVG's "x,y x,y" -->
      <svg v-if="drawing || strokes.length" class="pv-ink" :class="{ on: drawing }" :viewBox="`0 0 ${format.w} ${format.h}`" aria-hidden="true"
        @pointerdown="penDown" @pointermove="penMove" @pointerup="penUp" @pointercancel="penUp">
        <g v-for="(s, i) in strokes" :key="i" :style="{ stroke: s.color, strokeWidth: s.width }"><polyline :points="s.pts.join(' ')" /><polyline v-if="s.arrow" :points="arrowHead(s.pts[0], s.pts[1], s.width).join(' ')" /></g>
      </svg>
    </div>
    <aside v-if="presenterView" class="pv-side">
      <div class="pv-next">
        <small>{{ t('Next slide') }}</small>
        <div v-if="upNext.slide !== ui.slide || upNext.step !== clickStep" :style="{ width: format.w * 0.3 + 'px', height: format.h * 0.3 + 'px' }"><SlideView :slide="deck.slides[upNext.slide]" :index="upNext.slide" :step="upNext.step" :style="{ transform: 'scale(0.3)' }" /></div>
        <p v-else>{{ t('End') }}</p>
      </div>
      <div class="pv-notes">{{ slide.notes || t('No notes') }}</div>
    </aside>
    <div v-if="blank" class="pv-blank" :class="blank" aria-hidden="true" />
    <div v-if="tool === 'laser' && laser" class="pv-laser" :style="{ translate: `${laser[0]}px ${laser[1]}px` }" aria-hidden="true" />
    <div class="pv-jump" aria-live="polite">{{ jump && t('Slide {0}', jump) }}</div>
    <div v-if="keysHelp" class="pv-keys" role="dialog" :aria-label="t('Keys while presenting')" @click.stop="keysHelp = false">
      <h2>{{ t('Keys while presenting') }}</h2>
      <dl><template v-for="[k, what] in PRESENT_KEYS" :key="k"><dt><kbd v-for="x in k.split('  ')" :key="x">{{ x }}</kbd></dt><dd>{{ t(what) }}</dd></template></dl>
    </div>
    <!-- pen options in a row of their own above the bar, so the tools and the way out stay in reach on a phone -->
    <div class="pv-bars">
    <div v-if="drawing" class="pv-bar pv-ink-bar" @click.stop>
      <button v-for="c in INKS" :key="c" class="pv-swatch" :class="{ on: ink.color === c }" :style="{ background: c }" :title="c" :aria-label="t('Pen colour {0}', c)" :aria-pressed="ink.color === c" @click="ink.color = c" />
      <button v-for="w in WIDTHS" :key="w" class="tb icon small" :class="{ on: ink.width === w }" :title="t('Line width {0}', w)" :aria-label="t('Line width {0}', w)" :aria-pressed="ink.width === w" @click="ink.width = w"><i class="pv-width" :style="{ height: w / 2 + 1 + 'px' }" /></button>
    </div>
    <div class="pv-bar">
      <span>{{ ui.slide + 1 }} / {{ deck.slides.length }}</span>
      <span v-if="presenterView && clickSteps(slide).length" :title="t('Click steps shown')">· {{ Math.min(clickStep, clickSteps(slide).length) }}/{{ clickSteps(slide).length }}</span>
      <button v-if="presenterView" class="tb small pv-timer" :title="t('Reset timer') + ' (R)'" :aria-label="t('Reset timer')" @click.stop="resetTimer">⏱ {{ elapsed }}</button>
      <button class="tb icon small" :class="{ on: tool === 'laser' }" :title="t('Laser pointer') + ' (L)'" :aria-label="t('Laser pointer')" :aria-pressed="tool === 'laser'" @click.stop="setTool('laser')"><Icon name="laser" :size="16" /></button>
      <button class="tb icon small" :class="{ on: tool === 'pen' }" :title="t('Pen') + ' (D)'" :aria-label="t('Pen')" :aria-pressed="tool === 'pen'" @click.stop="setTool('pen')"><Icon name="brush" :size="16" /></button>
      <button class="tb icon small" :class="{ on: tool === 'arrow' }" :title="t('Arrow') + ' (A)'" :aria-label="t('Arrow')" :aria-pressed="tool === 'arrow'" @click.stop="setTool('arrow')"><Icon name="arrowDraw" :size="16" /></button>
      <button class="tb icon small" :class="{ on: keysHelp }" :title="t('Keys while presenting') + ' (?)'" :aria-label="t('Keys while presenting')" :aria-pressed="keysHelp" @click.stop="keysHelp = !keysHelp"><Icon name="keyboard" :size="16" /></button>
      <button v-if="strokes.length" class="tb icon small" :title="t('Clear drawing') + ' (E)'" :aria-label="t('Clear drawing')" @click.stop="strokes = []"><Icon name="trash" :size="16" /></button>
      <button class="tb icon small" :title="t('Presenter view (P)')" @click.stop="presenterView = !presenterView; fitPresenter()"><Icon name="presenter" :size="16" /></button>
      <!-- like Esc: with a tool on, the first press puts the tool away, so the tool buttons come back instead of the presentation ending -->
      <button class="tb icon small" :title="tool ? t('Put the tool away (Esc)') : t('Exit (Esc)')" :aria-label="tool ? t('Put the tool away (Esc)') : t('Exit (Esc)')" @click.stop="tool ? (tool = null) : stopPresenting()"><Icon name="x" :size="16" /></button>
    </div>
    </div>
    <div class="pv-progress" :style="{ width: ((ui.slide + 1) / deck.slides.length) * 100 + '%' }" />
  </div>

  <div v-if="A.exportSlides.value" class="output">
    <SlideView v-for="(s, i) in A.exportSlides.value" :key="s.id" :slide="s" :index="i" />
  </div>
</template>
