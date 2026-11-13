<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { ui, clean } from './store.js'
import { cellKey, cellPaste, cellCopy, mirrorCells, area, insertRow, deleteRow, insertCol, deleteCol } from './tableOps.js'
import { typed, autoList } from './lists.js'
import { t } from './i18n.js'

// A table element. While editing, every cell is editable; Tab/arrows move between cells,
// pasted spreadsheet data fills the grid, and the column borders can be dragged.
const props = defineProps({ el: Object, editing: Boolean, selected: Boolean, scale: { type: Number, default: 1 } })

// --- selected: the box follows the table's real height, and row/column handles appear ---
const tableRef = ref()
const grid = ref({ cols: [], rows: [] }) // [start, size] of each column / row in slide px
let ro
function measure() {
  const t = tableRef.value
  if (!t?.rows.length) return
  grid.value = {
    cols: [...t.rows[0].cells].map(c => [c.offsetLeft, c.offsetWidth]),
    rows: [...t.rows].map(r => [r.offsetTop, r.offsetHeight]),
  }
  // content taller than the box (long cell text, bigger font): grow the element, else the
  // selection frame and handles end in the middle of the table
  if (t.offsetHeight > props.el.h + 1) props.el.h = Math.ceil(t.offsetHeight)
}
watch(() => props.selected, on => {
  ro?.disconnect()
  if (on && tableRef.value) { ro = new ResizeObserver(measure); ro.observe(tableRef.value); measure() }
}, { flush: 'post', immediate: true })
onBeforeUnmount(() => ro?.disconnect())
// the toolbar ops work on ui.cell; point it at the row/column the handle belongs to
function op(fn, r, c, where) {
  ui.cell = { r, c }
  ui.cellEnd = null
  ui.editing = props.el.id // the new cell gets the caret
  fn(props.el, where)
}
const inv = computed(() => ({ transform: `scale(${1 / props.scale})` })) // handles keep their screen size
const head = computed(() => (props.el.header ? props.el.rows.slice(0, 1) : []))
const body = computed(() => props.el.rows.slice(head.value.length))
const offset = computed(() => head.value.length)
// a cell's colour and its own borders (tables imported from PowerPoint/ODP)
const look = (r, c) => {
  const b = props.el.borders?.[r]?.[c]
  return { textAlign: props.el.align?.[c] || null, background: props.el.fills?.[r]?.[c] || null, borderTop: b?.[0] || null, borderRight: b?.[1] || null, borderBottom: b?.[2] || null, borderLeft: b?.[3] || null }
}

// --- marking several cells: shift-click from the current cell, or drag across cells ---
const marked = computed(() => (props.editing && ui.cellEnd ? area(props.el) : null))
const isMarked = (r, c) => { const m = marked.value; return !!m && r >= m[0] && r <= m[1] && c >= m[2] && c <= m[3] }
watch(() => props.editing, on => { if (!on) ui.cellEnd = null })
// typing fills the marked cells only until the marking or the current cell changes
watch(() => [ui.cell?.r, ui.cell?.c, ui.cellEnd?.r, ui.cellEnd?.c], () => { ui.cellFill = false })
function down(e, r, c) {
  if (!props.editing || e.button) return
  if (e.shiftKey && ui.cell) { e.preventDefault(); ui.cellEnd = r === ui.cell.r && c === ui.cell.c ? null : { r, c }; return } // the caret stays put
  const table = tableRef.value
  const move = ev => {
    const td = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-r]')
    if (!td || !table.contains(td)) return
    const to = { r: +td.dataset.r, c: +td.dataset.c }
    if (to.r === r && to.c === c) { ui.cellEnd = null; return }
    ui.cellEnd = to
    getSelection().removeAllRanges() // a cell range, not a text selection across cells
  }
  addEventListener('pointermove', move)
  addEventListener('pointerup', () => removeEventListener('pointermove', move), { once: true })
}
function focused(r, c) {
  ui.cell = { r, c }
  ui.cellEnd = null
}

function commit(e) {
  const { r, c } = e.target.dataset
  const html = clean(e.target.innerHTML)
  if (props.el.rows[r]?.[c] !== html) props.el.rows[r][c] = html
}

// column borders: positions in percent of the table width
const borders = computed(() => {
  const w = props.el.widths
  if (!w) return Array.from({ length: (props.el.rows[0]?.length || 1) - 1 }, (_, i) => ((i + 1) * 100) / props.el.rows[0].length)
  let acc = 0
  return w.slice(0, -1).map(x => (acc += x))
})
function resizeCol(e, i) {
  const table = e.target.parentElement.querySelector('table')
  const total = table.offsetWidth
  const n = props.el.rows[0].length
  if (!props.el.widths) props.el.widths = [...table.rows[0].cells].map(c => Math.round((c.offsetWidth / total) * 1000) / 10)
  const start = [...props.el.widths]
  const move = ev => {
    const d = ((ev.clientX - e.clientX) / props.scale / total) * 100
    const a = Math.max(4, Math.min(start[i] + start[i + 1] - 4, start[i] + d))
    props.el.widths[i] = Math.round(a * 10) / 10
    props.el.widths[i + 1] = Math.round((start[i] + start[i + 1] - a) * 10) / 10
  }
  addEventListener('pointermove', move)
  addEventListener('pointerup', () => removeEventListener('pointermove', move), { once: true })
  void n
}
</script>

<template>
  <div class="tbl-wrap" :data-table="el.preset || 'theme'" :data-borders="el.borders ? '' : null" :data-firstcol="el.firstCol ? '' : null" :data-compact="el.compact ? '' : null">
    <table ref="tableRef">
      <colgroup v-if="el.widths"><col v-for="(w, i) in el.widths" :key="i" :style="{ width: w + '%' }" /></colgroup>
      <thead v-if="head.length">
        <tr>
          <th v-for="(cell, c) in head[0]" :key="c" v-html="cell" :data-r="0" :data-c="c" :class="{ marked: isMarked(0, c) }" :style="look(0, c)"
            :contenteditable="editing" @focus="focused(0, c)" @pointerdown="down($event, 0, c)" @copy="cellCopy($event, el)" @cut="cellCopy($event, el, true)" @blur="commit" @keydown="cellKey($event, el)" @input="typed($event.target, $event); autoList($event.target, $event); mirrorCells($event.target, el)" @paste="cellPaste($event, el)" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, r) in body" :key="r">
          <td v-for="(cell, c) in row" :key="c" v-html="cell" :data-r="r + offset" :data-c="c" :style="look(r + offset, c)"
            :class="{ current: editing && ui.cell?.r === r + offset && ui.cell?.c === c, marked: isMarked(r + offset, c) }"
            :contenteditable="editing" @focus="focused(r + offset, c)" @pointerdown="down($event, r + offset, c)" @copy="cellCopy($event, el)" @cut="cellCopy($event, el, true)" @blur="commit" @keydown="cellKey($event, el)" @input="typed($event.target, $event); autoList($event.target, $event); mirrorCells($event.target, el)" @paste="cellPaste($event, el)" />
        </tr>
      </tbody>
    </table>
    <template v-if="selected && grid.cols.length">
      <div class="tbl-bar cols" @pointerdown.stop>
        <span v-for="([x, w], c) in grid.cols" :key="'c' + c" class="tbl-chip" :style="{ left: x + 'px', width: w + 'px' }">
          <button v-if="grid.cols.length > 1" class="tbl-btn del" :style="inv" :title="t('Spalte löschen')" @click="op(deleteCol, 0, c)">−</button>
        </span>
        <button v-for="(b, i) in grid.cols.length + 1" :key="'ci' + i" class="tbl-btn add" :style="{ ...inv, left: (i < grid.cols.length ? grid.cols[i][0] : grid.cols.at(-1)[0] + grid.cols.at(-1)[1]) + 'px' }"
          :title="t('Spalte einfügen')" @click="op(insertCol, 0, Math.max(0, i - 1), i === 0 ? 'left' : 'right')">+</button>
      </div>
      <div class="tbl-bar rows" @pointerdown.stop>
        <span v-for="([y, h], r) in grid.rows" :key="'r' + r" class="tbl-chip" :style="{ top: y + 'px', height: h + 'px' }">
          <button v-if="grid.rows.length > 1" class="tbl-btn del" :style="inv" :title="t('Zeile löschen')" @click="op(deleteRow, r, 0)">−</button>
        </span>
        <button v-for="(b, i) in grid.rows.length + 1" :key="'ri' + i" class="tbl-btn add" :style="{ ...inv, top: (i < grid.rows.length ? grid.rows[i][0] : grid.rows.at(-1)[0] + grid.rows.at(-1)[1]) + 'px' }"
          :title="t('Zeile einfügen')" @click="op(insertRow, Math.max(0, i - 1), 0, i === 0 ? 'above' : 'below')">+</button>
      </div>
    </template>
    <template v-if="editing">
      <i v-for="(x, i) in borders" :key="i" class="col-resize" :style="{ left: x + '%' }" :title="t('Spaltenbreite ziehen')" @pointerdown.stop.prevent="resizeCol($event, i)" />
    </template>
  </div>
</template>
