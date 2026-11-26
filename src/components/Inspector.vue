<script setup>
import { computed, ref, reactive, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { listAt } from '../editor/lists.js'
import Icon from './Icon.vue'
import Menu from './Menu.vue'
import Sec from './InspectorSection.vue'
import ChartPanel from './ChartPanel.vue'
import FontOptions from './FontOptions.vue'
import { deck, ui, SHAPES, LOOKS, deckOfSlide, clean, cleanEl, textStyles, saveTextStyles, STYLE_PROPS, blockTag, styleMatches, storeFont, removeFont , webUrl } from '../core/store.js'
import { TABLE_PRESETS, themeStyle, FONTS, fontStack } from '../slide/themes.js'
import { LANGS, codeOpts } from '../slide/hl.js'
import { RUN_LANGS, isRun, autorun, withRun, withAutorun, setLines, runInto } from '../present/run.js'
import { canRevert, revertSlides, fitHeight, slide, selection, primary, align, distribute, order, canOrder, duplicate, remove, format, replaceImage, startCrop, endCrop, setCropRatio, resetCrop, CROP_RATIOS, run, duplicateSlide, deleteSlide, list, paint, pasteLook, setSlideLayout, editMaster, group, ungroup, setBackground, slideChoices, setSlideProp, download, toast } from '../core/actions.js'
import { layoutOf } from '../export/toSlidev.js'
import * as table from '../editor/tableOps.js'
import { clock, parseClock } from '../present/timer.js'
import { lists, saveList, removeList, listsFile, importLists } from '../present/picker.js'
import { LETTERS } from '../present/quiz.js'
import { t } from '../core/i18n.js'
import { kbd } from '../core/keys.js'
import { morphSlides } from '../present/morph.js'
import { PALETTE, FILLS, SHAPE_NAMES, DIAGRAMS, FORMULAS } from '../slide/presets.js'
import { picker as iconPicker } from '../slide/icons.js'
import { diagram } from '../slide/diagram.js'
import { MARKS, MARK_NAMES, MARK_COLORS, markAt, setMark, markSteps } from '../slide/marks.js'
import { themeOf, CENTERED } from '../slide/themes.js'
import { mathError, formulaHtml } from '../slide/math.js'

const emit = defineEmits(['link', 'markdown'])
const el = computed(() => (selection.value.length === 1 ? primary.value : null))
const typing = computed(() => el.value && ui.editing === el.value.id)
// list buttons show what the caret is in, like in a word processor
const listKind = ref(null)
const fillScope = ref('cell') // table colour: the current cell, its row or its column
// table borders: where, and the line to draw
const border = ref({ scope: 'cell', w: 1, style: 'solid', color: '#0f172a' })
const BORDER_MODES = [['all', 'All', 'borderAll'], ['outer', 'Outer', 'borderOuter'], ['inner', 'Inner', 'borderInner'], ['none', 'None', 'borderNone'], ['top', 'Top', 'borderTop'], ['bottom', 'Bottom', 'borderBottom'], ['left', 'Left', 'borderLeft'], ['right', 'Right', 'borderRight']]
// which buttons describe the lines around the current cell / row / column / table right now
const bordersOn = computed(() => (el.value?.type === 'table' && ui.cell ? Object.fromEntries(BORDER_MODES.map(([m]) => [m, table.borderOn(el.value, m, border.value.scope)])) : {}))
// several cells marked (shift-click, drag, shift+arrows): the "Cell" choices mean all of them
const cellWord = computed(() => { if (!ui.cellEnd || !el.value?.rows) return t('Cell'); const [r0, r9, c0, c9] = table.area(el.value); return t('Selection ({0} cells)', (r9 - r0 + 1) * (c9 - c0 + 1)) })
const setBorder = mode => { const b = border.value; tbl(table.toggleBorder, mode, `${b.w}px ${b.style} ${b.color}`, b.scope) }
const onSelection = () => { listKind.value = listAt(getSelection().anchorNode) }
onMounted(() => document.addEventListener('selectionchange', onSelection))
onBeforeUnmount(() => document.removeEventListener('selectionchange', onSelection))
const EFFECT_NAMES = { 'fly-left': 'Fly in from left', 'fly-right': 'Fly in from right', 'fly-up': 'Fly in from bottom', zoom: 'Zoom' }
const TRANSITIONS = { none: 'None', fade: 'Fade', 'slide-left': 'Slide left', 'slide-right': 'Slide right', 'slide-up': 'Slide up', 'slide-down': 'Slide down', morph: 'Magic move' } // Slidev's names and Slidecko's morph (store.js keeps only these)
// plays Magic move on the canvas, from this slide into the next (the copy keeps the old slide's look once the canvas shows the next one)
async function previewMorph() {
  const i = ui.slide
  ui.sel = []; ui.editing = null
  await nextTick()
  const from = document.querySelector('.frame > .slide')?.cloneNode(true)
  ui.slide = i + 1
  await nextTick()
  morphSlides(from, document.querySelector('.frame > .slide'), deck.slides[i], deck.slides[i + 1])
}
// the project's layouts; "Edit layouts …" opens the slide's one in the master and layouts mode
const slideLayout = computed(() => layoutOf(slide.value, deck.layouts))
function pickLayout(e) {
  const l = deck.layouts.find(x => x.id === e.target.value)
  if (l) setSlideLayout(slide.value, l)
  else { e.target.value = slideLayout.value?.id; editMaster(slideLayout.value?.id) }
}
const running = ref(false) // the Run button while its code runs
const langs = computed(() => (el.value?.lang && !LANGS.includes(el.value.lang) ? [el.value.lang, ...LANGS] : LANGS))
// code backgrounds: light editor greys and the usual dark editor themes
const CODE_BGS = ['#ffffff', '#f6f8fa', '#f1f5f9', '#fdf6e3', '#fef9c3', '#e0f2fe', '#0d1117', '#1e293b', '#282a36', '#002b36', '#2e3440', '#000000']
const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64]
// --- text styles: the theme's block formats, shown as live previews, plus the user's own presets ---
const STYLES = [['h1', 'Title'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['h4', 'Heading 4'], ['p', 'Body text'], ['blockquote', 'Quote'], ['pre', 'Code']]
const BLOCK_RE = /^(P|H[1-6]|BLOCKQUOTE|PRE)$/
const curTag = computed(() => el.value && blockTag(el.value))
// the whole box: every paragraph/heading/quote becomes `tag` (lists stay lists)
function setBlocks(tag) {
  const d = document.createElement('div')
  d.innerHTML = el.value.html || ''
  for (const n of [...d.children]) {
    if (!BLOCK_RE.test(n.tagName)) continue
    const inner = n.tagName === 'BLOCKQUOTE' ? n.innerHTML.replace(/<\/?p>/g, '') : n.innerHTML
    const m = document.createElement(tag)
    if (tag === 'blockquote') m.innerHTML = `<p>${inner}</p>`
    else if (tag === 'pre') m.textContent = n.textContent
    else m.innerHTML = inner
    n.replaceWith(m)
  }
  el.value.html = clean(d.innerHTML)
}
function applyStyle(tag) {
  typing.value ? format('formatBlock', tag) : setBlocks(tag)
  fitHeight(el.value)
}
// what a custom style carries besides the block format (missing = theme default)
const pick = o => Object.fromEntries(STYLE_PROPS.map(k => [k, o[k]]))
// the custom style this box matches right now
const isCustom = p => styleMatches(p, el.value)
const curStyleName = computed(() => textStyles.list.find(isCustom)?.name || t(STYLES.find(([tag]) => tag === curTag.value)?.[1] || 'Body text'))
const naming = ref(false), presetName = ref('')
const vFocus = { mounted: e => e.focus() } // the name field appears inside an open menu: autofocus does not fire there
function saveCurrent() {
  const name = presetName.value.trim()
  if (!name) return
  saveTextStyles([...textStyles.list.filter(p => p.name !== name), { name, tag: curTag.value || 'p', ...pick(el.value) }])
  naming.value = false
  presetName.value = ''
}
function applyCustom(p) {
  if (!typing.value) setBlocks(p.tag)
  else format('formatBlock', p.tag)
  Object.assign(el.value, pick(p))
  fitHeight(el.value)
}
const removeCustom = p => saveTextStyles(textStyles.list.filter(x => x !== p))

// text colour: of the selected words while typing, of the whole box otherwise
function textColor(c) {
  if (typing.value) format('foreColor', c)
  else el.value.color = c === el.value.color ? undefined : c
}
// colour chips show the current colour; "none" is the crossed swatch, several different ones a neutral grey
const NONE = 'linear-gradient(135deg, #fff 45%, var(--ui-danger) 45% 55%, #fff 55%)'
const lastCountdown = ref(600) // Stopwatch and back: the countdown keeps its length
const chip = (c, none = NONE) => ({ '--chip': c === null ? 'var(--ui-line-strong)' : !c || c === 'none' ? none : c })
// menus that act on the words being typed open without taking the focus (editing ends on blur), like the context menu
let wasOpen = false
const armPop = e => { wasOpen = e.currentTarget.nextElementSibling?.matches(':popover-open') }
function openPop(m, e, keep) {
  if (wasOpen) return (wasOpen = false) // the click that closed it by light dismiss
  const r = e.currentTarget.getBoundingClientRect()
  m.openAt(r.left, r.bottom + 6, !!keep)
}
const styleMenu = ref(), colorMenu = ref(), cellMenu = ref()
// v-mark: the menu shows the mark at the caret, or what the next one gets; a type marks the selected words
const markMenu = ref(), mk = reactive({ mark: null, color: undefined, at: undefined, hint: false })
function openMark(e) {
  const m = markAt()
  Object.assign(mk, { hint: false, mark: m?.getAttribute('data-mark') || null, ...(m && { color: m.getAttribute('data-mark-color') || undefined, at: m.getAttribute('data-mark-at') || undefined }) })
  openPop(markMenu.value, e, true)
}
function pickMark(k, v) {
  mk[k] = v
  if (k === 'mark') mk.hint = !setMark({ mark: v, color: mk.color, at: mk.at })
  else if (markAt()) setMark({ [k]: v })
}
const unmark = () => { setMark(null); mk.mark = null }
// click steps to choose from: the slide's numbers and the next one
const markClicks = computed(() => Array.from({ length: Math.min(99, Math.max(0, ...slide.value.elements.flatMap(e => [e.click || 0, ...markSteps(e.html)])) + 1) }, (_, i) => String(i + 1)))
const num = (key, v) => { const n = Math.round(+v); if (Number.isFinite(n)) el.value[key] = key === 'w' || key === 'h' ? Math.max(8, n) : n }
const tbl = (fn, ...a) => run(() => fn(el.value, ...a))
const ytId = v => v.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{6,20})/)?.[1] || (/^[\w-]{6,20}$/.test(v) ? v : null)
function setVideo(v) {
  const id = ytId(v.trim()), url = !id && webUrl(v)
  if (id) Object.assign(el.value, { youtube: id, url: undefined })
  else if (url) Object.assign(el.value, { url, youtube: undefined })
}
const TYPO = [['text', 'Text', [12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28]], ['title', 'Title', [24, 26, 28, 30, 32, 36, 40, 44, 48]], ['h2', 'Heading 2', [18, 20, 22, 24, 26, 28, 30, 32, 36, 40]],
  ['h3', 'Heading 3', [16, 18, 20, 22, 24, 26, 28, 32]], ['code', 'Code', [8, 9, 10, 11, 12, 13, 14, 16, 18, 20]]]
// the list plus the size set now (e.g. 64 px taken over from a text box), so the select shows it
const typoSizes = (k, sizes) => [...new Set([...sizes, deck.typo[k]].filter(Boolean))].sort((a, b) => a - b)
// a text box that is one heading level: its own size can become that level's size in the whole project
const TYPO_OF = { h1: ['title', 'Title'], h2: ['h2', 'Heading 2'], h3: ['h3', 'Heading 3'] }
const typoFor = computed(() => el.value?.type === 'text' && el.value.fontSize && TYPO_OF[curTag.value]?.[0] && deck.typo[TYPO_OF[curTag.value][0]] !== el.value.fontSize && TYPO_OF[curTag.value])
function sizeForAll() {
  const e = el.value
  setTypo(typoFor.value[0], e.fontSize)
  // the project sizes count on content layouts (themes.js typoCss); on a centred one the box keeps its own
  if (!CENTERED.includes(slide.value?.layout)) { e.fontSize = undefined; fitHeight(e) }
}
function setTypo(k, v) {
  const t = { ...deck.typo }
  delete t.from // set by hand: it stays when the theme changes back
  if (v) t[k] = v
  else delete t[k]
  deck.typo = t
}
const ALIGNS = [['left', 'alignL', 'Left'], ['center', 'alignC', 'Center horizontally'], ['right', 'alignR', 'Right'], ['top', 'alignT', 'Top'], ['middle', 'alignM', 'Center vertically'], ['bottom', 'alignB', 'Bottom']]
const ORDERS = [['front', 'toFront', 'Bring to front'], ['forward', 'forward', 'Bring forward'], ['backward', 'backward', 'Send backward'], ['back', 'toBack', 'Send to back']] // the command id is the first entry
const TEXT_ALIGNS = [['left', 'textL', 'Align left'], ['center', 'textC', 'Centered'], ['right', 'textR', 'Align right'], ['justify', 'textJ', 'Justify']]
// a tooltip with the user's current shortcut of that command (keys.js)
const keyTip = (lbl, ...ids) => { const k = ids.map(kbd).filter(Boolean).join(' / '); return k ? `${t(lbl)} (${k})` : t(lbl) }
const alignTo = ref('sel')
// several elements: the text boxes among them, formatted together
const texts = computed(() => selection.value.filter(e => e.type === 'text'))
const same = (k, els = texts.value) => (v => (els.every(e => e[k] === v) ? v : null))(els[0]?.[k]) // null = mixed
const shadowable = computed(() => selection.value.filter(e => ['text', 'shape', 'image', 'code'].includes(e.type)))
// a toggle over several elements: on, off or 'mixed' (aria-pressed)
const tri = k => selection.value.every(e => e[k]) || (selection.value.some(e => e[k]) && 'mixed')
function setAll(els, k, v) {
  for (const e of els) { e[k] = v; if (k === 'fill' && !v) delete e.fillAlpha; if (k === 'font' || k === 'fontSize') fitHeight(e) }
}
// font select: '+' asks for a font file, which then becomes the font of els
const fontFile = ref()
let fontFor = []
function chooseFont(e, els) {
  if (e.target.value !== '+') return setAll(els, 'font', e.target.value || undefined)
  e.target.value = same('font', els) ?? ''
  fontFor = els
  fontFile.value.click()
}
const uploadFont = file => file && run(async () => setAll(fontFor, 'font', await storeFont(file)))
// appear on click: switched on, an element gets a step after the slide's last one
const nextClick = (min = 0) => Math.min(99, Math.max(min, ...slide.value.elements.flatMap(e => [e.click || 0, e.clickUntil || 0])) + 1)
const clickNum = v => Math.min(99, Math.max(1, Math.round(+v) || 1))
// disappear on click (Slidev v-click.hide, with "appear" a range): always after the element appeared
const setClick = (el, v) => { el.click = v; if (v && el.clickUntil <= v) el.clickUntil = undefined }
const setUntil = (el, v) => { el.clickUntil = v && Math.min(99, Math.max(v, (el.click || 0) + 1)) }
// planned time of a slide or the whole talk; empty or 0 clears it (the deck keeps 0, a slide drops the key)
function setTime(obj, e) {
  const v = parseClock(e.target.value || 0)
  if (v === 0) obj === deck ? (deck.duration = 0) : delete obj.duration
  else if (v && v <= 86400) obj.duration = v // unreadable: the field shows the old value again
  e.target.value = obj.duration ? clock(obj.duration) : ''
}
const notesRows = computed(() => Math.min(14, Math.max(4, (slide.value.notes || '').split('\n').length + 1)))
// longer help lives in the collapsed Tips section at the end
const TIPS = {
  text: 'Double-click into the text to format words.',
  code: 'Double-click to edit. Tab indents, Esc finishes.',
  table: 'Double-click into a cell. Tab/arrows move between cells, Tab in the last cell adds a row. Paste data straight from Excel or Numbers. Drag column edges to resize. Select several cells with ⇧-click, dragging or ⇧+arrow keys – typing, pasting, color, borders, alignment, delete and copy then apply to all of them. Custom borders replace the preset’s lines.',
  image: 'Dragging a corner keeps the aspect ratio (⇧ for free).',
  shape: 'Double-click the shape to write text in it.',
  timer: 'While presenting: a click starts or pauses it, a double click sets it back.',
  picker: 'While presenting: a click draws a name, nobody twice until everyone was drawn (unless a name can come up again); the arrow at its edge starts over.',
  quiz: 'While presenting: a click marks an answer, “Reveal” (or Q) shows the solution.',
  diagram: 'Mermaid syntax (mermaid.js.org): flowchart, sequence, class, state, gantt, pie, mind map and more. In Slidev it is rendered by Slidev itself.',
  math: 'TeX as in Slidev and LaTeX (rendered by KaTeX). In text boxes, write $…$ inside a line and $$…$$ for a centred formula; \\$ is a dollar sign.',
  video: 'Plays while presenting; in Slidev as a <Youtube> component.',
  icon: 'Double-click to choose another icon. In Slidev it is an Iconify component like <mdi-home />.',
  chart: 'Copy cells in Excel, Sheets or Numbers and paste them into the top-left cell of the data: the first row names the series, the first column the categories.',
}
// Mermaid code: rendered a moment after typing stops (one render, one undo step, not one per key)
const dia = computed(() => el.value?.type === 'diagram' && diagram(el.value.code, deck.theme))
// the style buttons of random draws, quizzes and tables of contents: the built-in one first (unset)
const LOOK_NAMES = { picker: ['Card', 'Filled', 'Outline', 'Plain'], quiz: ['Tiles', 'List', 'Colours', 'Plain'], toc: ['Bullets', 'Numbered', 'Cards', 'Lines'] }
const looks = type => [undefined, ...LOOKS[type]].map((k, i) => [k, LOOK_NAMES[type][i]])
const listName = ref('')
// name lists to and from a file (another browser or device)
const exportLists = () => download(new Blob([listsFile()], { type: 'application/json' }), 'name-lists.json')
const readLists = async e => {
  const f = e.target.files[0]
  e.target.value = ''
  if (!f) return
  let n = 0
  try { n = importLists(JSON.parse(await f.text())) } catch { /* not JSON: counted as nothing */ }
  toast(n ? t('{0} name lists imported', n) : t('No name lists found in this file.'))
} // the saved name list being saved or used
let diaTimer
const setDiagram = (target, code, ms = 300) => { clearTimeout(diaTimer); diaTimer = setTimeout(() => { target.code = cleanEl({ type: 'diagram', code }).code }, ms) }
const tip = computed(() => el.value && !(el.value.type === 'shape' && el.value.shape === 'line') && TIPS[el.value.type])
</script>

<template>
  <aside class="inspector" :aria-label="t('Properties')">
    <input ref="fontFile" type="file" accept=".woff2,.woff,.ttf,.otf" hidden @change="uploadFont($event.target.files[0]); $event.target.value = ''" />
    <!-- several elements -->
    <template v-if="selection.length > 1">
      <Sec id="multi" icon="selectAll" :title="t('{0} elements', selection.length)">
        <div class="field">{{ t('Align to') }}
          <div class="seg" role="group" :aria-label="t('Align to')">
            <button class="ib grow" :class="{ on: alignTo === 'sel' }" :aria-pressed="alignTo === 'sel'" :title="t('Selection (to each other)')" @click="alignTo = 'sel'">{{ t('Selection') }}</button>
            <button class="ib grow" :class="{ on: alignTo === 'slide' }" :aria-pressed="alignTo === 'slide'" @click="alignTo = 'slide'">{{ t('Slide') }}</button>
          </div>
        </div>
        <div class="seg-row">
          <span v-for="part in [ALIGNS.slice(0, 3), ALIGNS.slice(3)]" :key="part[0][0]" class="seg" role="group">
            <button v-for="[a, i, lbl] in part" :key="a" class="ib" :aria-label="t(lbl)" :title="t(alignTo === 'slide' ? '{0} (to slide)' : '{0} (to each other)', t(lbl))" @click="align(a, alignTo === 'slide')"><Icon :name="i" /></button>
          </span>
          <span v-if="selection.length > 2" class="seg" role="group">
            <button class="ib" :aria-label="t('Distribute horizontally')" :title="t('Distribute horizontally')" @click="distribute('h')"><Icon name="distH" /></button>
            <button class="ib" :aria-label="t('Distribute vertically')" :title="t('Distribute vertically')" @click="distribute('v')"><Icon name="distV" /></button>
          </span>
          <button class="ib" :class="{ on: tri('locked') === true, mixed: tri('locked') === 'mixed' }" :aria-pressed="tri('locked')" :aria-label="t('Lock position')" :title="t('Locked elements can be selected and edited, but not moved, resized or aligned.')" @click="setAll(selection, 'locked', tri('locked') === true ? undefined : true)"><Icon :name="tri('locked') ? 'lock' : 'unlock'" /></button>
        </div>
      </Sec>
      <Sec id="arrange" icon="layers" :title="t('Arrange')">
        <div class="seg-row">
          <span class="seg" role="group" :aria-label="t('Arrange')">
            <button v-for="[o, i, lbl] in ORDERS" :key="o" class="ib" :aria-label="t(lbl)" :title="keyTip(lbl, o)" :disabled="!canOrder(o)" @click="order(o)"><Icon :name="i" /></button>
          </span>
          <button v-if="selection.some(e => e.group)" class="ib" :aria-label="t('Ungroup')" :title="keyTip('Ungroup', 'ungroup')" @click="ungroup"><Icon name="ungroup" /></button>
          <button v-else class="ib" :aria-label="t('Group')" :title="keyTip('Group', 'group')" @click="group"><Icon name="group" /></button>
        </div>
      </Sec>
      <Sec v-if="texts.length" id="text" icon="text" :title="`${t('Text')} (${texts.length} ${texts.length === 1 ? t('Text box') : t('Text boxes')})`">
        <div class="btn-row">
          <select class="grow" :aria-label="t('Font')" :title="t('Font')" :value="same('font') ?? ''" @change="chooseFont($event, texts)"><option value="">{{ same('font') === null ? t('Mixed') : t('Theme font') }}</option><FontOptions upload /></select>
          <select class="size" :aria-label="t('Font size')" :title="t('Font size')" :value="same('fontSize') ?? ''" @change="setAll(texts, 'fontSize', +$event.target.value || undefined)"><option value="">{{ same('fontSize') === null ? t('Mixed') : t('Default') }}</option><option v-for="s in SIZES" :key="s" :value="s">{{ s }} px</option></select>
        </div>
        <div class="seg-row">
          <span class="seg" role="group" :aria-label="t('Paragraph')">
            <button v-for="[a, i, lbl] in TEXT_ALIGNS" :key="a" class="ib" :class="{ on: same('align') === (a === 'left' ? undefined : a) }" :aria-pressed="same('align') === (a === 'left' ? undefined : a)" :aria-label="t(lbl)" :title="t(lbl)" @click="setAll(texts, 'align', a === 'left' ? undefined : a)"><Icon :name="i" /></button>
          </span>
        </div>
        <div class="chips">
          <span class="chip" :style="chip(same('color'), 'currentColor')"><Menu icon="fontColor" :title="t('Text color')">
            <div class="swatches pop-sw">
              <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: same('color') === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="same('color') === c" @click="setAll(texts, 'color', c)" />
              <button class="sw none" :title="t('Theme color')" :aria-label="t('Theme color')" @click="setAll(texts, 'color', undefined)" />
            </div>
          </Menu></span>
          <span class="chip" :style="chip(same('fill'))"><Menu icon="fill" :label="t('Fill')" :title="t('Background')">
            <div class="swatches pop-sw">
              <button v-for="c in FILLS" :key="c" class="sw" :class="{ on: same('fill') === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="same('fill') === c" @click="setAll(texts, 'fill', c)" />
              <button class="sw none" :title="t('No background')" :aria-label="t('No background')" @click="setAll(texts, 'fill', undefined)" />
            </div>
          </Menu></span>
        </div>
      </Sec>
      <Sec id="effects" icon="shadow" :title="t('Effects')">
        <label v-if="shadowable.length" class="row-ico" :title="t('Shadow')"><Icon name="shadow" :size="16" />
          <select :aria-label="t('Shadow')" :value="same('shadow', shadowable) ?? ''" @change="setAll(shadowable, 'shadow', $event.target.value || undefined)"><option value="">{{ same('shadow', shadowable) === null ? t('Mixed') : t('none') }}</option><option value="soft">{{ t('soft') }}</option><option value="strong">{{ t('strong') }}</option></select>
        </label>
        <div class="btn-row">
          <button class="ib wide" :class="{ on: tri('click') === true, mixed: tri('click') === 'mixed' }" :aria-pressed="tri('click')" :title="t('Hidden while presenting until a click or → reveals it; elements with the same number appear together')" @click="setAll(selection, 'click', tri('click') === true ? undefined : nextClick())"><Icon name="pointer" /> {{ t('Appear on click') }}</button>
          <input v-if="tri('click') === true" type="number" class="click-num" min="1" max="99" :aria-label="t('Click order')" :title="t('Click order')" :value="same('click', selection) ?? ''" :placeholder="t('Mixed')" @change="setAll(selection, 'click', clickNum($event.target.value))" />
        </div>
      </Sec>
      <section class="actions">
        <button v-if="ui.look" class="ib" :aria-label="t('Paste formatting')" :title="keyTip('Apply copied formatting to all', 'pasteLook')" @click="pasteLook()"><Icon name="brush" /></button>
        <button class="ib" :aria-label="t('Duplicate')" :title="keyTip('Duplicate', 'duplicate')" @click="duplicate"><Icon name="copy" /></button>
        <button class="ib danger" :aria-label="t('Delete')" :title="t('Delete (⌫)')" @click="remove"><Icon name="trash" /></button>
      </section>
    </template>

    <!-- one element -->
    <template v-else-if="el">
      <Sec v-if="el.type === 'text'" id="text" icon="text" :title="t('Text')">
        <div class="style-menu">
          <button class="tb" :title="t('Paragraph style')" :aria-label="`${t('Paragraph style')}: ${curStyleName}`" @mousedown.prevent @pointerdown="armPop" @click="openPop(styleMenu, $event, typing)"><Icon name="text" /><span>{{ curStyleName }}</span><Icon name="chevron" :size="14" class="chev" /></button>
          <!-- previews render up front: the menu measures its height when it opens, to stay on screen -->
          <Menu ref="styleMenu" wide>
            <div class="style-pop">
              <div class="styles" role="group" :aria-label="t('Text style')">
                <button v-for="[tag, n] in STYLES" :key="tag" class="style-btn" :class="{ on: curTag === tag }" :aria-pressed="curTag === tag" :title="t(typing ? 'Paragraph as {0}' : 'Whole text box as {0}', t(n))" @click="applyStyle(tag)">
                  <span class="slide mini style-prev layout-center" :class="`theme-${deck.theme}`" :style="themeStyle(deck.theme)"><component :is="tag">{{ t(n) }}</component></span>
                </button>
                <div v-for="p in textStyles.list" :key="p.name" class="style-btn custom" :class="{ on: isCustom(p) }">
                  <button class="style-apply" :aria-pressed="isCustom(p)" :title="t('Apply custom style “{0}”', p.name)" @click="applyCustom(p)">
                    <span class="slide mini style-prev layout-center" :class="`theme-${deck.theme}`" :style="{ ...themeStyle(deck.theme), background: p.fill || null }">
                      <component :is="p.tag" :style="{ fontSize: p.fontSize ? p.fontSize + 'px' : null, color: p.color || null, textAlign: p.align || null, fontFamily: fontStack(p.font) || null }">{{ p.name }}</component>
                    </span>
                  </button>
                  <button class="style-del" :title="t('Delete style “{0}”', p.name)" :aria-label="t('Delete style “{0}”', p.name)" @click="removeCustom(p)"><Icon name="x" :size="12" /></button>
                </div>
              </div>
              <hr />
              <form v-if="naming" class="btn-row" data-keep @submit.prevent="saveCurrent">
                <input v-model="presetName" v-focus class="grow" :placeholder="t('Name, e.g. Key point')" :aria-label="t('Style name')" />
                <button class="ib" type="submit">{{ t('Save') }}</button>
                <button class="ib" type="button" :title="t('Cancel')" :aria-label="t('Cancel')" @click="naming = false"><Icon name="x" /></button>
              </form>
              <button v-else class="mi" data-keep :title="t('Remember this text box’s formatting, font, size, colors and alignment as a custom style (same name overwrites)')" @click="naming = true"><Icon name="plus" />{{ t('Save as custom style') }}</button>
            </div>
          </Menu>
        </div>
        <div class="btn-row">
          <select class="grow" :aria-label="t('Font')" :title="t('Font')" :value="el.font || ''" :style="{ fontFamily: fontStack(el.font) || null }" @change="chooseFont($event, [el])"><option value="">{{ t('Theme font') }}</option><FontOptions upload /></select>
          <button v-if="FONTS[el.font]?.[2] === 'own'" class="ib" :aria-label="t('Remove font {0} from the project', FONTS[el.font][0])" :title="t('Remove font {0} from the project', FONTS[el.font][0])" @click="removeFont(el.font)"><Icon name="trash" /></button>
          <select class="size" :aria-label="t('Font size')" :title="t('Font size')" :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined; fitHeight(el)"><option value="">{{ t('Default') }}</option><option v-for="s in SIZES" :key="s" :value="s">{{ s }} px</option></select>
        </div>
        <button v-if="typoFor" class="ib wide" :title="t('Every “{0}” in the project gets this size (Font for all slides); boxes with their own size keep it', t(typoFor[1]))" @click="sizeForAll"><Icon name="fontSize" /> {{ t('{0} px for every “{1}”', el.fontSize, t(typoFor[1])) }}</button>
        <div class="seg-row" @mousedown.prevent>
          <!-- disabled buttons get no hover: the wrapper explains why -->
          <span class="seg" role="group" :aria-label="t('Character')" :title="typing ? null : t('Double-click into the text to format words.')">
            <button class="ib" :disabled="!typing" :aria-label="t('Bold')" :title="t('Bold (⌘B)')" @click="format('bold')"><Icon name="bold" /></button>
            <button class="ib" :disabled="!typing" :aria-label="t('Italic')" :title="t('Italic (⌘I)')" @click="format('italic')"><Icon name="italic" /></button>
            <button class="ib" :disabled="!typing" :aria-label="t('Underline')" :title="t('Underline (⌘U)')" @click="format('underline')"><Icon name="underline" /></button>
            <button class="ib" :disabled="!typing" :aria-label="t('Strikethrough')" :title="t('Strikethrough')" @click="format('strikeThrough')"><Icon name="strike" /></button>
          </span>
          <span class="seg" role="group" :title="typing ? null : t('Double-click into the text to format words.')">
            <button class="ib" :disabled="!typing" :aria-label="t('Link')" :title="t('Link (⌘K)')" @click="emit('link')"><Icon name="link" /></button>
            <button class="ib" :disabled="!typing" :aria-label="t('Inline code')" :title="t('Inline code')" @click="format('insertHTML', `<code>${getSelection().toString().replace(/</g, '&lt;') || 'code'}</code>`)"><Icon name="code" /></button>
            <button class="ib" :disabled="!typing" :aria-label="t('Mark')" :title="t('Hand-drawn mark (circle, underline …), optionally drawn on click')" @pointerdown="armPop" @click="openMark($event)"><Icon name="pen" /></button>
            <Menu ref="markMenu">
              <div data-keep class="mark-menu">
                <h4 class="mh">{{ t('Mark') }}</h4>
                <button v-for="m in MARKS" :key="m" class="mi" :class="{ on: mk.mark === m }" :aria-pressed="mk.mark === m" @click="pickMark('mark', m)"><Icon name="check" :style="{ visibility: mk.mark === m ? null : 'hidden' }" />{{ t(MARK_NAMES[m]) }}</button>
                <p v-if="mk.hint" class="mark-hint" role="status">{{ t('Select a few words in one paragraph first.') }}</p>
                <h4 class="mh">{{ t('Color') }}</h4>
                <div class="swatches pop-sw">
                  <button class="sw" :class="{ on: !mk.color }" :style="{ background: themeOf(deck.theme).vars?.accent }" :title="t('Theme accent')" :aria-label="t('Theme accent')" :aria-pressed="!mk.color" @click="pickMark('color', undefined)" />
                  <button v-for="(c, n) in MARK_COLORS" :key="n" class="sw" :class="{ on: mk.color === n }" :style="{ background: c }" :title="n" :aria-label="n" :aria-pressed="mk.color === n" @click="pickMark('color', n)" />
                </div>
                <h4 class="mh">{{ t('Drawn on click') }}</h4>
                <div class="mark-steps">
                  <button class="mi" :class="{ on: !mk.at }" :aria-pressed="!mk.at" @click="pickMark('at', undefined)">{{ t('Always') }}</button>
                  <button v-for="n in markClicks" :key="n" class="mi" :class="{ on: mk.at === n }" :aria-pressed="mk.at === n" @click="pickMark('at', n)">{{ n }}</button>
                </div>
                <button v-if="mk.mark" class="mi" @click="unmark"><Icon name="trash" />{{ t('Remove mark') }}</button>
              </div>
            </Menu>
          </span>
          <span class="chip fc" :style="chip(el.color, 'currentColor')">
            <button class="ib" :aria-label="typing ? t('Selection color') : t('Text color')" :title="typing ? t('Selection color') : t('Text color')" @pointerdown="armPop" @click="openPop(colorMenu, $event, typing)"><Icon name="fontColor" /></button>
            <Menu ref="colorMenu">
              <div class="swatches pop-sw">
                <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: !typing && el.color === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="!typing && el.color === c" @click="textColor(c)" />
                <button class="sw none" :title="t('Theme color')" :aria-label="t('Theme color')" @click="typing ? format('removeFormat') : (el.color = undefined)" />
              </div>
            </Menu>
          </span>
        </div>
        <div class="seg-row" @mousedown.prevent>
          <span class="seg" role="group" :aria-label="t('Paragraph')">
            <button v-for="[a, i, lbl] in TEXT_ALIGNS" :key="a" class="ib" :class="{ on: (el.align || 'left') === a }" :aria-pressed="(el.align || 'left') === a" :aria-label="t(lbl)" :title="t(lbl)" @click="el.align = a === 'left' ? undefined : a"><Icon :name="i" /></button>
          </span>
          <span class="seg" role="group" :title="typing ? null : t('Double-click into the text to format words.')">
            <button class="ib" :class="{ on: typing && listKind === 'UL' }" :disabled="!typing" :aria-label="t('Bullet list')" :title="t('Bulleted list (⌘⇧8)')" :aria-pressed="typing && listKind === 'UL'" @click="list('ul')"><Icon name="list" /></button>
            <button class="ib" :class="{ on: typing && listKind === 'OL' }" :disabled="!typing" :aria-label="t('Numbered list')" :title="t('Numbered list (⌘⇧7)')" :aria-pressed="typing && listKind === 'OL'" @click="list('ol')"><Icon name="olist" /></button>
          </span>
          <span class="seg" role="group">
            <button v-for="[a, i, lbl] in [['top', 'vTop', 'Text top'], ['middle', 'vMiddle', 'Text middle'], ['bottom', 'vBottom', 'Text bottom']]" :key="a" class="ib" :class="{ on: (el.valign || 'top') === a }" :aria-pressed="(el.valign || 'top') === a" :aria-label="t(lbl)" :title="t(lbl)" @click="el.valign = a === 'top' ? undefined : a"><Icon :name="i" /></button>
          </span>
        </div>
        <div class="btn-row">
          <label class="field grow">{{ t('Line spacing') }}
            <select :value="el.line ?? ''" @change="el.line = $event.target.value ? +$event.target.value : undefined"><option value="">{{ t('Theme') }}</option><option v-for="v in [1, 1.15, 1.3, 1.5, 2, 2.5]" :key="v" :value="v">{{ v }}</option></select></label>
          <label class="field grow">{{ t('Paragraph spacing') }}
            <select :value="el.para ?? ''" @change="el.para = $event.target.value ? +$event.target.value : undefined"><option value="">{{ t('Theme') }}</option><option v-for="v in [0, 4, 8, 12, 16, 24, 32, 48]" :key="v" :value="v">{{ v }} px</option></select></label>
        </div>
        <label class="check" :title="t('While presenting, a click into the box lets you type into it, e.g. ideas from the audience; it is saved in the project.')"><input type="checkbox" :checked="!!el.board" @change="el.board = $event.target.checked || undefined" /> {{ t('Editable while presenting') }}</label>
        <label v-if="el.board" class="check sub" :title="t('Off: what is typed while presenting is shown until the presentation ends, and the box keeps its text.')"><input type="checkbox" :checked="!el.liveTemp" @change="el.liveTemp = !$event.target.checked || undefined" /> {{ t('Keep what is typed after presenting') }}</label>
        <label class="check"><input v-model="el.title" type="checkbox" /> {{ t('Slide title') }}</label>
      </Sec>
      <Sec v-if="el.type === 'text'" id="colors" icon="fill" :title="t('Fill & outline')">
        <div class="chips">
          <span class="chip" :style="chip(el.fill)"><Menu icon="fill" :label="t('Fill')" :title="t('Background')">
            <div class="swatches pop-sw">
              <button v-for="c in FILLS" :key="c" class="sw" :class="{ on: el.fill === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="el.fill === c" @click="el.fill = c" />
              <button class="sw none" :title="t('No background')" :aria-label="t('No background')" :aria-pressed="!el.fill" @click="el.fill = undefined" />
            </div>
          </Menu></span>
          <span class="chip" :style="chip(el.stroke)"><Menu icon="outline" :label="t('Outline')" :title="t('Outline')">
            <div class="swatches pop-sw">
              <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: el.stroke === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="el.stroke === c" @click="el.stroke = c; el.strokeWidth ||= 2" />
              <button class="sw none" :title="t('No outline')" :aria-label="t('No outline')" :aria-pressed="!el.stroke" @click="el.stroke = undefined" />
            </div>
          </Menu></span>
        </div>
        <label v-if="el.fill" class="slider" :title="t('Opacity')"><Icon name="opacity" :size="16" /><input type="range" min="0" max="100" step="5" :aria-label="t('Opacity')" :value="el.fillAlpha ?? 100" @input="el.fillAlpha = +$event.target.value === 100 ? undefined : +$event.target.value" /><output>{{ el.fillAlpha ?? 100 }} %</output></label>
        <template v-if="el.stroke">
          <label class="slider" :title="t('Outline width')"><Icon name="lineWidth" :size="16" /><input type="range" min="1" max="12" :aria-label="t('Outline width')" :value="el.strokeWidth" @input="el.strokeWidth = +$event.target.value" /><output>{{ el.strokeWidth }} px</output></label>
          <select :aria-label="t('Line style')" :title="t('Line style')" :value="el.strokeStyle || 'solid'" @change="el.strokeStyle = $event.target.value === 'solid' ? undefined : $event.target.value"><option value="solid">{{ t('solid') }}</option><option value="dashed">{{ t('dashed') }}</option><option value="dotted">{{ t('dotted') }}</option></select>
        </template>
      </Sec>

      <Sec v-else-if="el.type === 'code'" id="code" icon="code" :title="t('Code')">
        <label class="field">{{ t('Language') }} <select v-model="el.lang"><option v-for="l in langs" :key="l">{{ l }}</option></select></label>
        <label class="field">{{ t('Font size') }}
          <select :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined"><option value="">{{ t('Default') }}</option><option v-for="s in [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24]" :key="s" :value="s">{{ s }} px</option></select>
        </label>
        <label v-if="!isRun(el.meta)" class="field" :title="t('Line numbers in braces, e.g. {2,4-5}; steps separated by | advance one per click while presenting, e.g. {1|3-4|all}')">{{ t('Highlight lines') }} <input :value="el.meta || ''" :placeholder="t('e.g. {2,4-5} or {1|3|all}')" @change="el.meta = $event.target.value.trim() || undefined" /></label>
        <label class="check"><input type="checkbox" :checked="codeOpts(el.meta).lines" @change="el.meta = setLines(el.meta, $event.target.checked)" /> {{ t('Line numbers') }}</label>
        <!-- Slidev's {monaco-run}: runs in a sandbox, while presenting and here; the last run is kept for the exports -->
        <label v-if="RUN_LANGS.includes(el.lang) || isRun(el.meta)" class="check"><input type="checkbox" :checked="isRun(el.meta)" @change="el.meta = withRun(el.meta, $event.target.checked)" /> {{ t('Runnable (JavaScript, TypeScript)') }}</label>
        <template v-if="isRun(el.meta)">
          <label class="check"><input type="checkbox" :checked="autorun(el.meta)" @change="el.meta = withAutorun(el.meta, $event.target.checked)" /> {{ t('Run automatically when shown') }}</label>
          <label class="field">{{ t('Output') }} <select :value="el.outPos || 'below'" @change="el.outPos = $event.target.value === 'right' ? 'right' : undefined"><option value="below">{{ t('below the code') }}</option><option value="right">{{ t('right of the code') }}</option></select></label>
          <label class="slider" :title="t('Output size')"><Icon name="layout" :size="16" /><input type="range" min="20" max="400" step="10" :aria-label="t('Output size')" :value="el.outH ?? 80" @input="el.outH = +$event.target.value" /><output>{{ el.outH ? el.outH + ' px' : t('Auto') }}</output></label>
          <div class="btn-row">
            <button class="grow" :disabled="running" @click="running = true; runInto(el, t('Stopped after 3 seconds (endless loop?)')).finally(() => { running = false })">▶ {{ t('Run') }}</button>
            <button class="grow" :disabled="!el.output" @click="el.output = undefined">{{ t('Clear output') }}</button>
          </div>
        </template>
        <!-- a code group (tabs): the code on the slide is the first tab, the others are edited here -->
        <label v-if="el.tabs?.length" class="field">{{ t('Tab name') }} <input :value="el.label || ''" :placeholder="el.lang" @input="el.label = $event.target.value || undefined" /></label>
        <div v-for="(tb, k) in el.tabs || []" :key="k" class="field">
          <div class="btn-row">
            <input class="grow" :value="tb.label || ''" :placeholder="tb.lang" :aria-label="t('Tab name')" :title="t('Tab name')" @input="tb.label = $event.target.value || undefined" />
            <select v-model="tb.lang" :aria-label="t('Language')" :title="t('Language')"><option v-for="l in langs" :key="l">{{ l }}</option></select>
            <button class="ib" :title="t('Remove tab')" :aria-label="t('Remove tab')" @click="el.tabs.splice(k, 1); if (!el.tabs.length) { el.tabs = undefined; el.label = undefined }">✕</button>
          </div>
          <textarea v-model="tb.code" rows="4" spellcheck="false" :aria-label="t('Code')" style="font-family: var(--mono, monospace)" />
        </div>
        <button @click="el.tabs = [...(el.tabs || []), { code: '', lang: el.lang }]">+ {{ t('Add tab') }}</button>
        <div class="chips">
          <span class="chip" :style="chip(el.fill, 'var(--ui-panel)')"><Menu icon="fill" :label="t('Background')" :title="t('Background')">
            <div class="swatches pop-sw">
              <button v-for="c in CODE_BGS" :key="c" class="sw" :class="{ on: el.fill === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="el.fill === c" @click="el.fill = c" />
              <button class="sw none" :title="t('Theme color')" :aria-label="t('Theme color')" :aria-pressed="!el.fill" @click="el.fill = undefined" />
            </div>
          </Menu></span>
        </div>
        <label class="slider" :title="t('Opacity')"><Icon name="opacity" :size="16" /><input type="range" min="0" max="100" step="5" :aria-label="t('Opacity')" :value="el.fillAlpha ?? 100" @input="el.fillAlpha = +$event.target.value === 100 ? undefined : +$event.target.value" /><output>{{ el.fillAlpha ?? 100 }} %</output></label>
        <label class="slider" :title="t('Corners')"><Icon name="radius" :size="16" /><input type="range" min="0" max="32" :aria-label="t('Corners')" :value="el.radius ?? 4" @input="el.radius = +$event.target.value === 4 ? undefined : +$event.target.value" /><output>{{ el.radius ?? 4 }} px</output></label>
      </Sec>

      <Sec v-else-if="el.type === 'table'" id="table" icon="table" :title="t('Table')">
        <div class="presets">
          <button v-for="[id, name] in TABLE_PRESETS" :key="id" class="preset" :class="{ on: (el.preset || 'theme') === id }" :aria-pressed="(el.preset || 'theme') === id" @click="el.preset = id">
            <span class="slide mini" :class="[`theme-${deck.theme}`]" :style="themeStyle(deck.theme)">
              <span class="tbl-wrap" :data-table="id"><table><thead><tr><th /><th /><th /></tr></thead><tbody><tr><td /><td /><td /></tr><tr><td /><td /><td /></tr><tr><td /><td /><td /></tr></tbody></table></span>
            </span>
            {{ t(name) }}
          </button>
        </div>
        <label class="check"><input v-model="el.header" type="checkbox" /> {{ t('Header row') }}</label>
        <label class="check"><input :checked="el.firstCol" type="checkbox" @change="el.firstCol = $event.target.checked || undefined" /> {{ t('Emphasize first column') }}</label>
        <label class="check"><input :checked="el.compact" type="checkbox" @change="el.compact = $event.target.checked || undefined" /> {{ t('Compact') }}</label>
        <h4 class="sub-head">{{ t('Rows & columns') }}</h4>
        <div class="seg-row" @mousedown.prevent>
          <span class="seg" role="group">
            <button class="ib" :aria-label="t('Row above')" :title="t('Row above')" @click="tbl(table.insertRow, 'above')"><Icon name="rowAbove" /></button>
            <button class="ib" :aria-label="t('Row below')" :title="t('Row below')" @click="tbl(table.insertRow, 'below')"><Icon name="rowBelow" /></button>
            <button class="ib" :aria-label="t('Column left')" :title="t('Column left')" @click="tbl(table.insertCol, 'left')"><Icon name="colLeft" /></button>
            <button class="ib" :aria-label="t('Column right')" :title="t('Column right')" @click="tbl(table.insertCol, 'right')"><Icon name="colRight" /></button>
          </span>
          <span class="seg" role="group">
            <button class="ib danger" :aria-label="t(ui.cellEnd ? 'Delete selected rows' : 'Delete row')" :title="t(ui.cellEnd ? 'Delete selected rows' : 'Delete row')" @click="tbl(table.deleteRow)"><Icon name="rowDel" /></button>
            <button class="ib danger" :aria-label="t(ui.cellEnd ? 'Delete selected columns' : 'Delete column')" :title="t(ui.cellEnd ? 'Delete selected columns' : 'Delete column')" @click="tbl(table.deleteCol)"><Icon name="colDel" /></button>
          </span>
        </div>
        <h4 class="sub-head">{{ t('Current column') }}</h4>
        <div class="seg-row" @mousedown.prevent>
          <span class="seg" role="group">
            <button v-for="[a, i, lbl] in TEXT_ALIGNS.slice(0, 3)" :key="a" class="ib" :class="{ on: ui.cell && el.align[ui.cell.c] === a }" :aria-pressed="!!ui.cell && el.align[ui.cell.c] === a" :aria-label="t(lbl)" :title="t(lbl)" @click="tbl(table.setAlign, a)"><Icon :name="i" /></button>
          </span>
          <span class="seg" role="group">
            <button class="ib" :aria-label="t('Sort ascending')" :title="t('Sort ascending (A→Z)')" @click="tbl(table.sortBy, 1)"><Icon name="sortAsc" /></button>
            <button class="ib" :aria-label="t('Sort descending')" :title="t('Sort descending (Z→A)')" @click="tbl(table.sortBy, -1)"><Icon name="sortDesc" /></button>
            <button class="ib" :aria-label="t('Equal column widths')" :title="t('Equal column widths')" @click="el.widths = undefined"><Icon name="colsEqual" /></button>
          </span>
        </div>
        <h4 class="sub-head">{{ t('Current cell') }}</h4>
        <div class="seg-row" @mousedown.prevent>
          <span class="seg" role="group">
            <button class="ib" :class="{ on: typing && listKind === 'UL' }" :disabled="!typing" :aria-label="t('Bullet list')" :title="t('Bulleted list (⌘⇧8)')" :aria-pressed="typing && listKind === 'UL'" @click="list('ul')"><Icon name="list" /></button>
            <button class="ib" :class="{ on: typing && listKind === 'OL' }" :disabled="!typing" :aria-label="t('Numbered list')" :title="t('Numbered list (⌘⇧7)')" :aria-pressed="typing && listKind === 'OL'" @click="list('ol')"><Icon name="olist" /></button>
          </span>
        </div>
        <div class="field">{{ t('Color for') }}
          <div class="btn-row">
            <select v-model="fillScope" class="grow" :aria-label="t('Apply color to')"><option value="cell">{{ cellWord }}</option><option value="row">{{ t(ui.cellEnd ? 'Rows' : 'Row') }}</option><option value="col">{{ t(ui.cellEnd ? 'Columns' : 'Column') }}</option><option value="table">{{ t('Table') }}</option></select>
            <span class="chip" :style="chip((ui.cell && el.fills?.[ui.cell.r]?.[ui.cell.c]) || undefined)">
              <button class="tb" :title="t('Fill')" @mousedown.prevent @pointerdown="armPop" @click="openPop(cellMenu, $event, typing)"><Icon name="fill" /><span>{{ t('Fill') }}</span></button>
              <Menu ref="cellMenu">
                <div class="swatches pop-sw">
                  <button v-for="c in FILLS" :key="c" class="sw" :class="{ on: ui.cell && el.fills?.[ui.cell.r]?.[ui.cell.c] === c }" :style="{ background: c }" :title="c" :aria-label="c" @click="tbl(table.setFill, c, fillScope)" />
                  <button class="sw none" :title="t('No color')" :aria-label="t('No color')" @click="tbl(table.setFill, '', fillScope)" />
                </div>
              </Menu>
            </span>
          </div>
        </div>
        <div class="field">{{ t('Border for') }}
          <select v-model="border.scope" :aria-label="t('Apply border to')"><option value="cell">{{ cellWord }}</option><option value="row">{{ t(ui.cellEnd ? 'Rows' : 'Row') }}</option><option value="col">{{ t(ui.cellEnd ? 'Columns' : 'Column') }}</option><option value="table">{{ t('Table') }}</option></select>
          <div class="seg-row" @mousedown.prevent>
            <span v-for="part in [BORDER_MODES.slice(0, 4), BORDER_MODES.slice(4)]" :key="part[0][0]" class="seg" role="group">
              <button v-for="[m, label, icon] in part" :key="m" class="ib" :class="{ on: bordersOn[m] }" :aria-pressed="!!bordersOn[m]" :title="m === 'none' ? t('No lines') : t('{0}: set line, click again to remove it', t(label))" :aria-label="t('Border {0}', t(label))" @click="setBorder(m)"><Icon :name="icon" /></button>
            </span>
          </div>
          <div class="btn-row">
            <select v-model="border.w" class="size" :aria-label="t('Line width')" :title="t('Line width')"><option v-for="w in [1, 2, 3, 4, 6]" :key="w" :value="w">{{ w }} px</option></select>
            <select v-model="border.style" class="grow" :aria-label="t('Line style')" :title="t('Line style')"><option value="solid">{{ t('solid') }}</option><option value="dashed">{{ t('dashed') }}</option><option value="dotted">{{ t('dotted') }}</option><option value="double">{{ t('double') }}</option></select>
            <span class="chip" :style="chip(border.color)"><Menu icon="outline" :title="t('Line color')">
              <div class="swatches pop-sw">
                <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: border.color === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="border.color === c" @click="border.color = c" />
              </div>
            </Menu></span>
          </div>
          <button v-if="el.borders" class="ib wide" @click="el.borders = undefined"><Icon name="undo" /> {{ t('Use the preset’s lines') }}</button>
        </div>
        <label class="field">{{ t('Font size') }}
          <select :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined"><option value="">{{ t('Default') }}</option><option v-for="s in [10, 12, 13, 14, 15, 16, 18, 20, 24]" :key="s" :value="s">{{ s }} px</option></select>
        </label>
      </Sec>

      <Sec v-else-if="el.type === 'image'" id="image" icon="image" :title="t('Image')">
        <label class="ib wide file" tabindex="0" role="button"><Icon name="image" /> {{ t('Replace image') }}<input type="file" accept="image/*" hidden @change="run(() => replaceImage(el, $event.target.files[0]))" /></label>
        <template v-if="ui.crop === el.id">
          <label class="field">{{ t('Aspect ratio') }}
            <select :value="ui.cropRatio || ''" @change="setCropRatio(el, $event.target.value || null)"><option v-for="[k, n] in CROP_RATIOS" :key="n" :value="k || ''">{{ t(n) }}</option></select>
          </label>
          <div class="btn-row">
            <button class="ib wide" @click="resetCrop(el)"><Icon name="undo" /> {{ t('Revert') }}</button>
            <button class="ib wide on" @click="endCrop()"><Icon name="check" /> {{ t('Done') }}</button>
          </div>
          <!-- needed right now, so it stays here instead of under Tips -->
          <p class="hint">{{ t('Drag the edges to crop, drag the picture to move the visible part. ⇧ on a corner keeps the aspect ratio. Enter or Esc finishes.') }}</p>
        </template>
        <div v-else class="btn-row">
          <button class="ib wide" :disabled="el.locked" :title="t('Or double-click the picture')" @click="run(() => startCrop(el))"><Icon name="crop" /> {{ t('Crop') }}</button>
          <button v-if="el.crop" class="ib wide" @click="resetCrop(el)"><Icon name="undo" /> {{ t('Remove crop') }}</button>
        </div>
        <label class="slider" :title="t('Corners')"><Icon name="radius" :size="16" /><input type="range" min="0" max="80" :aria-label="t('Corners')" :value="el.radius || 0" @input="el.radius = +$event.target.value || undefined" /><output>{{ el.radius || 0 }} px</output></label>
        <label class="field">{{ t('Alt text') }}
          <textarea rows="2" :value="el.decorative ? '' : el.alt || ''" :disabled="el.decorative" :placeholder="t('What the picture shows, for screen readers')" @input="el.alt = $event.target.value || undefined" />
        </label>
        <label class="check"><input type="checkbox" :checked="!!el.decorative" @change="el.decorative = $event.target.checked || undefined" /> {{ t('Decorative (screen readers skip it)') }}</label>
      </Sec>

      <template v-else-if="el.type === 'shape'">
        <Sec id="shape" icon="shapes" :title="t('Shape')">
          <select v-model="el.shape" :aria-label="t('Shape')" :title="t('Shape')"><option v-for="s in SHAPES" :key="s" :value="s">{{ t(SHAPE_NAMES[s]) }}</option></select>
          <label v-if="el.shape !== 'line'" class="row-ico" :title="t('Font size')"><Icon name="fontSize" :size="16" />
            <select :aria-label="t('Font size')" :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined"><option value="">{{ t('Default') }}</option><option v-for="s in SIZES" :key="s" :value="s">{{ s }} px</option></select>
          </label>
          <!-- a line: its direction (corner to corner for any angle, set by the box) and arrowheads -->
          <template v-if="el.shape === 'line'">
            <div class="btn-row" role="group" :aria-label="t('Direction')">
              <button v-for="[v, label, sym] in [[undefined, 'Straight', '—'], ['down', 'Falling', '↘'], ['up', 'Rising', '↗']]" :key="label" class="ib grow" :class="{ on: el.slope === v }" :aria-pressed="el.slope === v" :title="t(label)" :aria-label="t(label)" @click="el.slope = v; if (v && el.h < 40) el.h = Math.round(el.w / 2)">{{ sym }}</button>
            </div>
            <div class="btn-row" role="group" :aria-label="t('Arrowheads')">
              <button v-for="[v, label, sym] in [[undefined, 'No arrowheads', '—'], ['end', 'Arrowhead at the end', '→'], ['start', 'Arrowhead at the start', '←'], ['both', 'Arrowheads at both ends', '↔']]" :key="label" class="ib grow" :class="{ on: el.head === v }" :aria-pressed="el.head === v" :title="t(label)" :aria-label="t(label)" @click="el.head = v">{{ sym }}</button>
            </div>
          </template>
          <label v-if="el.shape === 'rect'" class="slider" :title="t('Corner radius')"><Icon name="radius" :size="16" /><input type="range" min="0" max="80" :aria-label="t('Corner radius')" :value="el.radius || 0" @input="el.radius = +$event.target.value" /><output>{{ el.radius || 0 }} px</output></label>
        </Sec>
        <Sec id="colors" icon="fill" :title="t('Fill & outline')">
          <div class="chips">
            <span v-if="el.shape !== 'line'" class="chip" :style="chip(el.fill)"><Menu icon="fill" :label="t('Fill')" :title="t('Fill')">
              <div class="swatches pop-sw">
                <button v-for="c in FILLS" :key="c" class="sw" :class="{ on: el.fill === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="el.fill === c" @click="el.fill = c" />
                <button class="sw none" :title="t('No fill')" :aria-label="t('No fill')" :aria-pressed="el.fill === 'none'" @click="el.fill = 'none'" />
              </div>
            </Menu></span>
            <span class="chip" :style="chip(el.stroke)"><Menu icon="outline" :label="t('Outline')" :title="t('Outline')">
              <div class="swatches pop-sw">
                <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: el.stroke === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="el.stroke === c" @click="el.stroke = c; el.strokeWidth ||= 2" />
                <button class="sw none" :title="t('No outline')" :aria-label="t('No outline')" :aria-pressed="el.stroke === 'none'" @click="el.stroke = 'none'" />
              </div>
            </Menu></span>
            <span v-if="el.shape !== 'line'" class="chip" :style="chip(el.color, 'currentColor')"><Menu icon="fontColor" :title="t('Text color')">
              <div class="swatches pop-sw">
                <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: el.color === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="el.color === c" @click="el.color = c" />
                <button class="sw none" :title="t('Theme color')" :aria-label="t('Theme color')" :aria-pressed="!el.color" @click="el.color = undefined" />
              </div>
            </Menu></span>
          </div>
          <label v-if="el.shape !== 'line' && el.fill !== 'none'" class="slider" :title="t('Opacity')"><Icon name="opacity" :size="16" /><input type="range" min="0" max="100" step="5" :aria-label="t('Opacity')" :value="el.fillAlpha ?? 100" @input="el.fillAlpha = +$event.target.value === 100 ? undefined : +$event.target.value" /><output>{{ el.fillAlpha ?? 100 }} %</output></label>
          <label class="slider" :title="t('Outline width')"><Icon name="lineWidth" :size="16" /><input type="range" min="0" max="16" :aria-label="t('Outline width')" :value="el.strokeWidth" @input="el.strokeWidth = +$event.target.value" /><output>{{ el.strokeWidth || 0 }} px</output></label>
        </Sec>
      </template>

      <Sec v-else-if="el.type === 'icon'" id="icon" icon="smile" :title="t('Icon')">
        <button class="ib wide" :title="el.icon" @click="Object.assign(iconPicker, { open: true, target: el.id })"><Icon name="search" /> {{ t('Change icon …') }}</button>
        <div class="btn-row">
          <span class="chip" :style="chip(el.color === 'currentColor' ? themeStyle(deck.theme)['--fg'] : el.color || themeStyle(deck.theme)['--accent'])"><Menu icon="fontColor" :title="t('Color')">
            <div class="swatches pop-sw">
              <button class="sw" :class="{ on: !el.color }" :style="{ background: themeStyle(deck.theme)['--accent'] }" :title="t('Theme accent')" :aria-label="t('Theme accent')" :aria-pressed="!el.color" @click="el.color = undefined" />
              <button class="sw" :class="{ on: el.color === 'currentColor' }" :style="{ background: themeStyle(deck.theme)['--fg'] }" :title="t('Theme text color')" :aria-label="t('Theme text color')" :aria-pressed="el.color === 'currentColor'" @click="el.color = 'currentColor'" />
              <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: el.color === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="el.color === c" @click="el.color = c" />
            </div>
          </Menu></span>
          <button class="ib" :aria-label="t('Rotate 90°')" :title="t('Rotate 90°')" @click="el.rotate = ((el.rotate || 0) + 1) % 4 || undefined"><Icon name="rotate" /></button>
          <button v-for="[f, n, lbl] in [['h', 'flipH', 'Flip horizontally'], ['v', 'flipV', 'Flip vertically']]" :key="f" class="ib" :class="{ on: el.flip?.includes(f) }" :aria-pressed="!!el.flip?.includes(f)" :aria-label="t(lbl)" :title="t(lbl)"
            @click="el.flip = ['h', 'v'].filter(k => (k === f) !== !!el.flip?.includes(k)).join('') || undefined"><Icon :name="n" /></button>
        </div>
        <label class="field">{{ t('Description for screen readers (empty: decorative)') }}
          <input :value="el.label || ''" maxlength="200" @change="el.label = $event.target.value.trim() || undefined" /></label>
      </Sec>

      <Sec v-else-if="el.type === 'timer'" id="timer" icon="timer" :title="t('Timer')">
        <div class="seg" role="group" :aria-label="t('Kind')">
          <button class="ib grow" :class="{ on: el.seconds }" :aria-pressed="!!el.seconds" @click="el.seconds ||= lastCountdown">{{ t('Countdown') }}</button>
          <button class="ib grow" :class="{ on: !el.seconds }" :aria-pressed="!el.seconds" @click="lastCountdown = el.seconds || lastCountdown; el.seconds = 0">{{ t('Stopwatch') }}</button>
        </div>
        <label v-if="el.seconds" class="field">{{ t('Duration (minutes or m:ss)') }}
          <input :value="clock(el.seconds)" inputmode="numeric" @change="el.seconds = parseClock($event.target.value) || el.seconds; $event.target.value = clock(el.seconds)" /></label>
        <div v-if="el.seconds" class="seg" role="group" :aria-label="t('Common durations')">
          <button v-for="m in [1, 2, 5, 10, 15, 20]" :key="m" class="ib grow" :class="{ on: el.seconds === m * 60 }" :aria-pressed="el.seconds === m * 60" :title="t('{0} min', m)" @click="el.seconds = m * 60">{{ m }}</button>
        </div>
        <label class="check"><input type="checkbox" :checked="!!el.auto" @change="el.auto = $event.target.checked || undefined" /> {{ t('Starts when the slide appears') }}</label>
        <label v-if="el.seconds" class="check"><input type="checkbox" :checked="!el.silent" @change="el.silent = !$event.target.checked || undefined" /> {{ t('Sound when the time is up') }}</label>
        <label v-if="el.seconds" class="check"><input type="checkbox" :checked="!!el.warn" @change="el.warn = $event.target.checked || undefined" /> {{ t('Last minute in red') }}</label>
        <div class="field">{{ t('Design') }}
          <div class="seg" role="group" :aria-label="t('Design')">
            <button v-for="[f, n] in [[undefined, 'Digits'], ['ring', 'Ring'], ['bar', 'Bar']]" :key="n" class="ib grow" :class="{ on: el.face === f }" :aria-pressed="el.face === f" @click="el.face = f">{{ t(n) }}</button>
          </div>
        </div>
        <div class="btn-row">
          <span v-if="el.face" class="chip" :style="chip(el.accent, 'var(--ui-accent)')"><Menu icon="brush" :label="t('Accent')" :title="t('Colour of the ring or bar')">
            <div class="swatches pop-sw">
              <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: el.accent === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="el.accent === c" @click="el.accent = c" />
              <button class="sw none" :title="t('Theme color')" :aria-label="t('Theme color')" :aria-pressed="!el.accent" @click="el.accent = undefined" />
            </div>
          </Menu></span>
          <span class="chip" :style="chip(el.fill)"><Menu icon="fill" :label="t('Fill')" :title="t('Background')">
            <div class="swatches pop-sw">
              <button v-for="c in FILLS" :key="c" class="sw" :class="{ on: el.fill === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="el.fill === c" @click="el.fill = c" />
              <button class="sw none" :title="t('No background')" :aria-label="t('No background')" :aria-pressed="!el.fill" @click="el.fill = undefined" />
            </div>
          </Menu></span>
        </div>
        <div class="btn-row">
          <select class="grow" :aria-label="t('Font size')" :title="t('Font size')" :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined"><option value="">{{ t('Default') }}</option><option v-for="s in [...SIZES, 96, 128]" :key="s" :value="s">{{ s }} px</option></select>
          <span class="chip" :style="chip(el.color, 'currentColor')"><Menu icon="fontColor" :title="t('Text color')">
            <div class="swatches pop-sw">
              <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: el.color === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="el.color === c" @click="el.color = c" />
              <button class="sw none" :title="t('Theme color')" :aria-label="t('Theme color')" :aria-pressed="!el.color" @click="el.color = undefined" />
            </div>
          </Menu></span>
        </div>
      </Sec>

      <Sec v-else-if="el.type === 'picker'" id="picker" icon="dice" :title="t('Random draw')">
        <!-- the same limits as when loading a project -->
        <label class="field">{{ t('Names or groups, one per line') }}
          <textarea :value="el.names.join('\n')" rows="8" maxlength="20000" @change="el.names = cleanEl({ type: 'picker', names: $event.target.value.split('\n') }).names" /></label>
        <div class="field">{{ t('Style') }}
          <div class="seg" role="group" :aria-label="t('Style')">
            <button v-for="[k, n] in looks(el.type)" :key="n" class="ib grow" :class="{ on: el.look === k }" :aria-pressed="el.look === k" @click="el.look = k">{{ t(n) }}</button>
          </div>
        </div>
        <label class="field">{{ t('Text above (empty: none)') }}
          <input :value="el.heading ?? t('Who’s next?')" maxlength="100" @change="el.heading = $event.target.value.replace(/\s+/g, ' ').trim()" /></label>
        <div class="field">{{ t('Icon') }}
          <div class="seg" role="group" :aria-label="t('Icon')">
            <button class="ib grow" :class="{ on: !el.noIcon && !el.body }" :aria-pressed="!el.noIcon && !el.body" @click="Object.assign(el, { noIcon: undefined, icon: undefined, body: undefined, view: undefined })">{{ t('Die') }}</button>
            <button class="ib grow" :class="{ on: !!el.body }" :aria-pressed="!!el.body" :title="el.icon" @click="el.noIcon = undefined; Object.assign(iconPicker, { open: true, target: el.id })">{{ t('Choose …') }}</button>
            <button class="ib grow" :class="{ on: !!el.noIcon }" :aria-pressed="!!el.noIcon" @click="el.noIcon = true">{{ t('None') }}</button>
          </div>
        </div>
        <label class="check"><input type="checkbox" :checked="!!el.repeat" @change="el.repeat = $event.target.checked || undefined" /> {{ t('A name can be drawn again') }}</label>
        <!-- name lists in this browser, for every project: choosing one copies its names here -->
        <div class="field">{{ t('Saved name lists') }}
          <div class="btn-row">
            <select v-if="Object.keys(lists).length" class="grow" :aria-label="t('Use a saved list')" value="" @change="el.names = cleanEl({ type: 'picker', names: lists[$event.target.value] }).names; listName = $event.target.value; $event.target.value = ''">
              <option value="" disabled>{{ t('Use a saved list …') }}</option>
              <option v-for="n in Object.keys(lists)" :key="n" :value="n">{{ n }} ({{ lists[n].length }})</option>
            </select>
          </div>
          <div class="btn-row">
            <input v-model="listName" class="grow" maxlength="100" :placeholder="t('List name, e.g. Workshop group A')" :aria-label="t('List name')" @keydown.enter="saveList(listName, el.names)" />
            <button class="ib" :disabled="!listName.trim() || !el.names.length" :title="t('Save these names as a list in this browser')" @click="saveList(listName, el.names)">{{ lists[listName.trim()] ? t('Update') : t('Save') }}</button>
            <button v-if="lists[listName.trim()]" class="ib" :title="t('Delete list')" :aria-label="t('Delete list')" @click="removeList(listName.trim()); listName = ''"><Icon name="trash" /></button>
          </div>
          <div class="btn-row">
            <button class="ib grow" :disabled="!Object.keys(lists).length" :title="t('Save all name lists as a file, e.g. for another device')" @click="exportLists">{{ t('Export lists') }}</button>
            <button class="ib grow" :title="t('Add the name lists from a file')" @click="$refs.listFile.click()">{{ t('Import lists …') }}</button>
            <input ref="listFile" type="file" accept=".json,application/json" hidden @change="readLists" />
          </div>
        </div>
        <div class="btn-row">
          <select class="grow" :aria-label="t('Font size')" :title="t('Font size')" :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined"><option value="">{{ t('Default') }}</option><option v-for="s in [...SIZES, 96, 128]" :key="s" :value="s">{{ s }} px</option></select>
          <span class="chip" :style="chip(el.color, 'currentColor')"><Menu icon="fontColor" :title="t('Text color')">
            <div class="swatches pop-sw">
              <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: el.color === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="el.color === c" @click="el.color = c" />
              <button class="sw none" :title="t('Theme color')" :aria-label="t('Theme color')" :aria-pressed="!el.color" @click="el.color = undefined" />
            </div>
          </Menu></span>
        </div>
      </Sec>

      <Sec v-else-if="el.type === 'quiz'" id="quiz" icon="quiz" :title="t('Quiz')">
        <label class="field">{{ t('Question') }} <input :value="el.question" maxlength="300" @input="el.question = $event.target.value" /></label>
        <div class="field">{{ t('Answers (tick the correct ones)') }}
          <div v-for="(a, i) in el.answers" :key="i" class="btn-row">
            <input type="checkbox" :checked="a.correct" :aria-label="t('Answer {0} is correct', LETTERS[i])" @change="a.correct = $event.target.checked || undefined" />
            <input class="grow" :value="a.text" maxlength="200" :aria-label="t('Answer {0}', LETTERS[i])" @input="a.text = $event.target.value" />
            <button class="ib" :disabled="el.answers.length <= 2" :title="t('Remove answer')" :aria-label="t('Remove answer')" @click="el.answers.splice(i, 1)"><Icon name="x" /></button>
          </div>
          <button class="ib wide" :disabled="el.answers.length >= LETTERS.length" @click="el.answers.push({ text: '' })"><Icon name="plus" /> {{ t('Add answer') }}</button>
        </div>
        <div class="field">{{ t('Style') }}
          <div class="seg" role="group" :aria-label="t('Style')">
            <button v-for="[k, n] in looks(el.type)" :key="n" class="ib grow" :class="{ on: el.look === k }" :aria-pressed="el.look === k" @click="el.look = k">{{ t(n) }}</button>
          </div>
        </div>
        <label class="row-ico" :title="t('Font size')"><Icon name="fontSize" :size="16" />
          <select :aria-label="t('Font size')" :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined"><option value="">{{ t('Default') }}</option><option v-for="s in SIZES" :key="s" :value="s">{{ s }} px</option></select>
        </label>
      </Sec>

      <Sec v-else-if="el.type === 'toc'" id="toc" icon="list" :title="t('Table of contents')">
        <div class="grid3">
          <label>{{ t('From level') }}<select :value="el.minDepth || 1" @change="el.minDepth = +$event.target.value > 1 ? +$event.target.value : undefined"><option v-for="n in 6" :key="n" :value="n">{{ n }}</option></select></label>
          <label>{{ t('To level') }}<select :value="el.maxDepth || 6" @change="el.maxDepth = +$event.target.value < 6 ? +$event.target.value : undefined"><option v-for="n in 6" :key="n" :value="n">{{ n === 6 ? t('all') : n }}</option></select></label>
          <label>{{ t('Columns') }}<select :value="el.columns || 1" @change="el.columns = +$event.target.value > 1 ? +$event.target.value : undefined"><option v-for="n in 4" :key="n" :value="n">{{ n }}</option></select></label>
        </div>
        <label class="check"><input type="checkbox" :checked="!!el.current" @change="el.current = $event.target.checked || undefined" /> {{ t('Highlight the current slide') }}</label>
        <div class="field">{{ t('Style') }}
          <div class="seg" role="group" :aria-label="t('Style')">
            <button v-for="[k, n] in looks(el.type)" :key="n" class="ib grow" :class="{ on: el.look === k }" :aria-pressed="el.look === k" @click="el.look = k">{{ t(n) }}</button>
          </div>
        </div>
        <label class="row-ico" :title="t('Font size')"><Icon name="fontSize" :size="16" />
          <select :aria-label="t('Font size')" :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined"><option value="">{{ t('Default') }}</option><option v-for="s in SIZES" :key="s" :value="s">{{ s }} px</option></select>
        </label>
        <p class="hint">{{ t('Lists the slide titles (their first heading, by its level) as links. Hidden slides and slides with “Hide in table of contents” are left out.') }}</p>
      </Sec>
      <Sec v-else-if="el.type === 'chart'" id="chart" icon="chart" :title="t('Chart')"><ChartPanel :el="el" /></Sec>
      <Sec v-else-if="el.type === 'diagram'" id="diagram" icon="diagram" :title="t('Diagram')">
        <select :aria-label="t('Start from a template')" @change="setDiagram(el, DIAGRAMS[$event.target.value][1](), 0); $event.target.value = ''">
          <option value="">{{ t('Start from a template …') }}</option><option v-for="(d, k) in DIAGRAMS" :key="k" :value="k">{{ t(d[0]) }}</option>
        </select>
        <label class="field">{{ t('Mermaid code') }}
          <textarea :key="el.id" class="diagram-code" :value="el.code" rows="10" maxlength="20000" spellcheck="false" autocapitalize="off" @input="setDiagram(el, $event.target.value)" /></label>
        <p v-if="dia?.error" class="error diagram-error" role="alert">{{ t('The code has an error; the slide shows the last working diagram.') }} <small>{{ dia.error }}</small></p>
      </Sec>

      <Sec v-else-if="el.type === 'math'" id="math" icon="formula" :title="t('Formula')">
        <select :aria-label="t('Start from a template')" @change="el.tex = FORMULAS[$event.target.value][1]; $event.target.value = ''">
          <option value="">{{ t('Start from a template …') }}</option><option v-for="(f, k) in FORMULAS" :key="k" :value="k">{{ t(f[0]) }}</option>
        </select>
        <label class="field">{{ t('TeX code') }}
          <textarea :key="el.id" class="diagram-code" :value="el.tex" rows="5" maxlength="5000" spellcheck="false" autocapitalize="off" @input="el.tex = $event.target.value" /></label>
        <div class="math-preview" :aria-label="t('Preview')" v-html="formulaHtml(el.tex)" />
        <p v-if="mathError(el.tex)" class="error diagram-error" role="alert">{{ t('The TeX code has an error.') }} <small>{{ mathError(el.tex) }}</small></p>
        <div class="btn-row">
          <select class="grow" :aria-label="t('Font size')" :title="t('Font size')" :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined"><option value="">{{ t('Default') }}</option><option v-for="s in [...SIZES, 96]" :key="s" :value="s">{{ s }} px</option></select>
          <span class="chip" :style="chip(el.color, 'currentColor')"><Menu icon="fontColor" :title="t('Text color')">
            <div class="swatches pop-sw">
              <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: el.color === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="el.color === c" @click="el.color = c" />
              <button class="sw none" :title="t('Theme color')" :aria-label="t('Theme color')" :aria-pressed="!el.color" @click="el.color = undefined" />
            </div>
          </Menu></span>
        </div>
      </Sec>

      <Sec v-else-if="el.type === 'video'" id="video" :icon="el.url ? 'globe' : 'video'" :title="t(el.url ? 'Web page' : 'Video')">
        <label class="field">{{ t('YouTube link or web address (https://…)') }} <input :value="el.url || el.youtube" @change="setVideo($event.target.value)" /></label>
      </Sec>

      <Sec id="pos" icon="move" :title="t('Position & size')">
        <div class="xywh">
          <label v-for="k in ['x', 'y', 'w', 'h']" :key="k" class="nf"><span aria-hidden="true">{{ { x: 'X', y: 'Y', w: t('W'), h: t('H') }[k] }}</span><input type="number" :aria-label="t({ x: 'X position', y: 'Y position', w: 'Width', h: 'Height' }[k])" :value="el[k]" :disabled="el.locked" @change="num(k, $event.target.value)" /></label>
          <button class="ib" :class="{ on: el.locked }" :aria-pressed="!!el.locked" :aria-label="t('Lock position')" :title="t('Locked elements can be selected and edited, but not moved, resized or aligned.')" @click="el.locked = !el.locked || undefined"><Icon :name="el.locked ? 'lock' : 'unlock'" /></button>
        </div>
      </Sec>
      <Sec id="arrange" icon="layers" :title="t('Arrange')">
        <div class="seg-row">
          <span class="seg" role="group" :aria-label="t('Arrange')">
            <button v-for="[o, i, lbl] in ORDERS" :key="o" class="ib" :aria-label="t(lbl)" :title="keyTip(lbl, o)" :disabled="!canOrder(o)" @click="order(o)"><Icon :name="i" /></button>
          </span>
        </div>
        <div class="seg-row">
          <span v-for="part in [ALIGNS.slice(0, 3), ALIGNS.slice(3)]" :key="part[0][0]" class="seg" role="group">
            <button v-for="[a, i, lbl] in part" :key="a" class="ib" :disabled="el.locked" :aria-label="t('{0} (to slide)', t(lbl))" :title="t('{0} (to slide)', t(lbl))" @click="align(a)"><Icon :name="i" /></button>
          </span>
        </div>
      </Sec>
      <Sec id="effects" icon="shadow" :title="t('Effects')">
        <label v-if="['text', 'shape', 'image', 'code'].includes(el.type)" class="row-ico" :title="t('Shadow')"><Icon name="shadow" :size="16" />
          <select :aria-label="t('Shadow')" :value="el.shadow || ''" @change="el.shadow = $event.target.value || undefined"><option value="">{{ t('none') }}</option><option value="soft">{{ t('soft') }}</option><option value="strong">{{ t('strong') }}</option></select>
        </label>
        <div class="btn-row">
          <button class="ib wide" :class="{ on: el.click }" :aria-pressed="!!el.click" :title="t('Hidden while presenting until a click or → reveals it; elements with the same number appear together')" @click="setClick(el, el.click ? undefined : nextClick())"><Icon name="pointer" /> {{ t('Appear on click') }}</button>
          <input v-if="el.click" type="number" class="click-num" min="1" max="99" :aria-label="t('Click order')" :title="t('Click order')" :value="el.click" @change="setClick(el, clickNum($event.target.value))" />
        </div>
        <label v-if="el.click" class="field">{{ t('Entrance') }}
          <select class="effect" :value="el.effect || ''" @change="el.effect = $event.target.value || undefined"><option value="">{{ t('Fade in') }}</option><option v-for="(name, k) in EFFECT_NAMES" :key="k" :value="k">{{ t(name) }}</option></select>
        </label>
        <div class="btn-row">
          <button class="ib wide" :class="{ on: el.clickUntil }" :aria-pressed="!!el.clickUntil" :title="t('Hidden from this click on while presenting; with “Appear on click” the element is visible only in between')" @click="setUntil(el, el.clickUntil ? undefined : nextClick(el.click))"><Icon name="pointer" /> {{ t('Disappear on click') }}</button>
          <input v-if="el.clickUntil" type="number" class="click-num" :min="(el.click || 0) + 1" max="99" :aria-label="t('Disappear at click')" :title="t('Disappear at click')" :value="el.clickUntil" @change="setUntil(el, clickNum($event.target.value))" />
        </div>
        <label v-if="['shape', 'image'].includes(el.type)" class="field">{{ t('On click while presenting, go to') }}
          <select :value="el.to || ''" @change="el.to = $event.target.value || undefined"><option value="">{{ t('nothing') }}</option><option v-if="el.to && !slideChoices.some(c => c.id === el.to)" :value="el.to">{{ t('a deleted slide') }}</option><option v-for="c in slideChoices" :key="c.id" :value="c.id">{{ c.label }}</option></select>
        </label>
        <label v-if="el.type === 'text' && /<(ul|ol)\b/.test(el.html)" class="check" :title="t('While presenting, the list items appear one per click, from the box’s click step on')"><input type="checkbox" :checked="!!el.clickItems" @change="el.clickItems = $event.target.checked || undefined" /> {{ t('List items one by one') }}</label>
        <!-- empty: Magic move pairs it automatically (same text, picture or shape) -->
        <label class="field" :title="t('Magic move pairs elements with the same name on this slide and the next one')">{{ t('Magic move name') }}
          <input :value="el.morph || ''" :placeholder="t('automatic')" maxlength="40" @change="el.morph = $event.target.value.trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '') || undefined" />
        </label>
      </Sec>
      <section class="actions">
        <button v-if="['text', 'shape', 'code', 'image'].includes(el.type)" class="ib" :class="{ on: ui.painting }" :aria-pressed="!!ui.painting" :aria-label="t('Copy formatting')" :title="keyTip('Copy formatting: then click an element', 'copyLook', 'pasteLook')" @click="paint"><Icon name="brush" /></button>
        <button class="ib" :aria-label="t('Duplicate')" :title="keyTip('Duplicate', 'duplicate')" @click="duplicate"><Icon name="copy" /></button>
        <button class="ib danger" :aria-label="t('Delete')" :title="t('Delete (⌫)')" @click="remove"><Icon name="trash" /></button>
      </section>
      <Sec v-if="tip" id="tips" icon="info" :title="t('Tips')"><p class="hint">{{ t(tip) }}</p></Sec>
    </template>

    <!-- the slide -->
    <template v-else-if="slide && !ui.master">
      <Sec id="slide" icon="slides">
        <template #title>{{ t('Slide {0}', ui.slide + 1) }} <small v-if="deckOfSlide(ui.slide)">· {{ deckOfSlide(ui.slide).name }}</small></template>
        <label class="row-ico" :title="t('Layout')"><Icon name="layout" :size="16" />
          <select :aria-label="t('Layout')" :value="slideLayout?.id" @change="pickLayout"><option v-for="l in deck.layouts" :key="l.id" :value="l.id">{{ l.name }}</option><option value="">{{ t('Edit layouts …') }}</option></select>
        </label>
        <label class="check"><input type="checkbox" :checked="!!slide.hideMaster" @change="$event.target.checked ? (slide.hideMaster = true) : delete slide.hideMaster" />{{ t('Hide master elements') }}</label>
        <label class="check"><input type="checkbox" :checked="!!slide.hideInToc" @change="setSlideProp(slide, 'hideInToc', $event.target.checked)" />{{ t('Hide in table of contents') }}</label>
        <h4 class="sub-head">{{ t('Background image') }}</h4>
        <div class="btn-row">
          <label class="ib wide file" tabindex="0" role="button"><Icon name="image" /> {{ slide.bg ? t('Replace') : t('Choose image …') }}<input type="file" accept="image/*" hidden @change="run(() => setBackground(slide, $event.target.files[0]))" /></label>
          <button v-if="slide.bg" class="ib" :aria-label="t('Remove background image')" :title="t('Remove background image')" @click="delete slide.bg"><Icon name="trash" /></button>
        </div>
        <template v-if="slide.bg">
          <label class="row-ico" :title="t('Fit')"><Icon name="crop" :size="16" />
            <select :aria-label="t('Fit')" :value="slide.bg.fit || 'cover'" @change="slide.bg.fit = $event.target.value === 'contain' ? 'contain' : undefined"><option value="cover">{{ t('Fill the slide') }}</option><option value="contain">{{ t('Show the whole image') }}</option></select>
          </label>
          <label class="slider" :title="t('Darken (for readable text)')"><Icon name="opacity" :size="16" /><input type="range" min="0" max="90" step="5" :aria-label="t('Darken (for readable text)')" :value="slide.bg.dim || 0" @input="slide.bg.dim = +$event.target.value || undefined" /><output>{{ slide.bg.dim || 0 }} %</output></label>
        </template>
        <label class="field" :title="t('Slidev’s class: frontmatter, kept for the Slidev export')">{{ t('Slidev classes') }}<input :value="slide.cls || ''" placeholder="text-white" @change="setSlideProp(slide, 'cls', $event.target.value.replace(/[^\w\s:.\-[\]%/!#()]/g, '').trim())" /></label>
        <h4 class="sub-head">{{ t('Transition') }}</h4>
        <!-- plays when presenting, between this slide and the next -->
        <label class="field">{{ t('Transition to next slide') }}
          <select :value="slide.transition || ''" @change="slide.transition = $event.target.value || undefined"><option value="">{{ t('Project default ({0})', t(TRANSITIONS[deck.transition])) }}</option><option v-for="(n, k) in TRANSITIONS" :key="k" :value="k">{{ t(n) }}</option></select>
        </label>
        <label class="field">{{ t('Default transition (all slides)') }}
          <select v-model="deck.transition"><option v-for="(n, k) in TRANSITIONS" :key="k" :value="k">{{ t(n) }}</option></select>
        </label>
        <button v-if="(slide.transition || deck.transition) === 'morph' && deck.slides[ui.slide + 1]" class="ib wide" :title="t('Plays Magic move from this slide into the next one')" @click="previewMorph"><Icon name="play" /> {{ t('Preview transition') }}</button>
        <!-- rehearsing compares against these; the talk length is shared by the slides without their own time -->
        <h4 class="sub-head">{{ t('Planned time') }}</h4>
        <label class="field">{{ t('This slide (minutes or m:ss)') }}
          <input :value="slide.duration ? clock(slide.duration) : ''" inputmode="numeric" :placeholder="t('e.g. 1:30')" @change="setTime(slide, $event)" /></label>
        <label class="field">{{ t('Whole talk (minutes or m:ss)') }}
          <input :value="deck.duration ? clock(deck.duration) : ''" inputmode="numeric" :placeholder="t('e.g. 20')" @change="setTime(deck, $event)" /></label>
        <div class="btn-row">
          <button class="ib" :aria-label="t('Duplicate slide')" :title="keyTip('Duplicate slide', 'duplicateSlide')" @click="duplicateSlide()"><Icon name="copy" /></button>
          <button class="ib danger" :aria-label="t('Delete slide')" :title="keyTip('Delete slide', 'deleteSlide')" @click="deleteSlide()"><Icon name="trash" /></button>
          <button class="ib wide" data-tour="markdown" :title="t('View and edit this slide’s Markdown – e.g. generated by an AI')" @click="emit('markdown')"><Icon name="markdown" /> {{ t('Edit Markdown') }}</button>
        </div>
        <button v-if="canRevert(slide)" class="ib wide" :title="t('Show the slide as it was imported – changes to this slide are lost (can be undone)')" @click="revertSlides([slide])"><Icon name="undo" /> {{ t('Revert to imported version') }}</button>
      </Sec>
      <Sec id="typo" icon="fontSize" :title="t('Font for all slides')">
        <p class="hint">{{ t('Applies to the whole project, in every theme and in exports. Individual elements can have their own sizes.') }}</p>
        <div class="grid3">
          <label v-for="[k, n, sizes] in TYPO" :key="k">{{ t(n) }}
            <select :value="deck.typo[k] || ''" @change="setTypo(k, +$event.target.value)"><option value="">{{ t('Theme') }}</option><option v-for="v in typoSizes(k, sizes)" :key="v" :value="v">{{ v }} px</option></select>
          </label>
        </div>
      </Sec>
      <Sec id="notes" icon="notes" class="grow" :title="t('Speaker notes')">
        <div class="notes-wrap">
          <!-- same text behind the transparent textarea: find marks it with CSS highlights, which textareas cannot show -->
          <div class="notes-mirror text-mirror" aria-hidden="true">{{ slide.notes }}{{ '​' }}</div>
          <textarea v-model="slide.notes" class="notes" :rows="notesRows" :placeholder="t('Notes for presenter view …')" :aria-label="t('Speaker notes')" @scroll="$event.target.previousElementSibling.scrollTop = $event.target.scrollTop" />
        </div>
      </Sec>
      <Sec id="tips" icon="info" :title="t('Tips')">
        <p class="hint-box"><kbd>{{ t('Double-click') }}</kbd> {{ t('edit') }} · <kbd>⇧</kbd>+{{ t('click for several') }} · {{ t('drag on empty space to select') }} · <kbd>Alt</kbd> {{ t('while dragging turns off snapping') }} · <kbd>⌘K</kbd> {{ t('all commands') }}</p>
      </Sec>
    </template>
  </aside>
</template>
