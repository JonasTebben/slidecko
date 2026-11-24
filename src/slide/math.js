import { ref } from 'vue'

// TeX formulas in Slidev's notation: $…$ inline, $$…$$ display, \$ is a dollar sign. An inline $ opens only
// before a non-space and closes only after one and not before a digit (Slidev's and Pandoc's rule), so
// "5 $ and 6 $" or "$5 and $6" stay text. The model keeps the source; KaTeX renders it where it is shown.
export const MATH = /\\\$|\$\$((?:\\[\s\S]|[^\\$])+?)\$\$|\$(?![\s$])((?:\\[\s\S]|[^\\$\n])*?[^\\\s$])\$(?!\d)/g
const AT = new RegExp(`^(?:${MATH.source})`)

// text -> [string | { tex, display }]; strings keep their \$
export function mathParts(text) {
  const out = []
  let at = 0
  for (const m of text.matchAll(MATH)) {
    if (m[0] === '\\$') continue
    if (m.index > at) out.push(text.slice(at, m.index))
    out.push({ tex: (m[1] ?? m[2]).trim(), display: m[1] != null })
    at = m.index + m[0].length
  }
  if (at < text.length) out.push(text.slice(at))
  return out
}
export const hasMath = text => mathParts(String(text ?? '')).some(p => typeof p !== 'string')
const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// marked (Markdown import): math is kept as its source text, safe from emphasis and escapes; a $$ block on
// its own lines is a formula element (data-math, read by importSlidev.js). Slidev's {1|2} line marks are dropped.
export const mathMarked = {
  extensions: [{
    name: 'mathBlock', level: 'block',
    start: s => s.match(/^ {0,3}\$\$/m)?.index,
    tokenizer(src) {
      const m = /^ {0,3}\$\$(?:[ \t]*\{[^}\n]*\})?[ \t]*\n?((?:\\[\s\S]|[^\\$])+?)\n?[ \t]*\$\$[ \t]*(?:\n+|$)/.exec(src)
      if (m && m[1].trim()) return { type: 'mathBlock', raw: m[0], text: m[1].trim() }
    },
    renderer: t => `<p data-math="display">$$${escHtml(t.text)}$$</p>\n`,
  }, {
    name: 'mathInline', level: 'inline',
    start: s => { const i = s.search(/\\?\$/); return i < 0 ? undefined : i },
    tokenizer(src) { const m = AT.exec(src); if (m) return { type: 'mathInline', raw: m[0] } },
    renderer: t => escHtml(t.raw),
  }],
}

// --- rendering (browser): KaTeX and its stylesheet load with the first formula ---
let katex, loading
export const mathOn = ref(0) // counts up when KaTeX arrives: views that showed the source render again
export function loadMath() {
  return (loading ??= Promise.all([import('katex'), import('./katexCss.js')]).then(([k, css]) => {
    document.head.append(Object.assign(document.createElement('style'), { textContent: css.default }))
    katex = k.default
    mathOn.value++
  }).catch(() => { /* offline or a failed chunk: the source stays shown */ }))
}
// resolves when KaTeX is there, if any formula asked for it (exports wait for it)
export const mathReady = () => loading

const cache = new Map()
// MathML next to the drawing: screen readers read the formula; trust off: no \href, \url or \includegraphics
const opts = display => ({ displayMode: display, output: 'htmlAndMathml', throwOnError: false, strict: 'ignore', trust: false, maxSize: 50, maxExpand: 1000 })
function render(tex, display) {
  const k = (display ? 'D' : 'I') + tex
  if (!cache.has(k)) {
    if (cache.size > 2000) cache.clear()
    let html
    try { html = katex.renderToString(tex, opts(display)) } catch { html = `<span class="math-error">${escHtml(tex)}</span>` }
    cache.set(k, html)
  }
  return cache.get(k)
}
// KaTeX's message for broken TeX (inspector), '' when it renders or KaTeX is not there yet
export function mathError(tex) {
  void mathOn.value
  if (!katex) { loadMath(); return '' }
  try { katex.renderToString(tex, { ...opts(true), throwOnError: true }); return '' } catch (e) { return String(e?.message || e).replace(/^KaTeX parse error: /, '') }
}

// a formula element: display math, or its source until KaTeX is loaded
export function formulaHtml(tex) {
  void mathOn.value
  if (!katex) { loadMath(); return escHtml(tex) }
  return render(tex, true)
}

// text box HTML with its $…$ rendered (not inside code); the same input gives the same string, so v-html keeps the DOM
const done = new Map()
export function withMath(html) {
  if (!html?.includes('$')) return html
  void mathOn.value
  const math = hasMath(html.replace(/<[^>]*>/g, ' '))
  if (!math && !html.includes('\\$')) return html
  if (math && !katex) { loadMath(); return html }
  if (!done.has(html)) {
    if (done.size > 500) done.clear()
    const t = document.createElement('template')
    t.innerHTML = html
    const walk = document.createTreeWalker(t.content, NodeFilter.SHOW_TEXT), texts = []
    for (let n; (n = walk.nextNode());) if (n.data.includes('$') && !n.parentElement?.closest('code, pre, kbd')) texts.push(n)
    for (const n of texts) {
      const s = document.createElement('span')
      s.innerHTML = mathParts(n.data).map(p => (typeof p === 'string' ? escHtml(p.replace(/\\\$/g, '$')) : render(p.tex, p.display))).join('')
      n.replaceWith(...s.childNodes)
    }
    done.set(html, t.innerHTML)
  }
  return done.get(html)
}
