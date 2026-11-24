// Bullet / numbered list toggle for the text being edited. Replaces execCommand('insert…List'), which
// splits Markdown lists (<li><p>…</p></li>, <ol start>) into one list per item.
// The box is seen as a run of lines: top-level blocks and the items of top-level lists. The selected lines
// switch kind (or leave the list when all of them already are of that kind), then consecutive lines of one
// kind are regrouped into one list. A list keeps its attributes, and every item keeps its number: a split
// list continues with start="…", and a paragraph that left a numbered list remembers it (data-num), so
// switching numbering off and on again gives the same numbers.
const BLOCK = /^(P|H[1-6]|DIV|BLOCKQUOTE|PRE)$/
const isBlock = n => n.nodeType === 1 && /^(P|H[1-6]|DIV|BLOCKQUOTE|PRE|UL|OL|LI|V-CLICKS|TABLE)$/.test(n.nodeName)
const gap = t => !t.data.trim() && [t.previousSibling, t.nextSibling].every(s => !s || isBlock(s))

// the list kind ('UL' | 'OL') at the caret, for the toolbar state
export const listAt = node => (node?.nodeType === 1 ? node : node?.parentElement)?.closest('[contenteditable=true] li')?.parentElement.nodeName || null

// undo for list changes while typing: { undo: [], redo: [], live } per text box. Chrome's own undo cannot
// take them (insertHTML keeps a list around the old content), but it survives them: the text nodes are
// moved, never recreated. Both histories interleave: typing pauses ours (live = false) and ⌘Z goes to the
// browser; once the browser has undone the typing back to the state right after our change, ours is live.
const history = new WeakMap()
const stack = root => history.get(root) || history.set(root, { undo: [], redo: [], live: false }).get(root)
export function typed(root, e) {
  const h = history.get(root)
  if (!h) return
  if (e?.inputType === 'historyUndo') h.live = root.innerHTML === h.undo.at(-1)?.after
  else if (e?.inputType !== 'historyRedo') { h.live = false; h.redo = [] }
}

// the structure of the box with its live text nodes, and the selection as character positions
function snapshot(root) {
  const s = getSelection(), r = s.rangeCount && s.getRangeAt(0)
  const texts = [], w = root.ownerDocument.createTreeWalker(root, 4)
  while (w.nextNode()) texts.push([w.currentNode, w.currentNode.data]) // the data too: the marker of "1. " is cut from its node
  return { shape: root.cloneNode(true), texts, sel: r && root.contains(r.commonAncestorContainer) ? [offset(root, r.startContainer, r.startOffset), offset(root, r.endContainer, r.endOffset)] : null }
}
function restore(root, snap) {
  const shape = snap.shape.cloneNode(true), copies = [], w = root.ownerDocument.createTreeWalker(shape, 4)
  while (w.nextNode()) copies.push(w.currentNode)
  copies.forEach((c, i) => {
    const [node, data] = snap.texts[i]
    if (node.data !== data) node.data = data
    c.replaceWith(node)
  })
  root.replaceChildren(...shape.childNodes)
  select(root, snap.sel)
}
// ⌘Z / ⌘⇧Z in a text box: true when it was a list change that got undone or redone
export function undoList(root, redo = false) {
  const h = history.get(root), from = h?.[redo ? 'redo' : 'undo']
  if (!h?.live || !from?.length) return false
  const now = snapshot(root), entry = from.pop()
  restore(root, entry)
  // entry.after: how the box looked right after that change, to recognise it again
  h[redo ? 'undo' : 'redo'].push({ ...now, after: entry.after ?? now.after })
  if (redo) h.undo.at(-1).after = root.innerHTML
  // typing before the change we just undid is the browser's again
  h.live = redo || root.innerHTML === h.undo.at(-1)?.after
  return true
}

// whitespace between blocks (Markdown's "\n") does not count as a character: the rebuild drops it
function offset(root, node, off) {
  const doc = root.ownerDocument, r = doc.createRange(), w = doc.createTreeWalker(root, 4)
  r.setStart(root, 0); r.setEnd(node, off)
  let n = 0
  while (w.nextNode()) if (!gap(w.currentNode) && r.intersectsNode(w.currentNode)) n += w.currentNode === node ? off : w.currentNode.length
  return n
}
function select(root, sel) {
  if (!sel) return
  const at = n => {
    const w = root.ownerDocument.createTreeWalker(root, 4)
    let left = n, last = null
    while (w.nextNode()) { if (gap(w.currentNode)) continue; last = w.currentNode; if (left <= last.length) return [last, left]; left -= last.length }
    return last ? [last, last.length] : [root, 0]
  }
  try { const r = root.ownerDocument.createRange(); r.setStart(...at(sel[0])); r.setEnd(...at(sel[1])); getSelection().removeAllRanges(); getSelection().addRange(r) } catch {}
}

export function toggleList(root, tag, range = getSelection().rangeCount && getSelection().getRangeAt(0)) {
  if (!range || !root.contains(range.commonAncestorContainer)) return false
  return step(root, () => change(root, tag.toUpperCase(), range))
}

function change(root, tag, range) {
  // inside <v-clicks> the lines are its children
  const box = range.commonAncestorContainer.parentElement?.closest('v-clicks') || root
  if (!root.contains(box)) return false
  const doc = root.ownerDocument
  const keep = [range.startContainer, range.startOffset, range.endContainer, range.endOffset]

  // 1. lines: { node, kind: 'UL' | 'OL' | null, list (original list element), num (its number) }
  const lines = []
  let loose = null // inline content at the top level becomes a paragraph
  for (const n of [...box.childNodes]) {
    if (n.nodeName === 'UL' || n.nodeName === 'OL') {
      loose = null
      const start = Number(n.getAttribute('start')) || 1
      ;[...n.children].forEach((li, k) => lines.push({ node: li, kind: n.nodeName, list: n, num: n.nodeName === 'OL' ? start + k : undefined }))
    } else if (n.nodeType === 1 && BLOCK.test(n.nodeName)) {
      loose = null
      lines.push({ node: n, kind: null, num: Number(n.dataset.num) || undefined })
    } else if (n.nodeType === 3 && !n.data.trim() && !loose) {
      n.remove() // whitespace between blocks
    } else {
      if (!loose) { loose = box.insertBefore(doc.createElement('p'), n); lines.push({ node: loose, kind: null }) }
      loose.append(n)
    }
  }
  // moving nodes shifts a live range: rebuild it from the (moved, not copied) text nodes
  range = doc.createRange()
  try { range.setStart(keep[0], keep[1]); range.setEnd(keep[2], keep[3]) } catch { return false }
  const picked = lines.filter(l => range.intersectsNode(l.node) || l.node.contains(range.startContainer))
  if (!picked.length) return false

  // 2. switch: off when every picked line already is in a list of this kind
  const off = picked.every(l => l.kind === tag)
  // Markdown "loose" lists (blank lines between items) hold paragraphs: new items follow suit
  const looseItems = lines.some(l => l.kind && [...l.node.children].some(c => c.nodeName === 'P'))
  const out = []
  for (const l of lines) {
    if (!picked.includes(l)) { out.push(l); continue }
    if (off) {
      // a loose item's paragraphs come out as they are; a tight item's content goes into a <p>
      const kids = [...l.node.childNodes].filter(c => c.nodeType !== 3 || c.data.trim())
      const blocks = kids.length && kids.every(c => c.nodeType === 1 && BLOCK.test(c.nodeName)) ? kids : [doc.createElement('p')]
      if (blocks[0].nodeName === 'P' && !kids.includes(blocks[0])) blocks[0].append(...l.node.childNodes)
      if (l.num) blocks[0].dataset.num = l.num
      for (const b of blocks) out.push({ node: b, kind: null })
    } else if (l.kind) out.push({ ...l, kind: tag, num: tag === 'OL' ? l.num : undefined })
    else {
      const li = doc.createElement('li')
      l.node.removeAttribute('data-num')
      if (l.node.nodeName === 'P' && !looseItems) li.append(...l.node.childNodes)
      else li.append(l.node)
      out.push({ node: li, kind: tag, num: tag === 'OL' ? l.num : undefined })
    }
  }

  // 3. rebuild: consecutive list lines share one list, with the other attributes of the first original list
  // in it; a numbered list starts at its first item's number
  box.replaceChildren()
  let cur = null, attrs = false
  for (const l of out) {
    if (!l.kind) { cur = null; box.append(l.node); continue }
    if (cur?.nodeName !== l.kind) {
      cur = box.appendChild(doc.createElement(l.kind))
      attrs = false
      if (l.kind === 'OL' && l.num > 1) cur.setAttribute('start', l.num)
    }
    if (l.list && !attrs) {
      attrs = true
      for (const a of l.list.attributes) if (a.name !== 'start') cur.setAttribute(a.name, a.value)
    }
    cur.append(l.node)
  }
  return true
}

// the selected items: the caret's item and its selected siblings (one level, in order)
function selectedItems(root, range) {
  const li = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement)?.closest('li')
  if (!li || !root.contains(li)) return []
  return [...li.parentElement.children].filter(c => c === li || range.intersectsNode(c))
}
// runs a structural change as one undoable step (see toggleList)
function step(root, fn, keepSelection = true) {
  const before = snapshot(root)
  if (!fn()) return false
  const h = stack(root)
  h.undo.push({ ...before, after: root.innerHTML })
  h.redo = []
  h.live = true
  if (keepSelection) select(root, before.sel)
  return true
}

// Tab / ⇧Tab in a list: the items go one level deeper, under the item before them, or one level up.
// On the top level ⇧Tab ends the list for them, as in Google Docs. false: the caret is not in a list.
export function indent(root, out = false, range = getSelection().rangeCount && getSelection().getRangeAt(0)) {
  const items = range ? selectedItems(root, range) : []
  if (!items.length) return false
  const list = items[0].parentElement, doc = root.ownerDocument
  if (!out) {
    const prev = items[0].previousElementSibling
    if (!prev) return true // nothing to hang it under; still a list key, not a focus change
    return step(root, () => {
      let sub = prev.lastElementChild
      if (sub?.nodeName !== list.nodeName) sub = prev.appendChild(doc.createElement(list.nodeName))
      sub.append(...items)
      return true
    })
  }
  const parent = list.parentElement.closest('li')
  if (!parent || !root.contains(parent)) return toggleList(root, list.nodeName, range)
  return step(root, () => {
    // the items after them stay where they are on screen: below the last one, one level deeper
    const after = [...list.children].slice([...list.children].indexOf(items.at(-1)) + 1)
    if (after.length) items.at(-1).appendChild(doc.createElement(list.nodeName)).append(...after)
    parent.after(...items)
    if (!list.children.length) list.remove()
    return true
  })
}

// "1. ", "1) ", "- ", "* ", "• " typed at the start of a line becomes a list, as in Word and Google Docs;
// ⌘Z right after brings the typed marker back. Call on input.
const MARKER = /^(?:(\d{1,3})[.)]|([-*•]))[\s ]$/
export function autoList(root, e) {
  if (e.inputType !== 'insertText' || e.data !== ' ') return false
  const s = getSelection(), r = s.rangeCount && s.getRangeAt(0)
  if (!r?.collapsed || !root.contains(r.startContainer)) return false
  const at = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement
  const inside = at.closest('li, pre, td, th') // the box itself may be a table cell
  if (inside && inside !== root && root.contains(inside)) return false
  const block = at.closest('p, h1, h2, h3, h4, h5, h6, div')
  const line = root.contains(block) && block !== root ? block : root
  const head = root.ownerDocument.createRange()
  head.setStart(line, 0)
  head.setEnd(r.startContainer, r.startOffset)
  // only the start of a line: in the root itself, the text since the last block or <br>
  if (line === root && [...root.childNodes].some(n => (n.nodeType === 1 && (isBlock(n) || n.nodeName === 'BR')) && head.intersectsNode(n))) return false
  const m = head.toString().match(MARKER)
  if (!m) return false
  return step(root, () => {
    const doc = root.ownerDocument
    head.deleteContents()
    // a placeholder at the caret travels with the line into its new item
    const mark = doc.createTextNode('\u200b')
    head.insertNode(mark)
    const caret = doc.createRange()
    caret.selectNode(mark)
    if (!change(root, m[1] ? 'OL' : 'UL', caret)) { mark.remove(); return false }
    const li = mark.parentElement.closest('li'), r = doc.createRange()
    if (!li) { mark.remove(); return true }
    const parent = mark.parentNode, i = [...parent.childNodes].indexOf(mark)
    mark.remove()
    if (!li.textContent) { li.innerHTML = '<br>'; r.setStart(li, 0) } else r.setStart(parent, i)
    r.collapse(true)
    getSelection().removeAllRanges()
    getSelection().addRange(r)
    if (m[1] && li.parentElement.firstElementChild === li && +m[1] > 1) li.parentElement.setAttribute('start', m[1])
    return true
  }, false)
}
