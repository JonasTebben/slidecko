<script setup>
import { ref, reactive, computed, watch, watchEffect, nextTick, onMounted } from 'vue'
import Icon from './Icon.vue'
import AppFooter from './AppFooter.vue'
import Menu from './Menu.vue'
import SlideView from './SlideView.vue'
import Inspector from './Inspector.vue'
import Home from './Home.vue'
import ThemeEditor from './ThemeEditor.vue'
import { t } from './i18n.js'
import { format, setFormat, deck, ui, decks, library, openProject, fileOf, restore, undo, redo, canUndo, canRedo, newSlide, cleanSlides } from './store.js'
import { parseRatio } from './format.js'
import { THEMES, TABLE_PRESETS, CALLOUTS, editorCss, typoCss, themeStyle, themeOf, themeIds, importTheme } from './themes.js'
import { SLIDE_PRESETS, PALETTE, FILLS } from './presets.js'
import { shapeSvg } from './toSlidev.js'
import { applyUno } from './uno.js'
import * as A from './actions.js'
import { insertRow, insertCol, deleteRow, deleteCol, area, setAlign, clearCells } from './tableOps.js'
import { toggleMarked, codeOpts, withLines, highlight } from './hl.js'
import { find, replace, ranges, pattern } from './search.js'
import { loadSession, saveSession, sessionView, selIds, selIndexes, viewHash, parseViewHash } from './session.js'

const { slide, selection, primary } = A
const ready = ref(false)
const stage = ref(), view = ref(), scale = ref(1)
const presenter = ref(), presenting = ref(false), presenterView = ref(false), presentScale = ref(1), started = ref(0), now = ref(Date.now())
const linkDialog = ref(), linkUrl = ref('')
const importDialog = ref(), importFiles = ref([]), importEntries = ref([]), importPick = ref([]), importMode = ref('project')
const mdDialog = ref(), mdText = ref(''), mdTarget = ref('slide')
const paletteDialog = ref(), paletteQuery = ref(''), paletteIndex = ref(0)
const deckDialog = ref(), deckNameInput = ref(''), deckRenaming = ref(null)
const confirmDialog = ref(), confirmText = ref(''), confirmAction = ref(null)
const ytDialog = ref(), ytUrl = ref('')

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
const KINDS = [['text', 'Text'], ['table', 'Tabellen'], ['code', 'Code'], ['notes', 'Notizen']]
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
  A.toast(t('{0} Treffer ersetzt', n))
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
  { id: 'pdf', name: 'PDF', ext: '.pdf', apps: 'Zum Verteilen, Drucken und Archivieren', note: 'Vektor-PDF, Text auswählbar', exact: true },
  { id: 'pptx', name: 'PowerPoint', ext: '.pptx', apps: 'PowerPoint · Keynote · LibreOffice', note: 'Text, Tabellen und Formen bleiben bearbeitbar. Nicht für Google Slides – dort verrutscht der Text, dafür die eigene Variante nehmen.', editable: true },
  { id: 'pptx-google', name: 'Google Slides', ext: '.pptx', apps: 'Google Slides (Datei → Importieren)', note: 'Bearbeitbar; Zeilenabstände so geschrieben, wie Google sie liest', editable: true },
  { id: 'pptx-image', name: 'PowerPoint originalgetreu', ext: '.pptx', apps: 'PowerPoint · Keynote · Google Slides · LibreOffice', note: 'Jede Folie als hochaufgelöstes Bild – sieht überall exakt so aus wie hier. Notizen bleiben erhalten.', exact: true },
  { id: 'odp', name: 'OpenDocument', ext: '.odp', apps: 'LibreOffice Impress · OpenOffice · Collabora', note: 'Offenes Format, bearbeitbar', editable: true },
  { id: 'html', name: 'HTML-Präsentation', ext: '.html', apps: 'Jeder Browser, auch offline', note: 'Eine einzige Datei. Mit Pfeiltasten präsentieren, F für Vollbild.', exact: true },
  { id: 'html-zip', name: 'HTML-Präsentation (ZIP)', ext: '.zip', apps: 'Webserver, Lernplattformen, jeder Browser', note: 'index.html mit Bildern als eigene Dateien – kleiner als die Einzeldatei', exact: true },
  { id: 'png', name: 'Bilder', ext: '.png (ZIP)', apps: 'Web, Lernplattformen, Social Media', note: 'Eine PNG-Datei pro Folie, 1960 × 1104 px', exact: true },
  { id: 'slidev', name: 'Slidev-Projekt', ext: '.zip', apps: 'Slidev (npx slidev)', note: 'Markdown mit allen Foliensätzen, Bildern und Theme', editable: true, project: true },
]
const exportDialog = ref(), exportScope = ref(''), exportFormat = ref(localStorage.getItem('slides-builder:export') || 'pptx')
function openExport(scope = '', format) {
  exportScope.value = scope
  if (format) exportFormat.value = format
  exportDialog.value.showModal()
}
function doExport() {
  if (exportDialog.value.returnValue !== 'ok') return
  try { localStorage.setItem('slides-builder:export', exportFormat.value) } catch { /* private mode */ }
  A.exportAs(exportFormat.value, exportScope.value || undefined)
}
const THUMB = computed(() => 176 / format.w)

// theme, table and callout rules, generated from the same source as the Slidev export
// (rebuilt when own themes change)
const themeRules = document.head.appendChild(document.createElement('style'))
watchEffect(() => { themeRules.textContent = editorCss() })
// --- own themes: editor, import ---
const themeEditor = ref()
const themeName = id => (THEMES[id]?.custom ? THEMES[id].name : t(themeOf(id).name))
async function importThemeFiles(files) {
  for (const f of files) {
    try { const id = importTheme(JSON.parse(await f.text())); setTheme(id); A.toast(t('Theme „{0}“ importiert', THEMES[id].name)) }
    catch { A.toast(t('{0} ist keine gültige Theme-Datei', f.name)) }
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
  if (!parseRatio(customRatio.value)) return A.toast(t('Ungültiges Format – z. B. 21:9 oder 1.6'))
  setFormat(customRatio.value, deck.canvasWidth)
  customRatio.value = ''
  formatMenu.value.close()
}
// project-wide font sizes (Inspector › Schrift für alle Folien)
const typoStyle = document.head.appendChild(document.createElement('style'))
watchEffect(() => { typoStyle.textContent = typoCss('.slide', deck.typo) })
// utility classes (Slidev's UnoCSS) of everything on the slides
let unoTimer
watch(() => deck.slides, () => {
  clearTimeout(unoTimer)
  unoTimer = setTimeout(() => applyUno(JSON.stringify(deck.slides.map(s => s.elements.map(e => [e.html, e.cls, e.rows]))).replace(/\\"/g, '"')), 200)
}, { deep: true, immediate: true })
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
  addEventListener('resize', fitPresenter)
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) presenting.value = false })
  setInterval(() => { now.value = Date.now() }, 1000)
})
watch([() => ui.home, ready], async () => {
  await nextTick()
  if (stage.value) new ResizeObserver(([e]) => { stageBox = e.contentRect; fitStage() }).observe(stage.value)
})
let stageBox
const fitStage = () => {
  if (!stageBox) return
  const pad = stageBox.width < 600 ? 24 : 64 // phones: the slide takes the width
  scale.value = Math.max(0.1, Math.min((stageBox.width - pad) / format.w, (stageBox.height - pad) / format.h))
}
watch(format, () => { fitStage(); fitPresenter() })
watch(() => ui.slide, () => { ui.sel = []; ui.editing = null })
async function showView(v) {
  if (!v) return
  if (v.home) { ui.home = true; return }
  if (v.project !== deck.id) {
    if (!library.list.some(p => p.id === v.project)) return // deleted or from another browser: stay where we are
    try { await openProject(v.project) } catch { return }
  }
  ui.home = false
  ui.slide = Math.max(0, Math.min(v.slide, deck.slides.length - 1))
}

// a closed dialog can keep the focus (palette input): that is not typing
const inField = e => e.target.closest?.('input, textarea, select, dialog[open], [contenteditable=true]') && !e.target.closest('dialog:not([open])')
const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const mod = computed(() => isMac ? '⌘' : t('Strg+'))

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
  linkDialog.value.showModal()
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
const confirmLabel = ref('')
function ask(text, action, label = t('Entfernen')) {
  confirmLabel.value = label
  confirmText.value = text
  confirmAction.value = action
  confirmDialog.value.showModal()
}

async function pickImport(files, mode) {
  if (!A.markdownFiles(files).length) return A.toast(t('Keine Markdown-Dateien gefunden.'))
  const paths = [...A.filesMap(A.markdownFiles(files)).keys()]
  // a Slidev project folder is loaded through its slides.md, like Slidev does
  if (mode === 'project' && paths.includes('slides.md')) {
    const source = files[0]?.webkitRelativePath?.split('/')[0]
    dupOf.value = source && library.list.find(p => p.source === source)
    if (!dupOf.value) return A.importProject(files, 'slides.md')
    importFiles.value = files
    return dupDialog.value.showModal()
  }
  importFiles.value = files
  // loose .md files: each becomes a deck of a new project (or of the open one), in name order
  importMode.value = mode === 'project' ? 'new' : mode
  importEntries.value = (mode === 'project' ? await A.entryCandidates(files) : paths).sort(A.byName)
  importPick.value = [...importEntries.value]
  if (mode === 'project' && importEntries.value.length === 1) return A.importDecksAsProject(files, importPick.value)
  importDialog.value.showModal()
}
const dupDialog = ref(), dupOf = ref(null)
function dupChoice() {
  const v = dupDialog.value.returnValue
  if (v === 'open') A.run(() => openProject(dupOf.value.id))
  else if (v === 'copy') A.importProject(importFiles.value, 'slides.md')
  else if (v === 'replace') A.importProject(importFiles.value, 'slides.md', dupOf.value.id)
}
function doImport() {
  if (importDialog.value.returnValue !== 'ok' || !importPick.value.length) return
  if (importMode.value === 'new') A.importDecksAsProject(importFiles.value, importPick.value)
  else A.appendDecks(importFiles.value, importPick.value)
}

function openMarkdown(target = 'slide') {
  mdTarget.value = target
  mdText.value = target === 'slide' ? A.currentSlideMarkdown() : t('---\nlayout: cover\n---\n\n# Titel\n\n## Untertitel\n\n---\n\n# Erste Folie\n\n- Punkt eins\n- Punkt zwei\n')
  mdOpen.value = true
  mdDialog.value.showModal()
}
const applyMarkdown = () => A.run(async () => {
  mdOpen.value = false
  if (mdDialog.value.returnValue !== 'ok') return
  const file = mdTarget.value === 'slide' ? fileOf(slide.value) : `${String(decks.value.length).padStart(2, '0')}_Neu.md`
  const slides = await A.markdownToSlides(mdText.value, file)
  if (!slides.length) return A.toast(t('Kein Folieninhalt gefunden.'))
  if (mdTarget.value === 'slide') {
    for (const s of slides) s.file = slide.value.file
    deck.slides.splice(ui.slide, 1, ...slides)
  } else {
    deck.slides.splice(ui.slide + 1, 0, ...slides.map(s => ({ ...s, file: slide.value.file })))
    ui.slide++
  }
  A.toast(t(slides.length > 1 ? '{0} Folien übernommen.' : '{0} Folie übernommen.', slides.length))
})

function newDeck() { deckRenaming.value = null; deckNameInput.value = ''; deckDialog.value.showModal() }
function renameDeckAsk(d) { deckRenaming.value = d.file; deckNameInput.value = d.name; deckDialog.value.showModal() }
function applyDeck() {
  if (deckDialog.value.returnValue !== 'ok' || !deckNameInput.value.trim()) return
  if (deckRenaming.value) A.renameDeck(deckRenaming.value, deckNameInput.value)
  else A.addDeck(deckNameInput.value)
}
function addVideo() {
  if (ytDialog.value.returnValue !== 'ok') return
  const id = ytUrl.value.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{6,20})/)?.[1] || (/^[\w-]{6,20}$/.test(ytUrl.value.trim()) ? ytUrl.value.trim() : null)
  id ? A.insert('video', id) : A.toast(t('Kein gültiger YouTube-Link.'))
}

// --- presenting ---
const fitPresenter = () => {
  const narrow = innerWidth < 760 // phones: presenter view stacks slide, next slide and notes
  presentScale.value = presenterView.value ? Math.min((innerWidth * (narrow ? 1 : 0.62) - (narrow ? 32 : 0)) / format.w, (innerHeight * (narrow ? 0.4 : 0.7)) / format.h) : Math.min(innerWidth / format.w, innerHeight / format.h)
}
async function present(from = ui.slide) {
  ui.sel = []
  ui.editing = null
  A.go(from)
  presenting.value = true
  started.value = Date.now()
  await nextTick()
  presenter.value.focus()
  await presenter.value.requestFullscreen?.().catch(() => {}) // without fullscreen it fills the window
  fitPresenter()
}
function stopPresenting() {
  presenting.value = false
  if (document.fullscreenElement) document.exitFullscreen()
}
function presentKey(e) {
  const d = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, Enter: 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1, Backspace: -1 }[e.key]
  if (d) A.go(ui.slide + d)
  else if (e.key === 'Home') A.go(0)
  else if (e.key === 'End') A.go(deck.slides.length - 1)
  else if (e.key === 'Escape') stopPresenting()
  else if (e.key.toLowerCase() === 'p') { presenterView.value = !presenterView.value; fitPresenter() }
  else return
  e.preventDefault()
}
function presentClick(e) {
  const a = e.target.closest('a[href]')
  if (a) return window.open(a.href, '_blank', 'noopener')
  if (e.target.closest('iframe, .pv-side, .pv-bar')) return
  A.go(ui.slide + (e.clientX < innerWidth / 4 ? -1 : 1)) // the left edge goes back: touch screens have no arrow keys
}
const elapsed = computed(() => { const s = Math.max(0, Math.floor((now.value - started.value) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` })

// --- command palette ---
// [label, action, shortcut]: shortcuts are spelled 'mod+shift+alt+key' (mod = ⌘ on Mac, Strg elsewhere);
// the same list drives the command palette, its hints and the keyboard handling
// what the theme gallery shows: big enough to read at 13 %
const THEME_PREVIEW = computed(() => ({ layout: 'default', elements: [
  { id: 't', type: 'text', title: true, x: 56, y: 30, w: 868, h: 60, html: `<h1>${t('Titel')}</h1>`, fontSize: 30 },
  { id: 'l', type: 'text', x: 56, y: 130, w: 520, h: 300, html: `<ul><li>${t('Punkt eins')}</li><li>${t('Punkt')} <a href="#">${t('zwei')}</a></li><li><code>code</code></li></ul>`, fontSize: 40 },
  { id: 'c', type: 'code', x: 620, y: 140, w: 300, h: 220, lang: 'js', code: 'const a = 1\nlog(a)', fontSize: 30 },
] }))
const SHAPE_NAMES = { rect: ['Rechteck', 'r'], rounded: ['Abgerundet'], ellipse: ['Ellipse', 'o'], triangle: ['Dreieck'], arrow: ['Pfeil', 'a'], line: ['Linie'] }
const pickImage = () => document.querySelector('.topbar input[type=file][accept^="image"]')?.click()
const commands = computed(() => [
  [t('Neue Folie'), () => A.addSlide(), 'n'], [t('Folie duplizieren'), () => A.duplicateSlide(), 'mod+shift+d'], [t('Folie löschen'), () => A.deleteSlide(), 'mod+shift+backspace'],
  [t('Folie nach oben'), () => A.moveSlide(ui.slide, ui.slide - 1), 'alt+arrowup'], [t('Folie nach unten'), () => A.moveSlide(ui.slide, ui.slide + 1), 'alt+arrowdown'],
  ...SLIDE_PRESETS.map(p => [t('Neue Folie: {0}', t(p.name)), () => A.addSlide(p)]),
  [t('Text einfügen'), () => A.insert('text'), 't'], [t('Überschrift einfügen'), () => A.insert('heading'), 'h'], [t('Aufzählung einfügen'), () => A.insert('list'), 'l'],
  [t('Nummerierte Liste einfügen'), () => A.insert('olist'), 'shift+l'], [t('Zitat einfügen'), () => A.insert('quote'), 'q'], [t('Code einfügen'), () => A.insert('code'), 'c'],
  [t('Bild einfügen'), pickImage, 'i'],
  ...TABLE_PRESETS.map(([id, n], i) => [t('Tabelle einfügen: {0}', t(n)), () => A.insert('table', id), i ? undefined : 'b']),
  ...CALLOUTS.map(([k, n]) => [t('Hinweisbox: {0}', t(n)), () => A.insert('callout', k)]),
  ...Object.entries(SHAPE_NAMES).map(([s, [n, key]]) => [t('Form einfügen: {0}', t(n)), () => A.insert('shape', s), key]),
  [t('YouTube-Video einfügen'), () => { ytUrl.value = ''; ytDialog.value.showModal() }, 'y'],
  [t('Markdown dieser Folie bearbeiten'), () => openMarkdown('slide'), 'm'], [t('Folien aus Markdown einfügen (z. B. von KI)'), () => openMarkdown('new'), 'shift+m'],
  [t('Neuer Foliensatz'), newDeck, 'shift+n'],
  [t('Präsentieren ab aktueller Folie'), () => present(), 'p'], [t('Präsentieren von Anfang'), () => present(0), 'shift+p'],
  [t('Referentenansicht'), () => { presenterView.value = true; present() }, 'alt+p'],
  [t('Folienleiste ein-/ausblenden'), () => (panels.slides = !panels.slides), 'alt+b'], [t('Eigenschaften ein-/ausblenden'), () => (panels.props = !panels.props), 'alt+e'],
  [t('Rückgängig'), () => undo(), 'mod+z'], [t('Wiederholen'), redo, 'mod+shift+z'],
  [t('Suchen'), () => openFind(), 'mod+f'], [t('Ersetzen'), () => openFind(true), 'mod+alt+f'],
  [t('Alles auswählen'), A.selectAll, 'mod+a'], [t('Format kopieren'), A.copyLook, 'mod+alt+c'], [t('Format einfügen'), () => A.pasteLook(), 'mod+alt+v'], [t('Duplizieren'), () => (selection.value.length ? A.duplicate() : A.duplicateSlide()), 'mod+d'],
  [t('Eine Ebene nach vorne'), () => A.order('forward'), 'mod+arrowup'], [t('Eine Ebene nach hinten'), () => A.order('backward'), 'mod+arrowdown'],
  [t('Ganz nach vorne'), () => A.order('front'), 'mod+shift+arrowup'], [t('Ganz nach hinten'), () => A.order('back'), 'mod+shift+arrowdown'],
  [t('Exportieren …'), () => openExport(), 'mod+e'],
  [t('Export: PDF (gesamt)'), () => A.pdf(), 'mod+p'], [t('Export: PowerPoint (gesamt)'), () => A.pptx(), 'mod+shift+e'], [t('Export: Slidev-Projekt (ZIP)'), A.slidev, 'mod+alt+s'],
  [t('Export: PowerPoint originalgetreu (gesamt)'), () => A.exportAs('pptx-image')], [t('Export: OpenDocument .odp (gesamt)'), () => A.exportAs('odp')], [t('Export: PowerPoint für Google Slides (gesamt)'), () => A.exportAs('pptx-google')],
  [t('Export: HTML-Präsentation (gesamt)'), () => A.exportAs('html')], [t('Export: Bilder PNG (gesamt)'), () => A.exportAs('png')],
  ...decks.value.filter(d => d.file !== deck.entry).map(d => [t('Export: Foliensatz „{0}“ …', d.name), () => openExport(d.file)]),
  [t('Projekt als Datei sichern'), A.saveFile, 'mod+s'], [t('Zur Projektübersicht'), () => { ui.home = true }],
  [t('Alle Befehle und Tastenkürzel'), openPalette, 'mod+k'],
  [t('Diese Folie auf Import-Stand zurücksetzen'), () => A.revertSlides([slide.value])],
  [t('Alle geänderten Folien auf Import-Stand zurücksetzen'), () => ask(t('{0} geänderte importierte Folien zurücksetzen? Änderungen daran gehen verloren.', deck.slides.filter(A.canRevert).length), () => A.revertSlides(), t('Zurücksetzen'))],
  ...[...themeIds(false), ...themeIds(true)].map(id => [`Theme: ${themeName(id)}`, () => setTheme(id)]),
  [t('Theme bearbeiten …'), () => themeEditor.value.open(deck.theme)], [t('Theme importieren …'), () => document.querySelector('[data-theme-import]')?.click()],
])
const KEY_NAMES = { arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', backspace: '⌫', enter: '↵' }
const keyLabel = spec => spec && spec.split('+').map(k => ({ mod: isMac ? '⌘' : t('Strg+'), shift: '⇧', alt: isMac ? '⌥' : 'Alt+' }[k] || KEY_NAMES[k] || k.toUpperCase())).join('')
const filtered = computed(() => {
  const q = paletteQuery.value.toLowerCase().split(/\s+/).filter(Boolean)
  // without a query: everything that has a shortcut first, as a cheat sheet
  if (!q.length) return [...commands.value].sort((a, b) => !a[2] - !b[2])
  return commands.value.filter(([n, , k]) => q.every(w => n.toLowerCase().includes(w) || keyLabel(k)?.toLowerCase() === w)).slice(0, 30)
})
function openPalette() { paletteQuery.value = ''; paletteIndex.value = 0; paletteDialog.value.showModal() }
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
  if (presenting.value || ui.home) return
  const k = e.key.toLowerCase(), cmd = e.metaKey || e.ctrlKey
  // letters by position: Alt/Option changes e.key (⌥P = π)
  const name = /^Key[A-Z]$/.test(e.code) ? e.code[3].toLowerCase() : k
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
  else if (!ui.sel.includes(el.id)) ui.sel = [el.id]
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
const copyText = s => navigator.clipboard.writeText(s).then(() => A.toast(t('Kopiert.')), () => A.toast(t('Kopieren nicht erlaubt – bitte ⌘C/Strg+C nutzen.')))
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
const codeCut = ta => navigator.clipboard.writeText(taText(ta)).then(() => taReplace(ta, ''), () => A.toast(t('Ausschneiden nicht erlaubt – bitte ⌘X/Strg+X nutzen.')))
const codePaste = ta => navigator.clipboard.readText().then(s => taReplace(ta, s), () => A.toast(t('Einfügen nicht erlaubt – bitte ⌘V/Strg+V nutzen.')))
const ctxTable = (fn, where) => A.run(() => fn(ctxAt.value.el, where))
const CLIP = 'application/x-slides-builder'
function onClipboard(e) {
  if (presenting.value || ui.home || inField(e)) return
  if (e.type !== 'paste') {
    if (!selection.value.length) return
    e.clipboardData.setData(CLIP, JSON.stringify(selection.value))
    e.clipboardData.setData('text/plain', selection.value.map(el => el.code || el.html?.replace(/<[^>]+>/g, '') || '').join('\n'))
    if (e.type === 'cut') A.remove()
  } else if (e.clipboardData.getData(CLIP)) {
    const list = JSON.parse(e.clipboardData.getData(CLIP))
    A.run(() => {
      const els = cleanSlides([{ elements: list }])[0].elements.map(el => ({ ...el, x: el.x + 16, y: el.y + 16 }))
      slide.value.elements.push(...els)
      ui.sel = els.map(el => el.id)
    })
  } else if ([...e.clipboardData.files].some(f => f.type.startsWith('image/'))) {
    A.addImages([...e.clipboardData.files])
  } else {
    const text = e.clipboardData.getData('text/plain')
    if (!text.trim()) return
    // markdown pasted onto the canvas becomes slides when it looks like Slidev, otherwise text
    if (/^---\s*$/m.test(text) || /^#\s/m.test(text)) { mdTarget.value = 'new'; mdText.value = text; mdOpen.value = true; mdDialog.value.showModal() }
    else A.addElement({ type: 'text', x: 120, y: 140, w: 600, h: 40, html: text.split(/\n{2,}/).map(p => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('') })
  }
  e.preventDefault()
}
</script>

<template>
  <Home v-if="ready && ui.home" @import="pickImport($event, 'project')" />

  <div v-else-if="ready" class="app" :inert="presenting">
    <header class="topbar">
      <button class="logo" :title="t('Projektübersicht')" @click="ui.home = true"><Icon name="slides" :size="20" /></button>
      <div class="doc">
        <div class="doc-row">
          <input v-model="deck.title" class="doc-title" :aria-label="t('Titel des Projekts')" spellcheck="false" />
          <span class="save-state" :class="ui.save" role="status" :title="ui.save === 'failed' ? ui.status : t('Alle Änderungen liegen in diesem Browser (IndexedDB)')">
            <Icon v-if="ui.save === 'saved'" name="check" :size="14" />{{ { saving: t('Speichert …'), saved: t('Gespeichert'), failed: t('Nicht gespeichert – als Datei sichern') }[ui.save] }}
          </span>
        </div>
        <div class="menubar">
          <Menu :label="t('Datei')">
            <button class="mi" @click="ui.home = true"><Icon name="home" />{{ t('Alle Projekte') }}</button>
            <hr />
            <label class="mi"><Icon name="folder" />{{ t('Slidev-Projekt öffnen …') }}<input type="file" webkitdirectory hidden @change="pickImport([...$event.target.files], 'project'); $event.target.value = ''" /></label>
            <label class="mi"><Icon name="upload" />{{ t('Foliensätze hinzufügen (.md) …') }}<input type="file" accept=".md,text/markdown" multiple hidden @change="pickImport([...$event.target.files], 'decks'); $event.target.value = ''" /></label>
            <label class="mi"><Icon name="upload" />{{ t('Foliensätze aus Ordner hinzufügen …') }}<input type="file" webkitdirectory hidden @change="pickImport([...$event.target.files], 'decks'); $event.target.value = ''" /></label>
            <button class="mi" @click="openMarkdown('new')"><Icon name="markdown" />{{ t('Folien aus Markdown einfügen …') }}</button>
            <hr />
            <button class="mi" @click="A.saveFile"><Icon name="save" />{{ t('Projekt als Datei sichern') }}<kbd>{{ mod }}S</kbd></button>
          </Menu>
          <Menu :label="t('Bearbeiten')">
            <button class="mi" :disabled="!canUndo()" @click="undo()"><Icon name="undo" />{{ t('Rückgängig') }}<kbd>{{ mod }}Z</kbd></button>
            <button class="mi" :disabled="!canRedo()" @click="redo"><Icon name="redo" />{{ t('Wiederholen') }}<kbd>{{ mod }}⇧Z</kbd></button>
            <hr />
            <button class="mi" @click="openFind()"><Icon name="search" />{{ t('Suchen …') }}<kbd>{{ mod }}F</kbd></button>
            <button class="mi" @click="openFind(true)"><Icon name="search" />{{ t('Ersetzen …') }}<kbd>{{ keyLabel('mod+alt+f') }}</kbd></button>
            <hr />
            <button class="mi" @click="A.selectAll"><Icon name="grid" />{{ t('Alles auswählen') }}<kbd>{{ mod }}A</kbd></button>
            <button class="mi" :disabled="!selection.length" @click="A.duplicate"><Icon name="copy" />{{ t('Duplizieren') }}<kbd>{{ mod }}D</kbd></button>
            <button class="mi" :disabled="!selection.length" @click="A.remove"><Icon name="trash" />{{ t('Löschen') }}<kbd>⌫</kbd></button>
            <hr />
            <button class="mi" @click="openPalette"><Icon name="search" />{{ t('Alle Befehle & Tastenkürzel …') }}<kbd>{{ mod }}K</kbd></button>
          </Menu>
          <Menu :label="t('Ansicht')">
            <button class="mi" @click="present()"><Icon name="play" />{{ t('Präsentieren') }}<kbd>P</kbd></button>
            <button class="mi" @click="present(0)"><Icon name="play" />{{ t('Von Anfang präsentieren') }}<kbd>⇧P</kbd></button>
            <button class="mi" @click="presenterView = true; present()"><Icon name="presenter" />{{ t('Referentenansicht') }}<kbd>{{ keyLabel('alt+p') }}</kbd></button>
            <hr />
            <button class="mi" :aria-pressed="panels.slides" @click="panels.slides = !panels.slides"><Icon name="slides" />{{ t('Folienleiste ein-/ausblenden') }}<kbd>{{ keyLabel('alt+b') }}</kbd></button>
            <button class="mi" :aria-pressed="panels.props" @click="panels.props = !panels.props"><Icon name="layout" />{{ t('Eigenschaften ein-/ausblenden') }}<kbd>{{ keyLabel('alt+e') }}</kbd></button>
          </Menu>
        </div>
      </div>

      <div class="bar">
      <div class="tools">
        <Menu icon="plus" :label="t('Folie')" :title="t('Neue Folie (N)')" wide>
          <div class="preset-grid">
            <button v-for="p in SLIDE_PRESETS" :key="p.id" class="preset-card" @click="A.addSlide(p)">
              <span class="mini-slide"><SlideView :slide="{ layout: p.layout, elements: p.make() }" :index="0" :style="{ transform: 'scale(0.13)' }" inert /></span>
              {{ t(p.name) }}
            </button>
          </div>
        </Menu>
        <span class="divider" />
        <button class="tb" :title="t('Text (T)')" @click="A.insert('text')"><Icon name="text" /><span>Text</span></button>
        <label class="tb" :title="t('Bild (I) – auch per Drag & Drop oder Einfügen')"><Icon name="image" /><span>{{ t('Bild') }}</span><input type="file" accept="image/*" multiple hidden @change="A.addImages([...$event.target.files]); $event.target.value = ''" /></label>
        <Menu icon="table" :label="t('Tabelle')">
          <button v-for="[id, n] in TABLE_PRESETS" :key="id" class="mi" @click="A.insert('table', id)">
            <span class="slide mini-tbl" :class="`theme-${deck.theme}`"><span class="tbl-wrap" :data-table="id"><table><thead><tr><th /><th /><th /></tr></thead><tbody><tr><td /><td /><td /></tr><tr><td /><td /><td /></tr></tbody></table></span></span>{{ t(n) }}
          </button>
        </Menu>
        <Menu icon="shapes" :label="t('Einfügen')">
          <button class="mi" @click="A.insert('heading')"><Icon name="heading" />{{ t('Überschrift') }}<kbd>{{ keyLabel('h') }}</kbd></button>
          <button class="mi" @click="A.insert('list')"><Icon name="list" />{{ t('Aufzählung') }}<kbd>{{ keyLabel('l') }}</kbd></button>
          <button class="mi" @click="A.insert('olist')"><Icon name="olist" />{{ t('Nummerierte Liste') }}<kbd>{{ keyLabel('shift+l') }}</kbd></button>
          <button class="mi" @click="A.insert('quote')"><Icon name="quote" />{{ t('Zitat') }}<kbd>{{ keyLabel('q') }}</kbd></button>
          <button class="mi" @click="A.insert('code')"><Icon name="code" />{{ t('Code') }}<kbd>{{ keyLabel('c') }}</kbd></button>
          <hr />
          <button v-for="[k, n, c] in CALLOUTS" :key="k" class="mi" @click="A.insert('callout', k)"><i class="dot" :style="{ background: c }" />{{ t('Hinweisbox: {0}', t(n)) }}</button>
          <hr />
          <div class="shape-row">
            <button v-for="s in ['rect', 'rounded', 'ellipse', 'triangle', 'arrow', 'line']" :key="s" class="shape-btn" :title="t(SHAPE_NAMES[s][0])" @click="A.insert('shape', s)">
              <svg viewBox="0 0 40 28"><rect v-if="s === 'rect'" x="4" y="4" width="32" height="20" /><rect v-if="s === 'rounded'" x="4" y="4" width="32" height="20" rx="6" /><ellipse v-if="s === 'ellipse'" cx="20" cy="14" rx="16" ry="10" /><polygon v-if="s === 'triangle'" points="20,3 36,25 4,25" /><polygon v-if="s === 'arrow'" points="3,9 24,9 24,3 37,14 24,25 24,19 3,19" /><line v-if="s === 'line'" x1="4" y1="14" x2="36" y2="14" /></svg>
            </button>
          </div>
          <hr />
          <button class="mi" @click="ytUrl = ''; ytDialog.showModal()"><Icon name="video" />{{ t('YouTube-Video …') }}<kbd>Y</kbd></button>
          <button class="mi" @click="openMarkdown('new')"><Icon name="markdown" />{{ t('Markdown / KI-Folien …') }}<kbd>⇧M</kbd></button>
        </Menu>
        <span class="divider" />
        <button class="tb icon" :disabled="!canUndo()" :title="`${t('Rückgängig')} (${mod}Z)`" @click="undo()"><Icon name="undo" /></button>
        <button class="tb icon" :disabled="!canRedo()" :title="`${t('Wiederholen')} (${mod}⇧Z)`" @click="redo"><Icon name="redo" /></button>
      </div>

      <div class="right">
        <button class="tb icon" :title="`${t('Befehle suchen')} (${mod}K)`" @click="openPalette"><Icon name="search" /></button>
        <Menu icon="palette" :label="themeName(deck.theme)" title="Theme" wide>
          <template v-for="own in [false, true]" :key="own">
            <h4 class="mh">{{ own ? t('Eigene Themes') : t('Vorgegebene Themes') }}</h4>
            <div class="theme-grid">
              <button v-for="id in themeIds(own)" :key="id" class="theme-card" :class="{ on: deck.theme === id }" @click="setTheme(id)">
                <span class="mini-slide"><SlideView :slide="THEME_PREVIEW" :index="0" :theme="id" :style="{ transform: 'scale(0.13)' }" inert /></span>
                {{ themeName(id) }}
              </button>
            </div>
            <p v-if="own && !themeIds(true).length" class="mh-note">{{ t('Noch keine – bearbeite ein Theme oder importiere eine .theme.json.') }}</p>
          </template>
          <div class="mi-row theme-actions">
            <button class="mi" @click="themeEditor.open(deck.theme)"><Icon name="text" />{{ THEMES[deck.theme]?.custom ? t('Theme bearbeiten …') : t('Als eigenes Theme anpassen …') }}</button>
            <label class="mi"><Icon name="upload" />{{ t('Importieren …') }}<input data-theme-import type="file" accept=".json,application/json" multiple hidden @change="importThemeFiles([...$event.target.files]); $event.target.value = ''" /></label>
          </div>
          <label class="check keep-sizes" data-keep :title="t('Das neue Theme übernimmt Farben und Schriften, aber die Schriftgrößen des bisherigen – so verschiebt sich kein Layout')"><input v-model="keepSizes" type="checkbox" /> {{ t('Schriftgrößen beim Wechsel beibehalten') }}<small v-if="deck.typo.from">{{ t('aktuell: Größen von „{0}“', themeName(deck.typo.from)) }}</small></label>
        </Menu>
        <Menu ref="formatMenu" icon="fullscreen" :label="ratioLabel(deck.aspectRatio)" :title="t('Folienformat (Seitenverhältnis)')">
          <h4 class="mh">Format</h4>
          <button v-for="r in formats" :key="r" class="mi" :aria-pressed="deck.aspectRatio === r" @click="setFormat(r, deck.canvasWidth)">
            <Icon name="check" :style="{ visibility: deck.aspectRatio === r ? null : 'hidden' }" />{{ ratioLabel(r) }}
          </button>
          <hr />
          <div class="mi-row format-custom" data-keep>
            <input v-model="customRatio" :placeholder="t('Eigenes …, z. B. 21:9')" :aria-label="t('Eigenes Seitenverhältnis')" @keydown.enter.prevent="setCustomRatio" />
            <button class="mi" @click="setCustomRatio">OK</button>
          </div>
        </Menu>
        <Menu icon="download" label="Export">
          <h4 class="mh">{{ t('Alles · {0} Folien', deck.slides.length) }}</h4>
          <button v-for="f in EXPORTS" :key="f.id" class="mi" @click="A.exportAs(f.id)"><Icon :name="f.id === 'slidev' ? 'markdown' : 'file'" />{{ t(f.name) }} <small class="mi-ext">{{ f.ext }}</small></button>
          <hr />
          <button class="mi" @click="openExport()"><Icon name="download" />{{ t('Exportieren …') }} <small class="mi-ext">{{ keyLabel('mod+e') }}</small></button>
          <button v-if="decks.length > 1" class="mi" @click="openExport(decks.find(d => d.file !== deck.entry)?.file)"><Icon name="file" />{{ t('Einzelnen Foliensatz exportieren …') }}</button>
        </Menu>
        <button class="tb primary" :title="t('Präsentieren (F5)')" @click="present()"><Icon name="play" /><span>{{ t('Präsentieren') }}</span></button>
      </div>
      </div>
    </header>

    <main :class="{ 'no-slides': !panels.slides, 'no-props': !panels.props }">
      <nav class="slides-panel" :aria-label="t('Folien')">
        <div class="panel-head">
          <span>{{ t('Foliensätze') }}</span>
          <button class="tb icon small" :title="t('Neuer Foliensatz')" @click="newDeck"><Icon name="plus" :size="16" /></button>
        </div>
        <div class="slide-list">
          <section v-for="(g, gi) in groups" :key="g.file + gi" class="deck-group"
            :class="{ 'drop-before': dropDeck === gi && deckFrom !== gi, 'drop-after': dropDeck === gi + 1 && gi === groups.length - 1 }"
            @dragover.prevent="deckOver($event, gi)" @drop.prevent="dropDeckAt()">
            <header class="deck-head" :class="{ entry: g.file === deck.entry }" draggable="true" :title="t('Ziehen, um den Foliensatz zu verschieben')"
              @dragstart="deckDragStart($event, gi)" @dragend="deckFrom = null; dropDeck = null" @contextmenu="onDeckContext($event, g)">
              <button class="tb icon small" :aria-expanded="!collapsed.has(g.file)" :aria-label="t(collapsed.has(g.file) ? '{0} aufklappen' : '{0} zuklappen', g.name || t('Foliensatz'))" :title="collapsed.has(g.file) ? t('Aufklappen') : t('Zuklappen')" @click="toggle(g.file)"><Icon :name="collapsed.has(g.file) ? 'chevronR' : 'chevron'" :size="14" /></button>
              <span class="deck-name" :title="g.file">{{ g.name }}</span>
              <span v-if="deckHits(g)" class="find-badge inline" :title="t('{0} Treffer in diesem Foliensatz', deckHits(g))">{{ deckHits(g) }}</span>
              <span class="count">{{ g.count }}</span>
              <Menu v-if="g.file !== deck.entry" icon="more" :title="t('Foliensatz')">
                <button class="mi" @click="renameDeckAsk(g)">{{ t('Umbenennen …') }}</button>
                <button class="mi" @click="A.moveDeck(g.file, -1)"><Icon name="up" />{{ t('Nach oben') }}</button>
                <button class="mi" @click="A.moveDeck(g.file, 1)"><Icon name="down" />{{ t('Nach unten') }}</button>
                <hr />
                <button class="mi" @click="A.pdf(g.file)"><Icon name="file" />{{ t('Als PDF exportieren') }}</button>
                <button class="mi" @click="A.pptx(g.file)"><Icon name="file" />{{ t('Als PPTX exportieren') }}</button>
                <button class="mi" @click="openExport(g.file)"><Icon name="download" />{{ t('Weitere Formate …') }}</button>
                <hr />
                <button class="mi danger" @click="ask(t('Foliensatz „{0}“ mit {1} Folien entfernen?', g.name, g.count), () => A.removeDeck(g.file))"><Icon name="trash" />{{ t('Entfernen') }}</button>
              </Menu>
            </header>
            <div v-if="!collapsed.has(g.file)" class="thumbs">
              <div v-for="(s, j) in g.slides" :key="s.id" class="thumb-row" @dragover.prevent @drop.prevent="drop($event, g.start + j, g.file)">
                <span class="num">{{ g.start + j + 1 }}</span>
                <button class="thumb" :style="{ height: Math.round(format.h * THUMB) + 4 + 'px' }" :aria-current="g.start + j === ui.slide" :aria-label="t('Folie {0}', g.start + j + 1)" draggable="true"
                  @click="ui.slide = g.start + j" @dblclick="present(g.start + j)" @contextmenu="onThumbContext($event, g.start + j)" @dragstart="dragStart($event, g.start + j)">
                  <SlideView :slide="s" :index="g.start + j" :style="{ transform: `scale(${THUMB})` }" inert aria-hidden="true" />
                  <span v-if="findOpen && hitsOn[g.start + j]" class="find-badge" :title="t('{0} Treffer', hitsOn[g.start + j])">{{ hitsOn[g.start + j] }}</span>
                </button>
              </div>
            </div>
          </section>
          <button class="add-slide" @click="A.addSlide()"><Icon name="plus" :size="16" /> {{ t('Neue Folie') }}</button>
        </div>
      </nav>

      <section ref="stage" class="stage" :aria-label="t('Folie {0}', ui.slide + 1)" @dragover.prevent @drop.prevent="A.addImages([...$event.dataTransfer.files])" @pointerdown.self="ui.sel = []">
        <button class="tb icon small panel-toggle left" :aria-expanded="panels.slides" :aria-label="t('Folienleiste ein-/ausblenden')" :title="`${t('Folienleiste ein-/ausblenden')} (${keyLabel('alt+b')})`" @click="panels.slides = !panels.slides"><Icon :name="panels.slides ? 'chevronL' : 'chevronR'" :size="16" /></button>
        <button class="tb icon small panel-toggle right" :aria-expanded="panels.props" :aria-label="t('Eigenschaften ein-/ausblenden')" :title="`${t('Eigenschaften ein-/ausblenden')} (${keyLabel('alt+e')})`" @click="panels.props = !panels.props"><Icon :name="panels.props ? 'chevronR' : 'chevronL'" :size="16" /></button>
        <Teleport defer :to="mdOpen ? '.md-wrap' : '.stage'">
        <dialog ref="findDialog" class="find" :class="{ replacing }" :aria-label="t('Suchen und ersetzen')" @keydown.esc.stop.prevent="closeFind" @keydown="findKey" @close="findOpen = false">
          <button type="button" class="tb icon small find-fold" :title="replacing ? t('Ersetzen ausblenden') : t('Ersetzen einblenden')" :aria-expanded="replacing" @click="replacing = !replacing"><Icon :name="replacing ? 'chevron' : 'chevronR'" :size="14" /></button>
          <div class="find-row">
            <span class="find-field">
              <input ref="findInput" v-model="findQ" :placeholder="t('Suchen')" :aria-label="t('Suchen')" :aria-invalid="rx === false" @keydown.enter.prevent="step($event.shiftKey ? -1 : 1)" />
              <span class="find-toggles">
                <button v-for="[k, label, name] in [['cs', 'Aa', 'Groß-/Kleinschreibung beachten'], ['word', 'ab', 'Nur ganzes Wort suchen'], ['regex', '.*', 'Regulären Ausdruck verwenden']]" :key="k"
                  type="button" class="find-toggle" :class="[k, { on: findOpt[k] }]" :title="`${t(name)} (${keyLabel('mod+alt+' + { cs: 'c', word: 'w', regex: 'r' }[k])})`" :aria-pressed="findOpt[k]" @click="findOpt[k] = !findOpt[k]">{{ label }}</button>
              </span>
            </span>
            <span class="find-count" role="status" :class="{ none: findQ && !occ.length }">{{ !findQ ? '' : rx === false ? t('Ungültiger Ausdruck') : occ.length ? t('{0} von {1}', findAt + 1 || '?', occ.length) : t('Keine Ergebnisse') }}<template v-if="occ[findAt]?.h.notes"> · {{ t('Notizen') }}</template></span>
            <button type="button" class="tb icon small" :title="t('Vorheriger Treffer (⇧↵)')" :aria-label="t('Vorheriger Treffer')" :disabled="!occ.length" @click="step(-1)"><Icon name="up" :size="14" /></button>
            <button type="button" class="tb icon small" :title="t('Nächster Treffer (↵)')" :aria-label="t('Nächster Treffer')" :disabled="!occ.length" @click="step(1)"><Icon name="down" :size="14" /></button>
            <button type="button" class="tb icon small find-filter" :class="{ on: filtered_ }" :title="t('Suchbereich eingrenzen')" :aria-label="t('Suchbereich eingrenzen')" :aria-expanded="filtering" @click="filtering = !filtering"><Icon name="filter" :size="14" /></button>
            <button type="button" class="tb icon small" :title="t('Schließen (Esc)')" :aria-label="t('Schließen')" @click="closeFind"><Icon name="x" :size="14" /></button>
          </div>
          <div v-if="filtering && !mdOpen" class="find-row find-scope">
            <select v-model="findScope" :aria-label="t('Umfang')">
              <option value="all">{{ t('Alle Folien') }}</option>
              <option value="deck">{{ t('Dieser Foliensatz') }}</option>
              <option value="slide">{{ t('Diese Folie') }}</option>
            </select>
            <label v-for="[k, name] in KINDS" :key="k" class="check"><input v-model="findKinds[k]" type="checkbox" />{{ t(name) }}</label>
          </div>
          <div v-if="replacing" class="find-row">
            <span class="find-field">
              <input v-model="findR" :placeholder="t('Ersetzen')" :aria-label="t('Ersetzen durch')" :title="findOpt.regex ? t('$1, $<name>, $& und \\n verwenden Gruppen des Ausdrucks') : null" @keydown.enter.prevent="$event.metaKey || $event.ctrlKey ? replaceAll() : replaceOne()" />
              <span class="find-toggles">
                <button type="button" class="find-toggle" :class="{ on: findOpt.keep }" :title="`${t('Groß-/Kleinschreibung beibehalten')} (${keyLabel('mod+alt+p')})`" :aria-pressed="findOpt.keep" @click="findOpt.keep = !findOpt.keep">AB</button>
              </span>
            </span>
            <button type="button" class="tb small" :title="t('Ersetzen (↵)')" :disabled="!occ.length" @click="replaceOne">{{ t('Ersetzen') }}</button>
            <button type="button" class="tb small" :title="`${t('Alle ersetzen')} (${mod}↵)`" :disabled="!occ.length" @click="replaceAll">{{ t('Alle') }}</button>
          </div>
        </dialog>
        </Teleport>
        <div class="frame" :style="{ width: format.w * scale + 'px', height: format.h * scale + 'px', '--s': scale }" @contextmenu="onContext">
          <SlideView ref="view" :key="slide.id" :slide="slide" :index="ui.slide" editable :scale="scale" :style="{ transform: `scale(${scale})` }" />
        </div>
        <Menu ref="ctx" manual>
          <template v-if="ctxAt?.group">
            <template v-for="g in [ctxAt.group]" :key="g.file">
              <button class="mi" :disabled="!g.count" @click="present(g.start)"><Icon name="play" />{{ t('Ab diesem Foliensatz präsentieren') }}</button>
              <button class="mi" @click="toggle(g.file)"><Icon :name="collapsed.has(g.file) ? 'chevronR' : 'chevron'" />{{ collapsed.has(g.file) ? t('Aufklappen') : t('Zuklappen') }}</button>
              <template v-if="g.file !== deck.entry">
                <button class="mi" @click="renameDeckAsk(g)"><Icon name="text" />{{ t('Umbenennen …') }}</button>
                <button class="mi" :disabled="!canMoveDeck(g, -1)" @click="A.moveDeck(g.file, -1)"><Icon name="up" />{{ t('Nach oben') }}</button>
                <button class="mi" :disabled="!canMoveDeck(g, 1)" @click="A.moveDeck(g.file, 1)"><Icon name="down" />{{ t('Nach unten') }}</button>
              </template>
              <button class="mi" @click="newDeck"><Icon name="plus" />{{ t('Neuer Foliensatz') }}<kbd>{{ keyLabel('shift+n') }}</kbd></button>
              <hr />
              <button class="mi" :disabled="!g.count" @click="A.pdf(g.file)"><Icon name="file" />{{ t('Als PDF exportieren') }}</button>
              <button class="mi" :disabled="!g.count" @click="A.pptx(g.file)"><Icon name="file" />{{ t('Als PPTX exportieren') }}</button>
              <button class="mi" :disabled="!g.count" @click="openExport(g.file)"><Icon name="download" />{{ t('Weitere Formate …') }}</button>
              <template v-if="g.file !== deck.entry">
                <hr />
                <button class="mi danger" @click="ask(t('Foliensatz „{0}“ mit {1} Folien entfernen?', g.name, g.count), () => A.removeDeck(g.file))"><Icon name="trash" />{{ t('Entfernen …') }}</button>
              </template>
            </template>
          </template>
          <template v-else-if="ctxAt?.thumb != null">
            <button class="mi" @click="present(ui.slide)"><Icon name="play" />{{ t('Ab dieser Folie präsentieren') }}<kbd>P</kbd></button>
            <hr />
            <button class="mi" @click="A.addSlide()"><Icon name="plus" />{{ t('Neue Folie danach') }}<kbd>N</kbd></button>
            <button class="mi" @click="A.duplicateSlide()"><Icon name="copy" />{{ t('Folie duplizieren') }}<kbd>{{ keyLabel('mod+shift+d') }}</kbd></button>
            <button class="mi" @click="openMarkdown('slide')"><Icon name="markdown" />{{ t('Markdown dieser Folie bearbeiten') }}<kbd>M</kbd></button>
            <button v-if="A.canRevert(slide)" class="mi" @click="A.revertSlides([slide])"><Icon name="undo" />{{ t('Auf Import-Stand zurücksetzen') }}</button>
            <hr />
            <button class="mi" :disabled="ui.slide === 0" @click="A.moveSlide(ui.slide, ui.slide - 1)"><Icon name="up" />{{ t('Nach oben') }}<kbd>{{ keyLabel('alt+arrowup') }}</kbd></button>
            <button class="mi" :disabled="ui.slide === deck.slides.length - 1" @click="A.moveSlide(ui.slide, ui.slide + 1)"><Icon name="down" />{{ t('Nach unten') }}<kbd>{{ keyLabel('alt+arrowdown') }}</kbd></button>
            <hr />
            <button class="mi danger" :disabled="deck.slides.length < 2" @click="A.deleteSlide()"><Icon name="trash" />{{ t('Folie löschen') }}<kbd>{{ keyLabel('mod+shift+backspace') }}</kbd></button>
          </template>
          <template v-else-if="ctxAt?.cropEl">
            <div class="mh">{{ t('Seitenverhältnis') }}</div>
            <button v-for="[k, n] in A.CROP_RATIOS" :key="n" class="mi" :class="{ on: ui.cropRatio === k }" :aria-pressed="ui.cropRatio === k" @click="A.setCropRatio(ctxAt.cropEl, k)"><Icon name="check" :style="{ visibility: ui.cropRatio === k ? null : 'hidden' }" />{{ t(n) }}</button>
            <hr />
            <button class="mi" @click="A.resetCrop(ctxAt.cropEl)"><Icon name="undo" />{{ t('Zuschnitt zurücksetzen') }}</button>
            <button class="mi" @click="A.endCrop()"><Icon name="image" />{{ t('Zuschneiden beenden') }}<kbd>↵</kbd></button>
          </template>
          <template v-else-if="ctxAt?.shapeText !== undefined && ctxAt?.el?.type === 'shape'">
            <button class="mi" :disabled="!ctxAt.text" @click="copyText(ctxAt.text)"><Icon name="copy" />{{ t('Auswahl kopieren') }}<kbd>{{ mod }}C</kbd></button>
            <hr />
            <div class="mi-row" data-keep role="group" :aria-label="t('Format')">
              <button class="mi" :title="t('Fett')" :aria-label="t('Fett')" @click="A.format('bold')"><Icon name="bold" /></button>
              <button class="mi" :title="t('Kursiv')" :aria-label="t('Kursiv')" @click="A.format('italic')"><Icon name="italic" /></button>
              <button class="mi" :title="t('Unterstrichen')" :aria-label="t('Unterstrichen')" @click="A.format('underline')"><Icon name="underline" /></button>
              <button class="mi" :title="t('Durchgestrichen')" :aria-label="t('Durchgestrichen')" @click="A.format('strikeThrough')"><Icon name="strike" /></button>
            </div>
            <div class="mi-row" data-keep role="group" :aria-label="t('Ausrichtung')">
              <button v-for="[a, i, n] in [['left', 'textL', 'Linksbündig'], ['center', 'textC', 'Zentriert'], ['right', 'textR', 'Rechtsbündig']]" :key="a" class="mi" :class="{ on: (ctxAt.el.align || 'center') === a }" :title="t(n)" :aria-label="t(n)" :aria-pressed="(ctxAt.el.align || 'center') === a" @click="ctxAt.el.align = a === 'center' ? undefined : a"><Icon :name="i" /></button>
            </div>
            <h4 class="mh">{{ t('Farbe der Auswahl') }}</h4>
            <div class="swatches ctx-sw" data-keep>
              <button v-for="c in PALETTE" :key="c" class="sw" :style="{ background: c }" :title="c" :aria-label="c" @click="A.format('foreColor', c)" />
              <button class="sw none" :title="t('Theme-Farbe')" :aria-label="t('Theme-Farbe')" @click="A.format('removeFormat')" />
            </div>
            <hr />
            <button class="mi" @click="ctxAt.shapeText && (ctxAt.shapeText.innerHTML = ''); ctxAt.shapeText?.blur()"><Icon name="trash" />{{ t('Text entfernen') }}</button>
            <button class="mi" @click="ctxAt.shapeText?.blur()"><Icon name="x" />{{ t('Bearbeiten beenden') }}<kbd>Esc</kbd></button>
          </template>
          <template v-else-if="ctxAt?.code">
            <button class="mi" :disabled="!ctxAt.hasSel" @click="codeCut(ctxAt.code)"><Icon name="cut" />{{ t('Ausschneiden') }}<kbd>{{ mod }}X</kbd></button>
            <button class="mi" :disabled="!ctxAt.hasSel" @click="copyText(taText(ctxAt.code))"><Icon name="copy" />{{ t('Kopieren') }}<kbd>{{ mod }}C</kbd></button>
            <button class="mi" @click="codePaste(ctxAt.code)"><Icon name="file" />{{ t('Aus Zwischenablage einfügen') }}<kbd>{{ mod }}V</kbd></button>
            <button class="mi" @click="ctxAt.code.select()"><Icon name="grid" />{{ t('Alles markieren') }}<kbd>{{ mod }}A</kbd></button>
            <hr />
            <button class="mi" @click="taLines(ctxAt.code, l => '  ' + l)"><Icon name="chevronR" />{{ t('Einrücken') }}<kbd>Tab</kbd></button>
            <button class="mi" @click="taLines(ctxAt.code, l => l.replace(/^( {1,2}|\t)/, ''))"><Icon name="chevronL" />{{ t('Ausrücken') }}</button>
            <button class="mi" @click="markLines(ctxAt.code, ctxAt.el)"><Icon name="filter" />{{ ctxAt.hasSel ? t('Markierte Zeilen hervorheben') : t('Zeile hervorheben') }}</button>
            <button class="mi" @click="ctxAt.el.meta = withLines(ctxAt.el.meta, !codeOpts(ctxAt.el.meta).lines)"><Icon name="olist" />{{ codeOpts(ctxAt.el.meta).lines ? t('Zeilennummern ausblenden') : t('Zeilennummern einblenden') }}</button>
            <hr />
            <button class="mi" @click="ctxAt.code.blur()"><Icon name="x" />{{ t('Bearbeiten beenden') }}<kbd>Esc</kbd></button>
          </template>
          <template v-else-if="ctxAt?.editingCell">
            <button class="mi" :disabled="!ctxAt.text" @click="copyText(ctxAt.text)"><Icon name="copy" />{{ t('Auswahl kopieren') }}<kbd>{{ mod }}C</kbd></button>
            <button class="mi" @click="ctxTable(clearCells)"><Icon name="x" />{{ ui.cellEnd ? t('Markierte Zellen leeren') : t('Zelle leeren') }}</button>
            <hr />
            <button class="mi" @click="ctxTable(insertRow, 'above')"><Icon name="rowAbove" />{{ t('Zeile oberhalb einfügen') }}</button>
            <button class="mi" @click="ctxTable(insertRow, 'below')"><Icon name="rowBelow" />{{ t('Zeile unterhalb einfügen') }}</button>
            <button class="mi" @click="ctxTable(insertCol, 'left')"><Icon name="colLeft" />{{ t('Spalte links einfügen') }}</button>
            <button class="mi" @click="ctxTable(insertCol, 'right')"><Icon name="colRight" />{{ t('Spalte rechts einfügen') }}</button>
            <button class="mi" @click="ctxTable(deleteRow)"><Icon name="rowDel" />{{ ui.cellEnd ? t('Markierte Zeilen löschen') : t('Zeile löschen') }}</button>
            <button class="mi" @click="ctxTable(deleteCol)"><Icon name="colDel" />{{ ui.cellEnd ? t('Markierte Spalten löschen') : t('Spalte löschen') }}</button>
            <hr />
            <div class="mi-row" role="group" :aria-label="t('Spalte ausrichten')">
              <button v-for="[a, i, tip] in [['left', 'textL', 'Spalte linksbündig'], ['center', 'textC', 'Spalte zentriert'], ['right', 'textR', 'Spalte rechtsbündig']]" :key="a"
                class="mi" :class="{ on: ctxAt.el.align[ui.cell?.c] === a }" :title="t(tip)" :aria-label="t(tip)" :aria-pressed="ctxAt.el.align[ui.cell?.c] === a" @click="ctxTable(setAlign, a)"><Icon :name="i" /></button>
            </div>
            <hr />
            <button class="mi" @click="ui.editing = null"><Icon name="x" />{{ t('Bearbeiten beenden') }}<kbd>Esc</kbd></button>
          </template>
          <template v-else-if="ctxAt?.el">
            <button v-if="selection.length === 1 && ['text', 'code', 'table'].includes(ctxAt.el.type)" class="mi" @click="ctxEdit"><Icon name="text" />{{ ctxAt.el.type === 'table' ? t('Zelle bearbeiten') : t('Bearbeiten') }}<kbd>↵</kbd></button>
            <label v-if="selection.length === 1 && ctxAt.el.type === 'image'" class="mi"><Icon name="image" />{{ t('Bild ersetzen …') }}<input type="file" accept="image/*" hidden @change="A.run(() => A.replaceImage(ctxAt.el, $event.target.files[0]))" /></label>
            <template v-if="selection.length === 1 && ctxAt.el.type === 'image' && !ctxAt.el.locked">
              <button class="mi" @click="A.run(() => A.startCrop(ctxAt.el))"><Icon name="image" />{{ t('Zuschneiden') }}</button>
              <button v-if="ctxAt.el.crop" class="mi" @click="A.resetCrop(ctxAt.el)"><Icon name="undo" />{{ t('Zuschnitt entfernen') }}</button>
            </template>
            <button v-if="selection.length === 1 && ctxAt.el.type === 'text'" class="mi" @click="A.fitHeight(ctxAt.el)"><Icon name="alignB" />{{ t('Höhe an Text anpassen') }}</button>
            <template v-if="ctxAt.cell">
              <hr />
              <button class="mi" @click="ctxTable(insertRow, 'above')"><Icon name="rowAbove" />{{ t('Zeile oberhalb einfügen') }}</button>
              <button class="mi" @click="ctxTable(insertRow, 'below')"><Icon name="rowBelow" />{{ t('Zeile unterhalb einfügen') }}</button>
              <button class="mi" @click="ctxTable(insertCol, 'left')"><Icon name="colLeft" />{{ t('Spalte links einfügen') }}</button>
              <button class="mi" @click="ctxTable(insertCol, 'right')"><Icon name="colRight" />{{ t('Spalte rechts einfügen') }}</button>
              <button class="mi" @click="ctxTable(deleteRow)"><Icon name="rowDel" />{{ ui.cellEnd ? t('Markierte Zeilen löschen') : t('Zeile löschen') }}</button>
              <button class="mi" @click="ctxTable(deleteCol)"><Icon name="colDel" />{{ ui.cellEnd ? t('Markierte Spalten löschen') : t('Spalte löschen') }}</button>
            </template>
            <!-- shapes: form, fill and outline right here; colour clicks keep the menu open to try them -->
            <template v-if="selection.length === 1 && ctxAt.el.type === 'shape'">
              <h4 class="mh">{{ t('Form') }}</h4>
              <div class="mi-row" data-keep role="group" :aria-label="t('Form')">
                <button v-for="([n], s) in SHAPE_NAMES" :key="s" class="mi" :class="{ on: ctxAt.el.shape === s }" :title="t(n)" :aria-label="t(n)" :aria-pressed="ctxAt.el.shape === s" @click="ctxAt.el.shape = s">
                  <span class="shape-ico" v-html="shapeSvg({ shape: s, w: 22, h: 14, fill: s === 'line' ? 'none' : 'currentColor', stroke: 'currentColor', strokeWidth: s === 'line' ? 2 : 0, radius: 2 })" />
                </button>
              </div>
              <template v-if="ctxAt.el.shape !== 'line'">
                <h4 class="mh">{{ t('Füllung') }}</h4>
                <div class="swatches ctx-sw" data-keep>
                  <button v-for="c in FILLS" :key="c" class="sw" :class="{ on: ctxAt.el.fill === c }" :style="{ background: c }" :title="c" :aria-label="c" @click="ctxAt.el.fill = c" />
                  <button class="sw none" :title="t('Keine Füllung')" :aria-label="t('Keine Füllung')" @click="ctxAt.el.fill = 'none'" />
                </div>
              </template>
              <h4 class="mh">{{ t('Kontur') }}</h4>
              <div class="swatches ctx-sw" data-keep>
                <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: ctxAt.el.stroke === c }" :style="{ background: c }" :title="c" :aria-label="c" @click="ctxAt.el.stroke = c; ctxAt.el.strokeWidth ||= 2" />
                <button class="sw none" :title="t('Keine Kontur')" :aria-label="t('Keine Kontur')" @click="ctxAt.el.stroke = 'none'" />
              </div>
              <div v-if="ctxAt.el.stroke !== 'none'" class="mi-row" data-keep role="group" :aria-label="t('Konturstärke')">
                <button v-for="w in [1, 2, 4, 8]" :key="w" class="mi" :class="{ on: ctxAt.el.strokeWidth === w }" :aria-pressed="ctxAt.el.strokeWidth === w" @click="ctxAt.el.strokeWidth = w">{{ w }} px</button>
              </div>
              <hr />
            </template>
            <hr v-if="selection.length === 1 && ctxAt.el.type !== 'shape' && ctxAt.el.type !== 'video'" />
            <button class="mi" @click="clip('cut')"><Icon name="cut" />{{ t('Ausschneiden') }}<kbd>{{ mod }}X</kbd></button>
            <button class="mi" @click="clip('copy')"><Icon name="copy" />{{ t('Kopieren') }}<kbd>{{ mod }}C</kbd></button>
            <button class="mi" @click="A.duplicate"><Icon name="copy" />{{ t('Duplizieren') }}<kbd>{{ mod }}D</kbd></button>
            <button class="mi" @click="A.remove"><Icon name="trash" />{{ selection.length > 1 ? t('{0} Elemente löschen', selection.length) : t('Löschen') }}<kbd>⌫</kbd></button>
            <hr />
            <button class="mi" @click="A.order('front')"><Icon name="up" />{{ t('Ganz nach vorne') }}<kbd>{{ keyLabel('mod+shift+arrowup') }}</kbd></button>
            <button class="mi" @click="A.order('forward')"><Icon name="up" />{{ t('Eine Ebene nach vorne') }}<kbd>{{ keyLabel('mod+arrowup') }}</kbd></button>
            <button class="mi" @click="A.order('backward')"><Icon name="down" />{{ t('Eine Ebene nach hinten') }}<kbd>{{ keyLabel('mod+arrowdown') }}</kbd></button>
            <button class="mi" @click="A.order('back')"><Icon name="down" />{{ t('Ganz nach hinten') }}<kbd>{{ keyLabel('mod+shift+arrowdown') }}</kbd></button>
            <hr />
            <div class="mi-row" role="group" :aria-label="selection.length > 1 ? t('Aneinander ausrichten') : t('Auf der Folie ausrichten')">
              <button v-for="[a, i, tip] in [['left', 'alignL', 'Links'], ['center', 'alignC', 'Horizontal zentrieren'], ['right', 'alignR', 'Rechts'], ['top', 'alignT', 'Oben'], ['middle', 'alignM', 'Vertikal zentrieren'], ['bottom', 'alignB', 'Unten']]" :key="a"
                class="mi" :title="t(selection.length > 1 ? '{0} (aneinander)' : '{0} (auf der Folie)', t(tip))" :aria-label="t(tip)" @click="A.align(a)"><Icon :name="i" /></button>
            </div>
            <template v-if="selection.length > 2">
              <button class="mi" @click="A.distribute('h')"><Icon name="distH" />{{ t('Horizontal verteilen') }}</button>
              <button class="mi" @click="A.distribute('v')"><Icon name="distV" />{{ t('Vertikal verteilen') }}</button>
            </template>
          </template>
          <template v-else>
            <button class="mi" @click="A.insert('text')"><Icon name="text" />{{ t('Text einfügen') }}<kbd>T</kbd></button>
            <button class="mi" @click="A.insert('heading')"><Icon name="heading" />{{ t('Überschrift einfügen') }}<kbd>H</kbd></button>
            <button class="mi" @click="pickImage"><Icon name="image" />{{ t('Bild einfügen …') }}<kbd>I</kbd></button>
            <button class="mi" :disabled="!slide.elements.length" @click="A.selectAll"><Icon name="grid" />{{ t('Alles auswählen') }}<kbd>{{ mod }}A</kbd></button>
            <hr />
            <button class="mi" @click="A.addSlide()"><Icon name="plus" />{{ t('Neue Folie') }}<kbd>N</kbd></button>
            <button class="mi" @click="A.duplicateSlide()"><Icon name="copy" />{{ t('Folie duplizieren') }}<kbd>{{ keyLabel('mod+shift+d') }}</kbd></button>
            <button class="mi" @click="openMarkdown('slide')"><Icon name="markdown" />{{ t('Markdown dieser Folie bearbeiten') }}<kbd>M</kbd></button>
            <button class="mi" :disabled="deck.slides.length < 2" @click="A.deleteSlide()"><Icon name="trash" />{{ t('Folie löschen') }}</button>
          </template>
        </Menu>
        <div class="stage-info">{{ ui.slide + 1 }} / {{ deck.slides.length }} · {{ Math.round(scale * 100) }} %</div>
      </section>

      <Inspector @link="openLink" @markdown="openMarkdown('slide')" />
    </main>
    <AppFooter />
  </div>

  <template v-if="ready">

    <div v-if="ui.status" class="toast" role="status">{{ ui.status }}<button class="tb icon small" :aria-label="t('Schließen')" @click="ui.status = ''"><Icon name="x" :size="14" /></button></div>

    <!-- dialogs -->
    <ThemeEditor ref="themeEditor" @saved="id => { setTheme(id); A.toast(t('Theme „{0}“ gespeichert', THEMES[id].name)) }" @deleted="id => A.toast(t('Theme gelöscht'))" />
    <dialog ref="dupDialog" @close="dupChoice">
      <form method="dialog">
        <h2>{{ t('Projekt bereits vorhanden') }}</h2>
        <p>{{ t('Der Ordner „{0}“ wurde schon als Projekt „{1}“ ({2} Folien) geöffnet. Änderungen dort gehen beim Überschreiben verloren.', dupOf?.source, dupOf?.title, dupOf?.slides) }}</p>
        <menu><button value="">{{ t('Abbrechen') }}</button><button value="open">{{ t('Vorhandenes öffnen') }}</button><button value="copy">{{ t('Kopie anlegen') }}</button><button class="primary danger" value="replace">{{ t('Überschreiben') }}</button></menu>
      </form>
    </dialog>

    <dialog ref="importDialog" @close="doImport">
      <form method="dialog">
        <h2>{{ importMode === 'new' ? t('Neues Projekt aus Foliensätzen') : t('Foliensätze hinzufügen') }}</h2>
        <p v-if="importMode === 'new'">{{ t('Keine Datei') }} <code>slides.md</code> {{ t('gefunden. Jede gewählte Datei wird ein Foliensatz – sortiert nach Namen – und beim Export in eine neue') }} <code>slides.md</code>{{ t(' eingebunden.') }}</p>
        <p v-else>{{ t('Jede gewählte Datei wird – sortiert nach Namen – ein eigener Foliensatz am Ende des Projekts und im Export von') }} <code>{{ deck.entry }}</code>{{ t(' eingebunden.') }}</p>
        <div class="pick-list">
          <label v-for="p in importEntries" :key="p" class="check">
            <input v-model="importPick" type="checkbox" :value="p" />
            {{ p }}
          </label>
        </div>
        <menu><button value="">{{ t('Abbrechen') }}</button><button class="primary" value="ok">{{ importMode === 'new' ? t('Projekt anlegen') : t('Hinzufügen') }}</button></menu>
      </form>
    </dialog>

    <dialog ref="mdDialog" class="wide" @close="applyMarkdown">
      <form method="dialog">
        <h2>{{ mdTarget === 'slide' ? t('Markdown von Folie {0}', ui.slide + 1) : t('Folien aus Markdown') }}</h2>
        <p>{{ t('Slidev-Markdown: Folien mit') }} <code>---</code> {{ t('trennen, Layout per Frontmatter (') }}<code>layout: cover</code>{{ t('). Ideal für Folien, die eine KI erzeugt hat.') }}</p>
        <div class="md-wrap">
          <!-- the highlighted copy shows through the transparent textarea text; highlight() escapes the HTML -->
          <div class="md-mirror text-mirror" aria-hidden="true" v-html="highlight(mdText, 'markdown') + '\u200b'" />
          <textarea v-model="mdText" class="md-editor" spellcheck="false" aria-label="Markdown" @scroll="$event.target.previousElementSibling.scrollTop = $event.target.scrollTop" />
        </div>
        <menu><button value="">{{ t('Abbrechen') }}</button><button class="primary" value="ok">{{ mdTarget === 'slide' ? t('Folie ersetzen') : t('Folien einfügen') }}</button></menu>
      </form>
    </dialog>

    <dialog ref="linkDialog" @close="applyLink">
      <form method="dialog">
        <h2>{{ t('Link') }}</h2>
        <input v-model="linkUrl" :aria-label="t('Adresse')" :placeholder="t('https://… (leer = Link entfernen)')" autofocus />
        <menu><button value="">{{ t('Abbrechen') }}</button><button class="primary" value="ok">{{ t('Übernehmen') }}</button></menu>
      </form>
    </dialog>

    <dialog ref="ytDialog" @close="addVideo">
      <form method="dialog">
        <h2>{{ t('YouTube-Video') }}</h2>
        <input v-model="ytUrl" :aria-label="t('YouTube-Link')" placeholder="https://www.youtube.com/watch?v=…" autofocus />
        <menu><button value="">{{ t('Abbrechen') }}</button><button class="primary" value="ok">{{ t('Einfügen') }}</button></menu>
      </form>
    </dialog>

    <dialog ref="deckDialog" @close="applyDeck">
      <form method="dialog">
        <h2>{{ deckRenaming ? t('Foliensatz umbenennen') : t('Neuer Foliensatz') }}</h2>
        <p>{{ t('Wird als eigene Markdown-Datei gespeichert und in') }} <code>{{ deck.entry }}</code>{{ t(' eingebunden.') }}</p>
        <input v-model="deckNameInput" aria-label="Name" :placeholder="t('z. B. Datenbanken')" autofocus />
        <menu><button value="">{{ t('Abbrechen') }}</button><button class="primary" value="ok">{{ deckRenaming ? t('Umbenennen') : t('Anlegen') }}</button></menu>
      </form>
    </dialog>

    <dialog ref="exportDialog" class="wide export-dlg" @close="doExport">
      <form method="dialog">
        <h2>{{ t('Exportieren') }}</h2>
        <label class="export-scope">{{ t('Umfang') }}
          <select v-model="exportScope">
            <option value="">{{ t('Gesamtes Projekt · {0} Folien', deck.slides.length) }}</option>
            <option v-for="d in decks.filter(d => d.file !== deck.entry)" :key="d.file" :value="d.file">{{ t('Foliensatz „{0}“ · {1} Folien', d.name, d.count) }}</option>
          </select>
        </label>
        <div class="export-grid" role="radiogroup" aria-label="Format">
          <label v-for="f in EXPORTS" :key="f.id" class="export-card" :class="{ on: exportFormat === f.id, off: f.project && exportScope }">
            <input v-model="exportFormat" type="radio" name="export-format" :value="f.id" :disabled="f.project && !!exportScope" />
            <strong>{{ t(f.name) }} <small>{{ f.ext }}</small></strong>
            <span class="apps">{{ t(f.apps) }}</span>
            <span class="note">{{ t(f.note) }}</span>
            <span class="badges"><em v-if="f.editable" class="b-edit">{{ t('bearbeitbar') }}</em><em v-if="f.exact" class="b-exact">{{ t('pixelgenau') }}</em><em v-if="f.project">{{ t('nur ganzes Projekt') }}</em></span>
          </label>
        </div>
        <p class="export-hint">{{ t('Keynote öffnet') }} <code>.pptx</code> {{ t('direkt. Für Google Slides die eigene Variante wählen und dort über „Datei → Importieren“ öffnen. Soll es dort exakt so aussehen wie hier, wähle „originalgetreu“.') }}</p>
        <menu><button value="">{{ t('Abbrechen') }}</button><button class="primary" value="ok" :disabled="EXPORTS.find(f => f.id === exportFormat)?.project && !!exportScope">{{ t('Exportieren') }}</button></menu>
      </form>
    </dialog>

    <dialog ref="confirmDialog" @close="confirmDialog.returnValue === 'ok' && confirmAction?.()">
      <form method="dialog">
        <h2>{{ t('Bist du sicher?') }}</h2>
        <p>{{ confirmText }} {{ t('Mit „Rückgängig“ lässt es sich zurückholen.') }}</p>
        <menu><button value="">{{ t('Abbrechen') }}</button><button class="primary danger" value="ok">{{ confirmLabel }}</button></menu>
      </form>
    </dialog>

    <dialog ref="paletteDialog" class="palette" @keydown="paletteKey">
      <input v-model="paletteQuery" class="palette-input" :placeholder="t('Befehl suchen … (z. B. „tabelle“, „pdf“, „theme“)')" :aria-label="t('Befehl suchen')" autofocus role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="palette-list" :aria-activedescendant="filtered.length ? 'cmd-' + paletteIndex : null" @input="paletteIndex = 0" />
      <ul id="palette-list" role="listbox" :aria-label="t('Befehle')">
        <li v-for="(c, i) in filtered" :id="'cmd-' + i" :key="c[0]" role="option" :aria-selected="i === paletteIndex" @click="runCommand(c)" @mousemove="paletteIndex = i">
          {{ c[0] }}<kbd v-if="c[2]">{{ keyLabel(c[2]) }}</kbd>
        </li>
        <li v-if="!filtered.length" class="empty">{{ t('Kein Befehl gefunden') }}</li>
      </ul>
    </dialog>
  </template>

  <div v-if="presenting" ref="presenter" class="presenter" :class="{ pv: presenterView }" tabindex="0" role="application" :aria-label="t('Folie {0} von {1}', ui.slide + 1, deck.slides.length)" @keydown="presentKey" @click="presentClick">
    <div class="pv-main" :style="{ width: format.w * presentScale + 'px', height: format.h * presentScale + 'px' }">
      <SlideView :slide="slide" :index="ui.slide" live :style="{ transform: `scale(${presentScale})` }" />
    </div>
    <aside v-if="presenterView" class="pv-side">
      <div class="pv-next">
        <small>{{ t('Nächste Folie') }}</small>
        <div v-if="deck.slides[ui.slide + 1]" :style="{ width: format.w * 0.3 + 'px', height: format.h * 0.3 + 'px' }"><SlideView :slide="deck.slides[ui.slide + 1]" :index="ui.slide + 1" :style="{ transform: 'scale(0.3)' }" /></div>
        <p v-else>{{ t('Ende') }}</p>
      </div>
      <div class="pv-notes">{{ slide.notes || t('Keine Notizen') }}</div>
    </aside>
    <div class="pv-bar">
      <span>{{ ui.slide + 1 }} / {{ deck.slides.length }}</span>
      <span v-if="presenterView">⏱ {{ elapsed }}</span>
      <button class="tb icon small" :title="t('Referentenansicht (P)')" @click.stop="presenterView = !presenterView; fitPresenter()"><Icon name="presenter" :size="16" /></button>
      <button class="tb icon small" :title="t('Beenden (Esc)')" @click.stop="stopPresenting"><Icon name="x" :size="16" /></button>
    </div>
    <div class="pv-progress" :style="{ width: ((ui.slide + 1) / deck.slides.length) * 100 + '%' }" />
  </div>

  <div v-if="A.exportSlides.value" class="output">
    <SlideView v-for="(s, i) in A.exportSlides.value" :key="s.id" :slide="s" :index="i" />
  </div>
</template>
