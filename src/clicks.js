// Click steps while presenting (Slidev's v-click, and v-clicks for "list items one by one").
// Pure: used by the store, the slide view and the Slidev export.

// top-level items of the lists in a text box's HTML (a nested list belongs to its item)
export function listItems(html) {
  let depth = 0, n = 0
  for (const [, end, tag] of String(html || '').matchAll(/<(\/?)(ul|ol|li)\b/gi)) {
    if (tag.toLowerCase() !== 'li') depth += end ? -1 : 1
    else if (!end && depth === 1) n++
  }
  return n
}
// key of an element's first step: its click number; a box listing its items one by one without one
// comes after all numbered steps (like a new v-click), in slide order (100+: numbers stop at 99)
function keyOf(els, e) {
  if (e.click) return e.click
  const j = e.clickItems && listItems(e.html) ? els.filter(x => x.clickItems && !x.click).indexOf(e) : -1
  return j < 0 ? 0 : 100 + j
}
// click steps of a slide, ascending: each click number once, repeated for every further list item shown
// one by one, so later numbers move back (step k shows what is due up to the k-th)
export function clickSteps(slide) {
  const els = slide?.elements || [], n = new Map()
  for (const e of els) {
    const k = keyOf(els, e)
    if (k) n.set(k, Math.max(n.get(k) || 1, e.clickItems ? listItems(e.html) : 1))
  }
  return [...n.keys()].sort((a, b) => a - b).flatMap(k => Array(n.get(k)).fill(k))
}
export const revealed = (el, steps, k) => !el.click || (k > 0 && el.click <= steps[k - 1])
// 1-based step at which an element (or its first list item) appears; 0: none
export const stepOf = (slide, el, steps = clickSteps(slide)) => steps.indexOf(keyOf(slide?.elements || [], el)) + 1
// list items one by one: each top-level <li> gets its step (data-click, read by the HTML presentation)
// and data-unshown from the shown-th one on
export function markItems(html, from, shown = Infinity) {
  let depth = 0, i = 0
  return html.replace(/<(\/?)(ul|ol|li)\b/gi, (m, end, tag) => {
    if (tag.toLowerCase() !== 'li') depth += end ? -1 : 1
    else if (!end && depth === 1) return `${m} data-click="${from + i}"${i++ >= shown ? ' data-unshown' : ''}`
    return m
  })
}
