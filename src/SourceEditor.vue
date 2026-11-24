<script setup>
// Source editor: every deck file of the project as Slidev Markdown in a VS Code-like CodeMirror, with
// markdownlint, Prettier and a live preview of the slide under the cursor. Loaded on first open (source.open).
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, markRaw } from 'vue'
import Icon from './Icon.vue'
import SlideView from './SlideView.vue'
import { deck, ui, W, H, fileOf, deckData, deckName } from './store.js'
import { slideToMarkdown } from './toSlidev.js'
import { splitSlides } from './parseSlidev.js'
import { joinSlides, splitSource, diffSlides, lintSource, formatSource, source } from './source.js'
import * as A from './actions.js'
import { isDark } from './scheme.js'
import { t } from './i18n.js'

const dlg = ref(), host = ref(), pane = ref()
// one tab per deck file, in slide order: its text, and which slide each unchanged text stands for
const data = deckData().slides
const files = reactive([])
deck.slides.forEach((s, i) => {
  const file = fileOf(s)
  let f = files.find(x => x.file === file)
  if (!f) files.push(f = { file, name: file === deck.entry ? file : deckName(file) + '.md', orig: [], saved: '' })
  f.orig.push({ slide: s, md: slideToMarkdown(data[i]) })
})
for (const f of files) f.saved = joinSlides(f.orig.map(o => o.md))
const tab = ref(Math.max(0, files.findIndex(f => f.file === fileOf(deck.slides[ui.slide] || {}))))
const states = [] // CodeMirror state per tab (text, undo history, cursor)
const texts = reactive(files.map(f => f.saved))
const dirty = computed(() => files.some((f, i) => texts[i] !== f.saved))
const cursor = reactive({ line: 1, col: 1, part: 0, count: 1 })
const problems = ref([])
const showPreview = ref(true)
const confirmClose = ref(false)
const busy = ref(false)
let view = null

// the slide part a line belongs to: from its `---` to the next one
function partAt(text, line) {
  const parts = splitSlides(text)
  let i = 0
  for (let k = 1; k < parts.length; k++) if (parts[k - 1].at + parts[k - 1].body.length <= line) i = k
  // the empty part before a leading frontmatter is no slide (splitSource drops it)
  const skip = parts[0] && !parts[0].fm && !parts[0].body.some(l => l.trim()) ? 1 : 0
  return { index: Math.max(0, i - skip), count: parts.length - skip }
}

// live preview: the original slide while its text is unchanged, else the text imported like the app does
const preview = ref(null)
let timer, seq = 0
function updatePreview() {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    const n = ++seq, md = splitSource(texts[tab.value])[cursor.part]
    if (!md) return (preview.value = null)
    const same = files[tab.value].orig.find(o => o.md === md)
    if (same) return (preview.value = same.slide)
    try {
      const [s] = await A.markdownToSlides(md, files[tab.value].file, A.slideIds())
      if (n === seq) preview.value = s || null
    } catch {} // half-typed Markdown: the last preview stays
  }, 300)
}
watch(() => [cursor.part, tab.value], updatePreview)
const scale = ref(0.3)
const ro = new ResizeObserver(([e]) => { scale.value = Math.max(0.1, (e.contentRect.width - 2) / W) })
watch(pane, (el, old) => { if (old) ro.unobserve(old); if (el) ro.observe(el) })

// --- applying ---
// unchanged slide texts keep their slide; edited and new ones are imported; files keep their order
async function apply() {
  if (busy.value) return
  busy.value = true
  try {
    const ids = A.slideIds() // shortcut: slide numbers in links mean the numbering before this apply
    const out = [], next = [] // the tabs' new state, kept only when the whole apply works
    for (const [i, f] of files.entries()) {
      const orig = []
      for (const d of diffSlides(f.orig, splitSource(texts[i]))) {
        if (d.keep) { out.push(d.keep); orig.push(f.orig.find(o => o.slide === d.keep)); continue }
        const made = (await A.markdownToSlides(d.md, f.file, ids)).map(s => ({ ...s, file: f.file }))
        out.push(...made)
        if (made.length === 1) orig.push({ slide: made[0], md: d.md }) // next apply keeps it as typed
      }
      next.push({ orig, saved: texts[i] })
    }
    if (!out.length) return A.toast(t('No slide content found.'))
    next.forEach((n, i) => Object.assign(files[i], n))
    deck.slides.splice(0, deck.slides.length, ...out)
    ui.slide = Math.min(ui.slide, out.length - 1)
    A.toast(t('Markdown applied.'))
  } catch (e) {
    A.toast(e.message || String(e))
  } finally {
    busy.value = false
  }
}

async function format() {
  try {
    const out = await formatSource(view.state.doc.toString())
    if (out !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: out } })
  } catch (e) {
    A.toast(t('Could not format: {0}', e.message)) // Prettier refuses broken Markdown with a line number
  }
}

const close = () => { if (dirty.value) confirmClose.value = true; else dlg.value.close() }
const discard = () => { confirmClose.value = false; dlg.value.close() }
const applyClose = async () => { await apply(); if (!dirty.value) dlg.value.close() }

// on the dialog, by physical key: on a Mac ⇧⌥F types "Ï", which CodeMirror's keymap does not match
function onKey(e) {
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyS') { e.preventDefault(); apply() }
  if (e.shiftKey && e.altKey && e.code === 'KeyF') { e.preventDefault(); format() }
  // Esc on keydown: Chrome closes a dialog on a second Esc even when its cancel is prevented (and the edits are gone).
  // defaultPrevented: CodeMirror used it (search, completion, problems panel)
  if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); if (confirmClose.value) { confirmClose.value = false; view?.focus() } else close() }
}

function select(i) {
  if (i === tab.value || !view) return
  states[tab.value] = view.state
  tab.value = i
  view.setState(states[i])
  track(view.state)
  view.focus()
}
// status bar and preview follow the cursor
function track(state) {
  const head = state.selection.main.head, line = state.doc.lineAt(head), p = partAt(texts[tab.value], line.number - 1)
  Object.assign(cursor, { line: line.number, col: head - line.from + 1, part: p.index, count: p.count })
}
function goTo(p) {
  const line = view.state.doc.line(p.line)
  view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true })
  view.focus()
}

onMounted(async () => {
  dlg.value.showModal()
  const [{ EditorView, basicSetup }, { EditorState, Compartment }, { keymap }, { indentWithTab }, { markdown, markdownLanguage }, { languages }, { linter, lintGutter, openLintPanel, closeLintPanel }, { syntaxHighlighting, HighlightStyle }, { tags }, { slidev }] = await Promise.all([
    import('codemirror'), import('@codemirror/state'), import('@codemirror/view'), import('@codemirror/commands'), import('@codemirror/lang-markdown'),
    import('@codemirror/language-data'), import('@codemirror/lint'), import('@codemirror/language'), import('@lezer/highlight'), import('./sourceLang.js'),
  ])
  if (!host.value) return // closed while loading
  // VS Code's Dark+ and Light+ colours
  const style = dark => HighlightStyle.define([
    { tag: tags.heading, color: dark ? '#569cd6' : '#800000', fontWeight: 'bold' },
    { tag: tags.strong, fontWeight: 'bold' }, { tag: tags.emphasis, fontStyle: 'italic' }, { tag: tags.strikethrough, textDecoration: 'line-through' },
    { tag: [tags.link, tags.url], color: dark ? '#3794ff' : '#0451a5' },
    { tag: tags.monospace, color: dark ? '#ce9178' : '#a31515' },
    { tag: tags.quote, color: dark ? '#6a9955' : '#008000' },
    { tag: [tags.list, tags.contentSeparator, tags.processingInstruction], color: dark ? '#6796e6' : '#0451a5' },
    { tag: [tags.tagName, tags.keyword, tags.bool, tags.atom], color: dark ? '#569cd6' : '#0000ff' },
    { tag: [tags.attributeName, tags.propertyName, tags.variableName], color: dark ? '#9cdcfe' : '#e50000' },
    { tag: [tags.string, tags.attributeValue, tags.special(tags.string)], color: dark ? '#ce9178' : '#a31515' },
    { tag: tags.comment, color: dark ? '#6a9955' : '#008000', fontStyle: 'italic' },
    { tag: tags.number, color: dark ? '#b5cea8' : '#098658' },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: dark ? '#dcdcaa' : '#795e26' },
    { tag: [tags.typeName, tags.className], color: dark ? '#4ec9b0' : '#267f99' },
    { tag: [tags.meta, tags.angleBracket, tags.punctuation], color: dark ? '#808080' : '#800000' },
  ])
  const look = dark => [syntaxHighlighting(style(dark)), EditorView.theme({
    '&': { height: '100%', color: dark ? '#d4d4d4' : '#000', backgroundColor: dark ? '#1e1e1e' : '#fff', fontSize: '14px' },
    '.cm-content': { fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace', caretColor: dark ? '#aeafad' : '#000' },
    '.cm-gutters': { backgroundColor: dark ? '#1e1e1e' : '#fff', color: dark ? '#858585' : '#237893', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'transparent', outline: `1px solid ${dark ? '#282828' : '#eee'}` },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: dark ? '#c6c6c6' : '#0b216f' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: dark ? '#264f78 !important' : '#add6ff !important' },
    '.cm-cursor': { borderLeftColor: dark ? '#aeafad' : '#000' },
    '.cm-panels': { backgroundColor: dark ? '#252526' : '#f3f3f3', color: dark ? '#ccc' : '#333' },
    '.cm-tooltip': { backgroundColor: dark ? '#252526' : '#f3f3f3', color: dark ? '#ccc' : '#333', border: `1px solid ${dark ? '#454545' : '#c8c8c8'}` },
  }, { dark })]
  const scheme = new Compartment()
  let panel = false
  const keys = keymap.of([
    indentWithTab,
    { key: 'Mod-Shift-m', preventDefault: true, run: v => { (panel = !panel) ? openLintPanel(v) : closeLintPanel(v); return true } },
  ])
  const lint = linter(async v => {
    const doc = v.state.doc, list = await lintSource(doc.toString())
    problems.value = list
    return list.filter(p => p.line <= doc.lines).map(p => {
      const l = doc.line(p.line), from = p.range ? Math.min(l.to, l.from + p.range[0] - 1) : l.from
      return { from, to: p.range ? Math.min(l.to, from + p.range[1]) : l.to, severity: 'warning', source: p.rule, message: p.message }
    })
  }, { delay: 400 })
  const extensions = [
    keys, basicSetup, EditorView.lineWrapping,
    markdown({ base: markdownLanguage, codeLanguages: languages, extensions: [slidev] }),
    lint, lintGutter(), scheme.of(look(isDark.value)),
    EditorView.contentAttributes.of({ 'aria-label': t('Markdown source') }),
    EditorView.updateListener.of(u => {
      if (u.docChanged) texts[tab.value] = u.state.doc.toString()
      if (u.docChanged || u.selectionSet) track(u.state)
      if (u.docChanged) updatePreview()
    }),
  ]
  for (const [i, f] of files.entries()) states[i] = EditorState.create({ doc: f.saved, extensions })
  view = markRaw(new EditorView({ parent: host.value, state: states[tab.value] }))
  watch(isDark, d => view.dispatch({ effects: scheme.reconfigure(look(d)) }))
  // the cursor starts on the slide the app shows
  const own = deck.slides.slice(0, ui.slide + 1).filter(s => fileOf(s) === files[tab.value].file).length - 1
  const md = files[tab.value].orig[own]?.md, at = md ? texts[tab.value].indexOf(md) : -1
  view.dispatch({ selection: { anchor: Math.max(0, at) }, scrollIntoView: true })
  updatePreview()
  view.focus()
})
onBeforeUnmount(() => { clearTimeout(timer); ro.disconnect(); view?.destroy() })
</script>

<template>
  <!-- keydown.stop: the app's shortcuts (present, delete …) would act on the slides behind -->
  <dialog ref="dlg" class="source-editor" :class="{ dark: isDark }" :aria-label="t('Markdown source')" @keydown.stop="onKey" @cancel.prevent="close" @close="source.open = false">
    <header class="se-bar">
      <div class="se-tabs" role="tablist">
        <button v-for="(f, i) in files" :key="f.file" role="tab" :aria-selected="i === tab" class="se-tab" :class="{ on: i === tab }" :title="f.file" @click="select(i)">
          <Icon name="markdown" />{{ f.name }}<span v-if="texts[i] !== f.saved" class="se-dot" :aria-label="t('unsaved')">●</span>
        </button>
      </div>
      <div class="se-actions">
        <button :title="t('Format document') + ' (⇧⌥F)'" @click="format()"><Icon name="brush" />{{ t('Format') }}</button>
        <button :aria-pressed="showPreview" :title="t('Preview of the slide at the cursor')" @click="showPreview = !showPreview"><Icon name="eye" />{{ t('Preview') }}</button>
        <button class="primary" :disabled="!dirty || busy" :title="t('Apply to the slides') + ' (⌘S)'" @click="apply()">{{ t('Apply') }}</button>
        <button :title="t('Close')" :aria-label="t('Close')" @click="close()"><Icon name="x" /></button>
      </div>
    </header>
    <div class="se-main">
      <div ref="host" class="se-code" />
      <aside v-if="showPreview" class="se-preview">
        <div ref="pane" class="se-pane">
          <div class="se-frame" :style="{ width: W * scale + 'px', height: H * scale + 'px' }">
            <SlideView v-if="preview" :slide="preview" :index="Math.max(0, deck.slides.indexOf(preview))" inert :style="{ transform: `scale(${scale})`, '--slide-w': W + 'px', '--slide-h': H + 'px' }" />
          </div>
        </div>
        <p class="se-hint">{{ t('Slide {0} of {1} in this file', cursor.part + 1, cursor.count || 1) }}</p>
      </aside>
    </div>
    <div v-if="confirmClose" class="se-confirm" role="alertdialog" :aria-label="t('Unsaved changes')">
      <span>{{ t('The Markdown has changes that are not applied to the slides yet.') }}</span>
      <button class="primary" @click="confirmClose = false; applyClose()">{{ t('Apply and close') }}</button>
      <button @click="discard()">{{ t('Discard') }}</button>
      <button @click="confirmClose = false; view?.focus()">{{ t('Keep editing') }}</button>
    </div>
    <footer class="se-status">
      <button :title="t('Problems') + ' (⇧⌘M)'" @click="problems.length && goTo(problems[0])"><Icon name="info" />{{ problems.length }}</button>
      <span v-if="busy">{{ t('Applying …') }}</span>
      <span class="se-grow" />
      <span>{{ t('Ln {0}, Col {1}', cursor.line, cursor.col) }}</span>
      <span>Slidev Markdown</span>
    </footer>
  </dialog>
</template>
