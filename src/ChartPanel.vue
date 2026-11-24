<script setup>
import { computed, toRaw } from 'vue'
import Icon from './Icon.vue'
import Menu from './Menu.vue'
import { deck, cleanEl } from './store.js'
import { themeOf } from './themes.js'
import { CHART_KINDS, PALETTES, paletteColor, toGrid, applyGrid, seriesColor, sliceColor, isPie, percentOff, fmt } from './chart.js'
import { textGrid } from './tableOps.js'
import { PALETTE } from './presets.js'
import { t } from './i18n.js'

// The chart's options and its data as a little spreadsheet: first row the series, first column the categories
const props = defineProps({ el: Object })
const grid = computed(() => toGrid(props.el))
const accent = computed(() => themeOf(deck.theme).vars?.accent)
// the grid back into the element, through the same limits as a loaded project
function save(g) {
  applyGrid(props.el, g)
  const c = cleanEl(structuredClone(toRaw(props.el)))
  props.el.categories = c.categories
  props.el.series = c.series
}
const setCell = (r, c, v) => { const g = grid.value; g[r][c] = v; save(g) }
// a block copied from Excel, Sheets or Numbers fills the grid from this cell on and grows it as needed
function paste(e, r, c) {
  const text = e.clipboardData.getData('text/plain')
  if (!/[\t\n]/.test(text.trim())) return
  e.preventDefault()
  // into the corner: the block with its headers replaces the data
  const g = r || c ? grid.value : [['']], block = textGrid(text.trim()).map(row => row.map(v => v.replace(/^"|"$/g, '').trim()))
  const cols = Math.max(g[0].length, c + Math.max(...block.map(b => b.length)))
  while (g.length < r + block.length) g.push([])
  for (const row of g) while (row.length < cols) row.push('')
  block.forEach((row, i) => row.forEach((v, j) => { g[r + i][c + j] = v }))
  save(g)
}
const addRow = () => { const g = grid.value; g.push([t('Category {0}', g.length), ...Array(g[0].length - 1).fill('0')]); save(g) }
const addSeries = () => { const g = grid.value; g.forEach((row, i) => row.push(i ? '0' : t('Series {0}', row.length))); save(g) }
const delRow = r => { const g = grid.value; g.splice(r, 1); props.el.catColors?.splice(r - 1, 1); save(g) }
// a pie slice's colour (null: the default one, by position)
function setSlice(j, c) {
  const cc = props.el.catColors = props.el.categories.map((_, k) => props.el.catColors?.[k] || null)
  cc[j] = c
  if (!cc.some(Boolean)) delete props.el.catColors
}
// a preset recolours everything: the single colours go (they can be set again afterwards)
function setPalette(p) {
  props.el.palette = p || undefined
  delete props.el.catColors
  for (const s of props.el.series) delete s.color
}
const strip = p => `linear-gradient(90deg, ${[0, 1, 2, 3, 4].map(i => `${paletteColor(p, i, accent.value)} ${i * 20}% ${i * 20 + 20}%`).join(', ')})`
// values in percent that don't add up to 100: named, with their sum
const off = computed(() => (props.el.percent ? percentOff(props.el) : []))
const delSeries = c => { props.el.series.splice(c - 1, 1) }
const num = v => (v === '' || !Number.isFinite(+v) ? undefined : +v)
</script>

<template>
  <div class="chart-panel">
    <label class="field">{{ t('Chart type') }}
      <select :value="el.kind" @change="el.kind = $event.target.value"><option v-for="(n, k) in CHART_KINDS" :key="k" :value="k">{{ t(n) }}</option></select></label>
    <label class="field">{{ t('Chart title') }} <input :value="el.title || ''" maxlength="200" :placeholder="t('None')" @change="el.title = $event.target.value.trim() || undefined" /></label>
    <label v-if="el.kind === 'column' || el.kind === 'bar'" class="check"><input type="checkbox" :checked="!!el.stacked" @change="el.stacked = $event.target.checked || undefined" /> {{ t('Stacked') }}</label>
    <label class="check"><input type="checkbox" :checked="el.legend" @change="el.legend = $event.target.checked" /> {{ t('Legend') }}</label>
    <label class="check"><input type="checkbox" :checked="!!el.values" @change="el.values = $event.target.checked || undefined" /> {{ t('Show values') }}</label>
    <div class="field">{{ t('Colors') }}
      <div class="palettes" role="group" :aria-label="t('Colors')">
        <button v-for="p in ['', ...Object.keys(PALETTES)]" :key="p" class="pal" :class="{ on: (el.palette || '') === p }" :style="{ background: strip(p) }" :title="t(p ? PALETTES[p][0] : 'Theme')" :aria-label="t(p ? PALETTES[p][0] : 'Theme')" :aria-pressed="(el.palette || '') === p" @click="setPalette(p)" />
      </div>
    </div>
    <label class="field">{{ t('Values as') }}
      <select :value="el.percent ? 'percent' : 'number'" @change="el.percent = $event.target.value === 'percent' || undefined"><option value="number">{{ t('Numbers') }}</option><option value="percent">{{ t('Percent (%)') }}</option></select></label>
    <div v-if="el.kind !== 'pie' && el.kind !== 'donut'" class="btn-row axis">
      <label class="field">{{ t('Axis minimum') }} <input type="number" :value="el.min ?? ''" :placeholder="t('Auto')" @change="el.min = num($event.target.value)" /></label>
      <label class="field">{{ t('Axis maximum') }} <input type="number" :value="el.max ?? ''" :placeholder="t('Auto')" @change="el.max = num($event.target.value)" /></label>
    </div>
    <div class="field">{{ t('Data (paste from Excel, Sheets or Numbers)') }}
      <div class="chart-grid">
        <table>
          <tr>
            <th />
            <th v-for="(s, i) in el.series" :key="i">
              <div class="btn-row">
                <span v-if="!isPie(el)" class="chip" :style="{ '--chip': seriesColor(el, i, accent) }"><Menu icon="fill" :title="t('Series color')">
                  <div class="swatches pop-sw">
                    <button v-for="c in PALETTE" :key="c" class="sw" :class="{ on: s.color === c }" :style="{ background: c }" :title="c" :aria-label="c" :aria-pressed="s.color === c" @click="s.color = c" />
                    <button class="sw none" :title="t('Theme color')" :aria-label="t('Theme color')" :aria-pressed="!s.color" @click="delete s.color" />
                  </div>
                </Menu></span>
                <button class="ib" :disabled="el.series.length <= 1" :title="t('Remove series')" :aria-label="t('Remove series')" @click="delSeries(i + 1)"><Icon name="x" :size="14" /></button>
              </div>
            </th>
          </tr>
          <tr v-for="(row, r) in grid" :key="r">
            <td v-for="(v, c) in row" :key="c" :class="{ cat: r && !c && isPie(el) }">
              <span v-if="r && !c && isPie(el)" class="chip" :style="{ '--chip': sliceColor(el, r - 1, accent) }"><Menu icon="fill" :title="t('Slice color')">
                <div class="swatches pop-sw">
                  <button v-for="col in PALETTE" :key="col" class="sw" :class="{ on: el.catColors?.[r - 1] === col }" :style="{ background: col }" :title="col" :aria-label="col" :aria-pressed="el.catColors?.[r - 1] === col" @click="setSlice(r - 1, col)" />
                  <button class="sw none" :title="t('Theme color')" :aria-label="t('Theme color')" :aria-pressed="!el.catColors?.[r - 1]" @click="setSlice(r - 1, null)" />
                </div>
              </Menu></span>
              <input :value="v" :inputmode="r && c ? 'decimal' : null" :aria-label="!r && !c ? t('Data (paste from Excel, Sheets or Numbers)') : !r ? t('Series {0}', c) : !c ? t('Category {0}', r) : `${row[0]} · ${grid[0][c]}`"
                @change="setCell(r, c, $event.target.value)" @paste="paste($event, r, c)" />
            </td>
            <td><button v-if="r" class="ib" :disabled="grid.length <= 2" :title="t('Remove category')" :aria-label="t('Remove category')" @click="delRow(r)"><Icon name="x" :size="14" /></button></td>
          </tr>
        </table>
      </div>
      <p v-if="isPie(el) && el.series.length > 1" class="hint">{{ t('A pie chart shows the first series only.') }}</p>
      <p v-for="[name, sum] in off" :key="name" class="hint warn" role="status">{{ t('{0} adds up to {1}%, not 100%.', name || t('Total'), fmt(sum)) }}</p>
      <div class="btn-row add">
        <button class="ib wide" :disabled="el.categories.length >= 100" @click="addRow"><Icon name="plus" /> {{ t('Add category') }}</button>
        <button class="ib wide" :disabled="el.series.length >= 20" @click="addSeries"><Icon name="plus" /> {{ t('Add series') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-panel { display: flex; flex-direction: column; gap: 8px; }
/* side by side when they fit, else one under the other (never on top of each other) */
.add { margin-top: 6px; gap: 6px; }
.add .ib.wide { flex: 1 1 auto; white-space: nowrap; }
.chart-grid td.cat { display: flex; align-items: center; }
.chart-grid td.cat .chip { flex: none; margin-left: 2px; }
.palettes { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.pal { width: 44px; height: 22px; padding: 0; border: 1px solid var(--ui-line-strong); border-radius: 5px; cursor: pointer; }
.pal.on { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
.hint { margin: 4px 0 0; font-size: 12px; color: var(--ui-muted); }
.hint.warn { color: var(--ui-danger); }
.chart-grid th .btn-row { flex-wrap: nowrap; }
.axis { flex-wrap: nowrap; gap: 8px; }
.axis .field { flex: 1; min-width: 0; }
.axis input { width: 100%; }
.chart-grid { overflow-x: auto; max-height: 320px; overflow-y: auto; border: 1px solid var(--ui-line); border-radius: 6px; }
.chart-grid table { border-collapse: collapse; }
.chart-grid td, .chart-grid th { padding: 0; border: 1px solid var(--ui-line); }
.chart-grid th { padding: 2px; font-weight: 400; }
.chart-grid input { width: 72px; border: 0; border-radius: 0; padding: 4px 6px; background: transparent; color: var(--ui-fg); font: inherit; font-size: 12px; }
.chart-grid input:focus { outline: 2px solid var(--ui-accent); outline-offset: -2px; }
.chart-grid tr > td:first-child input { font-weight: 600; }
</style>
