import hljs from 'highlight.js/lib/common'
import http from 'highlight.js/lib/languages/http'

hljs.registerLanguage('http', http)
// shortcut: no highlight.js grammar for these, HTML is close enough; add a real grammar if it matters
hljs.registerAliases(['astro', 'vue', 'svelte'], { languageName: 'xml' })

export const LANGS = ['js', 'ts', 'html', 'astro', 'css', 'bash', 'json', 'http', 'sql', 'python', 'yaml', 'markdown', 'plaintext']
// returns escaped HTML
export const highlight = (code, lang) =>
  hljs.highlight(code, { language: hljs.getLanguage(lang) ? lang : 'plaintext' }).value

// highlighted HTML as one string per line: spans running over a line break are closed and reopened
export function hlLines(code, lang) {
  const out = [], open = []
  let cur = ''
  for (const t of highlight(code, lang).split(/(<span[^>]*>|<\/span>|\n)/)) {
    if (t === '\n') { out.push(cur + '</span>'.repeat(open.length)); cur = open.join('') } else {
      if (t.startsWith('<span')) open.push(t)
      else if (t === '</span>') open.pop()
      cur += t
    }
  }
  return [...out, cur]
}
// Slidev's code block options in the fence info: "{2,4-5}" highlights lines (the first click step of "{1|3}"),
// "{lines:true,startLine:5}" numbers them. marked: Set of line numbers or null (all lines)
export function codeOpts(meta = '') {
  const groups = [...meta.matchAll(/\{([^}]*)\}/g)].map(m => m[1])
  const opts = groups.find(g => g.includes(':')) || ''
  const first = groups.find(g => !g.includes(':'))?.split('|')[0].trim()
  let marked = null
  if (first && !/^(all|\*)$/.test(first)) {
    marked = new Set()
    for (const part of first.split(',')) { const [a, b = a] = part.split('-').map(Number); for (let i = a; i <= b && i - a < 1000; i++) marked.add(i) }
  }
  return { lines: /lines:\s*true/.test(opts), start: +(opts.match(/startLine:\s*(\d+)/)?.[1] || 1), marked }
}
// the meta with line numbers switched on or off (other options and the highlighted lines stay)
// marks lines a..b in the meta's highlight group ({2,4-5}), or unmarks them when all are marked already;
// click steps ({1|3-4}) only change their first step
export function toggleMarked(meta = '', a, b) {
  const marked = codeOpts(meta).marked || new Set()
  const range = Array.from({ length: b - a + 1 }, (_, i) => a + i)
  const off = range.every(i => marked.has(i))
  for (const i of range) off ? marked.delete(i) : marked.add(i)
  const nums = [...marked].sort((x, y) => x - y), parts = []
  for (const n of nums) { const last = parts.at(-1); last && last[1] === n - 1 ? (last[1] = n) : parts.push([n, n]) }
  const first = parts.map(([x, y]) => (x === y ? x : `${x}-${y}`)).join(',')
  const groups = [...meta.matchAll(/\{([^}]*)\}/g)], g = groups.find(m => !m[1].includes(':'))
  const steps = g ? g[1].split('|').slice(1) : []
  const group = first || steps.length ? `{${[first || 'all', ...steps].join('|')}}` : ''
  const out = g ? meta.replace(g[0], group) : group + meta
  return out.trim() || undefined
}
export function withLines(meta = '', on) {
  const rest = meta.replace(/\{[^}]*:[^}]*\}/, m => m.replace(/,?\s*lines:\s*(true|false)/, '').replace(/\{\s*,/, '{')).replace(/\{\s*\}/, '').trim()
  if (!on) return rest || undefined
  const o = rest.match(/\{[^}]*:[^}]*\}/)
  return o ? rest.replace(o[0], o[0].replace('{', '{lines:true,')) : `${rest}{lines:true}`
}
