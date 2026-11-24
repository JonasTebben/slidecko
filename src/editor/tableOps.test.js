import test from 'node:test'
import assert from 'node:assert/strict'
// tableOps pulls in the store, which wants a browser: just enough of one
globalThis.document = { activeElement: null, createElement: () => ({}), querySelector: () => null }
globalThis.indexedDB = { open: () => ({}) }
const { setBorder, borderOn, toggleBorder, area, setFill, setAlign, clearCells, deleteRow, deleteCol, cellPaste } = await import('./tableOps.js')
const { ui } = await import('../core/store.js')
const L = '2px solid #000'
test('setBorder', () => {
  const el = { rows: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']], align: ['', '', ''] }
  ui.cell = { r: 1, c: 1 }
  setBorder(el, 'outer', L, 'cell')
  assert.deepEqual(el.borders[1][1], [L, L, L, L])
  assert.equal(el.borders[0][1][2], L); assert.equal(el.borders[1][0][1], L) // neighbours share the edge
  assert.equal(el.borders[0][0].join(''), '')
  setBorder(el, 'none', L, 'cell')
  assert.equal(el.borders, undefined) // nothing left: back to the preset
  setBorder(el, 'inner', L, 'table')
  assert.deepEqual(el.borders[0][0], ['', L, L, ''])
  assert.deepEqual(el.borders[2][2], [L, '', '', L])
  setBorder(el, 'bottom', L, 'row')
  assert.deepEqual(el.borders[1].map(b => b[2]), [L, L, L])
})

test('borderOn reports the lines around the current cell, including those its neighbours draw', () => {
  const el = { rows: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']], align: ['', '', ''] }
  ui.cell = { r: 1, c: 1 }
  assert.equal(borderOn(el, 'none'), true)
  assert.equal(borderOn(el, 'outer'), false)
  ui.cell = { r: 0, c: 1 }; setBorder(el, 'bottom', L, 'cell') // drawn by the cell above
  ui.cell = { r: 1, c: 1 }
  assert.equal(borderOn(el, 'top'), true)
  assert.equal(borderOn(el, 'none'), false)
  assert.equal(borderOn(el, 'outer'), false)
  assert.equal(borderOn(el, 'inner'), false) // a single cell has no inside
  setBorder(el, 'all', L, 'table')
  assert.equal(borderOn(el, 'outer', 'table'), true)
  assert.equal(borderOn(el, 'inner', 'table'), true)
  assert.equal(borderOn(el, 'left'), true)
})

test('a second click with the same line removes it, a different line restyles it', () => {
  const el = { rows: [['a', 'b'], ['c', 'd']], align: ['', ''] }
  ui.cell = { r: 0, c: 0 }
  toggleBorder(el, 'outer', L, 'table')
  assert.equal(borderOn(el, 'outer', 'table'), true)
  const red = '2px solid #f00'
  toggleBorder(el, 'outer', red, 'table') // other pen: restyle, keep
  assert.equal(el.borders[0][0][0], red)
  toggleBorder(el, 'outer', red, 'table') // same pen: off
  assert.equal(el.borders, undefined)
  toggleBorder(el, 'bottom', L, 'cell'); toggleBorder(el, 'right', L, 'cell')
  ui.cell = { r: 1, c: 0 }
  toggleBorder(el, 'top', L, 'cell') // drawn by the cell above: the same edge, so it goes
  assert.equal(borderOn(el, 'top'), false)
  ui.cell = { r: 0, c: 0 }
  assert.equal(borderOn(el, 'right'), true) // the other line stays
})

test('marked cells: fill, borders, alignment, delete and clear work on the whole range', async () => {
  const grid = () => ({ rows: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']], align: ['', '', ''], h: 90 })
  let el = grid()
  ui.cell = { r: 1, c: 2 }; ui.cellEnd = { r: 0, c: 1 } // dragged up-left: corners in any order
  assert.deepEqual(area(el), [0, 1, 1, 2])
  assert.deepEqual(area(el, 'row'), [0, 1, 0, 2])
  setFill(el, '#ff0000')
  assert.deepEqual(el.fills.map(r => r.map(f => (f ? 1 : 0))), [[0, 1, 1], [0, 1, 1], [0, 0, 0]])
  setBorder(el, 'outer', L)
  assert.equal(borderOn(el, 'outer'), true)
  assert.deepEqual(el.borders[0][1], [L, '', '', L])
  assert.equal(el.borders[1][0][1], L) // the neighbour left of the range shares the edge
  setAlign(el, 'right')
  assert.deepEqual(el.align, ['', 'right', 'right'])
  clearCells(el)
  assert.deepEqual(el.rows, [['a', '', ''], ['d', '', ''], ['g', 'h', 'i']])
  el = grid(); ui.cell = { r: 0, c: 0 }; ui.cellEnd = { r: 1, c: 0 }
  await deleteRow(el)
  assert.deepEqual(el.rows, [['g', 'h', 'i']])
  el = grid(); ui.cell = { r: 0, c: 0 }; ui.cellEnd = { r: 2, c: 2 }
  await deleteCol(el) // one column always stays
  assert.deepEqual(el.rows, [['c'], ['f'], ['i']])
  ui.cellEnd = null
})

test('pasting into marked cells: one value fills them all, a fitting block repeats, others go to the top-left', () => {
  const paste = (el, text) => cellPaste({ preventDefault() {}, clipboardData: { getData: k => (k === 'text/plain' ? text : '') }, target: { dataset: { r: ui.cell.r, c: ui.cell.c } } }, el)
  const grid = () => ({ rows: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']], align: ['', '', ''], h: 90 })
  let el = grid()
  ui.cell = { r: 1, c: 1 }; ui.cellEnd = { r: 2, c: 2 }
  paste(el, 'x')
  assert.deepEqual(el.rows, [['a', 'b', 'c'], ['d', 'x', 'x'], ['g', 'x', 'x']])
  el = grid(); ui.cell = { r: 0, c: 0 }; ui.cellEnd = { r: 1, c: 2 }
  paste(el, '1\t2\t3') // a row, twice
  assert.deepEqual(el.rows, [['1', '2', '3'], ['1', '2', '3'], ['g', 'h', 'i']])
  el = grid(); ui.cell = { r: 1, c: 1 }; ui.cellEnd = { r: 0, c: 0 }
  paste(el, '1\t2\t3\n4\t5\t6\n7\t8\t9') // bigger than the marking: once, from its top-left cell
  assert.deepEqual(el.rows, [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']])
  ui.cellEnd = null
})

test('Tab in the last cell adds a row and goes to its first cell', async () => {
  const { cellKey } = await import('./tableOps.js')
  globalThis.getSelection ??= () => ({ rangeCount: 0 })
  const el = { id: 'tab', rows: [['a', 'b'], ['c', 'd']], align: ['', ''], h: 60 }
  ui.cell = { r: 1, c: 1 }
  await cellKey({ key: 'Tab', target: { dataset: { r: '1', c: '1' } }, preventDefault() {} }, el)
  assert.equal(el.rows.length, 3)
  assert.deepEqual(ui.cell, { r: 2, c: 0 })
})
