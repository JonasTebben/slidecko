// The source editor's logic: a deck file as one Slidev Markdown text, back to slides, lint and format.
import { reactive } from 'vue'
import { splitSlides } from './parseSlidev.js'

export const source = reactive({ open: false }) // the source editor (SourceEditor.vue) is shown

// the Markdown of one slide as slideToMarkdown writes it, from a splitSlides part
const chunkOf = s => (s.fm ? `---\n${s.fm}\n---\n\n` : '') + s.body.join('\n').trim() + '\n'

// slideToMarkdown texts -> one file; a slide without frontmatter needs its own `---`
export const joinSlides = mds => mds.map((md, i) => (i && !md.startsWith('---\n') ? '---\n\n' + md : md)).join('\n')

// one file -> slide texts; the empty part before a leading frontmatter is no slide (an empty one later becomes none on import)
export const splitSource = text => splitSlides(text).filter((s, i) => i || s.fm || s.body.some(l => l.trim())).map(chunkOf)

// which slides stay as they are: [{ keep: original } | { md: changed text }] in the new order.
// An unchanged text keeps its slide object, so free positions, ids and everything Markdown does not carry survive.
export function diffSlides(origs, texts) {
  const pool = new Map()
  for (const o of origs) pool.set(o.md, [...(pool.get(o.md) || []), o.slide])
  return texts.map(md => (pool.get(md)?.length ? { keep: pool.get(md).shift() } : { md }))
}

// markdownlint rules that do not fit slides: every slide has its own h1, HTML and long lines are normal
const LINT_CONFIG = { default: true, MD013: false, MD024: false, MD025: false, MD033: false, MD041: false, MD047: false }

// problems in one file: each slide body is checked on its own (frontmatter and `---` are Slidev, not Markdown),
// line numbers are of the whole file
export async function lintSource(text) {
  const { lint } = await import('markdownlint/sync')
  const parts = splitSlides(text), strings = Object.fromEntries(parts.map((s, i) => [i, s.body.join('\n')]))
  const res = lint({ strings, config: LINT_CONFIG })
  return parts.flatMap((s, i) => res[i].map(r => ({
    line: s.at + r.lineNumber, // 1-based in the file
    range: r.errorRange, // [column (1-based), length] or null
    rule: r.ruleNames[0], message: r.ruleDescription + (r.errorDetail ? ` (${r.errorDetail})` : ''),
  })))
}

// Prettier per slide body: on the whole file it would read `---` + `layout: x` + `---` as a heading
export async function formatSource(text) {
  const [prettier, md] = await Promise.all([import('prettier/standalone'), import('prettier/plugins/markdown')])
  const parts = await Promise.all(splitSlides(text).map(async (s, i) => {
    const body = s.body.join('\n')
    const out = body.trim() ? (await prettier.format(body, { parser: 'markdown', plugins: [md], proseWrap: 'preserve' })).trim() : ''
    return { i, fm: s.fm, out, empty: !s.fm && !body.trim() }
  }))
  return joinSlides(parts.filter(p => !(p.i === 0 && p.empty)).map(p => (p.fm ? `---\n${p.fm}\n---\n\n` : '') + p.out + '\n'))
}
