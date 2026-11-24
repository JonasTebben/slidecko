import { fmGet } from './parseSlidev.js'

// Links to slides and the table of contents (Slidev's <Link to> and <Toc>). Pure: used by the store, the slide view and every export.
// A link names its slide by id (kept across reloads by cleanSlides), so reordering keeps it; numbers are worked out on export.
// In text: <a href="#slide-<id>">; on shapes and images: el.to = <id>. A link to a deleted slide does nothing and exports as plain text.
export const slideHref = id => '#slide-' + id
export const linkTarget = href => String(href ?? '').match(/^#slide-([\w-]{1,40})$/)?.[1]
// slide id -> number as Slidev counts them (hidden slides are not in Slidev's list)
export const slideNumbers = slides => { let n = 0; return new Map(slides.filter(s => !s.hidden).map(s => [s.id, ++n])) }
const HREF = /(href=")#slide-([\w-]{1,40})(")/g
// ids in links of these elements -> map[id] (slides that got a new id); ids not in map stay
export function remapLinks(els, map) {
  for (const e of els) {
    if (e.html?.includes('#slide-')) e.html = e.html.replace(HREF, (m, a, id, b) => (map[id] ? a + slideHref(map[id]) + b : m))
    if (map[e.to]) e.to = map[e.to]
  }
}

// --- table of contents ---
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }
const textOf = html => html.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, k) => ENT[k]).replace(/\s+/g, ' ').trim()
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// a slide's entry as Slidev finds it: frontmatter title/level, else its first heading (title box first) and that heading's level
export function slideTitle(s, first) {
  const els = [...s.elements.filter(e => e.title), ...s.elements.filter(e => e.type === 'text' && !e.title)]
  const h = els.map(e => e.html?.match(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/i)).find(m => m && textOf(m[2]))
  const title = (!first && fmGet(s.fm, 'title')) || (h && textOf(h[2])) // slide 1's title is the project's (headmatter)
  return title ? { title, level: +fmGet(s.fm, 'level') || (h ? +h[1] : 1) } : null
}
// the entries of a toc element: shown slides with a title, not hideInToc, within its depths
export function tocEntries(slides, el = {}) {
  const min = el.minDepth || 1, max = el.maxDepth || 6
  return slides.flatMap((s, i) => {
    const t = !s.hidden && !s.hideInToc && slideTitle(s, i === 0)
    return t && t.level >= min && t.level <= max ? [{ id: s.id, ...t }] : []
  })
}
// nested lists like Slidev's <Toc>; the slide it sits on is marked when el.current is set
export function tocHtml(entries, el = {}, current) {
  const min = el.minDepth || 1
  let out = '', depth = 0
  for (const e of entries) {
    const d = Math.max(1, e.level - min + 1)
    out += d > depth ? '<ul><li>'.repeat(d - depth) : '</li></ul>'.repeat(depth - d) + '</li><li>'
    out += `<a href="${slideHref(e.id)}"${el.current && e.id === current ? ' class="toc-current" aria-current="page"' : ''}>${esc(e.title)}</a>`
    depth = d
  }
  return out + '</li></ul>'.repeat(depth)
}
