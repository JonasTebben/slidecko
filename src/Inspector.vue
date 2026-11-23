<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { listAt } from './lists.js'
import Icon from './Icon.vue'
import { deck, ui, SHAPES, deckOfSlide, clean, cleanEl, textStyles, saveTextStyles, STYLE_PROPS, blockTag, styleMatches } from './store.js'
import { themeLayouts, TABLE_PRESETS, themeStyle, FONTS, fontStack } from './themes.js'
import { LANGS, codeOpts, withLines } from './hl.js'
import { canRevert, revertSlides, fitHeight, slide, selection, primary, align, distribute, order, duplicate, remove, format, replaceImage, startCrop, endCrop, setCropRatio, resetCrop, CROP_RATIOS, run, duplicateSlide, deleteSlide, list, paint, pasteLook } from './actions.js'
import * as table from './tableOps.js'
import { clock, parseClock } from './timer.js'
import { LETTERS } from './quiz.js'
import { t } from './i18n.js'
import { PALETTE, FILLS, SHAPE_NAMES } from './presets.js'

const emit = defineEmits(['link', 'markdown'])
const el = computed(() => (selection.value.length === 1 ? primary.value : null))
const typing = computed(() => el.value && ui.editing === el.value.id)
// list buttons show what the caret is in, like in a word processor
const listKind = ref(null)
const fillScope = ref('cell') // table colour: the current cell, its row or its column
// table borders: where, and the line to draw
const border = ref({ scope: 'cell', w: 1, style: 'solid', color: '#0f172a' })
const BORDER_MODES = [['all', 'All', '▦'], ['outer', 'Outer', '□'], ['inner', 'Inner', '╋'], ['top', 'Top', '▔'], ['bottom', 'Bottom', '▁'], ['left', 'Left', '▏'], ['right', 'Right', '▕'], ['none', 'None', '⬚']]
// which buttons describe the lines around the current cell / row / column / table right now
const bordersOn = computed(() => (el.value?.type === 'table' && ui.cell ? Object.fromEntries(BORDER_MODES.map(([m]) => [m, table.borderOn(el.value, m, border.value.scope)])) : {}))
// several cells marked (shift-click, drag, shift+arrows): the "Cell" choices mean all of them
const cellWord = computed(() => { if (!ui.cellEnd || !el.value?.rows) return t('Cell'); const [r0, r9, c0, c9] = table.area(el.value); return t('Selection ({0} cells)', (r9 - r0 + 1) * (c9 - c0 + 1)) })
const setBorder = mode => { const b = border.value; tbl(table.toggleBorder, mode, `${b.w}px ${b.style} ${b.color}`, b.scope) }
const onSelection = () => { listKind.value = listAt(getSelection().anchorNode) }
onMounted(() => document.addEventListener('selectionchange', onSelection))
onBeforeUnmount(() => document.removeEventListener('selectionchange', onSelection))
// the theme's own layouts join the common ones; a slide keeps a layout the theme does not know
const TRANSITIONS = { none: 'None', fade: 'Fade', 'slide-left': 'Slide left', 'slide-up': 'Slide up' } // Slidev's names (store.js keeps only these)
const layouts = computed(() => { const l = themeLayouts(deck.theme); return l.some(x => x[0] === slide.value.layout) ? l : [...l, [slide.value.layout, slide.value.layout]] })
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
const naming = ref(false), presetName = ref('')
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
const num = (key, v) => { const n = Math.round(+v); if (Number.isFinite(n)) el.value[key] = key === 'w' || key === 'h' ? Math.max(8, n) : n }
const tbl = (fn, ...a) => run(() => fn(el.value, ...a))
const ytId = v => v.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{6,20})/)?.[1] || (/^[\w-]{6,20}$/.test(v) ? v : null)
function setVideo(v) {
  const id = ytId(v.trim())
  if (id) el.value.youtube = id
}
const TYPO = [['text', 'Text', [12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28]], ['title', 'Title', [24, 26, 28, 30, 32, 36, 40, 44, 48]], ['code', 'Code', [8, 9, 10, 11, 12, 13, 14, 16, 18, 20]]]
function setTypo(k, v) {
  const t = { ...deck.typo }
  delete t.from // set by hand: it stays when the theme changes back
  if (v) t[k] = v
  else delete t[k]
  deck.typo = t
}
const ALIGNS = [['left', 'alignL', 'Left'], ['center', 'alignC', 'Center horizontally'], ['right', 'alignR', 'Right'], ['top', 'alignT', 'Top'], ['middle', 'alignM', 'Center vertically'], ['bottom', 'alignB', 'Bottom']]
const alignTo = ref('sel')
// several elements: the text boxes among them, formatted together
const texts = computed(() => selection.value.filter(e => e.type === 'text'))
const same = (k, els = texts.value) => (v => (els.every(e => e[k] === v) ? v : null))(els[0]?.[k]) // null = mixed
const shadowable = computed(() => selection.value.filter(e => ['text', 'shape', 'image', 'code'].includes(e.type)))
function setAll(els, k, v) {
  for (const e of els) { e[k] = v; if (k === 'fill' && !v) delete e.fillAlpha; if (k === 'font' || k === 'fontSize') fitHeight(e) }
}
// appear on click: switched on, an element gets a step after the slide's last one
const nextClick = () => Math.min(99, Math.max(0, ...slide.value.elements.map(e => e.click || 0)) + 1)
const clickNum = v => Math.min(99, Math.max(1, Math.round(+v) || 1))
const notesRows = computed(() => Math.min(14, Math.max(4, (slide.value.notes || '').split('\n').length + 1)))
</script>

<template>
  <aside class="inspector" :aria-label="t('Properties')">
    <!-- several elements -->
    <template v-if="selection.length > 1">
      <section>
        <h3>{{ t('{0} elements', selection.length) }}</h3>
        <label class="field">{{ t('Align to') }}
          <select v-model="alignTo"><option value="sel">{{ t('Selection (to each other)') }}</option><option value="slide">{{ t('Slide') }}</option></select>
        </label>
        <div class="btn-row">
          <button v-for="[a, i, lbl] in ALIGNS" :key="a" class="ib" :title="t(alignTo === 'slide' ? '{0} (to slide)' : '{0} (to each other)', t(lbl))" @click="align(a, alignTo === 'slide')"><Icon :name="i" /></button>
        </div>
        <template v-if="texts.length">
          <h3>{{ t('Text') }} ({{ texts.length }} {{ texts.length === 1 ? t('Text box') : t('Text boxes') }})</h3>
          <label class="field">{{ t('Font') }}
            <select :value="same('font') ?? ''" @change="setAll(texts, 'font', $event.target.value || undefined)"><option value="">{{ same('font') === null ? t('Mixed') : t('Theme') }}</option><option v-for="(f, k) in FONTS" :key="k" :value="k" :style="{ fontFamily: f[1] }">{{ f[0] }}</option></select>
          </label>
          <label class="field">{{ t('Font size') }}
            <select :value="same('fontSize') ?? ''" @change="setAll(texts, 'fontSize', +$event.target.value || undefined)"><option value="">{{ same('fontSize') === null ? t('Mixed') : t('Theme') }}</option><option v-for="s in SIZES" :key="s" :value="s">{{ s }} px</option></select>
          </label>
          <div class="btn-row">
            <button v-for="[a, i, lbl] in [['left', 'textL', 'Align left'], ['center', 'textC', 'Centered'], ['right', 'textR', 'Align right'], ['justify', 'textJ', 'Justify']]" :key="a" class="ib" :class="{ on: same('align') === (a === 'left' ? undefined : a) }" :title="t(lbl)" @click="setAll(texts, 'align', a === 'left' ? undefined : a)"><Icon :name="i" /></button>
          </div>
          <div class="field">{{ t('Text color') }}
            <div class="swatches">
              <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: same('color') === c }" :style="{ background: c }" :title="c" @click="setAll(texts, 'color', c)" />
              <button class="sw none" :title="t('Theme color')" @click="setAll(texts, 'color', undefined)" />
            </div>
          </div>
          <div class="field">{{ t('Background') }}
            <div class="swatches">
              <button v-for="c in FILLS" :key="c" class="sw" :class="{ on: same('fill') === c }" :style="{ background: c }" :title="c" @click="setAll(texts, 'fill', c)" />
              <button class="sw none" :title="t('No background')" @click="setAll(texts, 'fill', undefined)" />
            </div>
          </div>
        </template>
        <div class="btn-row">
          <button class="ib wide" @click="distribute('h')"><Icon name="distH" /> {{ t('Distribute horizontally') }}</button>
          <button class="ib wide" @click="distribute('v')"><Icon name="distV" /> {{ t('Distribute vertically') }}</button>
        </div>
        <label v-if="shadowable.length" class="field">{{ t('Shadow') }}
          <select :value="same('shadow', shadowable) ?? ''" @change="setAll(shadowable, 'shadow', $event.target.value || undefined)"><option value="">{{ same('shadow', shadowable) === null ? t('Mixed') : t('none') }}</option><option value="soft">{{ t('soft') }}</option><option value="strong">{{ t('strong') }}</option></select>
        </label>
        <label class="check" :title="t('Locked elements can be selected and edited, but not moved, resized or aligned.')">
          <input type="checkbox" :checked="selection.every(e => e.locked)" :indeterminate.prop="selection.some(e => e.locked) && !selection.every(e => e.locked)" @change="setAll(selection, 'locked', $event.target.checked || undefined)" /> {{ t('Lock position') }}
        </label>
        <label class="check" :title="t('Hidden while presenting until a click or → reveals it; elements with the same number appear together')">
          <input type="checkbox" :checked="selection.every(e => e.click)" :indeterminate.prop="selection.some(e => e.click) && !selection.every(e => e.click)" @change="setAll(selection, 'click', $event.target.checked ? nextClick() : undefined)" /> {{ t('Appear on click') }}
        </label>
        <label v-if="selection.every(e => e.click)" class="field">{{ t('Click order') }}<input type="number" min="1" max="99" :value="same('click', selection) ?? ''" :placeholder="t('Mixed')" @change="setAll(selection, 'click', clickNum($event.target.value))" /></label>
      </section>
      <section class="actions">
        <button v-if="ui.look" class="ib wide" :title="t('Apply copied formatting to all (⌘⌥V)')" @click="pasteLook()"><Icon name="brush" /> {{ t('Paste formatting') }}</button>
        <button class="ib wide" @click="duplicate"><Icon name="copy" /> {{ t('Duplicate') }}</button>
        <button class="ib wide danger" @click="remove"><Icon name="trash" /> {{ t('Delete') }}</button>
      </section>
    </template>

    <!-- one element -->
    <template v-else-if="el">
      <section v-if="el.type === 'text'">
        <h3>{{ t('Text') }}</h3>
        <div class="styles" role="group" :aria-label="t('Text style')" @mousedown.prevent>
          <button v-for="[tag, n] in STYLES" :key="tag" class="style-btn" :class="{ on: curTag === tag }" :aria-pressed="curTag === tag" :title="t(typing ? 'Paragraph as {0}' : 'Whole text box as {0}', t(n))" @click="applyStyle(tag)">
            <span class="slide mini style-prev layout-center" :class="`theme-${deck.theme}`" :style="themeStyle(deck.theme)"><component :is="tag">{{ t(n) }}</component></span>
          </button>
          <div v-for="p in textStyles.list" :key="p.name" class="style-btn custom" :class="{ on: isCustom(p) }">
            <button class="style-apply" :aria-pressed="isCustom(p)" :title="t('Apply custom style “{0}”', p.name)" @click="applyCustom(p)">
              <span class="slide mini style-prev layout-center" :class="`theme-${deck.theme}`" :style="{ ...themeStyle(deck.theme), background: p.fill || null }">
                <component :is="p.tag" :style="{ fontSize: p.fontSize ? p.fontSize + 'px' : null, color: p.color || null, textAlign: p.align || null, fontFamily: fontStack(p.font) || null }">{{ p.name }}</component>
              </span>
            </button>
            <button class="style-del" :title="t('Delete style “{0}”', p.name)" @click="removeCustom(p)"><Icon name="x" :size="12" /></button>
          </div>
        </div>
        <form v-if="naming" class="btn-row" @submit.prevent="saveCurrent">
          <input v-model="presetName" class="grow" :placeholder="t('Name, e.g. Key point')" :aria-label="t('Style name')" autofocus />
          <button class="ib" type="submit">{{ t('Save') }}</button>
          <button class="ib" type="button" :title="t('Cancel')" @click="naming = false"><Icon name="x" /></button>
        </form>
        <button v-else class="ib wide" :title="t('Remember this text box’s formatting, font, size, colors and alignment as a custom style (same name overwrites)')" @click="naming = true"><Icon name="plus" /> {{ t('Save as custom style') }}</button>
        <div class="btn-row" @mousedown.prevent>
          <button class="ib" :disabled="!typing" :title="t('Bold (⌘B)')" @click="format('bold')"><Icon name="bold" /></button>
          <button class="ib" :disabled="!typing" :title="t('Italic (⌘I)')" @click="format('italic')"><Icon name="italic" /></button>
          <button class="ib" :disabled="!typing" :title="t('Underline (⌘U)')" @click="format('underline')"><Icon name="underline" /></button>
          <button class="ib" :disabled="!typing" :title="t('Strikethrough')" @click="format('strikeThrough')"><Icon name="strike" /></button>
          <button class="ib" :disabled="!typing" :title="t('Link (⌘K)')" @click="emit('link')"><Icon name="link" /></button>
          <button class="ib" :disabled="!typing" :title="t('Inline code')" @click="format('insertHTML', `<code>${getSelection().toString().replace(/</g, '&lt;') || 'code'}</code>`)"><Icon name="code" /></button>
        </div>
        <div class="btn-row" @mousedown.prevent>
          <button class="ib" :class="{ on: typing && listKind === 'UL' }" :disabled="!typing" :title="t('Bulleted list (⌘⇧8)')" :aria-pressed="typing && listKind === 'UL'" @click="list('ul')"><Icon name="list" /></button>
          <button class="ib" :class="{ on: typing && listKind === 'OL' }" :disabled="!typing" :title="t('Numbered list (⌘⇧7)')" :aria-pressed="typing && listKind === 'OL'" @click="list('ol')"><Icon name="olist" /></button>
          <span class="sep" />
          <button v-for="[a, i] in [['left', 'textL'], ['center', 'textC'], ['right', 'textR'], ['justify', 'textJ']]" :key="a" class="ib" :class="{ on: (el.align || 'left') === a }" :title="t({ left: 'Align left', center: 'Centered', right: 'Align right', justify: 'Justify' }[a])" @click="el.align = a === 'left' ? undefined : a"><Icon :name="i" /></button>
          <span class="sep" />
          <button v-for="[a, i, lbl] in [['top', 'alignT', 'Text top'], ['middle', 'alignM', 'Text middle'], ['bottom', 'alignB', 'Text bottom']]" :key="a" class="ib" :class="{ on: (el.valign || 'top') === a }" :title="t(lbl)" @click="el.valign = a === 'top' ? undefined : a"><Icon :name="i" /></button>
        </div>
        <p v-if="!typing" class="hint">{{ t('Double-click into the text to format words.') }}</p>
        <label class="check" :title="t('While presenting, a click into the box lets you type the class’s ideas into it; they are saved in the project.')"><input type="checkbox" :checked="!!el.board" @change="el.board = $event.target.checked || undefined" /> {{ t('Editable while presenting') }}</label>
        <label class="field">{{ t('Font') }}
          <select :value="el.font || ''" :style="{ fontFamily: fontStack(el.font) || null }" @change="el.font = $event.target.value || undefined; fitHeight(el)"><option value="">{{ t('Theme') }}</option><option v-for="(f, k) in FONTS" :key="k" :value="k" :style="{ fontFamily: f[1] }">{{ f[0] }}</option></select>
        </label>
        <label class="field">{{ t('Font size') }}
          <select :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined; fitHeight(el)"><option value="">{{ t('Theme') }}</option><option v-for="s in SIZES" :key="s" :value="s">{{ s }} px</option></select>
        </label>
        <div class="field">{{ typing ? t('Selection color') : t('Text color') }}
          <div class="swatches" @mousedown.prevent>
            <button v-for="c in PALETTE" :key="c" class="sw" :style="{ background: c }" :title="c" @click="textColor(c)" />
            <button class="sw none" :title="t('Theme color')" @click="typing ? format('removeFormat') : (el.color = undefined)" />
          </div>
        </div>
        <div class="field">{{ t('Background') }}
          <div class="swatches">
            <button v-for="c in FILLS" :key="c" class="sw" :class="{ on: el.fill === c }" :style="{ background: c }" :title="c" @click="el.fill = c" />
            <button class="sw none" :title="t('No background')" @click="el.fill = undefined" />
          </div>
        </div>
        <label v-if="el.fill" class="field">{{ t('Opacity') }} {{ el.fillAlpha ?? 100 }} % <input type="range" min="0" max="100" step="5" :value="el.fillAlpha ?? 100" @input="el.fillAlpha = +$event.target.value === 100 ? undefined : +$event.target.value" /></label>
        <div class="field">{{ t('Outline') }}
          <div class="swatches">
            <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: el.stroke === c }" :style="{ background: c }" :title="c" :aria-pressed="el.stroke === c" @click="el.stroke = c; el.strokeWidth ||= 2" />
            <button class="sw none" :title="t('No outline')" @click="el.stroke = undefined" />
          </div>
        </div>
        <template v-if="el.stroke">
          <label class="field">{{ t('Outline width') }} {{ el.strokeWidth }} px <input type="range" min="1" max="12" :value="el.strokeWidth" @input="el.strokeWidth = +$event.target.value" /></label>
          <label class="field">{{ t('Line style') }}
            <select :value="el.strokeStyle || 'solid'" @change="el.strokeStyle = $event.target.value === 'solid' ? undefined : $event.target.value"><option value="solid">{{ t('solid') }}</option><option value="dashed">{{ t('dashed') }}</option><option value="dotted">{{ t('dotted') }}</option></select>
          </label>
        </template>
        <label class="check"><input v-model="el.title" type="checkbox" /> {{ t('Slide title') }}</label>
      </section>

      <section v-else-if="el.type === 'code'">
        <h3>{{ t('Code') }}</h3>
        <label class="field">{{ t('Language') }} <select v-model="el.lang"><option v-for="l in langs" :key="l">{{ l }}</option></select></label>
        <label class="field">{{ t('Font size') }}
          <select :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined"><option value="">{{ t('Theme') }}</option><option v-for="s in [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24]" :key="s" :value="s">{{ s }} px</option></select>
        </label>
        <label class="field">{{ t('Highlight lines') }} <input :value="el.meta || ''" :placeholder="t('e.g. {2,4-5}')" @change="el.meta = $event.target.value.trim() || undefined" /></label>
        <label class="check"><input type="checkbox" :checked="codeOpts(el.meta).lines" @change="el.meta = withLines(el.meta, $event.target.checked)" /> {{ t('Line numbers') }}</label>
        <div class="field">{{ t('Background') }}
          <div class="swatches">
            <button v-for="c in CODE_BGS" :key="c" class="sw" :class="{ on: el.fill === c }" :style="{ background: c }" :title="c" :aria-pressed="el.fill === c" @click="el.fill = c" />
            <button class="sw none" :title="t('Theme color')" :aria-pressed="!el.fill" @click="el.fill = undefined" />
          </div>
        </div>
        <label class="field">{{ t('Opacity') }} {{ el.fillAlpha ?? 100 }} % <input type="range" min="0" max="100" step="5" :value="el.fillAlpha ?? 100" @input="el.fillAlpha = +$event.target.value === 100 ? undefined : +$event.target.value" /></label>
        <label class="field">{{ t('Corners') }} {{ el.radius ?? 4 }} px <input type="range" min="0" max="32" :value="el.radius ?? 4" @input="el.radius = +$event.target.value === 4 ? undefined : +$event.target.value" /></label>
        <p class="hint">{{ t('Double-click to edit. Tab indents, Esc finishes.') }}</p>
      </section>

      <section v-else-if="el.type === 'table'">
        <h3>{{ t('Table') }}</h3>
        <div class="presets">
          <button v-for="[id, name] in TABLE_PRESETS" :key="id" class="preset" :class="{ on: (el.preset || 'theme') === id }" @click="el.preset = id">
            <span class="slide mini" :class="[`theme-${deck.theme}`]">
              <span class="tbl-wrap" :data-table="id"><table><thead><tr><th /><th /><th /></tr></thead><tbody><tr><td /><td /><td /></tr><tr><td /><td /><td /></tr><tr><td /><td /><td /></tr></tbody></table></span>
            </span>
            {{ t(name) }}
          </button>
        </div>
        <label class="check"><input v-model="el.header" type="checkbox" /> {{ t('Header row') }}</label>
        <label class="check"><input :checked="el.firstCol" type="checkbox" @change="el.firstCol = $event.target.checked || undefined" /> {{ t('Emphasize first column') }}</label>
        <label class="check"><input :checked="el.compact" type="checkbox" @change="el.compact = $event.target.checked || undefined" /> {{ t('Compact') }}</label>
        <h4>{{ t('Rows & columns') }}</h4>
        <div class="btn-row" @mousedown.prevent>
          <button class="ib" :title="t('Row above')" @click="tbl(table.insertRow, 'above')"><Icon name="rowAbove" /></button>
          <button class="ib" :title="t('Row below')" @click="tbl(table.insertRow, 'below')"><Icon name="rowBelow" /></button>
          <button class="ib" :title="t('Column left')" @click="tbl(table.insertCol, 'left')"><Icon name="colLeft" /></button>
          <button class="ib" :title="t('Column right')" @click="tbl(table.insertCol, 'right')"><Icon name="colRight" /></button>
          <button class="ib" :title="t(ui.cellEnd ? 'Delete selected rows' : 'Delete row')" @click="tbl(table.deleteRow)"><Icon name="rowDel" /></button>
          <button class="ib" :title="t(ui.cellEnd ? 'Delete selected columns' : 'Delete column')" @click="tbl(table.deleteCol)"><Icon name="colDel" /></button>
        </div>
        <h4>{{ t('Current column') }}</h4>
        <div class="btn-row" @mousedown.prevent>
          <button v-for="[a, i] in [['left', 'textL'], ['center', 'textC'], ['right', 'textR']]" :key="a" class="ib" :class="{ on: ui.cell && el.align[ui.cell.c] === a }" :title="t({ left: 'Align left', center: 'Centered', right: 'Align right' }[a])" @click="tbl(table.setAlign, a)"><Icon :name="i" /></button>
          <span class="sep" />
          <button class="ib" :title="t('Sort ascending')" @click="tbl(table.sortBy, 1)">A→Z</button>
          <button class="ib" :title="t('Sort descending')" @click="tbl(table.sortBy, -1)">Z→A</button>
          <button class="ib" :title="t('Equal column widths')" @click="el.widths = undefined">⇔</button>
        </div>
        <h4>{{ t('Current cell') }}</h4>
        <div class="btn-row" @mousedown.prevent>
          <button class="ib" :class="{ on: typing && listKind === 'UL' }" :disabled="!typing" :title="t('Bulleted list (⌘⇧8)')" :aria-pressed="typing && listKind === 'UL'" @click="list('ul')"><Icon name="list" /></button>
          <button class="ib" :class="{ on: typing && listKind === 'OL' }" :disabled="!typing" :title="t('Numbered list (⌘⇧7)')" :aria-pressed="typing && listKind === 'OL'" @click="list('ol')"><Icon name="olist" /></button>
        </div>
        <div class="field">{{ t('Color for') }}
          <select v-model="fillScope" :aria-label="t('Apply color to')"><option value="cell">{{ cellWord }}</option><option value="row">{{ t(ui.cellEnd ? 'Rows' : 'Row') }}</option><option value="col">{{ t(ui.cellEnd ? 'Columns' : 'Column') }}</option><option value="table">{{ t('Table') }}</option></select>
          <div class="swatches" @mousedown.prevent>
            <button v-for="c in FILLS" :key="c" class="sw" :class="{ on: ui.cell && el.fills?.[ui.cell.r]?.[ui.cell.c] === c }" :style="{ background: c }" :title="c" @click="tbl(table.setFill, c, fillScope)" />
            <button class="sw none" :title="t('No color')" @click="tbl(table.setFill, '', fillScope)" />
          </div>
        </div>
        <div class="field">{{ t('Border for') }}
          <select v-model="border.scope" :aria-label="t('Apply border to')"><option value="cell">{{ cellWord }}</option><option value="row">{{ t(ui.cellEnd ? 'Rows' : 'Row') }}</option><option value="col">{{ t(ui.cellEnd ? 'Columns' : 'Column') }}</option><option value="table">{{ t('Table') }}</option></select>
          <div class="btn-row" @mousedown.prevent>
            <button v-for="[m, label, sym] in BORDER_MODES" :key="m" class="ib" :class="{ on: bordersOn[m] }" :aria-pressed="bordersOn[m]" :title="m === 'none' ? t('No lines') : t('{0}: set line, click again to remove it', t(label))" :aria-label="t('Border {0}', t(label))" @click="setBorder(m)">{{ sym }}</button>
          </div>
          <div class="btn-row">
            <select v-model="border.w" :aria-label="t('Line width')"><option v-for="w in [1, 2, 3, 4, 6]" :key="w" :value="w">{{ w }} px</option></select>
            <select v-model="border.style" :aria-label="t('Line style')"><option value="solid">{{ t('solid') }}</option><option value="dashed">{{ t('dashed') }}</option><option value="dotted">{{ t('dotted') }}</option><option value="double">{{ t('double') }}</option></select>
          </div>
          <div class="swatches" @mousedown.prevent>
            <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: border.color === c }" :style="{ background: c }" :title="c" @click="border.color = c" />
          </div>
          <button v-if="el.borders" class="ib wide" @click="el.borders = undefined">{{ t('Use the preset’s lines') }}</button>
        </div>
        <label class="field">{{ t('Font size') }}
          <select :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined"><option value="">{{ t('Theme') }}</option><option v-for="s in [10, 12, 13, 14, 15, 16, 18, 20, 24]" :key="s" :value="s">{{ s }} px</option></select>
        </label>
        <p class="hint">{{ t('Double-click into a cell. Tab/arrows move between cells, Tab in the last cell adds a row. Paste data straight from Excel or Numbers. Drag column edges to resize. Select several cells with ⇧-click, dragging or ⇧+arrow keys – typing, pasting, color, borders, alignment, delete and copy then apply to all of them. Custom borders replace the preset’s lines.') }}</p>
      </section>

      <section v-else-if="el.type === 'image'">
        <h3>{{ t('Image') }}</h3>
        <label class="ib wide file">{{ t('Replace image') }}<input type="file" accept="image/*" hidden @change="run(() => replaceImage(el, $event.target.files[0]))" /></label>
        <template v-if="ui.crop === el.id">
          <label class="field">{{ t('Aspect ratio') }}
            <select :value="ui.cropRatio || ''" @change="setCropRatio(el, $event.target.value || null)"><option v-for="[k, n] in CROP_RATIOS" :key="n" :value="k || ''">{{ t(n) }}</option></select>
          </label>
          <div class="btn-row">
            <button class="ib wide" @click="resetCrop(el)">{{ t('Revert') }}</button>
            <button class="ib wide on" @click="endCrop()">{{ t('Done') }}</button>
          </div>
          <p class="hint">{{ t('Drag the edges to crop, drag the picture to move the visible part. ⇧ on a corner keeps the aspect ratio. Enter or Esc finishes.') }}</p>
        </template>
        <template v-else>
          <button class="ib wide" :disabled="el.locked" :title="t('Or double-click the picture')" @click="run(() => startCrop(el))">{{ t('Crop') }}</button>
          <button v-if="el.crop" class="ib wide" @click="resetCrop(el)">{{ t('Remove crop') }}</button>
        </template>
        <label class="field">{{ t('Corners') }} <input type="range" min="0" max="80" :value="el.radius || 0" @input="el.radius = +$event.target.value || undefined" /></label>
        <p class="hint">{{ t('Dragging a corner keeps the aspect ratio (⇧ for free).') }}</p>
      </section>

      <section v-else-if="el.type === 'shape'">
        <h3>{{ t('Shape') }}</h3>
        <label class="field">{{ t('Shape') }} <select v-model="el.shape"><option v-for="s in SHAPES" :key="s" :value="s">{{ t(SHAPE_NAMES[s]) }}</option></select></label>
        <div v-if="el.shape !== 'line'" class="field">{{ t('Fill') }}
          <div class="swatches">
            <button v-for="c in FILLS" :key="c" class="sw" :class="{ on: el.fill === c }" :style="{ background: c }" :title="c" @click="el.fill = c" />
            <button class="sw none" :title="t('No fill')" @click="el.fill = 'none'" />
          </div>
        </div>
        <label v-if="el.shape !== 'line' && el.fill !== 'none'" class="field">{{ t('Opacity') }} {{ el.fillAlpha ?? 100 }} % <input type="range" min="0" max="100" step="5" :value="el.fillAlpha ?? 100" @input="el.fillAlpha = +$event.target.value === 100 ? undefined : +$event.target.value" /></label>
        <div class="field">{{ t('Outline') }}
          <div class="swatches">
            <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: el.stroke === c }" :style="{ background: c }" :title="c" @click="el.stroke = c; el.strokeWidth ||= 2" />
            <button class="sw none" :title="t('No outline')" @click="el.stroke = 'none'" />
          </div>
        </div>
        <label class="field">{{ t('Outline width') }} <input type="range" min="0" max="16" :value="el.strokeWidth" @input="el.strokeWidth = +$event.target.value" /></label>
        <template v-if="el.shape !== 'line'">
          <div class="field">{{ t('Text color') }}
            <div class="swatches">
              <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: el.color === c }" :style="{ background: c }" :title="c" @click="el.color = c" />
              <button class="sw none" :title="t('Theme color')" @click="el.color = undefined" />
            </div>
          </div>
          <label class="field">{{ t('Font size') }}
            <select :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined"><option value="">{{ t('Theme') }}</option><option v-for="s in SIZES" :key="s" :value="s">{{ s }} px</option></select>
          </label>
          <p class="hint">{{ t('Double-click the shape to write text in it.') }}</p>
        </template>
        <label v-if="el.shape === 'rect'" class="field">{{ t('Corner radius') }} <input type="range" min="0" max="80" :value="el.radius" @input="el.radius = +$event.target.value" /></label>
      </section>

      <section v-else-if="el.type === 'timer'">
        <h3>{{ t('Timer') }}</h3>
        <label class="field">{{ t('Duration (minutes or m:ss, 0 counts up)') }}
          <input :value="clock(el.seconds)" inputmode="numeric" @change="el.seconds = parseClock($event.target.value) ?? el.seconds; $event.target.value = clock(el.seconds)" /></label>
        <label class="field">{{ t('Font size') }}
          <select :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined"><option value="">{{ t('Theme') }}</option><option v-for="s in [...SIZES, 96, 128]" :key="s" :value="s">{{ s }} px</option></select>
        </label>
        <div class="field">{{ t('Text color') }}
          <div class="swatches">
            <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: el.color === c }" :style="{ background: c }" :title="c" @click="el.color = c" />
            <button class="sw none" :title="t('Theme color')" @click="el.color = undefined" />
          </div>
        </div>
        <p class="hint">{{ t('While presenting: a click starts or pauses it, a double click sets it back.') }}</p>
      </section>

      <section v-else-if="el.type === 'picker'">
        <h3>{{ t('Random picker') }}</h3>
        <!-- the same limits as when loading a project -->
        <label class="field">{{ t('Names or groups, one per line') }}
          <textarea :value="el.names.join('\n')" rows="8" maxlength="20000" @change="el.names = cleanEl({ type: 'picker', names: $event.target.value.split('\n') }).names" /></label>
        <label class="field">{{ t('Font size') }}
          <select :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined"><option value="">{{ t('Theme') }}</option><option v-for="s in [...SIZES, 96, 128]" :key="s" :value="s">{{ s }} px</option></select>
        </label>
        <div class="field">{{ t('Text color') }}
          <div class="swatches">
            <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: el.color === c }" :style="{ background: c }" :title="c" @click="el.color = c" />
            <button class="sw none" :title="t('Theme color')" @click="el.color = undefined" />
          </div>
        </div>
        <p class="hint">{{ t('While presenting: a click draws a name, nobody twice until everyone was drawn; a double click starts over.') }}</p>
      </section>

      <section v-else-if="el.type === 'quiz'">
        <h3>{{ t('Quiz') }}</h3>
        <label class="field">{{ t('Question') }} <input :value="el.question" maxlength="300" @input="el.question = $event.target.value" /></label>
        <div class="field">{{ t('Answers (tick the correct ones)') }}
          <div v-for="(a, i) in el.answers" :key="i" class="btn-row">
            <input type="checkbox" :checked="a.correct" :aria-label="t('Answer {0} is correct', LETTERS[i])" @change="a.correct = $event.target.checked || undefined" />
            <input class="grow" :value="a.text" maxlength="200" :aria-label="t('Answer {0}', LETTERS[i])" @input="a.text = $event.target.value" />
            <button class="ib" :disabled="el.answers.length <= 2" :title="t('Remove answer')" :aria-label="t('Remove answer')" @click="el.answers.splice(i, 1)"><Icon name="x" /></button>
          </div>
          <button class="ib wide" :disabled="el.answers.length >= LETTERS.length" @click="el.answers.push({ text: '' })"><Icon name="plus" /> {{ t('Add answer') }}</button>
        </div>
        <label class="field">{{ t('Font size') }}
          <select :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined"><option value="">{{ t('Theme') }}</option><option v-for="s in SIZES" :key="s" :value="s">{{ s }} px</option></select>
        </label>
        <p class="hint">{{ t('While presenting: a click marks an answer, “Reveal” (or Q) shows the solution.') }}</p>
      </section>

      <section v-else-if="el.type === 'video'">
        <h3>{{ t('Video') }}</h3>
        <label class="field">{{ t('YouTube link or ID') }} <input :value="el.youtube" @change="setVideo($event.target.value)" /></label>
        <p class="hint">{{ t('Plays while presenting; in Slidev as a <Youtube> component.') }}</p>
      </section>

      <section>
        <h3>{{ t('Position & size') }}</h3>
        <div class="grid4">
          <label v-for="k in ['x', 'y', 'w', 'h']" :key="k">{{ { x: 'X', y: 'Y', w: t('W'), h: t('H') }[k] }}<input type="number" :value="el[k]" :disabled="el.locked" @change="num(k, $event.target.value)" /></label>
        </div>
        <label class="check" :title="t('Locked elements can be selected and edited, but not moved, resized or aligned.')"><input type="checkbox" :checked="!!el.locked" @change="el.locked = $event.target.checked || undefined" /> {{ t('Lock position') }}</label>
        <label class="check" :title="t('Hidden while presenting until a click or → reveals it; elements with the same number appear together')"><input type="checkbox" :checked="!!el.click" @change="el.click = $event.target.checked ? nextClick() : undefined" /> {{ t('Appear on click') }}</label>
        <label v-if="el.click" class="field">{{ t('Click order') }}<input type="number" min="1" max="99" :value="el.click" @change="el.click = clickNum($event.target.value)" /></label>
        <label v-if="['text', 'shape', 'image', 'code'].includes(el.type)" class="field">{{ t('Shadow') }}
          <select :value="el.shadow || ''" @change="el.shadow = $event.target.value || undefined"><option value="">{{ t('none') }}</option><option value="soft">{{ t('soft') }}</option><option value="strong">{{ t('strong') }}</option></select>
        </label>
        <div class="btn-row">
          <button v-for="[a, i, lbl] in ALIGNS" :key="a" class="ib" :disabled="el.locked" :title="t('{0} (to slide)', t(lbl))" @click="align(a)"><Icon :name="i" /></button>
        </div>
        <div class="btn-row">
          <button class="ib wide" :title="t('Bring to front (⌘⇧↑)')" @click="order('front')"><Icon name="up" /> {{ t('Front') }}</button>
          <button class="ib wide" :title="t('Send to back (⌘⇧↓)')" @click="order('back')"><Icon name="down" /> {{ t('Back') }}</button>
        </div>
      </section>
      <section class="actions">
        <button v-if="['text', 'shape', 'code', 'image'].includes(el.type)" class="ib wide" :class="{ on: ui.painting }" :aria-pressed="ui.painting" :title="t('Copy formatting: then click an element (⌘⌥C / ⌘⌥V)')" @click="paint"><Icon name="brush" /> {{ t('Copy formatting') }}</button>
        <button class="ib wide" @click="duplicate"><Icon name="copy" /> {{ t('Duplicate') }}</button>
        <button class="ib wide danger" @click="remove"><Icon name="trash" /> {{ t('Delete') }}</button>
      </section>
    </template>

    <!-- the slide -->
    <template v-else-if="slide">
      <section>
        <h3>{{ t('Slide {0}', ui.slide + 1) }} <small v-if="deckOfSlide(ui.slide)">· {{ deckOfSlide(ui.slide).name }}</small></h3>
        <label class="field">{{ t('Layout') }}
          <select v-model="slide.layout"><option v-for="[id, name] in layouts" :key="id" :value="id">{{ t(name) }}</option></select>
        </label>
        <!-- plays when presenting, between this slide and the next -->
        <label class="field">{{ t('Transition to next slide') }}
          <select :value="slide.transition || ''" @change="slide.transition = $event.target.value || undefined"><option value="">{{ t('Project default ({0})', t(TRANSITIONS[deck.transition])) }}</option><option v-for="(n, k) in TRANSITIONS" :key="k" :value="k">{{ t(n) }}</option></select>
        </label>
        <label class="field">{{ t('Default transition (all slides)') }}
          <select v-model="deck.transition"><option v-for="(n, k) in TRANSITIONS" :key="k" :value="k">{{ t(n) }}</option></select>
        </label>
        <div class="btn-row">
          <button class="ib wide" @click="duplicateSlide()"><Icon name="copy" /> {{ t('Duplicate') }}</button>
          <button class="ib wide danger" @click="deleteSlide()"><Icon name="trash" /> {{ t('Delete') }}</button>
        </div>
        <button class="ib wide" data-tour="markdown" :title="t('View and edit this slide’s Markdown – e.g. generated by an AI')" @click="emit('markdown')"><Icon name="markdown" /> {{ t('Edit Markdown') }}</button>
        <button v-if="canRevert(slide)" class="ib wide" :title="t('Show the slide as it was imported – changes to this slide are lost (can be undone)')" @click="revertSlides([slide])"><Icon name="undo" /> {{ t('Revert to imported version') }}</button>
      </section>
      <section>
        <h3>{{ t('Font for all slides') }}</h3>
        <p class="hint">{{ t('Applies to the whole project, in every theme and in exports. Individual elements can have their own sizes.') }}</p>
        <div class="grid3">
          <label v-for="[k, n, sizes] in TYPO" :key="k">{{ t(n) }}
            <select :value="deck.typo[k] || ''" @change="setTypo(k, +$event.target.value)"><option value="">{{ t('Theme') }}</option><option v-for="v in sizes" :key="v" :value="v">{{ v }} px</option></select>
          </label>
        </div>
      </section>
      <section class="grow">
        <h3>{{ t('Speaker notes') }}</h3>
        <div class="notes-wrap">
          <!-- same text behind the transparent textarea: find marks it with CSS highlights, which textareas cannot show -->
          <div class="notes-mirror text-mirror" aria-hidden="true">{{ slide.notes }}{{ '\u200b' }}</div>
          <textarea v-model="slide.notes" class="notes" :rows="notesRows" :placeholder="t('Notes for presenter view …')" :aria-label="t('Speaker notes')" @scroll="$event.target.previousElementSibling.scrollTop = $event.target.scrollTop" />
        </div>
      </section>
      <section class="hint-box">
        <p><kbd>{{ t('Double-click') }}</kbd> {{ t('edit') }} · <kbd>⇧</kbd>+{{ t('click for several') }} · {{ t('drag on empty space to select') }} · <kbd>Alt</kbd> {{ t('while dragging turns off snapping') }} · <kbd>⌘K</kbd> {{ t('all commands') }}</p>
      </section>
    </template>
  </aside>
</template>
