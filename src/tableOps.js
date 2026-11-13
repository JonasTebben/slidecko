import { toggleList, undoList, indent } from './lists.js'
import { nextTick } from 'vue'
import { ui, clean } from './store.js'
import { pasteHtml, pasteTable } from './paste.js'

// Table editing operations, shared by the table element (keyboard, paste) and the inspector.
// A table is { rows: [[cellHtml]], header, align: [per column], widths?: [percent], fills?: [[colour | '']] }.
// fills mirrors rows cell by cell, so every operation that moves cells moves their colours too;
// borders?: [[[top, right, bottom, left]]] likewise, and new cells copy their neighbour's lines.

const cellNode = (el, r, c) => document.querySelector(`.stage [data-el="${el.id}"] [data-r="${r}"][data-c="${c}"]`)

// writes the cell that is being typed in back to the model (cells commit on blur, but toolbar
// buttons keep the focus)
export function commitActive(el) {
  const a = document.activeElement
  if (a?.dataset?.r == null || !a.closest(`[data-el="${el.id}"]`)) return
  el.rows[+a.dataset.r][+a.dataset.c] = clean(a.innerHTML)
}

export async function focusCell(el, r, c, end = false) {
  ui.cell = { r, c }
  ui.cellEnd = null
  await nextTick()
  const n = cellNode(el, r, c)
  if (!n) return
  n.focus()
  if (end) getSelection().selectAllChildren(n), getSelection().collapseToEnd()
}

const rowH = el => el.h / Math.max(1, el.rows.length)
const cols = el => el.rows[0]?.length || 0
const at = el => ui.cell && ui.cell.r < el.rows.length && ui.cell.c < cols(el) ? ui.cell : { r: el.rows.length - 1, c: cols(el) - 1 }
// the marked cells [r0, r9, c0, c9]: from the current cell (ui.cell) to the other corner (ui.cellEnd: shift-click,
// drag, shift+arrows), widened to whole rows/columns/the table by scope
export function area(el, scope = 'cell') {
  const { r, c } = at(el), e = ui.cellEnd && ui.cellEnd.r < el.rows.length && ui.cellEnd.c < cols(el) ? ui.cellEnd : { r, c }
  const [r0, r9, c0, c9] = [Math.min(r, e.r), Math.max(r, e.r), Math.min(c, e.c), Math.max(c, e.c)], R = el.rows.length - 1, C = cols(el) - 1
  return scope === 'table' ? [0, R, 0, C] : scope === 'row' ? [r0, r9, 0, C] : scope === 'col' ? [0, R, c0, c9] : [r0, r9, c0, c9]
}
const several = el => { const [r0, r9, c0, c9] = area(el); return r9 > r0 || c9 > c0 }

export function insertRow(el, where) { // where: 'above' | 'below' | index
  commitActive(el)
  const { r, c } = at(el)
  let i = where === 'above' ? r : where === 'below' ? r + 1 : where
  if (el.header && i === 0) i = 1 // never push the header down
  el.rows.splice(i, 0, Array(cols(el)).fill(''))
  el.fills?.splice(i, 0, Array(cols(el)).fill(''))
  el.borders?.splice(i, 0, el.borders[Math.max(0, i - 1)].map(b => [b[2], b[1], b[2], b[3]])) // the row above's inside lines
  el.h = Math.round(el.h + rowH(el))
  return focusCell(el, i, Math.min(c, cols(el) - 1))
}
export function deleteRow(el) { // every marked row; one always stays
  commitActive(el)
  const [r, r9] = area(el), n = Math.min(r9 - r + 1, el.rows.length - 1), { c } = at(el)
  if (n < 1) return
  el.h = Math.max(30, Math.round(el.h - n * rowH(el)))
  el.rows.splice(r, n)
  el.fills?.splice(r, n)
  el.borders?.splice(r, n)
  return focusCell(el, Math.min(r, el.rows.length - 1), c)
}
export function insertCol(el, where) { // 'left' | 'right'
  commitActive(el)
  const { r, c } = at(el)
  const i = where === 'left' ? c : c + 1
  for (const row of [...el.rows, ...(el.fills || [])]) row.splice(i, 0, '')
  for (const row of el.borders || []) { const b = row[Math.max(0, i - 1)]; row.splice(i, 0, [b[0], b[1], b[2], b[1]]) } // the left column's inside lines
  el.align.splice(i, 0, '')
  if (el.widths) {
    el.widths.splice(i, 0, 100 / cols(el))
    normalize(el)
  }
  return focusCell(el, r, i)
}
export function deleteCol(el) { // every marked column; one always stays
  commitActive(el)
  const [, , c, c9] = area(el), n = Math.min(c9 - c + 1, cols(el) - 1), { r } = at(el)
  if (n < 1) return
  for (const row of [...el.rows, ...(el.fills || []), ...(el.borders || [])]) row.splice(c, n)
  el.align.splice(c, n)
  if (el.widths) {
    el.widths.splice(c, n)
    normalize(el)
  }
  return focusCell(el, r, Math.min(c, cols(el) - 1))
}
function normalize(el) {
  const sum = el.widths.reduce((a, b) => a + b, 0)
  el.widths = el.widths.map(w => Math.round((w / sum) * 1000) / 10)
}
export function setAlign(el, align) { // every marked column, toggled by the current one
  const { c } = at(el), [, , c0, c9] = area(el), v = el.align[c] === align ? '' : align
  for (let j = c0; j <= c9; j++) el.align[j] = v
}
export function sortBy(el, dir) {
  commitActive(el)
  const { c } = at(el)
  const n = el.header ? 1 : 0
  const text = h => h.replace(/<[^>]+>/g, '').trim()
  const coll = new Intl.Collator('de', { numeric: true })
  // sort row indices, so a row keeps its colours (borders stay put: outer lines belong to the table edge)
  const order = el.rows.map((_, i) => i).slice(n).sort((a, b) => dir * coll.compare(text(el.rows[a][c]), text(el.rows[b][c])))
  const pick = grid => [...grid.slice(0, n), ...order.map(i => grid[i])]
  el.rows = pick(el.rows)
  if (el.fills) el.fills = pick(el.fills)
}
// colours the marked cells, their rows or columns, or the table ('' removes the colour)
export function setFill(el, color, scope = 'cell') {
  commitActive(el)
  const [r0, r9, c0, c9] = area(el, scope)
  const fills = el.rows.map((row, i) => row.map((_, j) => (i >= r0 && i <= r9 && j >= c0 && j <= c9 ? color : el.fills?.[i]?.[j] || '')))
  el.fills = fills.some(row => row.some(Boolean)) ? fills : undefined
}

// draws lines around/inside the current cell, its row or column, or the whole table, like PowerPoint's border menu.
// mode: 'all' | 'outer' | 'inner' | 'top' | 'bottom' | 'left' | 'right' | 'none'; line: "1px solid #000" ('' clears).
// Neighbours across an edge get the same line on their side, so a cleared edge is really gone (borders collapse).
// The first own line replaces the preset's lines; none left -> back to the preset.
const D = [[-1, 0, 2], [0, 1, 3], [1, 0, 0], [0, -1, 1]] // per side (top, right, bottom, left): neighbour offset and its facing side
// the cell sides [i, j, k] a border mode covers in the scope around the current cell
function borderSides(el, mode, scope) {
  const [r0, r9, c0, c9] = area(el, scope)
  const out = []
  for (let i = r0; i <= r9; i++) for (let j = c0; j <= c9; j++) {
    const edge = [i === r0, j === c9, i === r9, j === c0]
    for (let k = 0; k < 4; k++) {
      if ({ all: true, none: true, outer: edge[k], inner: !edge[k], top: k === 0 && edge[0], right: k === 1 && edge[1], bottom: k === 2 && edge[2], left: k === 3 && edge[3] }[mode]) out.push([i, j, k])
    }
  }
  return out
}
// a second click with the same line removes it again; a different line restyles the edges instead
export function toggleBorder(el, mode, line, scope = 'cell') {
  const sides = borderSides(el, mode, scope)
  const same = mode !== 'none' && sides.length > 0 && sides.every(s => edgeLine(el, s) === line)
  return setBorder(el, mode, same ? '' : line, scope)
}
// the line drawn on a cell side: its own, else the neighbour's on the same edge (borders collapse)
const edgeLine = (el, [i, j, k]) => { const [di, dj, o] = D[k]; return el.borders?.[i]?.[j]?.[k] || el.borders?.[i + di]?.[j + dj]?.[o] || '' }
export function setBorder(el, mode, line, scope = 'cell') {
  commitActive(el)
  const b = el.rows.map((row, i) => row.map((_, j) => [...(el.borders?.[i]?.[j] || ['', '', '', ''])]))
  for (const [i, j, k] of borderSides(el, mode, scope)) {
    const v = mode === 'none' ? '' : line, [di, dj, o] = D[k]
    b[i][j][k] = v
    if (b[i + di]?.[j + dj]) b[i + di][j + dj][o] = v
  }
  el.borders = b.some(row => row.some(s => s.some(Boolean))) ? b : undefined
}
// is the mode what the scope shows now? an edge is drawn when either cell on it has the line (borders collapse);
// 'none' when no covered edge is drawn. Empty modes (inner of a single cell) are never on.
export function borderOn(el, mode, scope = 'cell') {
  if (!el.borders) return mode === 'none'
  const drawn = s => !!edgeLine(el, s)
  const sides = borderSides(el, mode, scope)
  return mode === 'none' ? !sides.some(drawn) : sides.length > 0 && sides.every(drawn)
}

// several marked cells: Delete/Backspace empties them, copying gives a grid (tab-separated text and an HTML table,
// so it pastes into Excel/Numbers/Docs and back into a table here). One cell: the browser's usual text editing.
export function clearCells(el) {
  const [r0, r9, c0, c9] = area(el)
  for (let i = r0; i <= r9; i++) for (let j = c0; j <= c9; j++) el.rows[i][j] = ''
  const n = cellNode(el, ui.cell?.r, ui.cell?.c)
  if (n) n.innerHTML = '' // the focused cell is not re-rendered from the model while it has the caret
}
// typing into several marked cells: the first key empties them all, then whatever the current cell holds is
// copied into the others as it is typed (cellFill ends when the marking or the current cell changes)
function startFill(el) {
  clearCells(el)
  const n = cellNode(el, ui.cell?.r, ui.cell?.c)
  if (n) { const rg = document.createRange(); rg.selectNodeContents(n); rg.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(rg) }
  ui.cellFill = true
}
export function mirrorCells(node, el) {
  if (!ui.cellFill || !several(el)) return
  const html = clean(node.innerHTML), [r0, r9, c0, c9] = area(el), { r, c } = at(el)
  for (let i = r0; i <= r9; i++) for (let j = c0; j <= c9; j++) if (i !== r || j !== c) el.rows[i][j] = html
}
export function cellCopy(e, el, cut = false) {
  if (!several(el)) return
  e.preventDefault()
  commitActive(el)
  const [r0, r9, c0, c9] = area(el), grid = el.rows.slice(r0, r9 + 1).map(row => row.slice(c0, c9 + 1))
  const text = h => { const d = document.createElement('div'); d.innerHTML = h.replace(/<br\s*\/?>/gi, ' '); return d.textContent.replace(/\s+/g, ' ').trim() }
  e.clipboardData.setData('text/plain', grid.map(row => row.map(text).join('\t')).join('\n'))
  e.clipboardData.setData('text/html', `<table>${grid.map(row => `<tr>${row.map(h => `<td>${h}</td>`).join('')}</tr>`).join('')}</table>`)
  if (cut) clearCells(el)
}

// keyboard navigation like in spreadsheet/office tables
export function cellKey(e, el) {
  const r = +e.target.dataset.r, c = +e.target.dataset.c
  // lists in a cell: the same keys as in a text box; Tab only indents inside a list item, else it moves on
  const mod = e.metaKey || e.ctrlKey
  if (mod && e.shiftKey && (e.code === 'Digit7' || e.code === 'Digit8')) { e.preventDefault(); return toggleList(e.target, e.code === 'Digit7' ? 'ol' : 'ul') }
  if (mod && (e.code === 'KeyZ' || (e.code === 'KeyY' && !e.shiftKey)) && undoList(e.target, e.shiftKey || e.code === 'KeyY')) return e.preventDefault()
  if (e.key === 'Tab' && !mod && !e.altKey && indent(e.target, e.shiftKey)) return e.preventDefault()
  if (e.key === 'Tab') {
    e.preventDefault()
    commitActive(el)
    const n = r * cols(el) + c + (e.shiftKey ? -1 : 1)
    if (n < 0) return
    if (n >= el.rows.length * cols(el)) return insertRow(el, el.rows.length)
    return focusCell(el, Math.floor(n / cols(el)), n % cols(el))
  }
  const sel = getSelection()
  const atEdge = dir => {
    if (!sel.rangeCount || !sel.isCollapsed) return false
    const range = document.createRange()
    range.selectNodeContents(e.target)
    range.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset)
    const before = range.toString().length
    return dir < 0 ? before === 0 : before === e.target.textContent.length
  }
  const move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key]
  // shift+arrows mark cells: up/down always, left/right once the caret is at the cell's edge or cells are marked
  if (move && e.shiftKey && !mod && (move[0] || ui.cellEnd || atEdge(move[1]))) {
    const from = ui.cellEnd || { r, c }, to = { r: Math.max(0, Math.min(el.rows.length - 1, from.r + move[0])), c: Math.max(0, Math.min(cols(el) - 1, from.c + move[1])) }
    e.preventDefault()
    ui.cellEnd = to.r === r && to.c === c ? null : to
    return
  }
  if (several(el) && !ui.cellFill) {
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return clearCells(el) }
    // a character (also ⌥ ones like @ on a Mac, and dead keys for ^ ´ …): it replaces every marked cell
    if ((e.key.length === 1 || e.key === 'Dead') && !e.metaKey && !(e.ctrlKey && !e.altKey)) return startFill(el)
  }
  if (move && !e.shiftKey && (move[0] || atEdge(move[1]))) {
    const [nr, nc] = [r + move[0], c + move[1]]
    if (nr < 0 || nr >= el.rows.length || nc < 0 || nc >= cols(el)) return
    e.preventDefault()
    commitActive(el)
    return focusCell(el, nr, nc, move[1] < 0 || move[0] !== 0)
  }
  if (e.key === 'Escape' && ui.cellEnd) { e.preventDefault(); ui.cellEnd = null; return } // first Escape drops the marking
  if (e.key === 'Escape') { e.preventDefault(); e.target.blur(); ui.editing = null }
}

// pasting: a grid (tab- or semicolon-separated text, or an HTML table) fills the table from the cursor and grows it as
// needed; formatted text goes into the cell as it is
export function cellPaste(e, el) {
  e.preventDefault()
  const text = e.clipboardData.getData('text/plain'), html = e.clipboardData.getData('text/html')
  const esc = s => s.replace(/^"|"$/g, '').trim().replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const plain = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(l => l.split(l.includes('\t') ? '\t' : /;(?=(?:[^"]*"[^"]*")*[^"]*$)/))
  const rich = html ? pasteTable(html) || [[{ html: pasteHtml(html, true) }]] : null
  // a table in the HTML; formatted text without one is one cell (Word paragraphs become line breaks), unless its
  // plain text is tab-separated (a grid from an app that copies no table); else the text's grid
  const grid = rich && (rich.length > 1 || rich[0].length > 1 || !text.includes('\t')) ? rich : plain.map(r => r.map(v => ({ html: esc(v) })))
  const put = (i, j, v) => {
    el.rows[i][j] = v.html
    // a pasted table cell brings its colour, also "none"; plain text keeps the cell's colour
    if (v.fill !== undefined && (v.fill || el.fills)) { el.fills ||= el.rows.map(row => row.map(() => '')); el.fills[i][j] = v.fill }
  }
  let r0 = +e.target.dataset.r, c0 = +e.target.dataset.c
  // several marked cells (not while typing into them): like Excel, one value fills them all and a block repeats
  // when the marking is a whole multiple of it; any other block is pasted once from the marking's top-left cell
  if (several(el) && !ui.cellFill) {
    const [a0, a9, b0, b9] = area(el), gw = Math.max(...grid.map(g => g.length))
    commitActive(el)
    if ((a9 - a0 + 1) % grid.length === 0 && (b9 - b0 + 1) % gw === 0) {
      for (let i = a0; i <= a9; i++) for (let j = b0; j <= b9; j++) put(i, j, grid[(i - a0) % grid.length][(j - b0) % gw] || { html: '' })
      return
    }
    ;[r0, c0] = [a0, b0]
  } else if (grid.length < 2 && grid[0].length < 2) {
    // one piece into the cell at the caret; the browser's own insert keeps undo working
    return rich ? document.execCommand('insertHTML', false, grid[0][0].html) : document.execCommand('insertText', false, text)
  }
  commitActive(el)
  while (el.rows.length < r0 + grid.length) { el.rows.push(Array(cols(el)).fill('')); el.h = Math.round(el.h + rowH(el)) }
  const need = c0 + Math.max(...grid.map(g => g.length))
  while (cols(el) < need) { for (const row of el.rows) row.push(''); el.align.push(''); if (el.widths) el.widths.push(100 / cols(el)) }
  if (el.widths) normalize(el)
  if (el.fills) el.fills = el.rows.map((row, i) => row.map((_, j) => el.fills[i]?.[j] || ''))
  if (el.borders) el.borders = el.rows.map((row, i) => row.map((_, j) => el.borders[i]?.[j] || ['', '', '', '']))
  grid.forEach((g, r) => g.forEach((v, c) => put(r0 + r, c0 + c, v)))
  focusCell(el, r0, c0)
}
