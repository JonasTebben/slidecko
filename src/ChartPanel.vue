<script setup>
import { computed, toRaw } from 'vue'
import Icon from './Icon.vue'
import Menu from './Menu.vue'
import { deck, cleanEl } from './store.js'
import { themeOf } from './themes.js'
import { CHART_KINDS, toGrid, applyGrid, seriesColor } from './chart.js'
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
const delRow = r => { const g = grid.value; g.splice(r, 1); save(g) }
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
                <span class="chip" :style="{ '--chip': seriesColor(el, i, accent) }"><Menu icon="fill" :title="t('Series color')">
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
            <td v-for="(v, c) in row" :key="c">
              <input :value="v" :inputmode="r && c ? 'decimal' : null" :aria-label="!r && !c ? t('Data (paste from Excel, Sheets or Numbers)') : !r ? t('Series {0}', c) : !c ? t('Category {0}', r) : `${row[0]} · ${grid[0][c]}`"
                @change="setCell(r, c, $event.target.value)" @paste="paste($event, r, c)" />
            </td>
            <td><button v-if="r" class="ib" :disabled="grid.length <= 2" :title="t('Remove category')" :aria-label="t('Remove category')" @click="delRow(r)"><Icon name="x" :size="14" /></button></td>
          </tr>
        </table>
      </div>
      <div class="btn-row">
        <button class="ib wide" :disabled="el.categories.length >= 100" @click="addRow"><Icon name="plus" /> {{ t('Add category') }}</button>
        <button class="ib wide" :disabled="el.series.length >= 20" @click="addSeries"><Icon name="plus" /> {{ t('Add series') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-panel { display: flex; flex-direction: column; gap: 8px; }
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
