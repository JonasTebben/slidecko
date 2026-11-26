import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { fmGet, fmHidden, TRANSITIONS, trOf } from '../import/parseSlidev.js'
import { parseDuration, slidevDuration } from '../present/rehearse.js'
import { parseRatio } from '../slide/format.js'
import { clock } from '../present/timer.js'
import { chartSvg } from '../slide/chart.js'
import { clickSteps, stepOf } from '../present/clicks.js'
import { linkTarget, slideNumbers } from '../slide/links.js'
import { MARKS, toVMark } from '../slide/marks.js'
import { iconTag, iconSet, ICON_SETS, ICONIFY_JSON } from '../slide/icons.js'
import { BUNDLED, bundledFaces, fontCss, usesFamily, FONT_EXT } from '../slide/fonts.js'
import { MATH } from '../slide/math.js'
import { tableCss, calloutCss, slidevThemeCss, themeOf, typoCss, fontStack, codeDark, shadowCss, CENTERED } from '../slide/themes.js'

// Project -> Slidev project files. Pure (no store, no browser-only APIs) so it is tested in Node.
//
// Compatibility rules:
// - A slide that was imported and not changed since is written back as its original markdown,
//   byte for byte (v-clicks, Tailwind classes, Mermaid, notes … all survive).
// - A changed or new slide is written as absolutely positioned <div>s on Slidev's canvas (980×552 at 16/9)
//   with markdown inside; importSlidev.js reads these boxes back at the same positions.
// - Slides return to the file (deck) they belong to; the entry file embeds the decks via `src:`.

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '*' })
turndown.use(gfm)
// text "<" would be read as an HTML tag (List<T> breaks Slidev's Vue compile), "&lt;" as an entity; code is not escaped
const mdEscape = turndown.escape.bind(turndown)
// $…$ math stays as typed (Slidev reads it as TeX), and so does an escaped \$
turndown.escape = s => {
  const kept = []
  const out = mdEscape(s.replace(MATH, m => `\0${kept.push(m) - 1}\0`)).replace(/&(?=#?\w+;)/g, '&amp;').replace(/</g, '&lt;')
  return out.replace(/\0(\d+)\0/g, (_, i) => kept[i])
}
// markup markdown cannot express stays HTML (Slidev renders inline HTML)
turndown.keep(node => ['V-CLICKS', 'V-CLICK', 'V-AFTER', 'MARK', 'U', 'SUB', 'SUP', 'KBD'].includes(node.nodeName) ||
  (node.nodeName === 'SPAN' && node.getAttribute('style')) || (node.nodeName === 'DIV' && node.getAttribute('data-callout')) ||
  (/^(P|H\d|LI)$/.test(node.nodeName) && /text-align/.test(node.getAttribute('style') || '')))
// list items one by one: each top-level list in Slidev's <v-clicks>, from the step of its first item (set by elementMd)
let listAt = 0
const inItem = n => { for (let p = n.parentNode; p; p = p.parentNode) if (p.nodeName === 'LI') return true }
turndown.addRule('clickItems', {
  filter: n => listAt > 0 && /^[OU]L$/.test(n.nodeName) && !inItem(n),
  replacement: (content, n) => {
    const at = listAt
    listAt += [...n.childNodes].filter(c => c.nodeName === 'LI').length
    return `\n\n<v-clicks at="${at}">\n\n${content.replace(/^\n+|\n+$/g, '')}\n\n</v-clicks>\n\n`
  },
})
// a link to a slide: Slidev's <Link to="n"> with the slide's number now; to a deleted or hidden slide: just the text
let curNums = new Map() // slide id -> Slidev number while toSlidev() runs
turndown.addRule('slideLink', {
  filter: n => n.nodeName === 'A' && !!linkTarget(n.getAttribute('href')),
  replacement: (content, n) => { const no = curNums.get(linkTarget(n.getAttribute('href'))); return no ? `<Link to="${no}">${content}</Link>` : content },
})
// v-mark: the mark span becomes Slidev's directive again (its text stays Markdown, which Slidev renders inside inline HTML)
turndown.addRule('vmark', {
  filter: n => n.nodeName === 'SPAN' && MARKS.includes(n.getAttribute('data-mark')),
  replacement: (content, n) => `<span ${toVMark({ mark: n.getAttribute('data-mark'), color: n.getAttribute('data-mark-color'), at: n.getAttribute('data-mark-at') })}${n.getAttribute('style') ? ` style="${esc(n.getAttribute('style'))}"` : ''}>${content}</span>`,
})
// slide number and count in a slide's text: Slidev's own components (read back as fields); the title stays its text,
// since {{ }} in slide text is escaped on purpose
turndown.addRule('field', {
  filter: n => n.nodeName === 'SPAN' && ['page', 'total'].includes(n.getAttribute('data-field')),
  replacement: (_, n) => (n.getAttribute('data-field') === 'page' ? '<SlideCurrentNo />' : '<SlidesTotal />'),
})
turndown.addRule('img', {
  filter: 'img',
  replacement: (_, n) => {
    const src = n.getAttribute('src') || ''
    const cls = n.getAttribute('class'), style = n.getAttribute('style'), alt = n.getAttribute('alt') || ''
    return cls || style ? `<img src="${esc(src)}"${cls ? ` class="${esc(cls)}"` : ''}${style ? ` style="${esc(style)}"` : ''} />` : `![${alt}](${src})`
  },
})

// identity of a slide's content, ignoring element ids (they change on every load) and the output of runnable code (Slidev runs it itself)
const hashOf = v => { let h = 0; for (const c of JSON.stringify(v)) h = (h * 31 + c.charCodeAt(0)) | 0; return h }
export const slideHash = slide => hashOf([slide.layout, slide.elements.map(({ id, mid, output, ...e }) => e)])
// a new slide's arrangement without its text (and heights, which grow with the text): while it stays the same,
// the slide follows the Slidev layout and is written as plain Markdown instead of positioned boxes
export const flowHash = slide => hashOf([slide.layout, slide.elements.map(({ id, mid, html, code, h, output, ...e }) => e)])
// only one column of text and code flows in Markdown the way it sits in the editor
export const flowable = els => els.every(e => (e.type === 'text' && !e.board) || e.type === 'code') && new Set(els.map(e => `${e.x},${e.w}`)).size <= 1
// a malformed escape ("100%.png") stays as written instead of stopping the export
export const imagePath = src => { try { src = decodeURI(src) } catch { /* keep src */ } return src.replace(/^\.?\//, '') }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
// decorative: role="presentation", because Markdown pictures without a description come with an empty alt too
const altAttr = el => (el.decorative ? ' alt="" role="presentation"' : el.alt ? ` alt="${esc(el.alt)}"` : '')

const SPACING_CSS = `[style*="--lh"] :is(p, li, h1, h2, h3, h4, h5, h6, blockquote) { line-height: var(--lh) !important; }
[style*="--ps"] > * { margin-block: 0 !important; }
[style*="--ps"] > * + *, [style*="--ps"] li + li { margin-top: var(--ps) !important; }`
function boxStyle(el, extra = '') {
  const px = n => Math.round(n) + 'px'
  let s = `position:absolute;left:${px(el.x)};top:${px(el.y)};width:${px(el.w)};height:${px(el.h)}`
  if (el.fontSize) s += `;font-size:${px(el.fontSize)}`
  if (el.color) s += `;color:${el.color}`
  if (fontStack(el.font)) s += `;font-family:${fontStack(el.font)};--heading-font:${fontStack(el.font)}`
  if (el.align) s += `;text-align:${el.align}`
  if (el.valign) s += `;display:flex;flex-direction:column;justify-content:${el.valign === 'middle' ? 'center' : 'flex-end'}`
  if (el.fill && el.type === 'text') s += `;background-color:${el.fillAlpha != null ? `color-mix(in srgb, ${el.fill} ${el.fillAlpha}%, transparent)` : el.fill}`
  if (el.stroke && el.type === 'text') s += `;border:${el.strokeWidth}px ${el.strokeStyle || 'solid'} ${el.stroke}`
  if ((el.fill || el.stroke) && el.type === 'text') s += ';padding:12px 16px;border-radius:10px'
  if (el.locked) s += ';--locked:1' // the editor's lock; Slidev ignores it
  if (el.group) s += `;--group:${el.group}` // the editor's group, likewise
  if (el.morph) s += `;--morph:${el.morph}` // Magic move name, likewise
  if (el.board) s += el.liveTemp ? ';--board:2' : ';--board:1' // editable while presenting (2: what is typed is not kept), likewise
  if (el.line != null) s += `;--lh:${el.line}` // line and paragraph spacing: SPACING_CSS in style.css applies them
  if (el.para != null) s += `;--ps:${el.para}px`
  if (shadowCss(el.shadow)) s += `;filter:${shadowCss(el.shadow)}`
  return s + extra
}

// a table cell is one Markdown line: a list in it stays HTML (Markdown would make it "- a<br>- b" text)
const inline = html => (/<(ul|ol)[\s>]/.test(html || '') ? html.replace(/\n+/g, '') : turndown.turndown(html || '').replace(/\n+/g, '<br>')).replace(/\|/g, '\\|') || ' '
function tableMd(el) {
  const align = c => ({ left: ':---', center: ':---:', right: '---:' })[el.align?.[c]] || '---'
  if (el.header !== false && !el.fills && !el.borders) {
    const [head, ...body] = el.rows
    const row = r => `| ${r.map(inline).join(' | ')} |`
    return [row(head), `| ${head.map((_, c) => align(c)).join(' | ')} |`, ...body.map(row)].join('\n')
  }
  // markdown tables always have a header row and no cell colours or borders; otherwise it stays an HTML table
  const style = (r, c) => [el.fills?.[r]?.[c] && `background:${el.fills[r][c]}`, ...['top', 'right', 'bottom', 'left'].map((k, i) => el.borders?.[r]?.[c]?.[i] && `border-${k}:${el.borders[r][c][i]}`)].filter(Boolean).join(';')
  const cell = (t, r) => (h, c) => `<${t}${el.align?.[c] ? ` align="${el.align[c]}"` : ''}${style(r, c) ? ` style="${style(r, c)}"` : ''}>${h}</${t}>`
  const head = el.header !== false ? `<thead><tr>${el.rows[0].map(cell('th', 0)).join('')}</tr></thead>` : ''
  const n = head ? 1 : 0
  return `<table>${head}<tbody>${el.rows.slice(n).map((r, i) => `<tr>${r.map(cell('td', i + n)).join('')}</tr>`).join('')}</tbody></table>`
}

export function shapeSvg(el) {
  const { w, h } = el, sw = el.strokeWidth || 0, f = el.fill || 'none', st = el.stroke || 'none'
  const a = `fill="${f}"${el.fillAlpha != null ? ` fill-opacity="${el.fillAlpha / 100}"` : ''} stroke="${st}" stroke-width="${sw}" vector-effect="non-scaling-stroke"`
  const i = sw / 2
  const body = {
    rect: `<rect x="${i}" y="${i}" width="${Math.max(0, w - sw)}" height="${Math.max(0, h - sw)}" rx="${el.radius || 0}" ${a}/>`,
    rounded: `<rect x="${i}" y="${i}" width="${Math.max(0, w - sw)}" height="${Math.max(0, h - sw)}" rx="${Math.min(w, h) / 4}" ${a}/>`,
    ellipse: `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${Math.max(0, w / 2 - i)}" ry="${Math.max(0, h / 2 - i)}" ${a}/>`,
    triangle: `<polygon points="${w / 2},${i} ${w - i},${h - i} ${i},${h - i}" ${a}/>`,
    arrow: `<polygon points="0,${h * 0.3} ${w - h / 2},${h * 0.3} ${w - h / 2},0 ${w},${h / 2} ${w - h / 2},${h} ${w - h / 2},${h * 0.7} 0,${h * 0.7}" ${a}/>`,
    line: `<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${st === 'none' ? f : st}" stroke-width="${sw || 3}" stroke-linecap="round"/>`,
  }[el.shape] || ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="overflow:visible">${body}</svg>`
}

let curShapeFont = {} // toSlidev()'s shapeFont while it runs
let curTheme // the deck's theme while toSlidev() runs: code blocks pick syntax colours for their background
function elementMd(el, flat, at = 0) { // at: step of the first list item (list items one by one)
  switch (el.type) {
    case 'image': {
      const r = el.radius ? `;border-radius:${el.radius}px` : ''
      if (el.crop) {
        // cropped: a clipping box with the picture scaled and shifted inside; data-crop brings the crop back on import
        const c = el.crop, p = v => Math.round(v * 1e4) / 100 + '%'
        return `<div data-crop="${[c.x, c.y, c.w, c.h].join(',')}" style="${boxStyle({ ...el, fontSize: 0 })};overflow:hidden${r}"><img src="${esc(el.src)}"${altAttr(el)} style="position:absolute;left:${p(-c.x / c.w)};top:${p(-c.y / c.h)};width:${p(1 / c.w)};height:${p(1 / c.h)};max-width:none;max-height:none;margin:0" /></div>`
      }
      return `<img src="${esc(el.src)}"${altAttr(el)}${el.cls ? ` class="${esc(el.cls)}"` : ''} style="${boxStyle({ ...el, fontSize: 0 })};object-fit:contain;max-width:none;max-height:none;margin:0${r}" />`
    }
    case 'code': {
      const size = el.fontSize ? `;--slidev-code-font-size:${el.fontSize}px;--slidev-code-line-height:${Math.round(el.fontSize * 1.4)}px` : ''
      const fence = '`'.repeat(Math.max(3, ...(el.code.match(/`+/g) || []).map(t => t.length + 1)))
      const info = [el.lang === 'plaintext' ? '' : el.lang, el.meta].filter(Boolean).join(' ')
      // own background, opacity and corners as Slidev's code variables; the class picks matching syntax colours
      const own = el.fill || el.fillAlpha != null
      const bg = own ? `;--slidev-code-background:${el.fillAlpha != null ? `color-mix(in srgb, ${el.fill || 'var(--code-bg, #f5f5f5)'} ${el.fillAlpha}%, transparent)` : el.fill}` : ''
      const look = bg + (el.radius != null ? `;--slidev-code-radius:${el.radius}px` : '') + (el.fill ? `;color:${codeDark(el, curTheme) ? '#e6edf3' : '#1f2328'}` : '')
      const block = `${fence}${info}\n${el.code}\n${fence}`
      if (flat) return block
      return `<div${el.fill ? ` class="${codeDark(el, curTheme) ? 'code-dark' : 'code-light'}"` : ''} style="${boxStyle(el, size + look)}">\n\n${block}\n\n</div>`
    }
    case 'diagram': { // Slidev renders ```mermaid itself; the box keeps position and size for the re-import
      const fence = '`'.repeat(Math.max(3, ...(el.code.match(/`+/g) || []).map(t => t.length + 1)))
      const block = `${fence}mermaid\n${el.code}\n${fence}`
      return flat ? block : `<div style="${boxStyle(el)}">\n\n${block}\n\n</div>`
    }
    case 'math': { // Slidev renders $$ blocks with KaTeX itself; the box keeps position, size and colour for the re-import
      const block = `$$\n${el.tex.replace(/\$\$/g, '$ $')}\n$$`
      return flat ? block : `<div style="${boxStyle(el, ';display:flex;flex-direction:column;justify-content:center')}">\n\n${block}\n\n</div>` // centred in its box, as in the editor
    }
    case 'table': {
      const data = `data-table="${el.preset || 'theme'}"${el.firstCol ? ' data-firstcol' : ''}${el.compact ? ' data-compact' : ''}${el.borders ? ' data-borders' : ''}`
      return `<div ${data} style="${boxStyle(el)}">\n\n${tableMd(el)}\n\n</div>`
    }
    case 'shape':
      return `<div data-shape="${el.shape}" data-fill="${el.fill}" data-stroke="${el.stroke}" data-sw="${el.strokeWidth || 0}" data-radius="${el.radius || 0}"${el.fillAlpha != null ? ` data-alpha="${el.fillAlpha}"` : ''} style="${boxStyle(el)}">${shapeSvg(el)}${el.html ? `<div class="shape-text" style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:8px 12px;text-align:${el.align || 'center'}"><div${curShapeFont[el.id] ? ` style="font-size:${curShapeFont[el.id]}"` : ''}>${el.html}</div></div>` : ''}</div>`
    case 'timer': { // Slidev has no timer: its start value as text, the data-* attributes bring it back on import
      const more = (el.face ? ` data-face="${el.face}"` : '') + (el.accent ? ` data-accent="${el.accent}"` : '') + (el.fill ? ` data-fill="${el.fill}"` : '') + (el.warn ? ' data-warn="1"' : '') + (el.auto ? ' data-auto="1"' : '') + (el.silent ? ' data-silent="1"' : '')
      return `<div data-timer="${el.seconds}"${more} style="${boxStyle(el)}">\n\n${el.seconds ? clock(el.seconds) : clock(0, true)}\n\n</div>`
    }
    case 'picker': // Slidev has no picker: the names as text, data-picks (JSON, one line) brings them back on import
      return `<div data-picks="${esc(JSON.stringify(el.names)).replace(/>/g, '&gt;')}"${el.repeat ? ' data-repeat="1"' : ''}${el.look ? ` data-look="${el.look}"` : ''}${el.heading != null ? ` data-heading="${esc(el.heading).replace(/>/g, '&gt;')}"` : ''}${el.noIcon ? ' data-noicon="1"' : el.icon ? ` data-pick-icon="${el.icon}"` : ''} style="${boxStyle(el)}">\n\n🎲 ${turndown.escape(el.names.join(' · '))}\n\n</div>`
    case 'quiz': // Slidev has no quiz: question and answers as text, the correct ones boxed in green on the next click (v-mark), data-quiz (JSON, one line) brings it back on import
      return `<div data-quiz="${esc(JSON.stringify({ question: el.question, answers: el.answers, look: el.look })).replace(/>/g, '&gt;')}" style="${boxStyle(el)}">\n\n**${turndown.escape(el.question)}**\n\n${el.answers.map((a, i) => (a.correct ? `- <span v-mark.box.green>**${'ABCDEF'[i]}** ${turndown.escape(a.text)}</span>` : `- **${'ABCDEF'[i]}** ${turndown.escape(a.text)}`)).join('\n')}\n\n</div>`
    case 'icon': // Slidev's Iconify component in the box; its colour and turns are on the icon
      return `<div style="${boxStyle({ ...el, color: undefined })}">\n\n${iconTag(el)}\n\n</div>`
    case 'chart': { // the picture as inline SVG in the theme's accent; data-chart (JSON, one line) brings the editable chart back on import
      const { kind, categories, series, legend, values, stacked, title, min, max, percent, catColors, palette } = el
      return `<div data-chart="${esc(JSON.stringify({ kind, categories, series, legend, values, stacked, title, min, max, percent, catColors, palette })).replace(/>/g, '&gt;')}" style="${boxStyle(el)}">${chartSvg(el, themeOf(curTheme).vars?.accent)}</div>`
    }
    case 'toc': { // Slidev's own <Toc>; data-toc brings the options (also the highlight Slidev lacks) back on import
      const { minDepth, maxDepth, columns, current, look } = el
      const props = [columns && ` columns="${columns}"`, minDepth && ` minDepth="${minDepth}"`, maxDepth && ` maxDepth="${maxDepth}"`].filter(Boolean).join('')
      return `<div data-toc="${esc(JSON.stringify({ minDepth, maxDepth, columns, current, look }))}" style="${boxStyle(el)}">\n<Toc${props} />\n</div>`
    }
    case 'video':
      return `<div data-video="${el.youtube}" style="${boxStyle(el)}">\n<Youtube id="${el.youtube}" width="100%" height="100%" />\n</div>`
    default: { // text
      listAt = el.clickItems ? at : 0
      const md = turndown.turndown(el.html || '').trim()
      listAt = 0
      if (flat) return md
      return `<div${el.color ? ' data-color' : ''} style="${boxStyle(el)}">\n\n${md}\n\n</div>`
    }
  }
}

// --- master and layouts (slide types) ---
// a field in master or layout text: <span data-field="page">#</span>, shown as the slide number, slide count or project title
export const FIELDS = { page: 'Slide number', total: 'Slide count', title: 'Project title' }
const FIELD = /(<span\b[^>]*\bdata-field="(page|total|title)"[^>]*>)[^<]*(<\/span>)/g
const htmlText = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const fillFields = (html, v) => (html?.includes('data-field') ? html.replace(FIELD, (_, a, k, b) => a + htmlText(v[k]) + b) : html)
// a slide's project layout: its own while that still has the slide's Slidev layout, else the first one with it
export const layoutOf = (s, layouts = []) => layouts.find(l => l.id === s.type && l.layout === s.layout) || layouts.find(l => l.layout === s.layout)
// drawn behind every slide of the layout (placeholders are copied into new slides instead)
export const decorations = l => l?.elements.filter(e => !e.placeholder) || []
const SLIDEV_LAYOUTS = ['cover', 'default', 'center', 'end', 'fact', 'full', 'iframe', 'iframe-left', 'iframe-right', 'image', 'image-left', 'image-right', 'intro', 'none', 'quote', 'section', 'statement', 'two-cols', 'two-cols-header']
// the Slidev names the deck's own layouts get on export (only decorated ones become layouts/<name>.vue); `theirs`: the project's own layout files
export const slidevNames = (layouts, theme, theirs = []) => layoutSlugs(layouts, [...SLIDEV_LAYOUTS, ...(themeOf(theme).layouts || []).map(x => x[0]), ...theirs])
// file names for decorated layouts, from their names; never the name of a Slidev or theme layout
function layoutSlugs(layouts, reserved) {
  const used = new Set(reserved), out = {}
  for (const l of layouts.filter(l => decorations(l).length)) {
    let base = l.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'layout'
    if (used.has(base)) base += '-layout'
    let k = base
    for (let i = 2; used.has(k); i++) k = `${base}-${i}`
    used.add(k)
    out[l.id] = k
  }
  return out
}
// Slidev's global layers and layouts are Vue files: elements as HTML (no Markdown there), fields as Slidev's own values;
// timers, pickers and quizzes need Markdown and are left out
const FIELD_VUE = { page: '{{ $nav.currentPage }}', total: '{{ $nav.total }}', title: '{{ $slidev.configs.title }}' }
function layerHtml(el) {
  const html = el.type === 'text' ? `<div${el.color ? ' data-color' : ''} style="${boxStyle(el)}">${el.html}</div>`
    : el.type === 'code' ? `<pre style="${boxStyle(el)};margin:0;overflow:hidden"><code>${esc(el.code)}</code></pre>`
      : el.type === 'table' ? `<div data-table="${el.preset || 'theme'}" style="${boxStyle(el)}">${tableMd({ ...el, fills: el.fills || [] })}</div>` // fills: always the HTML table
        : ['image', 'shape', 'video', 'chart', 'icon'].includes(el.type) ? elementMd(el) : ''
  return '    ' + escapeMustache(html).replace(FIELD, (_, a, k, b) => a + FIELD_VUE[k] + b)
}
// the data rides along in a comment, so a re-import gets the editable master and layouts back
const layerComment = (kind, data) => `<!-- slidecko-${kind} ${JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')} -->\n`
const strip = els => els.map(({ id, ...e }) => e)
// the master as Slidev's global-top layer: global-bottom sits behind the slide's opaque background and would never show.
// So in Slidev it lies over the slide's content (a slide with hideMaster: true has none); the class brings the theme's colours and fonts
const masterVue = master => layerComment('master', { elements: strip(master)}) + `<template>
  <div v-if="!$nav.currentSlideRoute?.meta?.slide?.frontmatter?.hideMaster" class="slidev-layout" style="position:absolute;inset:0;padding:0;background:none;pointer-events:none">
${master.map(layerHtml).filter(s => s.trim()).join('\n')}
  </div>
</template>
`
// a decorated layout: its Slidev layout as class (centred ones centre their content like Slidev's), the decorations behind the slide's content
const layoutVue = l => layerComment('layout', { id: l.id, name: l.name, layout: l.layout, elements: strip(l.elements) }) + `<template>
  <div class="slidev-layout ${l.layout}">
${decorations(l).map(layerHtml).filter(s => s.trim()).join('\n')}
    ${CENTERED.includes(l.layout) ? '<div class="my-auto w-full"><slot /></div>' : '<slot />'}
  </div>
</template>
`
// master and layouts from a Slidev export of Slidecko: { master, layouts: [{ ...layout, slug }] } (slug: the file name slides use)
export function readLayers(files = {}) {
  const read = p => { try { return JSON.parse(files[p].match(/^<!-- slidecko-\w+ (.*) -->/)[1]) } catch { return undefined } }
  const paths = Object.keys(files)
  const layouts = paths.filter(p => /(^|\/)layouts\/[\w-]+\.vue$/.test(p)).map(p => ({ ...read(p), slug: p.match(/([\w-]+)\.vue$/)[1] })).filter(l => Array.isArray(l.elements))
  const master = read(paths.find(p => /(^|\/)global-(top|bottom)\.vue$/.test(p)))?.elements
  return { master: Array.isArray(master) ? master : undefined, layouts }
}

export const COLORED = ':is(h1, h2, h3, h4, h5, h6, p, li, blockquote, strong, em)'
// CSS a changed slide needs beyond the theme (scoped to the slide by Slidev)
function slideStyle(slide) {
  const presets = [...new Set(slide.elements.filter(e => e.type === 'table' && e.preset !== 'theme').map(e => e.preset))]
  const tables = slide.elements.some(e => e.type === 'table' && (e.firstCol || e.compact || e.borders || e.preset !== 'theme'))
  const callouts = slide.elements.some(e => e.type === 'text' && /data-callout/.test(e.html))
  const css = (tables ? tableCss('.slidev-layout', presets) : '') + (callouts ? calloutCss('.slidev-layout') : '')
    // a text colour chosen for the box beats the theme's heading/paragraph colours
    + (slide.elements.some(e => e.type === 'text' && e.color) ? `.slidev-layout [data-color] ${COLORED} { color: inherit !important; }\n` : '')
    // a code block with an own background: Shiki's light or dark colours, whichever stays readable on it
    + (slide.elements.some(e => e.type === 'code' && e.fill) ? '.code-dark .shiki, .code-dark .shiki span { color: var(--shiki-dark) !important; }\n.code-light .shiki, .code-light .shiki span { color: var(--shiki-light) !important; }\n' : '')
  return css ? `\n\n<style>\n${css.trim()}\n</style>` : ''
}

// Slidev compiles slides as Vue templates: "{{" in text would be read as an interpolation.
// Fenced and inline code (Slidev adds v-pre there) and HTML tags are skipped; text gets Slidev's documented v-pre span.
// (an entity like &#123; would not help: markdown-it decodes it back to "{" before Vue sees it)
const VUE_SAFE = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[`~]*[ \t]*$|(?<!\\)(`+)(?!`)[\s\S]*?[^`]\2(?!`)|<\/?[a-zA-Z][^>]*>|\{\{/gm
export const escapeMustache = md => md.replace(VUE_SAFE, m => (m === '{{' ? '<span v-pre>{{</span>' : m))

// appear on click: Slidev's v-click attribute on the element's box, with its step (list items shown one by one take a step each)
// disappear on click as v-click.hide="n", both as the range v-click="[from, to]" (visible from, gone at)
function withClick(el, md, steps) {
  const at = k => steps.indexOf(k) + 1
  const attr = el.click && el.clickUntil ? `v-click="[${at(el.click)}, ${at(el.clickUntil)}]"` : el.click ? `v-click="${at(el.click)}"` : el.clickUntil ? `v-click.hide="${at(el.clickUntil)}"` : ''
  return attr ? md.replace(/^<(div|img)\b/, `<$1 ${attr}`) : md
}
// a shape or picture that jumps to a slide: Slidev's $nav.go on its box, data-to brings it back on import
const withTo = (el, md) => (el.to && curNums.get(el.to) ? md.replace(/^<(div|img)\b/, `<$1 data-to="${curNums.get(el.to)}" @click="$nav.go(${curNums.get(el.to)})"`) : md)
// an unchanged slide's links (<Link to="n">, [x](/n), [x](#n)) get the numbers their slides have now, in order of appearance
// shortcut: assumes the Markdown lists its slide links in the order of the slide's elements; data-to on boxes keeps its number
function relink(slide, md) {
  const ids = slide.elements.flatMap(e => [...(e.html || '').matchAll(/href="#slide-([\w-]+)"/g)].map(m => m[1]))
  let k = 0
  return ids.length && curNums.size ? md.replace(/(<Link\b[^>]*?\bto=")(\d+)(")|(\]\([/#])(\d+)(\))/g, (m, a, n, b, c, n2, d) => {
    const no = curNums.get(ids[k++])
    return !no ? m : a ? a + no + b : c + no + d
  }) : md
}
function slideMd(slide) {
  if (slide.md != null && slide.hash === slideHash(slide)) return relink(slide, slide.md)
  const flow = slide.flow != null && slide.flow === flowHash(slide)
  // the picture Slidev's image layouts draw from the frontmatter (image:) is not written twice
  const pic = /^image(-left|-right)?$/.test(slide.layout) && fmGet(slide.fm, 'image')
  const own = pic ? slide.elements.filter(e => !(e.type === 'image' && e.src === pic)) : slide.elements
  const els = flow ? [...own].sort((a, b) => a.y - b.y) : own
  const steps = clickSteps(slide)
  const body = escapeMustache(els.map(e => withClick(e, withTo(e, elementMd(e, flow, stepOf(slide, e, steps))), steps)).join('\n\n') + slideStyle(slide))
  // a "---" line in the notes would end the slide (Slidev splits there even inside a comment)
  return slide.notes ? `${body}\n\n<!--\n${slide.notes.replace(/-->/g, '—>').replace(/^---(?=\s*$)/gm, ' ---')}\n-->` : body
}

// the slide's own frontmatter, with `layout:` following the layout chosen in the editor and `hide:` the hidden switch
// `transition:` follows the editor; one the editor does not offer (slide-right …) stays while the slide follows the project default
// Magic move: Slidev gets `transition: fade` and `slidecko-transition: morph`, which brings it back on import
function withTransition(fm, v) {
  if (trOf(fm) === v || (!v && !TRANSITIONS.includes(trOf(fm)))) return fm
  fm = fm?.replace(/^slidecko-transition:.*(\n|$)/m, '').trim()
  const cur = fmGet(fm, 'transition'), to = v === 'morph' ? 'fade' : v
  if (cur !== to) fm = cur ? fm.replace(/^transition:.*(\n|$)/m, to ? `transition: ${to}$1` : '').trim() : [fm, `transition: ${to}`].filter(Boolean).join('\n')
  return v === 'morph' ? `${fm}\nslidecko-transition: morph` : fm
}
// first: the deck's first slide, which Slidev shows as a cover when it names no layout
function slideFm(slide, first) {
  let fm = slide.fm || ''
  if (!!slide.hidden !== fmHidden(fm)) fm = [fm.replace(/^(hide|disabled):.*\n?/gm, '').trim(), slide.hidden && 'hide: true'].filter(Boolean).join('\n')
  if (!!slide.hideMaster !== (fmGet(fm, 'hideMaster') === 'true')) fm = [fm.replace(/^hideMaster:.*\n?/gm, '').trim(), slide.hideMaster && 'hideMaster: true'].filter(Boolean).join('\n')
  // planned seconds for rehearsing: Slidev ignores the key, an import reads it back
  if ((slide.duration || 0) !== (+fmGet(fm, 'plannedTime') || 0)) fm = [fm.replace(/^plannedTime:.*\n?/gm, '').trim(), slide.duration && `plannedTime: ${slide.duration}`].filter(Boolean).join('\n')
  fm = withTransition(fm, slide.transition)
  // table of contents, background picture (fit and darkening are Slidecko's, Slidev ignores them) and Slidev's class:
  // (written only when set: the editor removes them from slide.fm itself, see setSlideProp, so older projects keep theirs)
  if (slide.hideInToc) fm = fmSet(fm, 'hideInToc', 'true')
  // a background the editor could not load (a web address, a colour) stays as written
  if (slide.bg || /^(\.{0,2}\/|[\w-]+\/)\S*\.(png|jpe?g|gif|webp|svg|avif)$/i.test(fmGet(fm, 'background') || '')) fm = fmSet(fmSet(fmSet(fm, 'background', slide.bg?.src), 'backgroundSize', slide.bg?.fit), 'backgroundDim', slide.bg?.dim)
  if (slide.cls) fm = fmSet(fm, 'class', slide.cls)
  if ((fmGet(fm, 'layout') || (first ? 'cover' : 'default')) === slide.layout) return fm
  const rest = fm.replace(/^layout:.*\n?/m, '').trim()
  return slide.layout === 'default' && !fmGet(fm, 'layout') && !first ? rest : [rest, `layout: ${slide.layout}`].filter(Boolean).join('\n')
}

// one frontmatter key set to v (removed when v is empty), unchanged when it already says so
export const fmSet = (fm, key, v) => ((fmGet(fm, key) ?? '') === String(v ?? '') ? fm : [fm.replace(new RegExp(`^${key}:.*\\n?`, 'm'), '').trim(), v != null && v !== '' && `${key}: ${v}`].filter(Boolean).join('\n'))

// slides: all of the project's, for the numbers of slide links (one slide's Markdown in the editor)
export function slideToMarkdown(slide, slides) {
  curNums = slides ? slideNumbers(slides) : new Map()
  const fm = slideFm(slide)
  return (fm ? `---\n${fm}\n---\n\n` : '') + slideMd(slide).trim() + '\n'
}

// returns { files: { path: text }, images: { path: assetId } }
// projectFiles: the project's other files (theme, package.json …), written back unchanged
// shapeFont: element id -> font size the editor shrank its shape text to
// fonts: what the project files need from the app, zip path -> 'fonts/…' (a bundled file) or an asset id (an uploaded font)
// image path in the Markdown -> asset id, for every image of these slides
export function imageMap(slides) {
  const images = {}
  for (const s of slides) if (s.bg) images[imagePath(s.bg.src)] = s.bg.asset // a slide's background picture
  for (const s of slides) for (const el of s.elements) {
    if (el.type === 'image' && el.src) images[imagePath(el.src)] = el.asset
    for (const m of JSON.stringify(el.html || el.rows || '').matchAll(/<img[^>]*?>/g)) {
      const id = m[0].match(/data-asset=\\"([^"\\]+)/)?.[1], src = m[0].match(/src=\\"([^"\\]+)/)?.[1]
      if (id && src && !/^(data|https?):/.test(src)) images[imagePath(src)] = id
    }
  }
  return images
}

export function toSlidev({ title, theme, entry, slides, typo, aspectRatio, canvasWidth, transition, duration, master = [], layouts = [], fonts: ownFonts = {} }, projectFiles = {}, { shapeFont = {}, assets = {} } = {}) {
  entry ||= 'slides.md'
  const dir = entry.split('/').slice(0, -1).join('/')
  // a theme that exists as a Slidev theme package (JBT) is named in the headmatter and package.json, the others become a generated style.css
  curTheme = theme
  curShapeFont = shapeFont
  curNums = slideNumbers(slides)
  const { slidev: own, pkg } = themeOf(theme)
  // consecutive slides of the same file form one part
  const head = transition !== 'none' ? transition : undefined // Slidev's default is no transition
  const parts = []
  for (const s of slides) {
    const file = s.file || entry
    if (parts.at(-1)?.file !== file) parts.push({ file, slides: [] })
    parts.at(-1).slides.push(s)
  }
  const files = { ...projectFiles }
  const write = (path, list) => {
    files[path] = list.map((s, i) => {
      const head = s.fm ? `---\n${s.fm}\n---` : i ? '---' : ''
      const next = i < list.length - 1 ? '\n'.repeat((s.gap ?? 1) + 1) : '\n'
      return [head, s.body].filter(Boolean).join('\n\n') + next
    }).join('')
  }
  // master and decorated layouts: Slidev's global-top.vue and layouts/<name>.vue (files of an earlier export are replaced)
  const root = dir ? dir + '/' : ''
  for (const p of Object.keys(files)) if (/^(global-(top|bottom)|layouts\/[\w-]+)\.vue$/.test(p.slice(root.length)) && files[p].startsWith('<!-- slidecko-')) delete files[p]
  if (master.length) files[root + 'global-top.vue'] = masterVue(master)
  const theirs = Object.keys(files).map(p => p.slice(root.length).match(/^layouts\/([\w-]+)\.vue$/)?.[1]).filter(Boolean) // the project's own layouts stay
  const slug = slidevNames(layouts, theme, theirs)
  for (const l of layouts) if (slug[l.id]) files[`${root}layouts/${slug[l.id]}.vue`] = layoutVue(l)
  // slides on a decorated layout name its file; the others keep their Slidev layout, so unchanged slides stay byte for byte
  const onLayout = s => { const k = slug[layoutOf(s, layouts)?.id]; return k ? { ...s, layout: k } : s }
  const entrySlides = []
  const used = {}
  for (const part of parts) {
    // slide 1's frontmatter is usually the headmatter, whose transition is the project default
    const list = part.slides.map(s => ({ fm: slideFm(onLayout(s === slides[0] && !s.transition ? { ...s, transition: head } : s), s === slides[0]), body: slideMd(s), gap: slideMd(s) === s.md ? s.gap : undefined }))
    if (part.file === entry) { entrySlides.push(...list); continue }
    // a file whose slides were split up by reordering continues in "name-2.md"
    const n = (used[part.file] = (used[part.file] || 0) + 1)
    const path = n > 1 ? part.file.replace(/(\.md)?$/, `-${n}.md`) : part.file
    write(path, list)
    const src = dir && path.startsWith(dir + '/') ? './' + path.slice(dir.length + 1) : dir ? '/' + path : './' + path
    entrySlides.push({ fm: `src: ${src}`, body: '' })
  }
  // headmatter (first frontmatter of the entry): theme and title
  const first = entrySlides[0] || (entrySlides[0] = { fm: '', body: '' })
  if (!fmGet(first.fm, 'theme')) first.fm = `theme: ${own || 'default'}\n${first.fm}`.trim()
  if (!fmGet(first.fm, 'title')) first.fm = `title: ${JSON.stringify(title || 'Presentation')}\n${first.fm}`.trim()
  // slide format: written when it is not Slidev's default or the headmatter already names it (a value that means the same stays as written)
  const ratio = v => parseRatio(v) || 16 / 9
  const format = (key, value, same, isDefault) => {
    const cur = fmGet(first.fm, key)
    if (cur ? same(cur) : isDefault) return
    first.fm = cur ? first.fm.replace(new RegExp(`^${key}:.*$`, 'm'), `${key}: ${value}`) : `${first.fm}\n${key}: ${value}`.trim()
  }
  if (aspectRatio) format('aspectRatio', aspectRatio, v => Math.abs(ratio(v) - ratio(aspectRatio)) < 1e-4, Math.abs(ratio(aspectRatio) - 16 / 9) < 1e-4)
  if (canvasWidth) format('canvasWidth', canvasWidth, v => +v === +canvasWidth, +canvasWidth === 980)
  first.fm = withTransition(first.fm, head) // Slidev: the headmatter's transition applies to every slide (shortcut: slide 1 cannot have its own)
  // the talk length is Slidev's `duration` (its presenter timer); a value that means the same stays as written
  if ((parseDuration(fmGet(first.fm, 'duration')) || 0) !== (duration || 0)) first.fm = [first.fm.replace(/^duration:.*\n?/m, '').trim(), duration && `duration: ${slidevDuration(duration)}`].filter(Boolean).join('\n')
  write(entry, entrySlides)
  if (!own) files['style.css'] = slidevThemeCss(theme) + (projectFiles['style.css'] ? '\n' + projectFiles['style.css'] : '') // the project's own rules stay
  // project-wide font sizes: Slidev loads style.css from the project root for every slide
  const typoRules = typoCss('.slidev-layout', typo, l => `.${l}`)
  if (typoRules) files['style.css'] = `${files['style.css'] || projectFiles['style.css'] || ''}\n/* font sizes for all slides (Slidecko) */\n${typoRules}`.trimStart()
  // fonts the slides or the theme name come along in public/fonts/ (Slidev serves public/ at /), so the project needs no network;
  // the block of an earlier export (style.css imported with the project) is replaced, not repeated
  if (files['style.css']) files['style.css'] = files['style.css'].replace(/\n?\/\* spacing \(Slidecko\) \*\/[\s\S]*?\/\* end of spacing \*\/\n?/g, '').replace(/\n?\/\* fonts \(Slidecko\) \*\/[\s\S]*?\/\* end of fonts \*\/\n?/g, '')
  // a text box's own line and paragraph spacing (--lh, --ps in its style), as in the editor (slide.css)
  if ([...slides, { elements: master }, ...layouts].some(s => s.elements?.some(e => e.line != null || e.para != null))) files['style.css'] = `${files['style.css'] || ''}\n/* spacing (Slidecko) */\n${SPACING_CSS}\n/* end of spacing */\n`.trimStart()
  const text = Object.values(files).join('\n'), fonts = {}, src = {}
  const bundled = Object.keys(BUNDLED).filter(k => usesFamily(text, BUNDLED[k][0]))
  for (const k of bundled) for (const f of [...bundledFaces(k).map(x => x[0]), `${k}/OFL.txt`]) fonts['public/fonts/' + f] = 'fonts/' + f
  for (const [id, name] of Object.entries(ownFonts)) {
    if (!usesFamily(text, name) || !assets[id]) continue
    src[id] = `/fonts/${id}.${FONT_EXT[assets[id].slice(5, assets[id].indexOf(';'))] || 'woff2'}`
    fonts['public' + src[id]] = id
  }
  if (Object.keys(fonts).length) files['style.css'] = `${files['style.css'] || ''}\n/* fonts (Slidecko) */\n${fontCss(bundled, ownFonts, src, '/fonts/')}\n/* end of fonts */\n`.trimStart()
  files['package.json'] ||= JSON.stringify({ name: 'slides', private: true, type: 'module', scripts: { dev: 'slidev --open', build: 'slidev build', export: 'slidev export' }, dependencies: { '@slidev/cli': '^52.11.3', '@slidev/theme-default': 'latest' } }, null, 2) + '\n'
  // the theme package must be installable; an imported package.json that already lists it stays byte for byte
  if (own && fmGet(first.fm, 'theme') === own) {
    try {
      const p = JSON.parse(files['package.json'])
      if (!p.dependencies?.[own]) files['package.json'] = JSON.stringify({ ...p, dependencies: { ...p.dependencies, [own]: pkg } }, null, 2) + '\n'
    } catch { /* not JSON: leave the project's file alone */ }
  }

  // Slidev renders icons from the @iconify-json package of their set
  const iconSets = [...new Set([...slides, { elements: master }, ...layouts].flatMap(s => s.elements.filter(e => e.type === 'icon').map(e => iconSet(e.icon))))].filter(k => ICON_SETS[k])
  try {
    const p = JSON.parse(files['package.json']), missing = iconSets.filter(k => !p.dependencies?.[`@iconify-json/${k}`] && !p.devDependencies?.[`@iconify-json/${k}`])
    if (missing.length) files['package.json'] = JSON.stringify({ ...p, dependencies: { ...p.dependencies, ...Object.fromEntries(missing.map(k => [`@iconify-json/${k}`, ICONIFY_JSON])) } }, null, 2) + '\n'
  } catch { /* not JSON: leave the project's file alone */ }

  const images = imageMap([...slides, { elements: master }, ...layouts])
  return { files, images, fonts }
}
