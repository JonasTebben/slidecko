<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { listAt } from './lists.js'
import Icon from './Icon.vue'
import { deck, ui, SHAPES, deckOfSlide, clean, textStyles, saveTextStyles, STYLE_PROPS, blockTag, styleMatches } from './store.js'
import { themeLayouts, TABLE_PRESETS, themeStyle, FONTS, fontStack } from './themes.js'
import { LANGS, codeOpts, withLines } from './hl.js'
import { canRevert, revertSlides, fitHeight, slide, selection, primary, align, distribute, order, duplicate, remove, format, replaceImage, startCrop, endCrop, setCropRatio, resetCrop, CROP_RATIOS, run, duplicateSlide, deleteSlide, list, paint, pasteLook } from './actions.js'
import * as table from './tableOps.js'
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
const BORDER_MODES = [['all', 'Alle', '▦'], ['outer', 'Außen', '□'], ['inner', 'Innen', '╋'], ['top', 'Oben', '▔'], ['bottom', 'Unten', '▁'], ['left', 'Links', '▏'], ['right', 'Rechts', '▕'], ['none', 'Keine', '⬚']]
// which buttons describe the lines around the current cell / row / column / table right now
const bordersOn = computed(() => (el.value?.type === 'table' && ui.cell ? Object.fromEntries(BORDER_MODES.map(([m]) => [m, table.borderOn(el.value, m, border.value.scope)])) : {}))
// several cells marked (shift-click, drag, shift+arrows): the "Zelle" choices mean all of them
const cellWord = computed(() => { if (!ui.cellEnd || !el.value?.rows) return t('Zelle'); const [r0, r9, c0, c9] = table.area(el.value); return t('Markierung ({0} Zellen)', (r9 - r0 + 1) * (c9 - c0 + 1)) })
const setBorder = mode => { const b = border.value; tbl(table.toggleBorder, mode, `${b.w}px ${b.style} ${b.color}`, b.scope) }
const onSelection = () => { listKind.value = listAt(getSelection().anchorNode) }
onMounted(() => document.addEventListener('selectionchange', onSelection))
onBeforeUnmount(() => document.removeEventListener('selectionchange', onSelection))
// the theme's own layouts join the common ones; a slide keeps a layout the theme does not know
const layouts = computed(() => { const l = themeLayouts(deck.theme); return l.some(x => x[0] === slide.value.layout) ? l : [...l, [slide.value.layout, slide.value.layout]] })
const langs = computed(() => (el.value?.lang && !LANGS.includes(el.value.lang) ? [el.value.lang, ...LANGS] : LANGS))
// code backgrounds: light editor greys and the usual dark editor themes
const CODE_BGS = ['#ffffff', '#f6f8fa', '#f1f5f9', '#fdf6e3', '#fef9c3', '#e0f2fe', '#0d1117', '#1e293b', '#282a36', '#002b36', '#2e3440', '#000000']
const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64]
// --- text styles: the theme's block formats, shown as live previews, plus the user's own presets ---
const STYLES = [['h1', 'Titel'], ['h2', 'Überschrift 2'], ['h3', 'Überschrift 3'], ['h4', 'Überschrift 4'], ['p', 'Fließtext'], ['blockquote', 'Zitat'], ['pre', 'Code']]
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
const TYPO = [['text', 'Text', [12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28]], ['title', 'Titel', [24, 26, 28, 30, 32, 36, 40, 44, 48]], ['code', 'Code', [8, 9, 10, 11, 12, 13, 14, 16, 18, 20]]]
function setTypo(k, v) {
  const t = { ...deck.typo }
  delete t.from // set by hand: it stays when the theme changes back
  if (v) t[k] = v
  else delete t[k]
  deck.typo = t
}
const ALIGNS = [['left', 'alignL', 'Links'], ['center', 'alignC', 'Horizontal zentrieren'], ['right', 'alignR', 'Rechts'], ['top', 'alignT', 'Oben'], ['middle', 'alignM', 'Vertikal zentrieren'], ['bottom', 'alignB', 'Unten']]
const alignTo = ref('sel')
// several elements: the text boxes among them, formatted together
const texts = computed(() => selection.value.filter(e => e.type === 'text'))
const same = (k, els = texts.value) => (v => (els.every(e => e[k] === v) ? v : null))(els[0]?.[k]) // null = mixed
const shadowable = computed(() => selection.value.filter(e => ['text', 'shape', 'image', 'code'].includes(e.type)))
function setAll(els, k, v) {
  for (const e of els) { e[k] = v; if (k === 'fill' && !v) delete e.fillAlpha; if (k === 'font' || k === 'fontSize') fitHeight(e) }
}
const notesRows = computed(() => Math.min(14, Math.max(4, (slide.value.notes || '').split('\n').length + 1)))
</script>

<template>
  <aside class="inspector" :aria-label="t('Eigenschaften')">
    <!-- several elements -->
    <template v-if="selection.length > 1">
      <section>
        <h3>{{ t('{0} Elemente', selection.length) }}</h3>
        <label class="field">{{ t('Ausrichten an') }}
          <select v-model="alignTo"><option value="sel">{{ t('Auswahl (aneinander)') }}</option><option value="slide">{{ t('Folie') }}</option></select>
        </label>
        <div class="btn-row">
          <button v-for="[a, i, lbl] in ALIGNS" :key="a" class="ib" :title="t(alignTo === 'slide' ? '{0} an der Folie' : '{0} aneinander', t(lbl))" @click="align(a, alignTo === 'slide')"><Icon :name="i" /></button>
        </div>
        <template v-if="texts.length">
          <h3>{{ t('Text') }} ({{ texts.length }} {{ texts.length === 1 ? t('Textfeld') : t('Textfelder') }})</h3>
          <label class="field">{{ t('Schriftart') }}
            <select :value="same('font') ?? ''" @change="setAll(texts, 'font', $event.target.value || undefined)"><option value="">{{ same('font') === null ? t('Gemischt') : t('Theme') }}</option><option v-for="(f, k) in FONTS" :key="k" :value="k" :style="{ fontFamily: f[1] }">{{ f[0] }}</option></select>
          </label>
          <label class="field">{{ t('Schriftgröße') }}
            <select :value="same('fontSize') ?? ''" @change="setAll(texts, 'fontSize', +$event.target.value || undefined)"><option value="">{{ same('fontSize') === null ? t('Gemischt') : t('Theme') }}</option><option v-for="s in SIZES" :key="s" :value="s">{{ s }} px</option></select>
          </label>
          <div class="btn-row">
            <button v-for="[a, i, lbl] in [['left', 'textL', 'Linksbündig'], ['center', 'textC', 'Zentriert'], ['right', 'textR', 'Rechtsbündig'], ['justify', 'textJ', 'Blocksatz']]" :key="a" class="ib" :class="{ on: same('align') === (a === 'left' ? undefined : a) }" :title="t(lbl)" @click="setAll(texts, 'align', a === 'left' ? undefined : a)"><Icon :name="i" /></button>
          </div>
          <div class="field">{{ t('Textfarbe') }}
            <div class="swatches">
              <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: same('color') === c }" :style="{ background: c }" :title="c" @click="setAll(texts, 'color', c)" />
              <button class="sw none" :title="t('Theme-Farbe')" @click="setAll(texts, 'color', undefined)" />
            </div>
          </div>
          <div class="field">{{ t('Hintergrund') }}
            <div class="swatches">
              <button v-for="c in FILLS" :key="c" class="sw" :class="{ on: same('fill') === c }" :style="{ background: c }" :title="c" @click="setAll(texts, 'fill', c)" />
              <button class="sw none" :title="t('Kein Hintergrund')" @click="setAll(texts, 'fill', undefined)" />
            </div>
          </div>
        </template>
        <div class="btn-row">
          <button class="ib wide" @click="distribute('h')"><Icon name="distH" /> {{ t('Horizontal verteilen') }}</button>
          <button class="ib wide" @click="distribute('v')"><Icon name="distV" /> {{ t('Vertikal verteilen') }}</button>
        </div>
        <label v-if="shadowable.length" class="field">{{ t('Schatten') }}
          <select :value="same('shadow', shadowable) ?? ''" @change="setAll(shadowable, 'shadow', $event.target.value || undefined)"><option value="">{{ same('shadow', shadowable) === null ? t('Gemischt') : t('keiner') }}</option><option value="soft">{{ t('weich') }}</option><option value="strong">{{ t('deutlich') }}</option></select>
        </label>
        <label class="check" :title="t('Gesperrte Elemente lassen sich auswählen und bearbeiten, aber nicht verschieben, in der Größe ändern oder ausrichten.')">
          <input type="checkbox" :checked="selection.every(e => e.locked)" :indeterminate.prop="selection.some(e => e.locked) && !selection.every(e => e.locked)" @change="setAll(selection, 'locked', $event.target.checked || undefined)" /> {{ t('Position sperren') }}
        </label>
      </section>
      <section class="actions">
        <button v-if="ui.look" class="ib wide" :title="t('Kopiertes Format auf alle übertragen (⌘⌥V)')" @click="pasteLook()"><Icon name="brush" /> {{ t('Format einfügen') }}</button>
        <button class="ib wide" @click="duplicate"><Icon name="copy" /> {{ t('Duplizieren') }}</button>
        <button class="ib wide danger" @click="remove"><Icon name="trash" /> {{ t('Löschen') }}</button>
      </section>
    </template>

    <!-- one element -->
    <template v-else-if="el">
      <section v-if="el.type === 'text'">
        <h3>{{ t('Text') }}</h3>
        <div class="styles" role="listbox" :aria-label="t('Textstil')" @mousedown.prevent>
          <button v-for="[tag, n] in STYLES" :key="tag" class="style-btn" :class="{ on: curTag === tag }" :aria-selected="curTag === tag" :title="t(typing ? 'Absatz als {0}' : 'Ganzes Textfeld als {0}', t(n))" @click="applyStyle(tag)">
            <span class="slide mini style-prev layout-center" :class="`theme-${deck.theme}`" :style="themeStyle(deck.theme)"><component :is="tag">{{ t(n) }}</component></span>
          </button>
          <div v-for="p in textStyles.list" :key="p.name" class="style-btn custom" :class="{ on: isCustom(p) }">
            <button class="style-apply" :title="t('Eigener Stil „{0}“ anwenden', p.name)" @click="applyCustom(p)">
              <span class="slide mini style-prev layout-center" :class="`theme-${deck.theme}`" :style="{ ...themeStyle(deck.theme), background: p.fill || null }">
                <component :is="p.tag" :style="{ fontSize: p.fontSize ? p.fontSize + 'px' : null, color: p.color || null, textAlign: p.align || null, fontFamily: fontStack(p.font) || null }">{{ p.name }}</component>
              </span>
            </button>
            <button class="style-del" :title="t('Stil „{0}“ löschen', p.name)" @click="removeCustom(p)"><Icon name="x" :size="12" /></button>
          </div>
        </div>
        <form v-if="naming" class="btn-row" @submit.prevent="saveCurrent">
          <input v-model="presetName" class="grow" :placeholder="t('Name, z. B. Merksatz')" :aria-label="t('Name des Stils')" autofocus />
          <button class="ib" type="submit">{{ t('Speichern') }}</button>
          <button class="ib" type="button" :title="t('Abbrechen')" @click="naming = false"><Icon name="x" /></button>
        </form>
        <button v-else class="ib wide" :title="t('Format, Schrift, Größe, Farben und Ausrichtung dieses Textfelds als eigenen Stil merken (gleicher Name überschreibt)')" @click="naming = true"><Icon name="plus" /> {{ t('Als eigenen Stil speichern') }}</button>
        <div class="btn-row" @mousedown.prevent>
          <button class="ib" :disabled="!typing" :title="t('Fett (⌘B)')" @click="format('bold')"><Icon name="bold" /></button>
          <button class="ib" :disabled="!typing" :title="t('Kursiv (⌘I)')" @click="format('italic')"><Icon name="italic" /></button>
          <button class="ib" :disabled="!typing" :title="t('Unterstrichen (⌘U)')" @click="format('underline')"><Icon name="underline" /></button>
          <button class="ib" :disabled="!typing" :title="t('Durchgestrichen')" @click="format('strikeThrough')"><Icon name="strike" /></button>
          <button class="ib" :disabled="!typing" :title="t('Link (⌘K)')" @click="emit('link')"><Icon name="link" /></button>
          <button class="ib" :disabled="!typing" :title="t('Inline-Code')" @click="format('insertHTML', `<code>${getSelection().toString().replace(/</g, '&lt;') || 'code'}</code>`)"><Icon name="code" /></button>
        </div>
        <div class="btn-row" @mousedown.prevent>
          <button class="ib" :class="{ on: typing && listKind === 'UL' }" :disabled="!typing" :title="t('Aufzählung (⌘⇧8)')" :aria-pressed="typing && listKind === 'UL'" @click="list('ul')"><Icon name="list" /></button>
          <button class="ib" :class="{ on: typing && listKind === 'OL' }" :disabled="!typing" :title="t('Nummerierung (⌘⇧7)')" :aria-pressed="typing && listKind === 'OL'" @click="list('ol')"><Icon name="olist" /></button>
          <span class="sep" />
          <button v-for="[a, i] in [['left', 'textL'], ['center', 'textC'], ['right', 'textR'], ['justify', 'textJ']]" :key="a" class="ib" :class="{ on: (el.align || 'left') === a }" :title="t({ left: 'Linksbündig', center: 'Zentriert', right: 'Rechtsbündig', justify: 'Blocksatz' }[a])" @click="el.align = a === 'left' ? undefined : a"><Icon :name="i" /></button>
          <span class="sep" />
          <button v-for="[a, i, lbl] in [['top', 'alignT', 'Text oben'], ['middle', 'alignM', 'Text vertikal mittig'], ['bottom', 'alignB', 'Text unten']]" :key="a" class="ib" :class="{ on: (el.valign || 'top') === a }" :title="t(lbl)" @click="el.valign = a === 'top' ? undefined : a"><Icon :name="i" /></button>
        </div>
        <p v-if="!typing" class="hint">{{ t('Doppelklick in den Text, um Wörter zu formatieren.') }}</p>
        <label class="field">{{ t('Schriftart') }}
          <select :value="el.font || ''" :style="{ fontFamily: fontStack(el.font) || null }" @change="el.font = $event.target.value || undefined; fitHeight(el)"><option value="">{{ t('Theme') }}</option><option v-for="(f, k) in FONTS" :key="k" :value="k" :style="{ fontFamily: f[1] }">{{ f[0] }}</option></select>
        </label>
        <label class="field">{{ t('Schriftgröße') }}
          <select :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined; fitHeight(el)"><option value="">{{ t('Theme') }}</option><option v-for="s in SIZES" :key="s" :value="s">{{ s }} px</option></select>
        </label>
        <div class="field">{{ typing ? t('Farbe der Auswahl') : t('Textfarbe') }}
          <div class="swatches" @mousedown.prevent>
            <button v-for="c in PALETTE" :key="c" class="sw" :style="{ background: c }" :title="c" @click="textColor(c)" />
            <button class="sw none" :title="t('Theme-Farbe')" @click="typing ? format('removeFormat') : (el.color = undefined)" />
          </div>
        </div>
        <div class="field">{{ t('Hintergrund') }}
          <div class="swatches">
            <button v-for="c in FILLS" :key="c" class="sw" :class="{ on: el.fill === c }" :style="{ background: c }" :title="c" @click="el.fill = c" />
            <button class="sw none" :title="t('Kein Hintergrund')" @click="el.fill = undefined" />
          </div>
        </div>
        <label v-if="el.fill" class="field">{{ t('Deckkraft') }} {{ el.fillAlpha ?? 100 }} % <input type="range" min="0" max="100" step="5" :value="el.fillAlpha ?? 100" @input="el.fillAlpha = +$event.target.value === 100 ? undefined : +$event.target.value" /></label>
        <div class="field">{{ t('Kontur') }}
          <div class="swatches">
            <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: el.stroke === c }" :style="{ background: c }" :title="c" :aria-pressed="el.stroke === c" @click="el.stroke = c; el.strokeWidth ||= 2" />
            <button class="sw none" :title="t('Keine Kontur')" @click="el.stroke = undefined" />
          </div>
        </div>
        <template v-if="el.stroke">
          <label class="field">{{ t('Konturstärke') }} {{ el.strokeWidth }} px <input type="range" min="1" max="12" :value="el.strokeWidth" @input="el.strokeWidth = +$event.target.value" /></label>
          <label class="field">{{ t('Linienart') }}
            <select :value="el.strokeStyle || 'solid'" @change="el.strokeStyle = $event.target.value === 'solid' ? undefined : $event.target.value"><option value="solid">{{ t('durchgezogen') }}</option><option value="dashed">{{ t('gestrichelt') }}</option><option value="dotted">{{ t('gepunktet') }}</option></select>
          </label>
        </template>
        <label class="check"><input v-model="el.title" type="checkbox" /> {{ t('Folientitel') }}</label>
      </section>

      <section v-else-if="el.type === 'code'">
        <h3>{{ t('Code') }}</h3>
        <label class="field">{{ t('Sprache') }} <select v-model="el.lang"><option v-for="l in langs" :key="l">{{ l }}</option></select></label>
        <label class="field">{{ t('Schriftgröße') }}
          <select :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined"><option value="">{{ t('Theme') }}</option><option v-for="s in [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24]" :key="s" :value="s">{{ s }} px</option></select>
        </label>
        <label class="field">{{ t('Zeilen hervorheben') }} <input :value="el.meta || ''" :placeholder="t('z. B. {2,4-5}')" @change="el.meta = $event.target.value.trim() || undefined" /></label>
        <label class="check"><input type="checkbox" :checked="codeOpts(el.meta).lines" @change="el.meta = withLines(el.meta, $event.target.checked)" /> {{ t('Zeilennummern') }}</label>
        <div class="field">{{ t('Hintergrund') }}
          <div class="swatches">
            <button v-for="c in CODE_BGS" :key="c" class="sw" :class="{ on: el.fill === c }" :style="{ background: c }" :title="c" :aria-pressed="el.fill === c" @click="el.fill = c" />
            <button class="sw none" :title="t('Theme-Farbe')" :aria-pressed="!el.fill" @click="el.fill = undefined" />
          </div>
        </div>
        <label class="field">{{ t('Deckkraft') }} {{ el.fillAlpha ?? 100 }} % <input type="range" min="0" max="100" step="5" :value="el.fillAlpha ?? 100" @input="el.fillAlpha = +$event.target.value === 100 ? undefined : +$event.target.value" /></label>
        <label class="field">{{ t('Ecken') }} {{ el.radius ?? 4 }} px <input type="range" min="0" max="32" :value="el.radius ?? 4" @input="el.radius = +$event.target.value === 4 ? undefined : +$event.target.value" /></label>
        <p class="hint">{{ t('Doppelklick zum Bearbeiten. Tab rückt ein, Esc beendet.') }}</p>
      </section>

      <section v-else-if="el.type === 'table'">
        <h3>{{ t('Tabelle') }}</h3>
        <div class="presets">
          <button v-for="[id, name] in TABLE_PRESETS" :key="id" class="preset" :class="{ on: (el.preset || 'theme') === id }" @click="el.preset = id">
            <span class="slide mini" :class="[`theme-${deck.theme}`]">
              <span class="tbl-wrap" :data-table="id"><table><thead><tr><th /><th /><th /></tr></thead><tbody><tr><td /><td /><td /></tr><tr><td /><td /><td /></tr><tr><td /><td /><td /></tr></tbody></table></span>
            </span>
            {{ t(name) }}
          </button>
        </div>
        <label class="check"><input v-model="el.header" type="checkbox" /> {{ t('Kopfzeile') }}</label>
        <label class="check"><input :checked="el.firstCol" type="checkbox" @change="el.firstCol = $event.target.checked || undefined" /> {{ t('Erste Spalte betonen') }}</label>
        <label class="check"><input :checked="el.compact" type="checkbox" @change="el.compact = $event.target.checked || undefined" /> {{ t('Kompakt') }}</label>
        <h4>{{ t('Zeilen & Spalten') }}</h4>
        <div class="btn-row" @mousedown.prevent>
          <button class="ib" :title="t('Zeile oberhalb')" @click="tbl(table.insertRow, 'above')"><Icon name="rowAbove" /></button>
          <button class="ib" :title="t('Zeile unterhalb')" @click="tbl(table.insertRow, 'below')"><Icon name="rowBelow" /></button>
          <button class="ib" :title="t('Spalte links')" @click="tbl(table.insertCol, 'left')"><Icon name="colLeft" /></button>
          <button class="ib" :title="t('Spalte rechts')" @click="tbl(table.insertCol, 'right')"><Icon name="colRight" /></button>
          <button class="ib" :title="t(ui.cellEnd ? 'Markierte Zeilen löschen' : 'Zeile löschen')" @click="tbl(table.deleteRow)"><Icon name="rowDel" /></button>
          <button class="ib" :title="t(ui.cellEnd ? 'Markierte Spalten löschen' : 'Spalte löschen')" @click="tbl(table.deleteCol)"><Icon name="colDel" /></button>
        </div>
        <h4>{{ t('Aktuelle Spalte') }}</h4>
        <div class="btn-row" @mousedown.prevent>
          <button v-for="[a, i] in [['left', 'textL'], ['center', 'textC'], ['right', 'textR']]" :key="a" class="ib" :class="{ on: ui.cell && el.align[ui.cell.c] === a }" :title="t({ left: 'Linksbündig', center: 'Zentriert', right: 'Rechtsbündig' }[a])" @click="tbl(table.setAlign, a)"><Icon :name="i" /></button>
          <span class="sep" />
          <button class="ib" :title="t('Aufsteigend sortieren')" @click="tbl(table.sortBy, 1)">A→Z</button>
          <button class="ib" :title="t('Absteigend sortieren')" @click="tbl(table.sortBy, -1)">Z→A</button>
          <button class="ib" :title="t('Gleich breite Spalten')" @click="el.widths = undefined">⇔</button>
        </div>
        <h4>{{ t('Aktuelle Zelle') }}</h4>
        <div class="btn-row" @mousedown.prevent>
          <button class="ib" :class="{ on: typing && listKind === 'UL' }" :disabled="!typing" :title="t('Aufzählung (⌘⇧8)')" :aria-pressed="typing && listKind === 'UL'" @click="list('ul')"><Icon name="list" /></button>
          <button class="ib" :class="{ on: typing && listKind === 'OL' }" :disabled="!typing" :title="t('Nummerierung (⌘⇧7)')" :aria-pressed="typing && listKind === 'OL'" @click="list('ol')"><Icon name="olist" /></button>
        </div>
        <div class="field">{{ t('Farbe für') }}
          <select v-model="fillScope" :aria-label="t('Farbe anwenden auf')"><option value="cell">{{ cellWord }}</option><option value="row">{{ t(ui.cellEnd ? 'Zeilen' : 'Zeile') }}</option><option value="col">{{ t(ui.cellEnd ? 'Spalten' : 'Spalte') }}</option><option value="table">{{ t('Tabelle') }}</option></select>
          <div class="swatches" @mousedown.prevent>
            <button v-for="c in FILLS" :key="c" class="sw" :class="{ on: ui.cell && el.fills?.[ui.cell.r]?.[ui.cell.c] === c }" :style="{ background: c }" :title="c" @click="tbl(table.setFill, c, fillScope)" />
            <button class="sw none" :title="t('Keine Farbe')" @click="tbl(table.setFill, '', fillScope)" />
          </div>
        </div>
        <div class="field">{{ t('Rahmen für') }}
          <select v-model="border.scope" :aria-label="t('Rahmen anwenden auf')"><option value="cell">{{ cellWord }}</option><option value="row">{{ t(ui.cellEnd ? 'Zeilen' : 'Zeile') }}</option><option value="col">{{ t(ui.cellEnd ? 'Spalten' : 'Spalte') }}</option><option value="table">{{ t('Tabelle') }}</option></select>
          <div class="btn-row" @mousedown.prevent>
            <button v-for="[m, label, sym] in BORDER_MODES" :key="m" class="ib" :class="{ on: bordersOn[m] }" :aria-pressed="bordersOn[m]" :title="m === 'none' ? t('Keine Linien') : t('{0}: Linie setzen, nochmal klicken entfernt sie', t(label))" :aria-label="t('Rahmen {0}', t(label))" @click="setBorder(m)">{{ sym }}</button>
          </div>
          <div class="btn-row">
            <select v-model="border.w" :aria-label="t('Linienstärke')"><option v-for="w in [1, 2, 3, 4, 6]" :key="w" :value="w">{{ w }} px</option></select>
            <select v-model="border.style" :aria-label="t('Linienart')"><option value="solid">{{ t('durchgezogen') }}</option><option value="dashed">{{ t('gestrichelt') }}</option><option value="dotted">{{ t('gepunktet') }}</option><option value="double">{{ t('doppelt') }}</option></select>
          </div>
          <div class="swatches" @mousedown.prevent>
            <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: border.color === c }" :style="{ background: c }" :title="c" @click="border.color = c" />
          </div>
          <button v-if="el.borders" class="ib wide" @click="el.borders = undefined">{{ t('Linien des Presets verwenden') }}</button>
        </div>
        <label class="field">{{ t('Schriftgröße') }}
          <select :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined"><option value="">{{ t('Theme') }}</option><option v-for="s in [10, 12, 13, 14, 15, 16, 18, 20, 24]" :key="s" :value="s">{{ s }} px</option></select>
        </label>
        <p class="hint">{{ t('Doppelklick in eine Zelle. Tab/Pfeile springen, Tab in der letzten Zelle fügt eine Zeile an. Daten aus Excel oder Numbers einfach einfügen. Spaltenränder lassen sich ziehen. Mehrere Zellen markieren: ⇧-Klick, Ziehen oder ⇧+Pfeiltasten – Tippen, Einfügen, Farbe, Rahmen, Ausrichtung, Löschen und Kopieren gelten dann für alle. Eigene Rahmen ersetzen die Linien des Presets.') }}</p>
      </section>

      <section v-else-if="el.type === 'image'">
        <h3>{{ t('Bild') }}</h3>
        <label class="ib wide file">{{ t('Bild ersetzen') }}<input type="file" accept="image/*" hidden @change="run(() => replaceImage(el, $event.target.files[0]))" /></label>
        <template v-if="ui.crop === el.id">
          <label class="field">{{ t('Seitenverhältnis') }}
            <select :value="ui.cropRatio || ''" @change="setCropRatio(el, $event.target.value || null)"><option v-for="[k, n] in CROP_RATIOS" :key="n" :value="k || ''">{{ t(n) }}</option></select>
          </label>
          <div class="btn-row">
            <button class="ib wide" @click="resetCrop(el)">{{ t('Zurücksetzen') }}</button>
            <button class="ib wide on" @click="endCrop()">{{ t('Fertig') }}</button>
          </div>
          <p class="hint">{{ t('Ränder ziehen schneidet zu, das Bild ziehen verschiebt den Ausschnitt. ⇧ an einer Ecke hält das Seitenverhältnis. Enter oder Esc beendet.') }}</p>
        </template>
        <template v-else>
          <button class="ib wide" :disabled="el.locked" :title="t('Auch per Doppelklick aufs Bild')" @click="run(() => startCrop(el))">{{ t('Zuschneiden') }}</button>
          <button v-if="el.crop" class="ib wide" @click="resetCrop(el)">{{ t('Zuschnitt entfernen') }}</button>
        </template>
        <label class="field">{{ t('Ecken') }} <input type="range" min="0" max="80" :value="el.radius || 0" @input="el.radius = +$event.target.value || undefined" /></label>
        <p class="hint">{{ t('Ecken ziehen behält das Seitenverhältnis (⇧ für frei).') }}</p>
      </section>

      <section v-else-if="el.type === 'shape'">
        <h3>{{ t('Form') }}</h3>
        <label class="field">{{ t('Form') }} <select v-model="el.shape"><option v-for="s in SHAPES" :key="s" :value="s">{{ t(SHAPE_NAMES[s]) }}</option></select></label>
        <div v-if="el.shape !== 'line'" class="field">{{ t('Füllung') }}
          <div class="swatches">
            <button v-for="c in FILLS" :key="c" class="sw" :class="{ on: el.fill === c }" :style="{ background: c }" @click="el.fill = c" />
            <button class="sw none" :title="t('Keine Füllung')" @click="el.fill = 'none'" />
          </div>
        </div>
        <label v-if="el.shape !== 'line' && el.fill !== 'none'" class="field">{{ t('Deckkraft') }} {{ el.fillAlpha ?? 100 }} % <input type="range" min="0" max="100" step="5" :value="el.fillAlpha ?? 100" @input="el.fillAlpha = +$event.target.value === 100 ? undefined : +$event.target.value" /></label>
        <div class="field">{{ t('Kontur') }}
          <div class="swatches">
            <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: el.stroke === c }" :style="{ background: c }" @click="el.stroke = c; el.strokeWidth ||= 2" />
            <button class="sw none" :title="t('Keine Kontur')" @click="el.stroke = 'none'" />
          </div>
        </div>
        <label class="field">{{ t('Konturstärke') }} <input type="range" min="0" max="16" :value="el.strokeWidth" @input="el.strokeWidth = +$event.target.value" /></label>
        <template v-if="el.shape !== 'line'">
          <div class="field">{{ t('Textfarbe') }}
            <div class="swatches">
              <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: el.color === c }" :style="{ background: c }" :title="c" @click="el.color = c" />
              <button class="sw none" :title="t('Theme-Farbe')" @click="el.color = undefined" />
            </div>
          </div>
          <label class="field">{{ t('Schriftgröße') }}
            <select :value="el.fontSize || ''" @change="el.fontSize = +$event.target.value || undefined"><option value="">{{ t('Theme') }}</option><option v-for="s in SIZES" :key="s" :value="s">{{ s }} px</option></select>
          </label>
          <p class="hint">{{ t('Doppelklick in die Form, um Text zu schreiben.') }}</p>
        </template>
        <label v-if="el.shape === 'rect'" class="field">{{ t('Eckenradius') }} <input type="range" min="0" max="80" :value="el.radius" @input="el.radius = +$event.target.value" /></label>
      </section>

      <section v-else-if="el.type === 'video'">
        <h3>{{ t('Video') }}</h3>
        <label class="field">{{ t('YouTube-Link oder ID') }} <input :value="el.youtube" @change="setVideo($event.target.value)" /></label>
        <p class="hint">{{ t('Wird beim Präsentieren abgespielt; in Slidev als <Youtube>-Komponente.') }}</p>
      </section>

      <section>
        <h3>{{ t('Position & Größe') }}</h3>
        <div class="grid4">
          <label v-for="k in ['x', 'y', 'w', 'h']" :key="k">{{ { x: 'X', y: 'Y', w: t('B'), h: t('H') }[k] }}<input type="number" :value="el[k]" :disabled="el.locked" @change="num(k, $event.target.value)" /></label>
        </div>
        <label class="check" :title="t('Gesperrte Elemente lassen sich auswählen und bearbeiten, aber nicht verschieben, in der Größe ändern oder ausrichten.')"><input type="checkbox" :checked="!!el.locked" @change="el.locked = $event.target.checked || undefined" /> {{ t('Position sperren') }}</label>
        <label v-if="['text', 'shape', 'image', 'code'].includes(el.type)" class="field">{{ t('Schatten') }}
          <select :value="el.shadow || ''" @change="el.shadow = $event.target.value || undefined"><option value="">{{ t('keiner') }}</option><option value="soft">{{ t('weich') }}</option><option value="strong">{{ t('deutlich') }}</option></select>
        </label>
        <div class="btn-row">
          <button v-for="[a, i, lbl] in ALIGNS" :key="a" class="ib" :disabled="el.locked" :title="t('{0} an der Folie', t(lbl))" @click="align(a)"><Icon :name="i" /></button>
        </div>
        <div class="btn-row">
          <button class="ib wide" :title="t('In den Vordergrund (⌘⇧↑)')" @click="order('front')"><Icon name="up" /> {{ t('Vorne') }}</button>
          <button class="ib wide" :title="t('In den Hintergrund (⌘⇧↓)')" @click="order('back')"><Icon name="down" /> {{ t('Hinten') }}</button>
        </div>
      </section>
      <section class="actions">
        <button v-if="['text', 'shape', 'code', 'image'].includes(el.type)" class="ib wide" :class="{ on: ui.painting }" :aria-pressed="ui.painting" :title="t('Format übertragen: danach auf ein Element klicken (⌘⌥C / ⌘⌥V)')" @click="paint"><Icon name="brush" /> {{ t('Format übertragen') }}</button>
        <button class="ib wide" @click="duplicate"><Icon name="copy" /> {{ t('Duplizieren') }}</button>
        <button class="ib wide danger" @click="remove"><Icon name="trash" /> {{ t('Löschen') }}</button>
      </section>
    </template>

    <!-- the slide -->
    <template v-else-if="slide">
      <section>
        <h3>{{ t('Folie {0}', ui.slide + 1) }} <small v-if="deckOfSlide(ui.slide)">· {{ deckOfSlide(ui.slide).name }}</small></h3>
        <label class="field">{{ t('Layout') }}
          <select v-model="slide.layout"><option v-for="[id, name] in layouts" :key="id" :value="id">{{ t(name) }}</option></select>
        </label>
        <div class="btn-row">
          <button class="ib wide" @click="duplicateSlide()"><Icon name="copy" /> {{ t('Duplizieren') }}</button>
          <button class="ib wide danger" @click="deleteSlide()"><Icon name="trash" /> {{ t('Löschen') }}</button>
        </div>
        <button class="ib wide" :title="t('Markdown dieser Folie ansehen und bearbeiten – z. B. von einer KI erzeugt')" @click="emit('markdown')"><Icon name="markdown" /> {{ t('Markdown bearbeiten') }}</button>
        <button v-if="canRevert(slide)" class="ib wide" :title="t('Folie wieder so darstellen, wie sie importiert wurde – Änderungen an dieser Folie gehen verloren (Rückgängig möglich)')" @click="revertSlides([slide])"><Icon name="undo" /> {{ t('Auf Import-Stand zurücksetzen') }}</button>
      </section>
      <section>
        <h3>{{ t('Schrift für alle Folien') }}</h3>
        <p class="hint">{{ t('Gilt im ganzen Projekt, in jedem Theme und im Export. Einzelne Elemente können eigene Größen haben.') }}</p>
        <div class="grid3">
          <label v-for="[k, n, sizes] in TYPO" :key="k">{{ t(n) }}
            <select :value="deck.typo[k] || ''" @change="setTypo(k, +$event.target.value)"><option value="">{{ t('Theme') }}</option><option v-for="v in sizes" :key="v" :value="v">{{ v }} px</option></select>
          </label>
        </div>
      </section>
      <section class="grow">
        <h3>{{ t('Sprechernotizen') }}</h3>
        <div class="notes-wrap">
          <!-- same text behind the transparent textarea: find marks it with CSS highlights, which textareas cannot show -->
          <div class="notes-mirror text-mirror" aria-hidden="true">{{ slide.notes }}{{ '\u200b' }}</div>
          <textarea v-model="slide.notes" class="notes" :rows="notesRows" :placeholder="t('Notizen für die Referentenansicht …')" :aria-label="t('Sprechernotizen')" @scroll="$event.target.previousElementSibling.scrollTop = $event.target.scrollTop" />
        </div>
      </section>
      <section class="hint-box">
        <p><kbd>{{ t('Doppelklick') }}</kbd> {{ t('bearbeiten') }} · <kbd>⇧</kbd>+{{ t('Klick mehrere') }} · {{ t('Ziehen auf leerer Fläche wählt aus') }} · <kbd>Alt</kbd> {{ t('beim Ziehen schaltet Einrasten aus') }} · <kbd>⌘K</kbd> {{ t('alle Befehle') }}</p>
      </section>
    </template>
  </aside>
</template>
