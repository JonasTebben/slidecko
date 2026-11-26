import { marked } from 'marked'
import { parseDuration } from '../present/rehearse.js'
import { mathMarked } from '../slide/math.js'

// $…$ and $$…$$ stay TeX source (Slidev's KaTeX notation) for every Markdown import
marked.use(mathMarked)

// Slidev markdown -> [{ layout, blocks, fm, md, file, notes }]. Pure (no DOM); positions are
// assigned later in importSlidev.js. fm/md/file are the slide's raw source, kept so that
// toSlidev.js can write untouched slides back verbatim.
// Block: { type: 'text', html, title? } | { type: 'code', code, lang, meta } | { type: 'image', src }
// - blocks inside `<div class="flex|grid"><div>…</div><div>…</div></div>` carry col: { group, index }
// - blocks inside `<div style="position:absolute;left…">` (what toSlidev.js writes) carry box: { x, y, w, h }

// Slidev layouts that centre their content; everything else is treated as a normal content slide
export const COVER = ['cover', 'intro', 'quiz', 'section', 'statement', 'fact', 'center']
export const fmGet = (fm, key) => fm?.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1].trim().replace(/^['"]|['"]$/g, '')
// Slidev hides a slide with `hide: true` (alias `disabled: true`)
// slide transitions the editor offers (Slidev's built-in names); 'none' turns the project's default off for one slide
export const TRANSITIONS = ['none', 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'morph']
// Magic move is Slidev's `view-transition` (older exports wrote `transition: fade` plus `slidecko-transition: morph`)
export const trOf = fm => (fmGet(fm, 'slidecko-transition') === 'morph' || fmGet(fm, 'transition') === 'view-transition' ? 'morph' : fmGet(fm, 'transition'))
// Slidev's v-click value -> click step: "2" is that step, an empty one (or "+1") the step after the last one
export const clickOf = (v, last) => (v = String(v).trim().replace(/^['"]|['"]$/g, ''), /^\d+$/.test(v) ? +v : last + (+v || 1))
// an element's Slidev click attributes (attr(name): value or null) -> { click, clickUntil, last: the new last step }:
// v-click="2" or "'+1'", v-click="[2, 4]" (visible from 2, gone at 4; a relative end counts from the start),
// v-click.hide="3" (gone at 3), v-after (with the previous click)
export function clickAttrs(attr, last) {
  const out = {}, vc = attr('v-click'), hide = attr('v-click.hide')
  const range = vc?.trim().match(/^\[(.*),(.*)\]$/)
  if (range) {
    out.click = clickOf(range[1], last)
    out.clickUntil = /^\s*['"]?[+-]/.test(range[2]) ? clickOf(range[2], out.click) : clickOf(range[2], 0)
  } else if (vc != null) out.click = clickOf(vc, last)
  else if (attr('v-after') != null && last) out.click = last
  if (hide != null) out.clickUntil = clickOf(hide, last)
  if (!(out.clickUntil > (out.click || 0))) delete out.clickUntil
  return { ...out, last: Math.max(last, out.click || 0, range ? 0 : out.clickUntil || 0) }
}
export const fmHidden =fm => fmGet(fm, 'hide') === 'true' || fmGet(fm, 'disabled') === 'true'

// the slide format of a Slidev headmatter: { aspectRatio: '4/3', canvasWidth: 980 } (keys only when set);
// '4:3' and "'16/9'" become '4/3' / '16/9', numbers stay as written ('1.6')
// HTML comments and per-slide <style> blocks are not content, but inside code fences and inline code they are
export const stripNonContent = md => md.replace(/(^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)|(`+)[^`\n][\s\S]*?\3|<!--[\s\S]*?-->|<style[\s\S]*?<\/style>/g,
  m => (m.startsWith('<') ? '' : m))
export function headFormat(md) {
  const fm = splitSlides(md).find(s => s.fm || s.body.some(l => l.trim()))?.fm // a leading `---` opens the headmatter
  const ar = fmGet(fm, 'aspectRatio')?.replace(/\s+/g, '').replace(':', '/'), cw = +fmGet(fm, 'canvasWidth')
  const tr = trOf(fm) // the project's default transition
  const dur = parseDuration(fmGet(fm, 'duration')) // the planned talk length
  return { ...(ar && { aspectRatio: ar }), ...(cw > 0 && { canvasWidth: cw }), ...(TRANSITIONS.includes(tr) && { transition: tr }), ...(dur && { duration: dur }) }
}

// Slidev components that would otherwise vanish (outside code): the slide number and count become Slidecko's fields,
// <AutoFitText> its text, <LightOrDark> its light part (slides stay light), every <v-switch> step one after the other,
// a ::code-group a <div data-tabs> around its code blocks (the import makes them one code element with tabs)
const COMPS = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[`~]*[ \t]*$|(`+)[^`\n][\s\S]*?\2|<(SlideCurrentNo|SlidesTotal)\s*\/>|\{\{\s*\$(?:slidev\.)?(?:nav\.)?(currentPage|total|configs\.title)\s*\}\}|<AutoFitText\b([^>]*?)\/>|<LightOrDark>([\s\S]*?)<\/LightOrDark>|<template\s+(?:#|v-slot:)[\w-]+\s*>|<\/template>|<Arrow\b([^>]*?)\/>|^::code-group[ \t]*$|^::[ \t]*$/gm
// Slidev's <Arrow x1 y1 x2 y2 width color two-way> -> a positioned line with arrowheads (slope and heads from its direction)
function arrowBox(a) {
  const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(k => +attrOf(a, k))
  if (![x1, y1, x2, y2].every(Number.isFinite)) return
  const flat = Math.abs(y2 - y1) < 1, back = x2 < x1 // drawn right to left: the head is at the line's start
  const slope = flat ? '' : (y2 > y1) !== back ? 'down' : 'up'
  const head = /\btwo-way\b|\btwoWay\b/.test(a) ? 'both' : back ? 'start' : 'end'
  const sw = +attrOf(a, 'width') || 2, color = attrOf(a, 'color') || '#334155'
  const h = flat ? 20 : Math.abs(y2 - y1), y = flat ? y1 - 10 : Math.min(y1, y2)
  return `<div data-shape="line" data-fill="none" data-stroke="${color.replace(/"/g, '')}" data-sw="${sw}" data-radius="0"${slope ? ` data-slope="${slope}"` : ''} data-head="${head}" style="position:absolute;left:${Math.min(x1, x2)}px;top:${y}px;width:${Math.max(4, Math.abs(x2 - x1))}px;height:${h}px"></div>`
}
const FIELD_OF = { SlideCurrentNo: 'page', currentPage: 'page', SlidesTotal: 'total', total: 'total', 'configs.title': 'title' }
export const slidevComponents = md => { let groups = 0; return md.replace(COMPS, (m, f, c, no, nav, fit, lod, arrow) => {
  if (f || c) return m
  if (m.startsWith('::code-group')) return groups++, '<div data-tabs>'
  if (m.startsWith('::')) return groups ? (groups--, '</div>') : ''
  if (arrow != null) return arrowBox(arrow) ?? ''
  if (no || nav) return `<span data-field="${FIELD_OF[no || nav]}">#</span>`
  if (fit != null) return `<p>${(fit.match(/modelValue=["']([^"']*)["']/)?.[1] ?? '')}</p>`
  if (lod != null) return (lod.match(/<template\s+(?:#|v-slot:)light\s*>([\s\S]*?)<\/template>/)?.[1] ?? lod.replace(/<template\s+(?:#|v-slot:)dark\s*>[\s\S]*?<\/template>/, '')).trim()
  if (m.startsWith('<template')) return '<div>'
  if (m === '</template>') return '</div>'
  return ''
}) }

// Slidev's code snippets: a line `<<< @/snippets/a.js` (from the project root) or `<<< ./a.ts {2,3}` (next to the deck),
// optionally with a language and line options -> a fenced block with the file's code; get(path): its text or undefined
// shortcut: `#region` parts are not cut out, the whole file is shown
export const SNIPPET = /^<<<[ \t]+(\S+?)(?:#[\w-]+)?(?:[ \t]+([\w+-]+))?(?:[ \t]+(\{[^}\n]*\}))?[ \t]*$/gm
export const snippetPath = (p, root, dir) => resolve(p.startsWith('@/') ? root : dir, p.replace(/^@\//, ''))
export const snippets = (md, get, root = '', dir = '') => md.replace(SNIPPET, (m, p, lang, meta) => {
  const code = get(snippetPath(p, root, dir))
  if (code == null) return m
  const fence = '`'.repeat(Math.max(3, ...(code.match(/`{3,}/g) || []).map(f => f.length + 1)))
  return `${fence}${lang || p.split('.').pop()}${meta ? ' ' + meta : ''}\n${code.replace(/\n$/, '')}\n${fence}`
})

// Slidev's slots (`::right::` in two-cols, `::left::`/`::right::` below the header in two-cols-header) as the
// two-column grid the import reads; the default slot is the left column (two-cols) or the header above the columns
// shortcut: a line that is just `::name::` inside a code block would count too, rare enough to accept
const SLOT = /^::([\w-]+)::[ \t]*$/m
export function slots(md) {
  if (!SLOT.test(md)) return md
  const parts = { default: [] }
  let cur = 'default'
  for (const line of md.split('\n')) {
    const m = line.match(/^::([\w-]+)::[ \t]*$/)
    if (m) parts[cur = m[1]] ??= []
    else parts[cur].push(line)
  }
  const col = k => `<div>\n\n${(parts[k] || []).join('\n').trim()}\n\n</div>`
  const head = parts.left ? parts.default.join('\n').trim() + '\n\n' : ''
  return `${head}<div class="grid grid-cols-2 gap-4">\n${col(parts.left ? 'left' : 'default')}\n${col('right')}\n</div>`
}

// at: index of the slide's first body line (the source editor maps lint results back with it)
export function splitSlides(md) {
  const lines = md.split(/\r?\n/)
  const slides = []
  let cur = { fm: '', body: [], at: 0 }
  let fence = '' // the open code fence; only an equal or longer one of the same kind closes it
  for (let i = 0; i < lines.length; i++) {
    const mark = lines[i].match(/^\s*(`{3,}|~{3,})(.*)$/)
    if (mark && !fence) fence = mark[1]
    else if (mark && mark[1].startsWith(fence) && !mark[2].trim()) fence = ''
    if (fence || !/^---\s*$/.test(lines[i])) {
      cur.body.push(lines[i])
      continue
    }
    slides.push(cur)
    cur = { fm: '', body: [], at: i + 1 }
    // a `key: value` block closed by another `---` is the new slide's frontmatter
    const end = lines.findIndex((l, j) => j > i && /^---\s*$/.test(l))
    const fm = end > i ? lines.slice(i + 1, end) : []
    if (fm.some(l => l.trim()) && fm.every(l => /^([\w-]+:|\s|$)/.test(l))) {
      cur.fm = fm.join('\n').trim()
      i = end
      cur.at = end + 1
    }
  }
  slides.push(cur)
  return slides
}

function boxOf(attrs) {
  if (!/position:\s*absolute/.test(attrs)) return
  const px = key => parseFloat(attrs.match(new RegExp(`[;"'\\s]${key}:\\s*(-?[\\d.]+)px`))?.[1])
  const box = { x: px('left'), y: px('top'), w: px('width'), h: px('height') }
  if (Object.values(box).some(Number.isNaN)) return
  if (px('font-size')) box.fontSize = px('font-size')
  return box
}

// Slidev's <Link to="n">, <Toc>, <Youtube> and <iframe> as HTML the editor reads (outside code): a link to "#n", a box with data-toc
// (filled with a few lines, so a bare <Toc /> gets a height when measured)
const attrOf = (a, k) => a?.match(new RegExp(`(?:^|\\s):?${k}=["']([^"']*)["']`, 'i'))?.[1]
const TAGS = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[`~]*[ \t]*$|(`+)[^`\n][\s\S]*?\2|<Link\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Link>)|<Toc\b([^>]*?)(?:\/>|>\s*<\/Toc>)|(<div[^>]*\bdata-video=[^>]*>\s*)?<Youtube\b([^>]*?)(?:\/>|>\s*<\/Youtube>)|(<div[^>]*\bdata-web=[^>]*>\s*)?<iframe\b([^>]*?)(?:\/>|>[\s\S]*?<\/iframe>)/gm
export const slidevTags = (md, lines = 4) => md.replace(TAGS, (m, f, c, la, text, ta, wrapped, ya, webWrapped, ia) => {
  if (la != null) return `<a href="#${attrOf(la, 'to') || ''}">${text ?? attrOf(la, 'title') ?? ''}</a>`
  // Slidev's <Youtube id>: a video box (inside the data-video box Slidecko's export writes, that box is the video)
  if (ya != null) return wrapped || (/^[\w-]{11}$/.test(attrOf(ya, 'id') || '') ? `<div data-video="${attrOf(ya, 'id')}"></div>` : m)
  // an <iframe>: a web page box (https only); never left in the HTML that is measured, where it would load
  if (ia != null) {
    if (webWrapped) return webWrapped
    const src = attrOf(ia, 'src')
    return /^https:\/\/[^\s"'<>]+$/.test(src || '') ? `<div data-web="${src.replace(/&/g, '&amp;')}" style="aspect-ratio:16/9"></div>` : ''
  }
  if (ta == null) return m
  const o = Object.fromEntries(['minDepth', 'maxDepth', 'columns'].map(k => [k, +attrOf(ta, k) || undefined]))
  return `<div data-toc="${JSON.stringify(o).replace(/"/g, '&quot;')}"><ul>${'<li>&nbsp;</li>'.repeat(lines)}</ul></div>`
})

// a fenced block: ```mermaid becomes a diagram, everything else a code block
export const codeEl = (code, lang) => (lang === 'mermaid' ? { type: 'diagram', code } : { type: 'code', code, lang: lang || 'plaintext' })

function parseBody(body) {
  const tokens = marked.lexer(body)
  const blocks = []
  const divs = [] // open <div>s: 'cols' | 'col' | 'other' | { box }
  let group = 0, index = -1, pending = [], boxStart = false
  const where = () => ({ col: divs.includes('col') ? { group, index } : undefined, box: divs.findLast(d => d.box)?.box })
  const flush = () => {
    if (!pending.length) return
    pending.links = tokens.links
    blocks.push({ type: 'text', html: marked.parser(pending), ...where() })
    pending = []
  }
  const push = b => { flush(); blocks.push({ ...where(), ...b }); boxStart = false }

  for (const t of tokens) {
    if (t.type === 'space') continue
    // the slide title: a leading "# heading" (of the slide, or of a positioned box)
    if (t.type === 'heading' && t.depth === 1 && !pending.length && (!blocks.length || boxStart)) {
      push({ type: 'text', title: true, html: marked.parser([t]) })
    } else if (t.type === 'code') {
      const [, lang, meta] = (t.lang || '').match(/^([^\s{]*)(.*)$/)
      push({ type: 'code', code: t.text, lang: lang || 'plaintext', meta: meta.trim() })
    } else if (t.type === 'paragraph' && t.tokens.length === 1 && t.tokens[0].type === 'image') {
      push({ type: 'image', src: t.tokens[0].href })
    } else if (t.type === 'html') {
      const tag = /<div\b([^>]*)>|<\/div>|<img\b[^>]*>/g
      for (const m of t.raw.matchAll(tag)) {
        if (m[0].startsWith('<img')) {
          const src = m[0].match(/src=["']([^"']+)["']/)
          if (src) push({ type: 'image', src: src[1], ...(boxOf(m[0]) && { box: boxOf(m[0]) }) })
          continue
        }
        flush() // text before a div boundary belongs to the previous column/box
        boxStart = false
        if (m[0] === '</div>') divs.pop()
        else if (boxOf(m[1])) { divs.push({ box: boxOf(m[1]) }); boxStart = true }
        else if (divs.at(-1) === 'cols') { divs.push('col'); index++ }
        else if (/\b(flex|grid)\b/.test(m[1]) && !/flex-col/.test(m[1]) && !divs.includes('cols')) { divs.push('cols'); group++; index = -1 }
        else divs.push('other')
      }
      const rest = t.raw.replace(tag, '').trim() // other inline HTML, e.g. <v-clicks>, stays in the text
      if (rest) pending.push({ ...t, raw: rest, text: rest })
    } else {
      pending.push(t)
      boxStart = false
    }
  }
  flush()
  return blocks
}

// "./a.md" relative to the importing file's folder, "/a.md" relative to the project root
function resolve(dir, src) {
  const out = src.startsWith('/') ? [] : dir.split('/').filter(Boolean)
  for (const part of src.split('/')) {
    if (part === '..') out.pop()
    else if (part && part !== '.') out.push(part)
  }
  return out.join('/')
}

// read(path) returns the markdown of another project file (or undefined); it is used for slides
// that embed a file via `src:` frontmatter, like Slidev's slides.md entry file.
export function parseSlidev(md, read = () => undefined, path = '', seen = [path]) {
  const dir = path.split('/').slice(0, -1).join('/')
  return splitSlides(md).flatMap(s => {
    const src = fmGet(s.fm, 'src')
    if (src) {
      // shortcut: a slide range ("file.md#2-5") is ignored and the whole file embedded
      const target = resolve(dir, src.split('#')[0])
      const sub = seen.includes(target) ? undefined : read(target) // seen: no import cycles
      return sub === undefined ? [] : parseSlidev(sub, read, target, [...seen, target])
    }
    const md = s.body.join('\n').trim()
    if (!md && !fmGet(s.fm, 'image')) return [] // a picture slide (layout: image) has no text
    // blank lines before the next `---`, so that untouched slides are written back byte for byte
    const gap = s.body.length - 1 - s.body.findLastIndex(l => l.trim())
    // Slidev: the last comment of a slide is its speaker notes; comments are never content
    // (?!<!--): only the last comment, not everything from an earlier one up to it
    const notes = md.match(/<!--((?:(?!<!--)[\s\S])*?)-->\s*$/)?.[1].trim() || ''
    return [{ layout: fmGet(s.fm, 'layout') || 'default', transition: trOf(s.fm), blocks: parseBody(slots(slidevComponents(stripNonContent(md)))), fm: s.fm, md, file: path, notes, gap, ...(fmHidden(s.fm) && { hidden: true }) }]
  })
}
