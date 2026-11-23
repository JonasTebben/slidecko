import { clean } from './store.js'

// Formatting of pasted HTML (Word, Google Docs/Sheets, Excel, Numbers, web pages, the editor itself) as the HTML
// the editor writes. Kept: bold, italic, underline, strike, text colour, links, paragraphs, line breaks, lists
// (also Word's, which are paragraphs with a typed bullet) and the colour of pasted table cells.
// Dropped: fonts, sizes, layout. Excel puts its formats into CSS classes, so <style> rules count like inline styles.

const PARA = /^(P|DIV|H[1-6]|BLOCKQUOTE|PRE|TR|TABLE|SECTION|ARTICLE|DD|DT)$/
const PLAIN = /^(windowtext|black|auto|inherit|initial|currentcolor|transparent|#000|#000000|rgb\(0,\s*0,\s*0\))$/i // default text colour: the theme's
const BLANK = /^(white|transparent|initial|inherit|none|#fff|#ffffff|rgba?\(255,\s*255,\s*255(,\s*1)?\)|rgba\(.*,\s*0\))$/i // default cell background
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') // also into attributes (href)

function parse(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const sheet = new CSSStyleSheet()
  try { sheet.replaceSync([...doc.querySelectorAll('style')].map(n => n.textContent).join('\n')) } catch { /* unparsable CSS: inline styles only */ }
  const rules = [...sheet.cssRules].filter(r => r.selectorText)
  // an element's own declarations: matching style rules, then its style attribute
  const own = n => {
    const out = {}
    for (const r of rules) { try { if (n.matches(r.selectorText)) for (const k of r.style) out[k] = r.style.getPropertyValue(k) } catch { /* selector the DOM rejects */ } }
    for (const k of n.style || []) out[k] = n.style.getPropertyValue(k)
    return out
  }
  return { doc, own }
}

// the content of a node as blocks { kind: 'p' | 'ul' | 'ol', level, runs: [[text, format]] }
function blocks(root, own) {
  const out = []
  let cur = null
  const start = (kind, level = 0) => { cur = { kind, level, runs: [] }; out.push(cur) }
  const walk = (n, f, depth) => {
    if (n.nodeType === 3) {
      const t = n.data.replace(/\s+/g, ' ')
      if (t.trim() || cur?.runs.length) { if (!cur) start('p'); cur.runs.push([t, f]) }
      return
    }
    if (n.nodeType !== 1 || /^(STYLE|SCRIPT|HEAD|TITLE|META|LINK)$/.test(n.tagName)) return
    const raw = n.getAttribute('style') || ''
    if (/mso-list:\s*ignore/i.test(raw)) return // Word's typed bullet or number
    if (n.tagName === 'BR') { if (!cur) start('p'); cur.runs.push(['\n', f]); return }
    const st = own(n), t = n.tagName, g = { ...f }, w = st['font-weight'], it = st['font-style'], d = st['text-decoration-line'] || st['text-decoration']
    if (/^(B|STRONG|H[1-6]|TH)$/.test(t)) g.b = true
    if (w) g.b = w === 'bold' || w === 'bolder' || +w >= 600 // Google Docs wraps everything in <b style="font-weight:normal">
    if (/^(I|EM)$/.test(t)) g.i = true
    if (it) g.i = it !== 'normal'
    if (t === 'U') g.u = true
    if (/^(S|STRIKE|DEL)$/.test(t)) g.s = true
    if (d) { g.u = /underline/.test(d); g.s = /line-through/.test(d) }
    if (st.color) g.color = PLAIN.test(st.color.trim()) ? undefined : st.color.trim()
    if (t === 'A' && /^(https?:|mailto:)/i.test(n.getAttribute('href') || '')) g.href = n.getAttribute('href')
    const word = raw.match(/mso-list:\s*l\d+\s+level(\d+)/i) // a Word list paragraph
    if (t === 'LI' || word) {
      const marker = word && n.querySelector('[style*="mso-list"]')?.textContent.trim()
      const kind = word ? (/^([0-9]+|[a-z]|[ivxlc]+)[.)]/i.test(marker || '') ? 'ol' : 'ul') : n.parentElement?.tagName === 'OL' ? 'ol' : 'ul'
      start(kind, word ? +word[1] - 1 : depth - 1) // depth: lists around the item
    } else if (PARA.test(t) && cur?.runs.length) start('p', 0) // a paragraph inside an empty list item stays the item
    for (const c of n.childNodes) walk(c, g, depth + (/^(UL|OL)$/.test(t) ? 1 : 0))
    if (/^(UL|OL|LI)$/.test(t) || word || (PARA.test(t) && cur?.runs.length)) cur = null // what follows is a new paragraph
    if (/^(TD|TH)$/.test(t) && cur?.runs.length) cur.runs.push([' ', f])
  }
  walk(root, {}, 0)
  for (const b of out) { // trim each block
    while (b.runs.length && !b.runs[0][0].trim()) b.runs.shift()
    while (b.runs.length && !b.runs.at(-1)[0].trim()) b.runs.pop()
    if (b.runs.length) { b.runs[0][0] = b.runs[0][0].replace(/^ +/, ''); b.runs.at(-1)[0] = b.runs.at(-1)[0].replace(/ +$/, '') }
  }
  for (const b of out) b.level = Math.max(0, b.level)
  return out.filter(b => b.runs.length)
}

// runs -> inline HTML; neighbouring runs with the same look become one
function runsHtml(runs) {
  const merged = []
  for (const [t, f] of runs) { const k = JSON.stringify(f); if (merged.at(-1)?.[1] === k) merged.at(-1)[0] += t; else merged.push([t, k, f]) }
  return merged.map(([t, , f]) => {
    let h = esc(t).replace(/\n/g, '<br>')
    if (f.s) h = `<s>${h}</s>`
    if (f.u) h = `<u>${h}</u>`
    if (f.i) h = `<em>${h}</em>`
    if (f.b) h = `<strong>${h}</strong>`
    if (f.color) h = `<span style="color:${esc(f.color)}">${h}</span>`
    if (f.href) h = `<a href="${esc(f.href)}">${h}</a>`
    return h
  }).join('')
}

// blocks -> paragraphs and (nested) lists
function blocksHtml(bs) {
  let out = ''
  const open = [] // open lists: { tag, level }
  const close = () => { out += `</li></${open.pop().tag}>` }
  for (const b of bs) {
    if (b.kind === 'p') { while (open.length) close(); out += `<p>${runsHtml(b.runs)}</p>`; continue }
    while (open.length && (open.at(-1).level > b.level || (open.at(-1).level === b.level && open.at(-1).tag !== b.kind))) close()
    if (open.at(-1)?.level === b.level) out += '</li><li>'
    else { out += `<${b.kind}><li>`; open.push({ tag: b.kind, level: b.level }) } // a deeper list opens inside the item
    out += runsHtml(b.runs)
  }
  while (open.length) close()
  return out
}

// pasted HTML as one piece: paragraphs and lists for a text box; for a table cell (cell = true) paragraphs become
// line breaks (cells hold one paragraph), lists stay lists
export function pasteHtml(html, cell = false) {
  const { doc, own } = parse(html)
  const bs = blocks(doc.body, own)
  // one paragraph is just text: it joins the paragraph at the caret instead of splitting it
  if (bs.length === 1 && bs[0].kind === 'p') return clean(runsHtml(bs[0].runs))
  return clean(cell && bs.every(b => b.kind === 'p') ? bs.map(b => runsHtml(b.runs)).join('<br>') : blocksHtml(bs))
}

// the first table in pasted HTML as a grid of { html, fill } (fill '' = no colour), or null without a table;
// merged cells (colspan, rowspan) keep their place in the grid: the cells they cover stay empty
export function pasteTable(html) {
  const { doc, own } = parse(html)
  const table = doc.querySelector('table')
  if (!table) return null
  const empty = { html: '', fill: '' }, grid = [...table.rows].map(() => [])
  for (const [r, tr] of [...table.rows].entries()) {
    let c = 0
    for (const td of tr.cells) {
      while (grid[r][c]) c++ // taken by a rowspan from above
      const bs = blocks(td, own), bg = own(td)['background-color']?.trim()
      const inner = bs.every(b => b.kind === 'p') ? bs.map(b => runsHtml(b.runs)).join('<br>') : blocksHtml(bs)
      const cell = { html: clean(inner), fill: bg && !BLANK.test(bg) ? bg : '' }
      for (let i = 0; i < Math.max(1, td.rowSpan) && r + i < grid.length; i++) for (let j = 0; j < td.colSpan; j++) grid[r + i][c + j] = i || j ? empty : cell
      c += td.colSpan
    }
  }
  return grid.map(row => Array.from(row, v => v || empty)) // holes of ragged rows
}
