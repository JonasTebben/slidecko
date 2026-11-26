import PptxGenJS from 'pptxgenjs'
import JSZip from 'jszip'
import { toJpeg, toPng, getFontEmbedCSS } from 'html-to-image'
import { OdpDoc } from './exportOdp.js'
import { onePPr, numberFont, decorative, DECORATIVE, clickTiming, uniqueIds } from './pptxFix.js'
import { W, H, deck } from '../core/store.js'
import { SHADOWS } from '../slide/themes.js'
import { t } from '../core/i18n.js'
import { linkTarget } from '../slide/links.js'
import { pathPoints, markColor } from '../slide/marks.js'
import { iconSvg } from '../slide/icons.js'

// Builds the PPTX from the rendered slides (root contains one .slide per slide at 1:1), so
// colours, fonts and sizes come from the theme CSS instead of a second theme definition.
// Text stays editable text in PowerPoint/LibreOffice; line breaks and spacing are approximate.

let IN, PT // slide is 10in wide: inch and pt per css px, set per export from the current format (W)
// computed colours: rgb(a)(…) or color(srgb r g b / a) with 0–1 channels; null when (nearly) invisible
function rgba(c) {
  // oklch(), lab(), color(display-p3 …) stay in their own space when computed: let the canvas convert them to sRGB
  if (/^(ok)?(lab|lch)\(|^hwb\(|^color\((?!srgb )/.test(c || '')) {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#0000'
    ctx.fillStyle = c
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    c = `rgba(${r}, ${g}, ${b}, ${a / 255})`
  }
  const m = (c || '').match(/-?[\d.]+(e-?\d+)?/g)?.map(Number) || []
  if (m.length < 3) return null
  const k = c.startsWith('color(') ? 255 : 1
  const a = m[3] ?? 1
  return a < 0.05 ? null : { hex: m.slice(0, 3).map(n => Math.round(Math.max(0, Math.min(255, n * k))).toString(16).padStart(2, '0')).join('').toUpperCase(), a }
}
const hex = c => rgba(c)?.hex ?? null
const fillOf = c => { const x = rgba(c); return x && { color: x.hex, ...(x.a < 1 && { transparency: Math.round((1 - x.a) * 100) }) } }
const box = el => ({ x: el.offsetLeft * IN, y: el.offsetTop * IN, w: el.offsetWidth * IN, h: el.offsetHeight * IN })
// position of a nested node relative to its slide, in inches
const rel = (n, slide) => { const a = n.getBoundingClientRect(), b = slide.getBoundingClientRect(); return { x: (a.left - b.left) * IN, y: (a.top - b.top) * IN, w: a.width * IN, h: a.height * IN } }
// the font the browser really uses: the first installed family of the CSS stack. Generic names
// (system-ui …) have no name other programs know, so they map to the platform's matching font.
const APPLE = /Mac|iPhone|iPad/.test(navigator.platform)
const GENERIC = {
  'ui-sans-serif': APPLE ? 'Helvetica Neue' : 'Segoe UI', 'system-ui': APPLE ? 'Helvetica Neue' : 'Segoe UI', '-apple-system': 'Helvetica Neue',
  'sans-serif': 'Arial', serif: 'Times New Roman', 'ui-serif': 'Times New Roman', monospace: 'Courier New', 'ui-monospace': APPLE ? 'Menlo' : 'Consolas', cursive: 'Comic Sans MS',
}
const fonts = new Map()
const ctx = document.createElement('canvas').getContext('2d')
function installed(f) {
  const width = fb => { ctx.font = `40px "${f}", ${fb}`; return ctx.measureText('mmmwwwlli10OQ@').width }
  return ['monospace', 'serif'].some(fb => width(fb) !== (ctx.font = `40px ${fb}`, ctx.measureText('mmmwwwlli10OQ@').width))
}
const isMono = stack => { ctx.font = `40px ${stack}`; return ctx.measureText('iiiiii').width === ctx.measureText('MMMMMM').width }
export function fontName(stack) {
  if (!fonts.has(stack)) {
    const names = stack.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''))
    const name = names.map(n => GENERIC[n] || (/^(BlinkMacSystemFont|SFMono-Regular)$/.test(n) ? null : installed(n) && n)).find(Boolean) || 'Arial'
    // code: Google Slides (and PowerPoint without the font) swap unknown fonts for a proportional one
    // and code spills out of its box (tested: pitch family, PANOSE and font lists are ignored).
    // Courier New exists everywhere and has the same 0.6 em advance as Menlo/SF Mono, so lines keep their length.
    fonts.set(stack, isMono(stack) ? 'Courier New' : name)
  }
  return fonts.get(stack)
}
const AT_ORIGIN = { position: 'relative', left: '0', top: '0', margin: '0', transform: 'none' }
const SHAPE = { rect: 'rect', rounded: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', arrow: 'rightArrow', line: 'line' }
const BLOCK = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,tr,div'

// text nodes -> pptxgenjs runs; a paragraph ends where the nearest block ancestor changes
// top: where the text box starts (client px). Paragraph gaps and line heights are taken from the
// browser's layout, so text lines up with boxes drawn behind it (tiles, callouts).
// skip: subtrees exported as boxes of their own (columns)
function runs(root, pre, top = root.getBoundingClientRect().top, left = root.getBoundingClientRect().left, skip = []) {
  const out = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let last = null, lineHasText = false, bottom = top
  const para = new Map() // block -> its paragraph options
  const wrap = { top: null } // top of the current visual line, for browserLines()
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (skip.some(s => s.contains(n))) continue
    const lines = pre ? n.data.split('\n') : [n.data.replace(/\s+/g, ' ')]
    const inPre = !pre && !!n.parentElement.closest('pre') // a code block inside text (e.g. in a list item)
    // indentation between block tags is not content
    if (!pre && !inPre && !lines[0].trim() && (n.parentElement.matches('div,ul,ol,blockquote,table,thead,tbody,tr') || [n.previousSibling, n.nextSibling].some(s => !s || (s.nodeType === 1 && !getComputedStyle(s).display.startsWith('inline'))))) continue
    const cs = getComputedStyle(n.parentElement)
    const block = n.parentElement.closest(BLOCK)
    // CSS transforms (scale-80) shrink the layout but not the computed font size
    const scale = (b => b.offsetWidth ? b.getBoundingClientRect().width / b.offsetWidth : 1)(block || root)
    const options = {
      color: hex(cs.color) || '000000',
      fontSize: Math.round(parseFloat(cs.fontSize) * scale * PT * 10) / 10,
      fontFace: fontName(cs.fontFamily),
      bold: +cs.fontWeight >= 600,
      italic: cs.fontStyle === 'italic',
      // dimmed code lines (Slidev's highlighted lines) and line numbers are see-through
      ...(pre && n.parentElement.closest('.dim, .ln') && { transparency: n.parentElement.closest('.dim') ? 70 : 55 }),
      // links stay clickable; a link to a slide jumps to it (when that slide is exported)
      ...hyperlink(n.parentElement.closest('a[href]')),
      ...decoration(n.parentElement, root),
      ...(!pre && highlightOf(n.parentElement)),
    }
    const lb = block || root
    if (!para.has(lb)) {
      const bs = getComputedStyle(lb), r = lb.getBoundingClientRect(), edge = k => parseFloat(bs['padding' + k]) + parseFloat(bs[`border${k}Width`])
      const textTop = r.top + edge('Top')
      const lh = parseFloat(bs.lineHeight)
      // text inset inside a padded tile/box; pptxgenjs only writes marL for bullets, so an invisible one carries it
      const inset = (r.left + edge('Left') - left) * PT
      // the first paragraph's gap moves the box instead (out.offset, px): apps drop space-before at the top of a box
      const gap = Math.max(0, textTop - bottom)
      if (!pre && !para.size) out.offset = gap
      para.set(lb, {
        ...(!pre && !(lb.tagName === 'LI' && bs.listStyleType !== 'none') && inset > 1 && { bullet: { characterCode: '200B', indent: inset } }),
        ...(!pre && { paraSpaceBefore: para.size ? gap * PT : 0, paraSpaceAfter: 0 }),
        // exact points (PowerPoint, Keynote, LibreOffice); Google Slides scales those by 1.2, so its variant gets a multiple of 1.2 × size
        ...(Number.isFinite(lh) && (google
          ? { lineSpacingMultiple: Math.round(lh / (1.2 * parseFloat(bs.fontSize)) * 100) / 100 }
          : { lineSpacing: Math.round(lh * scale * PT * 10) / 10 })),
      })
      // a block's own text ends where a nested block (list, code, paragraph) begins, not at its own bottom
      const inner = !pre && [...lb.children].find(c => !getComputedStyle(c).display.startsWith('inline') && getComputedStyle(c).display !== 'none')
      if (!pre) bottom = inner ? inner.getBoundingClientRect().top - topMargin(inner) : r.bottom - edge('Bottom')
    }
    Object.assign(options, para.get(lb))
    if (block !== last && out.length) out.at(-1).options.breakLine = true
    // every run of a list item carries the bullet: pptxgenjs takes paragraph properties per run
    // loose lists (blank lines in Markdown) wrap the item's text in a <p>: its first paragraph carries the marker
    const item = block?.tagName === 'LI' ? block : block?.parentElement?.tagName === 'LI' && block === block.parentElement.firstElementChild && !block.previousSibling?.textContent.trim() ? block.parentElement : null
    if (!pre && item && getComputedStyle(item).listStyleType !== 'none') { // themes may hide the markers
      const li = item.getBoundingClientRect().left
      const indent = Math.max(8, (li - item.parentElement.getBoundingClientRect().left) * PT)
      // nested lists: a real outline level (marL = indent · (level + 1)), with the browser's marker
      const level = Math.max(0, Math.round((li - left) * PT / indent) - 1)
      const marker = { circle: '25E6', square: '25AA' }[getComputedStyle(item).listStyleType]
      // numbering continues across one <ol> and restarts at its start (Markdown "6." gives start="6")
      options.bullet = item.parentElement.tagName === 'OL' ? { type: 'number', indent, ...(item.parentElement.start > 1 && { numberStartAt: item.parentElement.start }) } : { indent, ...(marker && { characterCode: marker }) }
      if (level) options.indentLevel = level
    }
    // text the theme adds via ::before (e.g. the 💻 of hands-on titles)
    const before = !pre && block && block !== last && getComputedStyle(block, '::before').content.match(/^"(.+)"$/)?.[1]
    if (before) out.push({ text: before + ' ', options: { ...options } })
    // the marker takes the colour of the paragraph's first run: a line starting with a link would get a blue bullet
    const itemColor = item && options.bullet && options.bullet.characterCode !== '200B' && block !== last && hex(getComputedStyle(item).color)
    if (itemColor && itemColor !== options.color) { const { hyperlink, underline, highlight, ...o } = options; out.push({ text: '​', options: { ...o, color: itemColor } }) }
    if (block !== last) wrap.top = null
    last = block
    const edge = pre ? { l: 0, r: 0 } : inlineEdges(n, root)
    // the browser's line breaks become soft breaks (same paragraph): other apps' slightly wider
    // fonts then wrap exactly where the editor did
    const segs = pre ? null : inPre ? n.data.split('\n').map((text, i, a) => ({ text: text || (i < a.length - 1 ? ' ' : ''), soft: i > 0 })) : browserLines(n, wrap)
    let soft = !pre && segs[0]?.soft
    const push = run => {
      if (soft) { run.options.softBreakBefore = true; if (out.length) out.at(-1).text = out.at(-1).text.replace(/ +$/, ''); soft = false }
      out.push(run)
    }
    if (edge.l > 0.5) push(spacer(edge.l, cs, options))
    if (pre) lines.forEach((text, i) => {
      if (i) { // newline inside code
        if (!lineHasText) out.push({ text: ' ', options: { ...options } }) // keep empty lines
        out.at(-1).options.breakLine = true
        lineHasText = false
      }
      if (text) {
        out.push({ text, options: { ...options } })
        lineHasText = true
      }
    })
    else segs.forEach((s, i) => { if (i && s.soft) soft = true; if (s.text) { const text = inPre ? s.text : transform(s.text, cs.textTransform); push({ text, options: { ...options, ...charSpacing(text, cs, options.fontFace, scale) } }) } })
    if (edge.r > 0.5) out.push(spacer(edge.r, cs, options))
  }
  return out
}

// slide id -> its number in the exported file, set per export
let slideNo = new Map()
const toSlide = id => (slideNo.get(id) ? { hyperlink: { slide: slideNo.get(id) } } : {})
function hyperlink(a) {
  if (!a) return {}
  const to = linkTarget(a.getAttribute('href'))
  return to ? toSlide(to) : /^(https?|mailto):/.test(a.href) ? { hyperlink: { url: a.href } } : {}
}

// CSS text-transform, which other apps don't know (theme titles in capitals)
const transform = (t, how) => how === 'uppercase' ? t.toLocaleUpperCase('de') : how === 'lowercase' ? t.toLocaleLowerCase('de') : how === 'capitalize' ? t.replace(/(^|\s)(\p{L})/gu, (m, s, c) => s + c.toLocaleUpperCase('de')) : t

// fill and border of a block inside text, as shapes; one-sided borders (callout bars) as strips
function frame(slide, n, node, extra = {}) {
  const ns = getComputedStyle(n), f = fillOf(ns.backgroundColor), r = rel(n, node), radius = parseFloat(ns.borderTopLeftRadius) * IN
  const sides = ['Top', 'Right', 'Bottom', 'Left'].map(k => ({ k, w: ns[`border${k}Style`] !== 'none' ? parseFloat(ns[`border${k}Width`]) : 0, c: hex(ns[`border${k}Color`]) })).filter(s => s.w > 0 && s.c)
  const uniform = sides.length === 4 && sides.every(s => s.w === sides[0].w && s.c === sides[0].c)
  if (f || uniform) {
    const w = uniform ? sides[0].w * IN : 0 // the line is centred on the edge: inset by half its width
    const dash = { dashed: 'dash', dotted: 'sysDot' }[ns.borderTopStyle]
    slide.addShape(radius ? 'roundRect' : 'rect', { x: r.x + w / 2, y: r.y + w / 2, w: r.w - w, h: r.h - w, fill: f || { type: 'none' }, line: uniform ? { color: sides[0].c, width: sides[0].w * PT, ...(dash && { dashType: dash }) } : { type: 'none' }, rectRadius: radius, ...extra })
  }
  if (!uniform) for (const s of sides) {
    const t = s.w * IN
    slide.addShape('rect', { x: s.k === 'Right' ? r.x + r.w - t : r.x, y: s.k === 'Bottom' ? r.y + r.h - t : r.y, w: s.k === 'Top' || s.k === 'Bottom' ? r.w : t, h: s.k === 'Left' || s.k === 'Right' ? r.h : t, fill: { color: s.c }, line: { type: 'none' } })
  }
}

// side-by-side children of block flex/grid containers (columns inside one element), outermost first
function columnsIn(c) {
  const cols = []
  for (const e of c.querySelectorAll('*')) {
    if (cols.some(x => x.contains(e)) || !['flex', 'grid'].includes(getComputedStyle(e).display)) continue
    const kids = [...e.children].filter(k => k.offsetWidth && k.textContent.trim())
    const rs = kids.map(k => k.getBoundingClientRect())
    if (rs.some((r, i) => i && r.left >= rs[i - 1].right - 1 && r.top < rs[i - 1].bottom)) cols.push(...kids)
  }
  return cols
}

// text node -> [{ text, soft }] split where the browser started a new visual line (soft: starts one)
const range = document.createRange()
function browserLines(n, wrap) {
  const raw = n.data, segs = []
  let start = 0, soft = false
  for (let i = 0; i < raw.length; i++) {
    if (/\s/.test(raw[i])) continue
    range.setStart(n, i)
    range.setEnd(n, i + 1)
    const r = range.getClientRects()[0]
    if (!r) continue
    if (wrap.top != null && r.top > wrap.top + r.height / 2) {
      segs.push({ text: raw.slice(start, i), soft })
      start = i
      soft = true
    }
    wrap.top = r.top
  }
  segs.push({ text: raw.slice(start), soft })
  return segs.map((s, i) => {
    let text = s.text.replace(/\s+/g, ' ')
    if (s.soft) text = text.replace(/^ /, '')
    if (segs[i + 1]?.soft) text = text.replace(/ $/, '')
    return { text, soft: s.soft }
  })
}

// horizontal padding/border/margin of the inline elements (code chips, kbd …) that text node n opens or closes, in px
function inlineEdges(n, root) {
  const e = { l: 0, r: 0 }
  const texts = el => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: t => t.data.trim() ? 1 : 3 }); const a = []; for (let t = w.nextNode(); t; t = w.nextNode()) a.push(t); return a }
  for (let el = n.parentElement; el && el !== root; el = el.parentElement) {
    const s = getComputedStyle(el)
    if (!s.display.startsWith('inline')) break
    const t = texts(el)
    const side = k => parseFloat(s['padding' + k]) + parseFloat(s[`border${k}Width`]) + parseFloat(s['margin' + k])
    if (t[0] === n) e.l += side('Left')
    if (t.at(-1) === n) e.r += side('Right')
  }
  return e
}

// a block's top margin as laid out: margins of first children collapse through it (a nested <ul> without
// margin still sits 6px below its parent's text when its first <li> has margin-top: 6px)
function topMargin(el) {
  let m = 0
  for (let n = el; n; n = n.firstElementChild) {
    const s = getComputedStyle(n)
    if (!['block', 'list-item'].includes(s.display)) break // inline content: nothing collapses further
    m = Math.max(m, parseFloat(s.marginTop))
    if (parseFloat(s.paddingTop) || parseFloat(s.borderTopWidth)) break
    if ([...n.childNodes].find(c => c.nodeType === 1 || c.textContent.trim()) !== n.firstElementChild) break // text first
  }
  return m
}

// PowerPoint/Impress have no inline padding: a no-break space whose font size makes it exactly that wide
// letter spacing that makes the run as wide in the exported font as in the browser's (system-ui is
// SF Pro on macOS but Helvetica Neue in the file, ~4 % wider), so code boxes drawn at browser positions
// stay on their code; also carries CSS letter-spacing
// shortcut: canvas widths per run (no kerning across runs, the substitute must be installed here), upgrade to per-line ranges if runs drift
function charSpacing(text, cs, face, scale) {
  const n = [...text].length
  if (!n) return {}
  const f = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} `
  ctx.font = f + cs.fontFamily
  const want = ctx.measureText(text).width + (parseFloat(cs.letterSpacing) || 0) * n
  ctx.font = `${f}"${face}"`
  const pt = Math.round((want - ctx.measureText(text).width) / n * scale * PT * 100) / 100
  return Math.abs(pt) >= 0.02 ? { charSpacing: pt } : {}
}

function spacer(px, cs, options) {
  ctx.font = `100px ${cs.fontFamily}`
  const em = ctx.measureText(' ').width / 100 || 0.25
  const { hyperlink, underline, strike, ...o } = options
  const size = px * PT / em, count = Math.ceil(size / options.fontSize) // never taller than the text: no line grows
  return { text: ' '.repeat(count), options: { ...o, fontSize: Math.max(1, Math.round(size / count * 10) / 10) } }
}

// underline/strike as drawn: text-decoration of any inline ancestor, or a bottom border (Slidev's dashed link line)
function decoration(el, root) {
  const d = {}
  for (let n = el; n && n !== root; n = n.parentElement) {
    const s = getComputedStyle(n)
    if (!s.display.startsWith('inline') && n !== el) break
    const color = hex(s.textDecorationColor || s.color)
    if (!d.underline && s.textDecorationLine.includes('underline')) d.underline = { style: s.textDecorationStyle === 'dashed' ? 'dash' : s.textDecorationStyle === 'dotted' ? 'dotted' : 'sng', ...(color && { color }) }
    if (!d.underline && s.display.startsWith('inline') && parseFloat(s.borderBottomWidth) > 0 && s.borderBottomStyle !== 'none') d.underline = { style: s.borderBottomStyle === 'dashed' ? 'dash' : s.borderBottomStyle === 'dotted' ? 'dotted' : 'sng', ...(hex(s.borderBottomColor) && { color: hex(s.borderBottomColor) }) }
    if (s.textDecorationLine.includes('line-through')) d.strike = 'sngStrike'
    // inline backgrounds (code, mark) in table cells become a text highlight: text boxes get shapes drawn
    // behind them instead, a cell's fill would hide those. No alpha, so it is mixed with what lies behind
    const bg = !d.highlight && s.display.startsWith('inline') && n.closest('td, th') && rgba(s.backgroundColor)
    if (bg) d.highlight = bg.a < 1 ? mix(bg, behind(n.parentElement)) : bg.hex
  }
  return d
}
// v-mark: a highlight without a click step is the text's own highlight (a:highlight); the others are drawn as shapes
const cssHex = (c, n) => { ctx.fillStyle = '#000'; ctx.fillStyle = c.startsWith('var(') ? getComputedStyle(n).getPropertyValue('--accent').trim() || '#000' : c; return ctx.fillStyle.replace('#', '').toUpperCase() }
const nativeMark = m => !odp && m?.getAttribute('data-mark') === 'highlight' && !m.hasAttribute('data-mark-at')
const highlightOf = n => { const m = n.closest('[data-mark]'); return nativeMark(m) ? { highlight: cssHex(markColor(m.getAttribute('data-mark-color')), m) } : null }
// every stroke of a mark as a freeform line over the text, where the editor drew it (static: no click animation)
function markShapes(slide, el) {
  for (const g of el.querySelectorAll(':scope > svg.marks > g')) {
    if (!odp && g.dataset.type === 'highlight' && !g.dataset.click) continue // written as a:highlight
    for (const p of g.querySelectorAll('path')) {
      const pts = pathPoints(p.getAttribute('d')), cs = getComputedStyle(p), c = rgba(cs.stroke)
      if (pts.length < 2 || !c) continue
      const x0 = Math.min(...pts.map(q => q[0])), y0 = Math.min(...pts.map(q => q[1])), op = (+cs.strokeOpacity || 1) * c.a
      slide.addShape('custGeom', {
        x: (el.offsetLeft + x0) * IN, y: (el.offsetTop + y0) * IN, w: Math.max(0.5, Math.max(...pts.map(q => q[0])) - x0) * IN, h: Math.max(0.5, Math.max(...pts.map(q => q[1])) - y0) * IN,
        points: pts.map(([x, y], i) => ({ x: (x - x0) * IN, y: (y - y0) * IN, ...(!i && { moveTo: true }) })),
        fill: { type: 'none' }, line: { color: c.hex, width: Math.max(0.25, parseFloat(cs.strokeWidth) * PT), ...(op < 1 && { transparency: Math.round((1 - op) * 100) }) },
      })
    }
  }
}
// the nearest opaque background below an element (white over images and the like)
function behind(el) {
  for (; el; el = el.parentElement) { const c = rgba(getComputedStyle(el).backgroundColor); if (c?.a >= 1) return c.hex }
  return 'FFFFFF'
}
const mix = (c, under) => [0, 2, 4].map(i => Math.round(parseInt(c.hex.slice(i, i + 2), 16) * c.a + parseInt(under.slice(i, i + 2), 16) * (1 - c.a)).toString(16).padStart(2, '0')).join('').toUpperCase()

// PPTX only knows png/jpeg/gif reliably; everything else (svg, webp, …) is rasterized
// null for a picture the browser cannot show (broken, undecodable format) or read (other origin): it is left out
function pptxImage(img) {
  if (!img?.naturalWidth) return null
  if (/^data:image\/(png|jpeg|gif)/.test(img.src)) return img.src
  const c = document.createElement('canvas')
  c.width = Math.max(1, img.offsetWidth * 2)
  c.height = Math.max(1, img.offsetHeight * 2)
  try {
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/png')
  } catch { return null }
}

// the cropped part of a picture at its own resolution (at most 4096 px a side);
// shortcut: PowerPoint gets the cut-out, not the whole picture with a crop it could undo – use srcRect cropping if that is wanted
function croppedImage(img, c) {
  const nw = img.naturalWidth, nh = img.naturalHeight, k = Math.min(1, 4096 / Math.max(nw * c.w, nh * c.h))
  const cv = document.createElement('canvas')
  cv.width = Math.max(1, Math.round(nw * c.w * k))
  cv.height = Math.max(1, Math.round(nh * c.h * k))
  cv.getContext('2d').drawImage(img, c.x * nw, c.y * nh, c.w * nw, c.h * nh, 0, 0, cv.width, cv.height)
  return /^data:image\/jpeg/.test(img.src) ? cv.toDataURL('image/jpeg', 0.92) : cv.toDataURL('image/png')
}

// a chart as PowerPoint's own (editable data); colours, text colour and font as rendered
function nativeChart(pptx, svg, m, bg) {
  const cs = getComputedStyle(svg), ink = hex(cs.color) || '000000', font = fontName(cs.fontFamily), size = Math.round((m.fontSize || 16) * 0.85 * PT * 10) / 10
  const pie = m.kind === 'pie' || m.kind === 'donut'
  const colorOf = i => { const n = svg.querySelector(`[data-s="${i}"]`), s = n && getComputedStyle(n); return (s && (hex(s.fill) || hex(s.stroke))) || '888888' }
  const data = (pie ? m.series.slice(0, 1) : m.series).map(s => ({ name: s.name, labels: m.categories, values: s.values }))
  const text = k => ({ [k + 'Color']: ink, [k + 'FontFace']: font, [k + 'FontSize']: size })
  return [pie ? (m.kind === 'donut' ? pptx.ChartType.doughnut : pptx.ChartType.pie) : m.kind === 'line' ? pptx.ChartType.line : pptx.ChartType.bar, data, {
    chartColors: (pie ? m.categories : m.series).map((_, i) => colorOf(i)),
    showLegend: !!m.legend, legendPos: 'b', ...text('legend'),
    showValue: !!m.values, ...text('dataLabel'), dataLabelFormatCode: m.percent ? '0.##"%"' : 'General', valAxisLabelFormatCode: m.percent ? '0.##"%"' : 'General', ...(pie && { showPercent: false, dataLabelPosition: 'outEnd' }), ...(m.kind === 'donut' && { holeSize: 55 }),
    ...(m.title && { showTitle: true, title: m.title, titleColor: ink, titleFontFace: font, titleFontSize: Math.round(size * 1.47 * 10) / 10 }),
    ...(!pie && {
      barDir: m.kind === 'bar' ? 'bar' : 'col', barGrouping: m.stacked ? 'stacked' : 'clustered',
      catAxisOrientation: m.kind === 'bar' ? 'maxMin' : 'minMax', // horizontal bars: the first category on top, as in the editor
      ...text('catAxisLabel'), ...text('valAxisLabel'), valGridLine: { color: mix({ hex: ink, a: 0.2 }, bg), size: 0.75 }, catGridLine: { style: 'none' },
      ...(m.min != null && { valAxisMinVal: m.min }), ...(m.max != null && { valAxisMaxVal: m.max }),
      ...(m.kind === 'line' && { lineSize: 2.25, lineDataSymbol: 'circle', lineDataSymbolSize: 6 }),
    }),
  }]
}
// the chart's SVG as a PNG (ODP): its text colour and font written in, as a picture loses the page's CSS
async function svgImage(svg, w, h) {
  const c = svg.cloneNode(true), cs = getComputedStyle(svg)
  c.setAttribute('width', w)
  c.setAttribute('height', h)
  c.style.color = cs.color
  c.style.fontFamily = cs.fontFamily
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(c))
  try { await img.decode() } catch { return null }
  const cv = document.createElement('canvas')
  cv.width = Math.max(1, w * 2)
  cv.height = Math.max(1, h * 2)
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height)
  return cv.toDataURL('image/png')
}

// one table cell -> pptxgenjs cell with the rendered fill, font and borders
function cell(td) {
  const cs = getComputedStyle(td)
  let bg = null
  for (let n = td; n && !bg; n = n.parentElement) { bg = fillOf(getComputedStyle(n).backgroundColor); if (n.tagName === 'TABLE') break }
  // pptxgenjs knows solid and dash (dotted lines come out dashed); `css` keeps the real style for the ODP writer
  const side = s => { const w = parseFloat(cs[`border${s}Width`]), c = hex(cs[`border${s}Color`]), st = cs[`border${s}Style`]; return w && c && st !== 'none' && st !== 'hidden' ? { type: /dash|dot/.test(st) ? 'dash' : 'solid', css: st, pt: Math.max(0.25, w * PT), color: c } : { type: 'none' } }
  // indents are measured from the content edge: the cell's padding is already its margin
  const text = runs(td, false, undefined, td.getBoundingClientRect().left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth))
  return {
    text: text.length ? text : '',
    options: {
      ...(bg && { fill: bg }), valign: 'middle',
      align: ['center', 'right'].includes(cs.textAlign) ? cs.textAlign : 'left',
      margin: [parseFloat(cs.paddingTop), parseFloat(cs.paddingRight), parseFloat(cs.paddingBottom), parseFloat(cs.paddingLeft)].map(v => v * PT),
      border: ['Top', 'Right', 'Bottom', 'Left'].map(side),
    },
  }
}

// root: one .slide per slide at 1:1; slides: their data (for shape kinds)
// alt text of a picture; decorative ones get a name that decorative() in pptxFix.js turns into PowerPoint's mark
const altOf = m => (m.decorative ? { altText: '', objectName: DECORATIVE } : m.alt ? { altText: m.alt } : {})
// format: 'pptx' | 'odp' (same layout pass, other writer); images: data URLs of the rendered
// slides – then every slide is one picture (exactly as in the editor, text not editable)
let odp = false // OpenDocument: no text highlight, so marks are always shapes
let google = false // Google Slides variant (see runs())
// KaTeX is HTML that PowerPoint and LibreOffice cannot hold: a formula, or a text box with $…$ in it, becomes a
// picture of the rendered element (3× for print; static: an absolute box comes out empty), its TeX source as alt text; fonts embedded once
let mathFonts
async function mathPicture(el, root) {
  mathFonts ??= getFontEmbedCSS(root)
  try { return await toPng(el, { pixelRatio: 3, style: { position: 'static', margin: '0' }, fontEmbedCSS: await mathFonts }) } catch { return null }
}
const sourceText = html => { const t = document.createElement('template'); t.innerHTML = html || ''; return t.content.textContent.replace(/\s+/g, ' ').trim() }
export async function exportPptx(root, name = deck.title, slides = [], { format = 'pptx', images, forGoogle = false } = {}) {
  google = forGoogle
  odp = format === 'odp'
  mathFonts = null
  IN = 10 / W
  PT = 720 / W
  const pptx = format === 'odp' ? new OdpDoc() : new PptxGenJS()
  pptx.defineLayout({ name: 'slides', width: W * IN, height: H * IN })
  pptx.layout = 'slides'
  pptx.title = name
  const masters = {} // background key -> master name
  // the master's and layouts' elements are rendered on the slides too (behind their own), and exported like them
  slideNo = new Map()
  slides.forEach((s, i) => { if (!slideNo.has(s.id)) slideNo.set(s.id, i + 1) }) // a quiz's solution copy comes second
  const model = new Map([...slides, { elements: deck.master }, ...deck.layouts].flatMap(s => s.elements.map(e => [e.id, e])))
  const timing = [] // per slide: the objects of each element that appears or disappears on click, with its steps

  for (const [index, node] of [...root.querySelectorAll('.slide')].entries()) {
    // decorated backgrounds (title bar, cover photo with gradient overlay, frame) are rendered by the
    // browser without content and become a slide master each: exact, and stored once, not per slide
    const cs = getComputedStyle(node)
    const color = hex(cs.backgroundColor) || 'FFFFFF'
    let masterName
    if (!images && (cs.backgroundImage !== 'none' || parseFloat(cs.borderTopWidth) > 0)) {
      const key = [cs.backgroundImage, cs.backgroundSize, cs.backgroundPosition, cs.backgroundColor, cs.backgroundBlendMode, cs.borderTopWidth, cs.borderTopColor].join('|')
      if (!masters[key]) {
        const data = await toJpeg(node, { width: W, height: H, pixelRatio: 2, quality: 0.92, style: AT_ORIGIN, filter: () => false })
        masters[key] = `bg-${Object.keys(masters).length + 1}`
        pptx.defineSlideMaster({ title: masters[key], background: { data } })
      }
      masterName = masters[key]
    }
    const slide = images ? pptx.addSlide() : pptx.addSlide(masterName ? { masterName } : undefined)
    if (slides[index]?.notes) slide.addNotes(slides[index].notes)
    if (images) {
      slide.addImage({ data: images[index], x: 0, y: 0, w: W * IN, h: H * IN })
      continue
    }
    if (!masterName) slide.background = { color }
    // appear / disappear on click (data-click, data-until: the steps SlideView wrote): every object the element becomes
    const count = () => (slide._slideObjects || slide.items).length, marks = []
    for (const el of node.querySelectorAll('.el')) {
      marks.push({ at: count(), click: +el.dataset.click || 0, until: +el.dataset.until || 0 })
      const m = model.get(el.dataset.el) || {}
      const type = el.classList.contains('diagram') ? 'image' : ['image', 'code', 'table', 'shape', 'video', 'chart', 'icon'].find(t => el.classList.contains(t)) || 'text' // a diagram is its rendered picture
      // the element's shadow (straight down, black), in points
      const sh = SHADOWS[m.shadow] && { shadow: { type: 'outer', angle: 90, blur: SHADOWS[m.shadow].blur * PT, offset: SHADOWS[m.shadow].y * PT, color: '000000', opacity: SHADOWS[m.shadow].a } }
      // a timer with a ring, bar or background and the draw card: the same picture route (their text as alt text)
      if (el.classList.contains('math') || (type === 'text' && el.querySelector('.katex')) || (m.type === 'timer' && (m.face || m.fill)) || m.type === 'picker') {
        const data = await mathPicture(el, root)
        if (data) slide.addImage({ data, ...box(el), ...sh, altText: m.type === 'math' ? m.tex : ['timer', 'picker'].includes(m.type) ? el.textContent.replace(/\s+/g, ' ').trim() : sourceText(m.html) })
        continue
      }
      if (type === 'image' && !el.querySelector('img')?.naturalWidth) continue // broken picture: nothing to export
      if (type === 'image' && m.crop) {
        // cropped: the visible part as its own picture, filling the box
        slide.addImage({ data: croppedImage(el.querySelector('img'), m.crop), x: el.offsetLeft * IN, y: el.offsetTop * IN, w: el.offsetWidth * IN, h: el.offsetHeight * IN, ...sh, ...altOf(m), ...toSlide(m.to) })
      } else if (type === 'image') {
        const img = el.querySelector('img'), is = getComputedStyle(img)
        // the picture sits inside the img's padding and border (classes like p-4, border), object-fit: contain done by hand
        const e = k => parseFloat(is['padding' + k]) + parseFloat(is[`border${k}Width`])
        const bw = parseFloat(is.borderTopWidth), bc = bw && is.borderTopStyle !== 'none' && hex(is.borderTopColor)
        if (bc) slide.addShape('rect', { x: (el.offsetLeft + bw / 2) * IN, y: (el.offsetTop + bw / 2) * IN, w: (el.offsetWidth - bw) * IN, h: (el.offsetHeight - bw) * IN, fill: { type: 'none' }, line: { color: bc, width: bw * PT } })
        const cx = el.offsetLeft + e('Left'), cy = el.offsetTop + e('Top'), cw = el.offsetWidth - e('Left') - e('Right'), ch = el.offsetHeight - e('Top') - e('Bottom')
        const k = Math.min(cw / (img.naturalWidth || cw), ch / (img.naturalHeight || ch))
        const w = (img.naturalWidth || cw) * k, h = (img.naturalHeight || ch) * k
        const data = pptxImage(img)
        if (data) slide.addImage({ data, x: (cx + (cw - w) / 2) * IN, y: (cy + (ch - h) / 2) * IN, w: w * IN, h: h * IN, ...sh, ...altOf(m), ...toSlide(m.to) })
      } else if (type === 'table') {
        const table = el.querySelector('table')
        const rows = [...table.rows].map(tr => [...tr.cells].map(cell))
        const tw = table.offsetWidth
        slide.addTable(rows, {
          ...rel(table, node), colW: [...table.rows[0].cells].map(c => c.offsetWidth * IN),
          rowH: [...table.rows].map(r => r.offsetHeight * IN), autoPage: false, w: tw * IN,
        })
      } else if (type === 'shape') {
        const g = el.querySelector('svg > *')
        const gs = g && getComputedStyle(g)
        const line = m.shape === 'line'
        const stroke = gs && hex(gs.stroke)
        slide.addShape(SHAPE[m.shape] || 'rect', {
          // a line: straight through the middle, or corner to corner (rising: flipped); arrowheads as PowerPoint's line ends
          ...box(el), ...(line && !m.slope && { y: (el.offsetTop + el.offsetHeight / 2) * IN, h: 0 }), ...(line && m.slope === 'up' && { flipV: true }),
          ...(!line && gs && fillOf(gs.fill) ? { fill: (f => +gs.fillOpacity < 1 ? { ...f, transparency: Math.round(100 - (100 - (f.transparency || 0)) * gs.fillOpacity) } : f)(fillOf(gs.fill)) } : {}),
          line: stroke ? {
            color: stroke, width: Math.max(0.5, (parseFloat(gs.strokeWidth) || (line ? 3 : 0)) * PT),
            ...(line && /start|both/.test(m.head) && { beginArrowType: 'triangle' }), ...(line && /end|both/.test(m.head) && { endArrowType: 'triangle' }),
          } : { type: 'none' },
          ...(m.shape === 'rounded' && { rectRadius: Math.min(el.offsetWidth, el.offsetHeight) / 4 * IN }),
          ...(m.shape === 'rect' && m.radius && { rectRadius: m.radius * IN }), ...sh, ...toSlide(m.to),
        })
        // text in the shape: one text box over it, centred like in the browser
        const st = el.querySelector('.shape-text')
        if (st?.textContent.trim()) {
          const area = rel(st, node), b = node.getBoundingClientRect(), text = runs(st, false, b.top + area.y / IN, b.left + area.x / IN)
          const ta = getComputedStyle(st.firstElementChild || st).textAlign
          if (text.length) slide.addText(text, { ...area, valign: 'middle', align: ['left', 'right', 'justify'].includes(ta) ? ta : 'center', margin: 0, fit: 'none', wrap: true })
        }
      } else if (type === 'icon' && m.body) {
        // a vector picture in its rendered colour (pptxgenjs adds a PNG for older readers, sized 2× the box); alt text: the label, else the icon's name
        const svg = iconSvg(m, { color: '#' + (hex(getComputedStyle(el).color) || '000000'), width: el.offsetWidth * 2, height: el.offsetHeight * 2 })
        slide.addImage({ data: 'data:image/svg+xml;base64,' + btoa(String.fromCharCode(...new TextEncoder().encode(svg))), ...box(el), altText: m.label || m.icon, ...sh })
      } else if (type === 'chart') {
        const svg = el.querySelector('svg')
        if (format === 'odp' || !m.series?.length || !m.categories?.length) { const data = svg && await svgImage(svg, el.offsetWidth, el.offsetHeight); if (data) slide.addImage({ data, ...box(el), ...sh }); continue }
        const [kind, data, opts] = nativeChart(pptx, svg, m, color)
        slide.addChart(kind, data, { ...opts, ...box(el) })
      } else if (type === 'video') {
        const link = `https://www.youtube.com/watch?v=${m.youtube}`
        slide.addText([{ text: '▶  ' + t('Watch the YouTube video'), options: { hyperlink: { url: link }, color: 'FFFFFF', bold: true, fontSize: 16 } }],
          { ...box(el), align: 'center', valign: 'middle', fill: { color: '111111' } })
      } else {
        let pre = type === 'code' && el.querySelector('pre')
        const out = pre && el.querySelector('pre.run-out') // runnable code: its output panel is a second code box
        const bar = pre && el.querySelector('.code-tabs') // a code group: its tab names above the first tab's code
        const content = pre || el.querySelector('.content') || el
        // boxes inside the text (callouts, quiz box, answer tiles, framed groups): drawn as shapes behind it
        // a filled or framed text box (rounded, maybe with a border): its box as a shape behind everything else
        if (!pre && content !== el && el.classList.contains('filled')) frame(slide, content, node, sh)
        if (!pre) for (const n of content.querySelectorAll('div, p, li, blockquote, h1, h2, h3, h4, ul, ol, pre')) if (n.offsetWidth) frame(slide, n, node)
        // inline code, marks …: one (semi-transparent) box per line they cover, as the browser draws them
        if (!pre) for (const n of content.querySelectorAll('code, mark, kbd, span')) {
          const ns = getComputedStyle(n), f = ns.display.startsWith('inline') && fillOf(ns.backgroundColor)
          if (f) for (const r of n.getClientRects()) {
            const b = node.getBoundingClientRect()
            slide.addShape(parseFloat(ns.borderTopLeftRadius) ? 'roundRect' : 'rect', { x: (r.left - b.left) * IN, y: (r.top - b.top) * IN, w: r.width * IN, h: r.height * IN, fill: f, line: { type: 'none' }, rectRadius: parseFloat(ns.borderTopLeftRadius) * IN })
          }
        }
        // one text box; columns (side-by-side flex/grid children) get boxes of their own, where the browser put them
        const emit = (c, main) => {
          const cols = pre ? [] : columnsIn(c)
          // text inside a single padded wrapper starts at the wrapper's padding, as in the browser
          const only = main && !pre && c.children.length === 1 ? c.firstElementChild : null
          // runs() measures from the content box, so the text box starts there too (the element may be padded)
          let area = main && (pre || c === el) ? (out || bar ? rel(c, node) : box(el)) : rel(c, node)
          if (only && !cols.length && fillOf(getComputedStyle(only).backgroundColor)) {
            const os = getComputedStyle(only), r = rel(only, node), pad = k => parseFloat(os['padding' + k]) * IN
            area = { x: r.x + pad('Left'), y: r.y + pad('Top'), w: r.w - pad('Left') - pad('Right'), h: r.h - pad('Top') - pad('Bottom') }
          }
          const b = node.getBoundingClientRect()
          const text = runs(c, !!pre, b.top + area.y / IN, b.left + area.x / IN, cols)
          const fill = !main ? null : fillOf(getComputedStyle(pre || c).backgroundColor) // a code background may be see-through
          const align = ['center', 'right', 'justify'].includes(getComputedStyle(c.firstElementChild || c).textAlign) ? getComputedStyle(c.firstElementChild || c).textAlign : 'left'
          // the breaks are already in the text: a little spare width keeps a wider substitute font from adding more
          if (!pre && !fill && align === 'left') area = { ...area, w: area.w * 1.04 }
          if (!pre && text.offset) {
            if (fill) text[0].options.paraSpaceBefore = text.offset * PT // a filled box stays put
            else area = { ...area, y: area.y + text.offset * IN, h: Math.max(0.05, area.h - text.offset * IN) }
          }
          // rounded code background: a rounded rectangle behind the text (text boxes have square corners)
          const round = pre && fill && parseFloat(getComputedStyle(pre).borderTopLeftRadius)
          if (round) slide.addShape('roundRect', { ...area, fill, line: { type: 'none' }, rectRadius: round * IN, ...(main && sh) })
          const boxed = main && !pre && c === content && el.classList.contains('filled') // already drawn as a shape below
          if (text.length) slide.addText(text, {
            ...area, valign: 'top', margin: pre ? 6 : 0, fit: 'none', wrap: !pre, align,
            ...(fill && !round && !boxed && { fill: typeof fill === 'string' ? { color: fill } : fill }),
            ...(main && !round && !boxed && sh), // the shadow sits on the box drawn behind, if there is one
          })
          for (const col of cols) emit(col, false)
        }
        emit(content, true)
        if (bar) {
          const bs = getComputedStyle(bar)
          const look = { color: hex(bs.color), fontSize: parseFloat(bs.fontSize) * PT, fontFace: fontName(bs.fontFamily) }
          slide.addText([...bar.children].map((b, k) => ({ text: (k ? '    ' : '') + b.textContent, options: { ...look, bold: b.classList.contains('on'), ...(b.classList.contains('on') && { underline: { style: 'sng' } }) } })),
            { ...rel(bar, node), margin: 0, valign: 'middle', fit: 'none', wrap: false })
        }
        if (out) { pre = out; emit(out, true) }
        // logos etc. inside the text: placed where the browser laid them out
        if (!pre) for (const img of content.querySelectorAll('img')) { const data = img.offsetWidth && pptxImage(img); if (data) slide.addImage({ data, ...rel(img, node) }) }
      }
      markShapes(slide, el)
    }
    timing[index] = marks.map((m, j) => ({ ...m, objs: Array.from({ length: (marks[j + 1]?.at ?? count()) - m.at }, (_, k) => m.at + k) })).filter(m => (m.click || m.until) && m.objs.length)
    slide.clicks = timing[index] // the ODP writer's animations
    const no = node.querySelector('.pageno')
    if (no && getComputedStyle(no).display !== 'none') {
      slide.addText(no.textContent, { x: (W - 60) * IN, y: (H - 28) * IN, w: 52 * IN, h: 20 * IN, align: 'right', fontSize: 9, color: hex(getComputedStyle(no).color) || '000000', margin: 0 })
    }
  }
  return format === 'odp' ? pptx.write() : insets(await pptx.write({ outputType: 'arraybuffer' }), slides, timing)
}

// the invisible bullets of runs() become a plain left margin: marL kept, no hanging indent, no bullet
// pptxgenjs writes control characters as they are (terminal escapes pasted into code, notes): invalid XML, PowerPoint
// rejects the file, so they are dropped everywhere
// Slidev plays the earlier slide's transition between two slides; PowerPoint plays it as the next slide's entrance
const PPT_TRANSITION = { fade: '<p:fade/>', 'slide-left': '<p:push dir="l"/>', 'slide-up': '<p:push dir="u"/>' }
// Magic move is PowerPoint's Morph (2016 and later pair the shapes themselves), older versions fade, as PowerPoint writes it
const MORPH = '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" Requires="p159"><p:transition spd="slow"><p159:morph option="byObject"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>'
async function insets(buf, slides, timing) {
  const zip = await JSZip.loadAsync(buf)
  for (const path of Object.keys(zip.files).filter(p => p.endsWith('.xml'))) {
    let xml = (await zip.file(path).async('string')).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '')
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(path)) { zip.file(path, xml); continue }
    xml = uniqueIds(xml)
    const before = slides[+path.match(/\d+/)[0] - 2], name = before && (before.transition || deck.transition), tr = name === 'morph' ? MORPH : PPT_TRANSITION[name] && `<p:transition spd="med">${PPT_TRANSITION[name]}</p:transition>`
    zip.file(path, decorative(numberFont(onePPr(xml.replace(/(<a:pPr[^>]*?marL="\d+") indent="-\d+"([^>]*>(?:(?!<\/a:pPr>).)*?)<a:buSzPct val="100000"\/><a:buChar char="&#x200B;"\/>/g, '$1 indent="0"$2<a:buNone/>')))
      .replace('</p:clrMapOvr>', m => m + (tr || '') + clickTiming(xml, timing[+path.match(/\d+/)[0] - 1]))))
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
}
