// Find & replace over all slides: text boxes, table cells, code and speaker notes.
// HTML is searched in its text only, so tags, attributes and links are never touched.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }
const decode = s => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, k) => ENT[k])
const encode = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const TAG = /(<(?:[^>"']|"[^"]*"|'[^']*')*>)/
// shortcut: matches stay inside one text run ("<b>Fo</b>o" is not found as "Foo"); fine for words and phrases
const mapText = (html, f) => html.split(TAG).map((p, i) => {
  if (i % 2) return p
  const t = decode(p), n = f(t)
  return n === t ? p : encode(n)
}).join('')
const textOf = html => html.split(TAG).filter((_, i) => !(i % 2)).map(decode).join('')

// options as in VS Code: cs = match case, word = whole word, regex = regular expression, keep = preserve case.
// Throws on an invalid regular expression.
export function pattern(q, { cs, word, regex } = {}) {
  let src = regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // \b only knows ASCII: "Größe" would not be a whole word
  if (word) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`
  return new RegExp(src, 'gm' + (cs ? '' : 'i') + (word ? 'u' : ''))
}
const matches = (text, rx) => [...text.matchAll(rx)].filter(m => m[0]) // an empty match (/a*/) is no hit

// the replacement for one match: $1, $&, $<name>, \n, \t with a regex; the case of the match with keep
function expand(r, m, groups, o) {
  if (o.regex) r = r.replace(/\$(\$|&|\d{1,2}|<([^>]+)>)|\\([nt\\])/g, (t, d, name, esc) => esc ? { n: '\n', t: '\t', '\\': '\\' }[esc]
    : d === '$' ? '$' : d === '&' ? m[0] : name ? groups?.[name] ?? '' : m[+d] ?? t)
  const s = m[0], up = s.toUpperCase(), low = s.toLowerCase()
  if (o.keep && r && up !== low) { // only matches with letters have a case
    if (s === up && s.length > 1) return r.toUpperCase()
    if (s === low) return r.toLowerCase()
    if (s[0] !== s[0].toLowerCase()) return r[0].toUpperCase() + r.slice(1)
  }
  return r
}

// every searchable string of a slide: [object, key, isHtml, element]; kinds limits it to text, table, code, notes
const ALL = { text: true, table: true, code: true, notes: true }
function* fields(s, kinds = ALL) {
  for (const e of s.elements) {
    if (!kinds[e.type]) continue
    if (e.type === 'text') yield [e, 'html', true, e]
    else if (e.type === 'code') yield [e, 'code', false, e]
    else if (e.type === 'table') for (const r of e.rows) for (let c = 0; c < r.length; c++) yield [r, c, true, e]
  }
  if (kinds.notes) yield [s, 'notes', false]
}

// one hit per field that contains a match of rx: { slide, el, notes, count, obj, key, html }
export function find(slides, rx, kinds) {
  const out = []
  if (!rx) return out
  slides.forEach((s, slide) => {
    for (const [obj, key, html, el] of fields(s, kinds)) {
      const count = matches(html ? textOf(obj[key] || '') : obj[key] || '', rx).length
      if (count) out.push({ slide, el: el?.id, notes: !el, count, obj, key, html })
    }
  })
  return out
}

// replaces every match in the given hits, or only the nth one of a single hit (mutates the slides);
// returns how many were replaced
export function replace(hits, rx, r, o = {}, nth) {
  let n = 0
  for (const h of hits) {
    let k = 0
    const with_ = (...a) => {
      const named = typeof a.at(-1) === 'object' ? a.pop() : undefined
      const m = a.slice(0, -2)
      if (!m[0] || (nth != null && k++ !== nth)) return m[0]
      n++
      return expand(r, m, named, o)
    }
    h.obj[h.key] = h.html ? mapText(h.obj[h.key], t => t.replace(rx, with_)) : h.obj[h.key].replace(rx, with_)
  }
  return n
}

// the match ranges of rx in the text of a DOM element, across inline tags (for highlighting on the slide)
export function ranges(root, rx) {
  if (!rx) return []
  const nodes = [], walk = root.ownerDocument.createTreeWalker(root, 4)
  let text = ''
  while (walk.nextNode()) { nodes.push([walk.currentNode, text.length]); text += walk.currentNode.data }
  const at = i => { // text offset -> [node, offset]
    let j = nodes.length - 1
    while (j > 0 && nodes[j][1] > i) j--
    return [nodes[j][0], i - nodes[j][1]]
  }
  return matches(text, rx).map(m => {
    const r = root.ownerDocument.createRange()
    r.setStart(...at(m.index))
    r.setEnd(...at(m.index + m[0].length - 1)); r.setEnd(r.endContainer, r.endOffset + 1)
    return r
  })
}
