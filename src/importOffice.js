import JSZip from 'jszip'
import { uid } from './store.js'
import { formatSize, parseRatio } from './format.js'
import { t } from './i18n.js'

// Imports presentations made elsewhere into editable slides: PowerPoint (.pptx, also Google Slides
// and Keynote exports), OpenDocument (.odp, LibreOffice/Impress), PDF and plain images. Positions
// are scaled to the canvas of a new project in the source's aspect ratio (slideFormat); text keeps its size, colour, weight and lists as inline styles.
// Vertical anchoring becomes valign. Turned freeforms and pictures become SVGs (the editor has no rotation);
// turned text, rectangles and ellipses keep their unturned box (quarter turns: width/height swapped). Not taken over: cropping, gradients, animations, charts/SmartArt (their fallback image is used when present).

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp' }
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const xml = s => new DOMParser().parseFromString(s, 'application/xml')
const kids = (n, name) => [...(n?.children || [])].filter(c => !name || c.localName === name)
const kid = (n, ...path) => path.reduce((a, p) => a && kids(a, p)[0], n)
const all = (n, name) => (n ? [...n.getElementsByTagNameNS('*', name)] : [])
const r1 = n => Math.round(n * 10) / 10
// relative zip path, e.g. ("ppt/slides/slide1.xml", "../media/a.png") -> ppt/media/a.png
const resolve = (from, to) => (to.startsWith('/') ? to.slice(1) : decodeURI(new URL(to, 'http://x/' + from).pathname.slice(1)))

// --- shared: paragraphs -> the editor's HTML ---
// para: { align, list: 'ul' | 'ol' | null, num, line, before, after, runs: [{ text, br, b, i, u, size, color, font, weight, spacing, mark }], lvl, numType: CSS list-style-type }
// line: CSS line-height; before/after: CSS margins; marL/indent: px; num: number of a numbered item;
// bullet: the marker character; size: px font size for an empty paragraph
function runHtml(r) {
  if (r.br) return '<br>'
  const css = [r.size && `font-size:${r1(r.size)}px`, r.color && `color:${r.color}`, r.font && `font-family:'${r.font.replace(/['"<>;]/g, '')}',${/mono|consolas|courier|code|menlo/i.test(r.font) ? 'monospace' : 'sans-serif'}`,
    r.weight && `font-weight:${r.weight}`, r.mark && `background-color:${r.mark}`, r.spacing && `letter-spacing:${r1(r.spacing)}px`].filter(Boolean).join(';')
  let h = esc(r.text)
  if (r.b) h = `<strong>${h}</strong>`
  if (r.i) h = `<em>${h}</em>`
  if (r.u) h = `<u>${h}</u>`
  return css ? `<span style="${css}">${h}</span>` : h
}
export function parasHtml(paras) {
  let out = '', list = null
  for (const p of paras) {
    // indents: a list item's text starts at marL (the number sits in front), other paragraphs hang by indent
    const ind = p.marL == null ? '' : p.list ? `;margin-left:${r1(p.marL)}px` : `;padding-left:${r1(p.marL)}px;text-indent:${r1(p.indent || 0)}px`
    // the paragraph's own size (its largest run): CSS gives every line at least the paragraph's line height
    const size = Math.max(0, ...p.runs.map(r => (r.text ? r.size || 0 : 0))) || p.size
    const style = `margin-top:${p.before || 0};margin-bottom:${p.after || 0};line-height:${p.line || 1.2};white-space:pre-wrap${ind}${p.align ? `;text-align:${p.align}` : ''}` +
      (p.bullet ? `;list-style-type:'${p.bullet.replace(/['\\<>;]/g, '')} '` : p.numType && p.numType !== 'decimal' ? `;list-style-type:${p.numType}` : '') + (size ? `;font-size:${r1(size)}px` : '')
    // a break that ends the paragraph opens an empty line, which HTML only shows with a second <br>
    const shown = p.runs.filter(r => r.text || r.br) // empty runs draw nothing: an empty paragraph still needs its line
    const body = shown.length ? shown.map(runHtml).join('') + (shown.at(-1).br ? '<br>' : '') : '<br>'
    if (list !== p.list) { if (list) out += `</${list}>`; if (p.list) out += `<${p.list} style="margin:0">`; list = p.list }
    out += p.list ? `<li${p.num ? ` value="${p.num}"` : ''} style="${style}">${body}</li>` : `<p style="${style}">${body}</p>`
  }
  if (list) out += `</${list}>`
  return out
}
// PowerPoint numbering: empty paragraphs get no number and do not count; startAt restarts;
// each level counts on its own: deeper items do not interrupt it, any other text paragraph at its level or above ends it.
// Used as paragraphs.map(numbering) – state lives in the array.
const NUM_TYPE = { arabic: 'decimal', alphaLc: 'lower-alpha', alphaUc: 'upper-alpha', romanLc: 'lower-roman', romanUc: 'upper-roman' }
function numbering(p, i, all) {
  const empty = !p.runs.some(r => r.text?.trim())
  if (empty) return { ...p, list: null }
  const prev = all.slice(0, i).reverse().find(q => q.runs.some(r => r.text?.trim()) && (q.lvl || 0) <= (p.lvl || 0))
  p.num = p.list !== 'ol' ? undefined : p.startAt || (prev?.list === 'ol' && (prev.lvl || 0) === (p.lvl || 0) ? prev.num + 1 : 1)
  return p
}
// hex colour + DrawingML modifiers -> CSS colour
const toLin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toSrgb = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)
function modColor(hex, mods) {
  let [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), a = 1
  for (const m of mods) {
    const v = +m.getAttribute('val') / 100000
    if (m.localName === 'alpha') a = v
    // tint and shade work in linear light, as in PowerPoint: tint 20 % of 9BBB59 is EFF3E9, not EBF1DE
    else if (m.localName === 'shade') [r, g, b] = [r, g, b].map(x => toSrgb(toLin(x) * v))
    else if (m.localName === 'tint') [r, g, b] = [r, g, b].map(x => toSrgb(1 - (1 - toLin(x)) * v))
    else if (['lumMod', 'lumOff', 'satMod'].includes(m.localName)) {
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
      let l = (max + min) / 2, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0
      const h = !d ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
      if (m.localName === 'lumMod') l *= v; else if (m.localName === 'lumOff') l += v; else s *= v
      l = Math.min(1, Math.max(0, l)); s = Math.min(1, Math.max(0, s))
      const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h % 2) - 1)), o = l - c / 2
      ;[r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h) % 6].map(q => q + o)
    }
  }
  const to = x => Math.round(Math.min(1, Math.max(0, x)) * 255)
  return a < 1 ? `rgba(${to(r)},${to(g)},${to(b)},${r1(a * 100) / 100})` : '#' + [r, g, b].map(x => to(x).toString(16).padStart(2, '0')).join('').toUpperCase()
}
// DrawingML freeform (custGeom) -> SVG data URL at w×h; arcs as in the spec (radii, start, sweep in 60000ths of a degree)
// turn: rotation (degrees) and flips; the picture is the rotated shape's bounding box, returned as { svg, w, h }
function custSvg(cust, w, h, fill, stroke, sw, turn = { rot: 0 }) {
  const d = []
  for (const path of all(cust, 'path')) {
    const pw = +path.getAttribute('w') || w, ph = +path.getAttribute('h') || h
    const sx = w / pw, sy = h / ph
    const pt = n => [+n.getAttribute('x') * sx, +n.getAttribute('y') * sy]
    let cur = [0, 0]
    for (const c of kids(path)) {
      const pts = kids(c, 'pt').map(pt)
      if (c.localName === 'moveTo') { cur = pts[0]; d.push('M', ...cur) }
      else if (c.localName === 'lnTo') { cur = pts[0]; d.push('L', ...cur) }
      else if (c.localName === 'cubicBezTo') { cur = pts[2]; d.push('C', ...pts.flat()) }
      else if (c.localName === 'quadBezTo') { cur = pts[1]; d.push('Q', ...pts.flat()) }
      else if (c.localName === 'close') d.push('Z')
      else if (c.localName === 'arcTo') {
        const wr = +c.getAttribute('wR') * sx, hr = +c.getAttribute('hR') * sy
        const st = +c.getAttribute('stAng') / 60000 * Math.PI / 180, sweep = +c.getAttribute('swAng') / 60000 * Math.PI / 180
        const cx = cur[0] - wr * Math.cos(st), cy = cur[1] - hr * Math.sin(st)
        const end = [cx + wr * Math.cos(st + sweep), cy + hr * Math.sin(st + sweep)]
        d.push('A', wr, hr, 0, Math.abs(sweep) > Math.PI ? 1 : 0, sweep > 0 ? 1 : 0, ...end)
        cur = end
      }
    }
  }
  if (!d.length) return null
  const attrs = `fill="${fill || 'none'}" stroke="${stroke || 'none'}" stroke-width="${r1(sw)}"`
  return turnSvg(`<path d="${d.map(v => (typeof v === 'number' ? r1(v) : v)).join(' ')}" ${attrs}/>`, w, h, turn)
}
// preset geometries (DrawingML presetShapeDefinitions, the common ones) as SVG; av: adjust values (1/100000)
// prstDash -> stroke-dasharray, in line widths
const DASH = { dash: [4, 3], lgDash: [8, 3], sysDash: [3, 1], sysDot: [1, 1], dot: [1, 3], dashDot: [4, 3, 1, 3], lgDashDot: [8, 3, 1, 3], lgDashDotDot: [8, 3, 1, 3, 1, 3], sysDashDot: [3, 1, 1, 1], sysDashDotDot: [3, 1, 1, 1, 1, 1] }
function presetSvg(geom, w, h, av, fill, stroke, sw, [head, tail], turn, dash) {
  const ss = Math.min(w, h), a = (k, d) => (av[k] ?? d) / 100000
  const poly = pts => 'M' + pts.map(p => p.map(r1).join(',')).join(' L') + ' Z'
  let d, open = false, extra = ''
  switch (geom) {
    case 'rect': case 'flowChartProcess': d = poly([[0, 0], [w, 0], [w, h], [0, h]]); break
    case 'roundRect': case 'flowChartAlternateProcess': { const r = ss * a('adj', 16667); d = `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${h - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 0,${h - r} V${r} A${r},${r} 0 0 1 ${r},0 Z`; break }
    case 'ellipse': case 'flowChartConnector': d = `M0,${h / 2} A${w / 2},${h / 2} 0 1 1 ${w},${h / 2} A${w / 2},${h / 2} 0 1 1 0,${h / 2} Z`; break
    case 'triangle': d = poly([[w * a('adj', 50000), 0], [w, h], [0, h]]); break
    case 'rtTriangle': d = poly([[0, 0], [w, h], [0, h]]); break
    case 'diamond': case 'flowChartDecision': d = poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]); break
    case 'parallelogram': { const x = ss * a('adj', 25000); d = poly([[x, 0], [w, 0], [w - x, h], [0, h]]); break }
    case 'trapezoid': { const x = ss * a('adj', 25000); d = poly([[x, 0], [w - x, 0], [w, h], [0, h]]); break }
    case 'homePlate': { const x = w - ss * a('adj', 50000); d = poly([[0, 0], [x, 0], [w, h / 2], [x, h], [0, h]]); break }
    case 'chevron': { const x = ss * a('adj', 50000); d = poly([[0, 0], [w - x, 0], [w, h / 2], [w - x, h], [0, h], [x, h / 2]]); break }
    case 'rightArrow': case 'leftArrow': {
      const y1 = h / 2 - h * a('adj1', 50000) / 2, y2 = h - y1, x = ss * a('adj2', 50000)
      d = geom === 'rightArrow' ? poly([[0, y1], [w - x, y1], [w - x, 0], [w, h / 2], [w - x, h], [w - x, y2], [0, y2]])
        : poly([[0, h / 2], [x, 0], [x, y1], [w, y1], [w, y2], [x, y2], [x, h]]); break
    }
    case 'downArrow': case 'upArrow': {
      const x1 = w / 2 - w * a('adj1', 50000) / 2, x2 = w - x1, y = ss * a('adj2', 50000)
      d = geom === 'downArrow' ? poly([[x1, 0], [x2, 0], [x2, h - y], [w, h - y], [w / 2, h], [0, h - y], [x1, h - y]])
        : poly([[w / 2, 0], [w, y], [x2, y], [x2, h], [x1, h], [x1, y], [0, y]]); break
    }
    case 'wedgeEllipseCallout': case 'wedgeRectCallout': case 'wedgeRoundRectCallout': {
      const tx = w / 2 + w * a('adj1', -20833), ty = h / 2 + h * a('adj2', 62500)
      if (geom === 'wedgeEllipseCallout') {
        const rx = w / 2, ry = h / 2, t = Math.atan2((ty - ry) / ry, (tx - rx) / rx), pt = q => [rx + rx * Math.cos(q), ry + ry * Math.sin(q)].map(r1)
        const [p1, p2] = [pt(t - 0.25), pt(t + 0.25)]
        d = `M${p1} L${r1(tx)},${r1(ty)} L${p2} A${r1(rx)},${r1(ry)} 0 1 1 ${p1} Z`
      } else { // the tail leaves the edge it points at
        const vert = Math.abs((ty - h / 2) / h) > Math.abs((tx - w / 2) / w), tip = [tx, ty]
        const pts = [[0, 0], [w, 0], [w, h], [0, h]], edge = vert ? (ty > h / 2 ? 2 : 0) : (tx > w / 2 ? 1 : 3)
        const base = vert ? [[w * 0.42, edge ? h : 0], [w * 0.58, edge ? h : 0]] : [[edge === 1 ? w : 0, h * 0.42], [edge === 1 ? w : 0, h * 0.58]]
        const order = { 0: [pts[0], base[0], tip, base[1], pts[1], pts[2], pts[3]], 1: [pts[0], pts[1], base[0], tip, base[1], pts[2], pts[3]], 2: [pts[0], pts[1], pts[2], base[1], tip, base[0], pts[3]], 3: [pts[0], pts[1], pts[2], pts[3], base[1], tip, base[0]] }
        d = poly(order[edge])
      }
      break
    }
    case 'foldedCorner': {
      const f = ss * a('adj', 16667), x = w - f, y = h - f
      d = poly([[0, 0], [w, 0], [w, y], [x, h], [0, h]])
      extra = `<path d="${poly([[x, h], [x + f * 0.2, y + f * 0.2], [w, y]])}" fill="#000" fill-opacity="0.2" stroke="${stroke || 'none'}" stroke-width="${r1(sw)}" stroke-linejoin="round"/>`
      break
    }
    case 'line': case 'straightConnector1': d = `M0,0 L${w},${h}`; open = true; break
    case 'bentConnector4': { const x = w * a('adj1', 50000), y = h * a('adj2', 50000); d = `M0,0 L${r1(x)},0 L${r1(x)},${r1(y)} L${w},${r1(y)} L${w},${h}`; open = true; break }
    case 'curvedConnector4': { // ECMA-376 presetShapeDefinitions
      const x2 = w * a('adj1', 50000), x3 = (w + x2) / 2, x4 = (x2 + x3) / 2, x5 = (x3 + w) / 2, y4 = h * a('adj2', 50000), y1 = y4 / 2, y2 = y1 / 2, y3 = (y1 + y4) / 2, y5 = (h + y4) / 2
      d = `M0,0 C${[[x2 / 2, 0], [x2, y2], [x2, y1]].map(q => q.map(r1)).join(' ')} C${[[x2, y3], [x4, y4], [x3, y4]].map(q => q.map(r1)).join(' ')} C${[[x5, y4], [w, y5], [w, h]].map(q => q.map(r1)).join(' ')}`
      open = true; break
    }
    case 'bentConnector2': d = `M0,0 L${w},0 L${w},${h}`; open = true; break
    case 'bentConnector3': { const x = w * a('adj1', 50000); d = `M0,0 L${r1(x)},0 L${r1(x)},${h} L${w},${h}`; open = true; break }
    case 'curvedConnector2': d = `M0,0 C${w / 2},0 ${w},${h / 2} ${w},${h}`; open = true; break
    case 'curvedConnector3': { const x = w * a('adj1', 50000); d = `M0,0 C${r1(x / 2)},0 ${r1(x)},${h / 4} ${r1(x)},${h / 2} C${r1(x)},${3 * h / 4} ${r1((w + x) / 2)},${h} ${w},${h}`; open = true; break }
    case 'curvedRightArrow': case 'curvedLeftArrow': {
      // a thick half ring along the left side, head pointing right at the bottom (left: mirrored)
      const th = ss * a('adj1', 25000), hw = ss * a('adj2', 50000), hl = ss * a('adj3', 25000)
      const cx = w - hl, rx = Math.max(1, cx - th / 2), top = th / 2, bot = h - hw / 2, cy = (top + bot) / 2, ry = (bot - top) / 2
      const band = `<path d="M${r1(cx)},${r1(top)} A${r1(rx)},${r1(ry)} 0 0 0 ${r1(cx)},${r1(bot)}" fill="none" stroke="${fill || stroke}" stroke-width="${r1(th)}"/>`
      const headPath = `<path d="${poly([[cx, h - hw], [w, h - hw / 2], [cx, h]])}" fill="${fill || stroke}"/>`
      const inner = band + headPath
      return turnSvg(geom === 'curvedLeftArrow' ? `<g transform="translate(${w} 0) scale(-1 1)">${inner}</g>` : inner, w, h, turn)
    }
    default: return null
  }
  const col = stroke || '#000000'
  const marker = (head || tail) && open ? `<defs><marker id="m" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="${r1(Math.max(7, sw * 4))}" markerHeight="${r1(Math.max(7, sw * 4))}" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="${col}"/></marker></defs>` : ''
  const ends = (head && open ? ' marker-start="url(#m)"' : '') + (tail && open ? ' marker-end="url(#m)"' : '')
  const dashes = DASH[dash] ? ` stroke-dasharray="${DASH[dash].map(v => r1(v * sw)).join(' ')}"` : ''
  const path = `${marker}<path d="${d}" fill="${open ? 'none' : fill || 'none'}" stroke="${stroke || 'none'}" stroke-width="${r1(sw)}" stroke-linejoin="round"${dashes}${ends}/>${extra}`
  // lines may have no width or height (vertical, horizontal): pad the picture so it has a size and room for arrowheads
  // connectors may bend outside their box (adj > 100 %): a picture shows only its own area, so pad by the overhang too
  const pts = open ? [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m => [+m[1], +m[2]]) : []
  const pad = open ? Math.max(7, sw * 4, ...pts.flatMap(([x, y]) => [-x, x - w, -y, y - h])) + sw : 0
  return turnSvg(pad ? `<g transform="translate(${r1(pad)} ${r1(pad)})">${path}</g>` : path, w + 2 * pad, h + 2 * pad, turn)
}
// SVG content drawn at w×h, turned and flipped around its centre; the SVG is the turned bounding box
function turnSvg(inner, w, h, turn) {
  const a = turn.rot * Math.PI / 180, bw = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)), bh = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))
  const tf = `translate(${r1(bw / 2)} ${r1(bh / 2)}) rotate(${r1(turn.rot)}) scale(${turn.fh ? -1 : 1} ${turn.fv ? -1 : 1}) translate(${r1(-w / 2)} ${r1(-h / 2)})`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r1(bw)}" height="${r1(bh)}" viewBox="0 0 ${r1(bw)} ${r1(bh)}" overflow="visible"><g transform="${tf}">${inner}</g></svg>`
  // btoa needs Latin-1: encode as UTF-8 first (picture data URLs are ASCII anyway)
  return { svg: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))), w: bw, h: bh }
}
const hasText = paras => paras.some(p => p.runs.some(r => r.text?.trim()))

// one asset per zip part: a logo on the master is stored once, not once per slide
const zipCache = new WeakMap()
async function zipImage(zip, path, assets) {
  const memo = zipCache.get(assets) || zipCache.set(assets, {}).get(assets)
  if (path in memo) return memo[path]
  const ext = path.split('.').pop().toLowerCase()
  const f = MIME[ext] && zip.file(path)
  if (!f) return (memo[path] = null) // EMF/WMF and missing parts: browsers cannot show them
  const id = uid()
  assets[id] = `data:${MIME[ext]};base64,${await f.async('base64')}`
  return (memo[path] = { asset: id, src: '/images/' + id + '-' + path.split('/').pop().replace(/[^\w.-]+/g, '_') })
}

// --- PowerPoint ---
// preset geometries the editor can draw; others (curved arrows, callouts …) are left out rather than drawn as a wrong box
const SHAPE = { rect: 'rect', flowChartProcess: 'rect', roundRect: 'rounded', flowChartAlternateProcess: 'rounded', ellipse: 'ellipse', flowChartConnector: 'ellipse', triangle: 'triangle', rightArrow: 'arrow', line: 'line', straightConnector1: 'line' }
// weight words at the end of a font name ("DM Sans Bold"): the family is "DM Sans", the weight goes to CSS
const WEIGHTS = { thin: 100, extralight: 200, ultralight: 200, light: 300, regular: 400, book: 400, medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900 }
// Wingdings bullet characters -> their Unicode look-alikes
const WINGDINGS = { 'à': '→', 'è': '➔', 'Ø': '➢', '§': '▪', 'ü': '✓', 'q': '❑', 'v': '❖', 'l': '●', 'n': '■', 'w': '◆' }
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const VALIGN = { ctr: 'middle', b: 'bottom', middle: 'middle', bottom: 'bottom' }
const ALIGN = { l: 'left', ctr: 'center', r: 'right', just: 'justify' }

// --- table styles ---
// regions in the order PowerPoint layers them over a cell is in tableCell(); built-in rules list them in this order
const TS_REGIONS = ['wholeTbl', 'band1H', 'band2H', 'firstRow', 'lastRow', 'firstCol', 'lastCol', 'band1V', 'band2V', 'nwCell', 'neCell', 'swCell', 'seCell']
// PowerPoint's built-in table styles, for files that name one by GUID without defining it (tableStyles.xml).
// Order: Themed 1–2, Light 1–3, Medium 1–4, Dark 1 – each without accent, then accent 1–6 –, then Dark 2 without accent and with
// accents 1+2, 3+4, 5+6. Rules per region of TS_REGIONS, "fill/text": A/B the variant's accent(s) (dk1 without accent),
// ~t tint, ~s shade, ~a alpha in percent, - no fill; measured against LibreOffice's rendering of all 74 styles.
const TS_IDS = ('2D5ABB26-0587-4C30-8999-92F81FD0307C 3C2FFA5D-87B4-456A-9821-1D502468CF0F 284E427A-3D55-4303-BF80-6455036E1DE7 69C7853C-536D-4A76-A0AE-DD22124D55A5 ' +
  '775DCB02-9BB8-47FD-8907-85C794F793BA 35758FB7-9AC5-4552-8A53-C91805E547FA 08FB837D-C827-4EFA-A057-4D05807E0F7C 5940675A-B579-460E-94D1-54222C63F5DA ' +
  'D113A9D2-9D6B-4929-AA2D-F23B5EE8CBE7 18603FDC-E32A-4AB5-989C-0864C3EAD2B8 306799F8-075E-4A3A-A7F6-7FBC6576F1A4 E269D01E-BC32-4049-B463-5C60D7B0CCD2 ' +
  '327F97BB-C833-4FB7-BDE5-3F7075034690 638B1855-1B75-4FBE-930C-398BA8C253C6 9D7B26C5-4107-4FEC-AEDC-1716B250A1EF 3B4B98B0-60AC-42C2-AFA5-B58CD77FA1E5 ' +
  '0E3FDE45-AF77-4B5C-9715-49D594BDF05E C083E6E3-FA7D-4D7B-A595-EF9225AFEA82 D27102A9-8310-4765-A935-A1911B00CA55 5FD0F851-EC5A-4D38-B0AD-8093EC10F338 ' +
  '68D230F3-CF80-4859-8CE7-A43EE81993B5 7E9639D4-E3E2-4D34-9284-5A2195B3D0D7 69012ECD-51FC-41F1-AA8D-1B2483CD663E 72833802-FEF1-4C79-8D5D-14CF1EAF98D9 ' +
  'F2DE63D5-997A-4646-A377-4702673A728D 17292A2E-F333-43FB-9621-5CBBE7FDCDCB 5A111915-BE36-4E01-A7E5-04B1672EAD32 912C8C85-51F0-491E-9774-3900AFEF0FD7 ' +
  '616DA210-FB5B-4158-B5E0-FEB733F419BA BC89EF96-8CEA-46FF-86C4-4CE0E7609802 5DA37D80-6434-44D0-A028-1B22A696006F 8799B23B-EC83-4686-B30A-512413B5E67A ' +
  'ED083AE6-46FA-4A59-8FB0-9F97EB10719F BDBED569-4797-4DF1-A0F4-6AAB3CD982D8 E8B1032C-EA38-4F05-BA0D-38AFFFC7BED3 793D81CF-94F2-401A-BA57-92F5A7B2D0C5 ' +
  'B301B821-A1FF-4177-AEE7-76D212191A09 9DCAF9ED-07DC-4A11-8D7F-57B35C25682E 1FECB4D8-DB02-4DC6-A0A2-4F2EBAE1DC90 1E171933-4619-4E11-9A3F-F7608DF75F80 ' +
  'FABFCF23-3B69-468F-B69F-88F6DE6A72F2 10A1B5D5-9B99-4C35-A422-299274C87663 073A0DAA-6AF3-43AB-8588-CEC1D06C72B9 5C22544A-7EE6-4342-B048-85BDC9FD1C3A ' +
  '21E4AEA4-8DFA-4A89-87EB-49C32662AFE0 F5AB1C69-6EDB-4FF4-983F-18BD219EF322 00A15C55-8517-42AA-B614-E9B94910E393 7DF18680-E054-41AD-8BC1-D1AEF772440D ' +
  '93296810-A885-4BE3-A3E7-6D5BEEA58F35 8EC20E35-A176-4012-BC5E-935CFFF8708E 6E25E649-3F16-4E02-A733-19D2CDBF48F0 85BE263C-DBD7-4A20-BB59-AAB30ACAA65A ' +
  'EB344D84-9AFB-497E-A393-DC336BA19D2E EB9631B5-78F2-41C9-869B-9F39066F8104 74C1A8A3-306A-4EB7-A6B1-4F7E0EB9C5D6 2A488322-F2BA-4B5B-9748-0D474271808F ' +
  'D7AC3CCA-C797-4891-BE02-D94E43425B78 69CF1AB2-1976-4502-BF36-3FF5EA218861 8A107856-5554-42FB-B03E-39F5DBC370BA 0505E3EF-67EA-436B-97B2-0124C06EBD24 ' +
  'C4B1156A-380E-4F78-BDF5-A606A8083BF9 22838BEF-8BB2-4498-84A7-C5851F593DF1 16D9F66E-5EB9-4882-86FB-DCBF35E3C3E4 E8034E78-7F5D-4C2E-B375-FC64B27BC917 ' +
  '125E5076-3810-47DD-B79F-674D7AD40C01 37CE84F3-28C3-443E-9E96-99CF82512B78 D03447BB-5D67-496B-8E87-E561075AD55C E929F9F4-4A8F-4326-A1B4-22849713DDAB ' +
  '8FD4443E-F989-4FC4-A0C8-D5A2AF1F390B AF606853-7671-496A-8E4F-DF71F8EC918B 5202B0CA-FC54-4496-8BCA-5EF66A818D29 0660B408-B3CF-4A94-85FC-2B1E0A45F4A2 ' +
  '91EBBBCC-DAD2-459C-BE2E-F6DE35CF9A28 46F890A9-2807-4EBB-B81D-B2AA78EC7F39').split(' ')
const TS_FAMILIES = [
  ['/dk1 A~a40/dk1 /dk1 A/lt1 /dk1 /dk1 /dk1 A~a40/dk1 /dk1 A/lt1 A/lt1 -/dk1 -/dk1', '/A /A /A /A /A /A /A /A /A -/A -/A -/A -/A'], // Themed Style 1
  ['A/lt1 A~a80/lt1 A/lt1 A/lt1 A/lt1 A/lt1 A/lt1 A~a80/lt1 A/lt1 A/lt1 A/lt1 A/lt1 A/lt1', '/lt1 /lt1 /lt1 /lt1 /lt1 /lt1 /lt1 /lt1 /lt1 -/lt1 -/lt1 -/lt1 -/lt1'], // Themed Style 2
  ['/dk1 A~a20/dk1 /dk1 /A /dk1 /dk1 /dk1 A~a20/dk1 /dk1 -/A -/A -/dk1 -/dk1', '/A A~a20/A /A /A /A /A /A A~a20/A /A -/A -/A -/A -/A'], // Light Style 1
  ['/dk1 /dk1 /dk1 A/lt1 /dk1 /dk1 /dk1 /dk1 /dk1 A/lt1 A/lt1 -/dk1 -/dk1', '/A /A /A A/lt1 /A /A /A /A /A A/lt1 A/lt1 -/A -/A'], // Light Style 2
  ['/dk1 A~a20/dk1 /dk1 /A /dk1 /dk1 /dk1 A~a20/dk1 /dk1 -/A -/A -/dk1 -/dk1', '/A A~a20/A /A /A /A /A /A A~a20/A /A -/A -/A -/A -/A'], // Light Style 3
  ['/dk1 A~t20/dk1 /dk1 A/lt1 /dk1 /dk1 /dk1 A~t20/dk1 /dk1 A/lt1 A/lt1 -/dk1 -/dk1', '/A A~t20/A /A A/lt1 /A /A /A A~t20/A /A A/lt1 A/lt1 -/A -/A'], // Medium Style 1
  ['A~t20/dk1 A~t40/dk1 A~t20/dk1 A/lt1 A/lt1 A/lt1 A/lt1 A~t40/dk1 A~t20/dk1 A/lt1 A/lt1 A/lt1 A/lt1', 'A~t20/A A~a20/A A~t20/A A/lt1 A/lt1 A/lt1 A/lt1 A~a20/A A~t20/A A/lt1 A/lt1 A/lt1 A/lt1'], // Medium Style 2
  ['/dk1 lt1~s80/dk1 /dk1 A/lt1 /dk1 A/lt1 A/lt1 lt1~s80/dk1 /dk1 A/lt1 A/lt1 A/lt1 A/lt1', '/A A~t20/A /A A/lt1 /A A/lt1 A/lt1 A~t20/A /A A/lt1 A/lt1 A/lt1 A/lt1'], // Medium Style 3
  ['A~t20/dk1 A~t40/dk1 A~t20/dk1 A~t20/A lt1~s80/dk1 A~t20/dk1 A~t20/dk1 A~t40/dk1 A~t20/dk1 A~t20/A A~t20/A lt1~s80/dk1 lt1~s80/dk1', 'A~t20/A A~a20/A A~t20/A A~t20/A A~t20/A A~t20/A A~t20/A A~a20/A A~t20/A A~t20/A A~t20/A A~t20/A A~t20/A'], // Medium Style 4
  ['A~s20/dk1 A~s40/dk1 A~s20/dk1 dk1/lt1 A/dk1 A~s60/dk1 A~s60/dk1 A~s40/dk1 A~s20/dk1 A~s60/lt1 A~s60/lt1 A~s60/dk1 A~s60/dk1', 'A~t20/A A~a20/A A~t20/A A/lt1 A/A A~t60/A A~t60/A A~a20/A A~t20/A A~t60/lt1 A~t60/lt1 A~t60/A A~t60/A'], // Dark Style 1
  ['A~t20/dk1 A~t40/dk1 A~t20/dk1 B/lt1 A~t20/dk1 A~t20/dk1 A~t20/dk1 A~t40/dk1 A~t20/dk1 B/lt1 B/lt1 A~t20/dk1 A~t20/dk1', 'A~t20/A A~a20/A A~t20/A A/lt1 A~t20/A A~t20/A A~t20/A A~a20/A A~t20/A A/lt1 A/lt1 A~t20/A A~t20/A'], // Dark Style 2
]
// their cell borders, per family [with accent, without]: "region.sides=colour[@pt]", sides L R T B outer, H V inside;
// wholeTbl lines from LibreOffice's export; Medium Style 2's 3 pt lines around header and total row are PowerPoint's
const TS_BORDERS = [
  ['wholeTbl.LRTBHV=A firstRow.B=lt1 nwCell.B=A neCell.B=A', ''], // Themed Style 1
  ['wholeTbl.LRTB=A~t50', 'wholeTbl.LRTB=A~t50 wholeTbl.HV=A'], // Themed Style 2
  ['wholeTbl.TB=A', 'wholeTbl.TB=A'], ['wholeTbl.LRTB=A', 'wholeTbl.LRTB=A'], ['wholeTbl.LRTBHV=A', 'wholeTbl.LRTBHV=A'], // Light 1–3
  ['wholeTbl.LRTBH=A', 'wholeTbl.LRTBH=A'], // Medium Style 1
  ['wholeTbl.LRTBHV=lt1 firstRow.B=lt1@3 lastRow.T=lt1@3', 'wholeTbl.LRTBHV=lt1 firstRow.B=lt1@3 lastRow.T=lt1@3'], // Medium Style 2
  ['wholeTbl.TB=dk1', 'wholeTbl.TB=dk1'], ['wholeTbl.LRTBHV=A', 'wholeTbl.LRTBHV=A'], ['', ''], ['', ''], // Medium 3, 4, Dark 1, 2
]
const SIDES = { L: 'left', R: 'right', T: 'top', B: 'bottom', H: 'insideH', V: 'insideV' }
const lineStyle = dash => (/dot/i.test(dash || '') && !/dash/i.test(dash) ? 'dotted' : DASH[dash] ? 'dashed' : 'solid')

// a new project takes the source's slide size: a preset name within 1 %, else the ratio itself
const PRESETS = ['16/9', '16/10', '4/3', '3/2', '1/1']
export function ratioName(w, h) {
  const r = w / h
  return PRESETS.find(p => { const [a, b] = p.split('/'); return Math.abs(a / b / r - 1) < 0.01 }) || String(+r.toFixed(4))
}
// the new project's format fields and its canvas size W×H for the coordinates below
// (a ratio outside what the editor accepts stays 16/9, letterboxed)
function slideFormat(w, h) {
  const aspectRatio = parseRatio(ratioName(w, h)) ? ratioName(w, h) : '16/9'
  const { w: W, h: H } = formatSize(parseRatio(aspectRatio), 980)
  return { format: { aspectRatio, canvasWidth: 980 }, W, H }
}

export async function importPptx(file) {
  const zip = await JSZip.loadAsync(file)
  const read = async p => { const f = zip.file(p); return f ? xml(await f.async('text')) : null }
  const rels = async p => {
    const doc = await read(p.replace(/([^/]+)$/, '_rels/$1.rels'))
    return Object.fromEntries(all(doc, 'Relationship').map(r => [r.getAttribute('Id'), { type: r.getAttribute('Type').split('/').pop(), target: r.getAttribute('TargetMode') === 'External' ? null : resolve(p, r.getAttribute('Target')) }]))
  }
  const pres = await read('ppt/presentation.xml')
  if (!pres) throw new Error(t('Not a valid PowerPoint file'))
  const presRels = await rels('ppt/presentation.xml')
  const sz = all(pres, 'sldSz')[0]
  const cx = +sz?.getAttribute('cx') || 12192000, cy = +sz?.getAttribute('cy') || 6858000
  const { format, W, H } = slideFormat(cx, cy)
  const k = Math.min(W / cx, H / cy), dx = (W - cx * k) / 2, dy = (H - cy * k) / 2 // centred: only rounding (H, a ratio within 1 % of a preset) is left over
  const px = emu => emu * k
  const assets = {}

  // theme colours and fonts (schemeClr / +mj-lt), from the first master's theme
  const theme = await read(Object.values(presRels).find(r => r.type === 'theme')?.target || 'ppt/theme/theme1.xml')
  const scheme = {}
  for (const c of kids(all(theme, 'clrScheme')[0])) scheme[c.localName] = kid(c, 'srgbClr')?.getAttribute('val') || kid(c, 'sysClr')?.getAttribute('lastClr')
  Object.assign(scheme, { tx1: scheme.dk1, bg1: scheme.lt1, tx2: scheme.dk2, bg2: scheme.lt2 })
  const themeFont = { '+mj-lt': kid(all(theme, 'majorFont')[0], 'latin')?.getAttribute('typeface'), '+mn-lt': kid(all(theme, 'minorFont')[0], 'latin')?.getAttribute('typeface') }
  // colour of a fill/colour container (solidFill, defRPr …), with its modifiers (lumMod/lumOff, tint, shade, alpha)
  function colorOf(n) {
    const c = kid(n, 'srgbClr') || kid(n, 'schemeClr') || kid(n, 'sysClr') || kid(n, 'prstClr')
    if (!c) return null
    const v = c.localName === 'schemeClr' ? scheme[c.getAttribute('val')] : c.localName === 'sysClr' ? c.getAttribute('lastClr') : c.getAttribute('val')
    if (!v) return null
    return /^[0-9a-f]{6}$/i.test(v) ? modColor(v, kids(c)) : v
  }
  const solid = n => { const f = kid(n, 'solidFill'); return f ? colorOf(f) : null }
  // table styles: { region: { fill ('none' clears), color, b } } from the file's definition, else from the built-in rules
  const tsDefs = Object.fromEntries(all(await read('ppt/tableStyles.xml') || xml('<x/>'), 'tblStyle').map(t => [t.getAttribute('styleId')?.toUpperCase(), t]))
  function tableStyle(id) {
    id = id?.trim().toUpperCase()
    if (!id) return null // a table without tableStyleId
    const def = tsDefs[id]
    if (def) return Object.fromEntries(TS_REGIONS.map(reg => {
      const r = kid(def, reg), f = kid(r, 'tcStyle', 'fill'), tx = kid(r, 'tcTxStyle')
      const bdr = kid(r, 'tcStyle', 'tcBdr'), bd = {}
      for (const [k, name] of Object.entries(SIDES)) { const s = kid(bdr, name); if (s) bd[k] = border(kid(s, 'ln'), kid(s, 'lnRef')) }
      return [reg, {
        fill: kid(f, 'noFill') ? 'none' : solid(f) || (kid(f, 'fillRef') && colorOf(kid(f, 'fillRef'))) || undefined,
        color: colorOf(tx) || colorOf(kid(tx, 'fontRef')) || undefined, b: tx?.getAttribute('b') === 'on' || undefined, bd,
      }]
    }))
    const i = TS_IDS.indexOf(id.replace(/[{}]/g, ''))
    if (i < 0) return null
    const [fam, v] = i < 70 ? [Math.floor(i / 7), i % 7] : [10, i - 70]
    const [A, B] = fam < 10 ? [v ? 'accent' + v : 'dk1'] : v ? ['accent' + (2 * v - 1), 'accent' + 2 * v] : ['dk1', 'dk1']
    const color = tok => {
      if (tok === '-') return 'none'
      const m = tok.match(/^(\w+?)(?:~([tsa])(\d+))?$/)
      if (!m) return undefined
      const hex = scheme[{ A, B: B || A }[m[1]] || m[1]]
      return hex && modColor(hex, m[2] ? [{ localName: { t: 'tint', s: 'shade', a: 'alpha' }[m[2]], getAttribute: () => m[3] * 1000 }] : [])
    }
    const rules = TS_FAMILIES[fam][v ? 0 : 1].split(' ')
    // bold edges: PowerPoint's convention for its built-in styles (LibreOffice's export, the reference here, does not say)
    const st = Object.fromEntries(TS_REGIONS.map((reg, k) => { const [f, t] = rules[k].split('/'); return [reg, { fill: color(f), color: color(t), b: /^(first|last)(Row|Col)$/.test(reg) || undefined, bd: {} }] }))
    for (const rule of TS_BORDERS[fam][v ? 0 : 1].split(' ').filter(Boolean)) {
      const [, reg, sides, tok, w] = rule.match(/^(\w+)\.(\w+)=([\w~]+)(?:@([\d.]+))?$/)
      for (const k of sides) st[reg].bd[k] = `${Math.max(1, r1(px(12700 * (w || 1))))}px solid ${color(tok)}`
    }
    return st
  }
  // a cell's look: regions layered from the whole table up to the first and last rows; flags are tblPr's switches
  function tableCell(st, fl, r, c, rows, cols) {
    const br = r - (fl.firstRow ? 1 : 0), bc = c - (fl.firstCol ? 1 : 0)
    const layers = ['wholeTbl', fl.bandCol && (bc % 2 ? 'band2V' : 'band1V'), fl.bandRow && (br % 2 ? 'band2H' : 'band1H'),
      fl.firstCol && c === 0 && 'firstCol', fl.lastCol && c === cols - 1 && 'lastCol', fl.firstRow && r === 0 && 'firstRow', fl.lastRow && r === rows - 1 && 'lastRow']
    const top = fl.firstRow && r === 0, bottom = fl.lastRow && r === rows - 1, left = fl.firstCol && c === 0, right = fl.lastCol && c === cols - 1
    layers.push(top && left && 'nwCell', top && right && 'neCell', bottom && left && 'swCell', bottom && right && 'seCell')
    const out = {}
    for (const l of layers) if (l) for (const [k, v] of Object.entries(st[l] || {})) if (v !== undefined && k !== 'bd') out[k] = v
    // borders: a region's outer sides where the cell meets its edge, its inside lines elsewhere
    for (const l of layers) {
      const bd = l && st[l]?.bd
      if (!bd) continue
      const [r0, r9, c0, c9] = l === 'wholeTbl' || /Col$/.test(l) ? [0, rows - 1, l === 'lastCol' ? c : 0, l === 'firstCol' ? 0 : l === 'lastCol' ? c : cols - 1]
        : /Row$|H$/.test(l) ? [r, r, 0, cols - 1] : /V$/.test(l) ? [0, rows - 1, c, c] : [r, r, c, c]
      const sides = { t: r === r0 ? bd.T : bd.H, b: r === r9 ? bd.B : bd.H, l: c === c0 ? bd.L : bd.V, r: c === c9 ? bd.R : bd.V }
      for (const [k, v] of Object.entries(sides)) if (v !== undefined) out['b' + k] = v
    }
    return out
  }
  // a cell border line (ln, or the theme line lnRef points to) as CSS; 'none' for an explicit noFill, undefined when unset
  function border(ln, ref) {
    if (kid(ln, 'noFill')) return 'none'
    const c = solid(ln) || (ref && colorOf(ref))
    if (!c) return undefined
    const w = +ln?.getAttribute('w') || lnWidths[+ref?.getAttribute('idx') - 1] || 12700
    return `${Math.max(1, r1(px(w)))}px ${lineStyle(kid(ln, 'prstDash')?.getAttribute('val'))} ${c}`
  }
  // line widths of the theme's line styles (lnRef idx 1, 2, 3)
  const lnWidths = kids(all(theme, 'lnStyleLst')[0], 'ln').map(l => +l.getAttribute('w') || 12700)

  // a part (slide, layout, master) with its relationships and placeholders
  async function part(path) {
    const doc = await read(path), r = await rels(path)
    const tree = all(doc, 'spTree')[0]
    const ph = [...all(tree, 'ph')].map(p => ({ type: p.getAttribute('type') || 'body', idx: p.getAttribute('idx'), sp: p.closest('sp, pic, graphicFrame') || p.parentNode.parentNode.parentNode }))
    return { path, doc, rels: r, tree, ph }
  }
  const phKey = t => (t === 'ctrTitle' ? 'title' : t === 'subTitle' ? 'body' : t)
  const findPh = (p, ph) => p && (p.ph.find(x => ph.idx != null && x.idx === ph.idx) || p.ph.find(x => phKey(x.type) === phKey(ph.type)))?.sp

  // text properties for list level lvl, nearest first: shape, layout and master placeholder, master text styles
  function chain(sp, ph, layout, master) {
    const out = [kid(sp, 'txBody', 'lstStyle')]
    if (ph) for (const p of [layout, master]) out.push(kid(findPh(p, ph), 'txBody', 'lstStyle'))
    const styles = all(master.doc, 'txStyles')[0]
    out.push(kid(styles, !ph ? 'otherStyle' : phKey(ph.type) === 'title' ? 'titleStyle' : 'bodyStyle'))
    return out.filter(Boolean)
  }
  const lvlProps = (ch, lvl) => ch.map(s => kid(s, `lvl${lvl + 1}pPr`)).filter(Boolean)

  function paragraphs(body, ch, scale) {
    return kids(body, 'p').map(p => {
      const pPr = kid(p, 'pPr'), lvl = +pPr?.getAttribute('lvl') || 0
      const pp = [pPr, ...lvlProps(ch, lvl)].filter(Boolean)
      const bullet = pp.find(x => kid(x, 'buNone') || kid(x, 'buChar') || kid(x, 'buAutoNum'))
      const list = !bullet || kid(bullet, 'buNone') ? null : kid(bullet, 'buAutoNum') ? 'ol' : 'ul'
      const defs = pp.map(x => kid(x, 'defRPr')).filter(Boolean)
      const runs = kids(p).filter(n => ['r', 'br', 'fld'].includes(n.localName)).map(n => {
        if (n.localName === 'br') return { br: true }
        const rp = [kid(n, 'rPr'), ...defs].filter(Boolean)
        const attr = a => rp.map(x => x.getAttribute(a)).find(v => v != null)
        const size = attr('sz'), spc = attr('spc')
        let font = rp.map(x => kid(x, 'latin')?.getAttribute('typeface')).find(Boolean)?.trim()
        font = themeFont[font] || font
        // "DM Sans Bold Italic" -> DM Sans, 700, italic
        let weight, italic
        for (let m; font && (m = font.match(/^(.+?)[\s-]+(\w+)$/)) && (WEIGHTS[m[2].toLowerCase()] || /^(italic|oblique)$/i.test(m[2]));) {
          if (WEIGHTS[m[2].toLowerCase()]) weight ??= WEIGHTS[m[2].toLowerCase()]; else italic = true
          font = m[1]
        }
        const b = attr('b') === '1' || weight >= 600
        return {
          // symbol fonts store glyphs as U+F0xx: map the Wingdings ones we know to Unicode
          text: (n.getAttribute('type') === 'slidenum' ? String(slideNo) : kid(n, 't')?.textContent || '').replace(/[\uF020-\uF0FF]/g, c => WINGDINGS[String.fromCharCode(c.charCodeAt(0) - 0xF000)] || c), b, i: attr('i') === '1' || italic, u: !!attr('u') && attr('u') !== 'none',
          size: size && px(size / 100 * 12700) * scale, color: rp.map(solid).find(Boolean), font, mark: rp.map(x => kid(x, 'highlight')).filter(Boolean).map(colorOf)[0],
          ...(weight && weight !== (b ? 700 : 400) && { weight }), ...(+spc && { spacing: px(+spc / 100 * 12700) }),
        }
      })
      // spacing: points -> px, percent -> multiple of the line (PowerPoint's single line is about 1.2 em)
      const space = (name, line) => {
        const s = pp.map(x => kid(x, name)).find(Boolean)
        const pts = kid(s, 'spcPts')?.getAttribute('val'), pct = kid(s, 'spcPct')?.getAttribute('val')
        return pts != null ? `${r1(px(+pts / 100 * 12700) * scale)}px` : pct != null ? (line ? r1(1.2 * +pct / 100000) : `${r1(1.2 * +pct / 100000)}em`) : undefined
      }
      const num = kid(bullet, 'buAutoNum')?.getAttribute('startAt')
      const pa = a => pp.map(x => x.getAttribute(a)).find(v => v != null)
      const char = kid(bullet, 'buChar')?.getAttribute('char'), buFont = pp.map(x => kid(x, 'buFont')?.getAttribute('typeface')).find(Boolean)
      const endSz = [kid(p, 'endParaRPr'), ...defs].map(x => x?.getAttribute('sz')).find(Boolean)
      return {
        ...(list === 'ul' && char && { bullet: /^Wingdings/i.test(buFont) ? WINGDINGS[char] || '•' : char }), ...(endSz && { size: px(endSz / 100 * 12700) * scale }),
        ...(list === 'ol' && { numType: NUM_TYPE[kid(bullet, 'buAutoNum').getAttribute('type')?.replace(/(Period|Paren[RL]|Plain|ParenBoth)$/, '')] }),
        align: ALIGN[pa('algn')], list, runs, lvl, startAt: num && +num, line: space('lnSpc', true), before: space('spcBef'), after: space('spcAft'),
        ...(pa('marL') != null && { marL: px(+pa('marL')), indent: px(+pa('indent') || 0) }),
      }
    }).map(numbering)
  }

  // shapes of one spTree -> elements; tf maps child coordinates of groups
  // gs: [x, y] scale of enclosing groups (sizes only: PowerPoint does not scale text with its group)
  // grot: rotation of enclosing groups in degrees (added to each child's own)
  async function shapes(p, layout, master, tree = p.tree, tf = (x, y) => [x, y], gs = [1, 1], onlyDecor = false, grot = 0) {
    const out = []
    for (const n of kids(tree)) {
      const ph = kid(n, n.localName === 'sp' ? 'nvSpPr' : n.localName === 'pic' ? 'nvPicPr' : 'nvGraphicFramePr', 'nvPr', 'ph')
      const phInfo = ph && { type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') }
      if (onlyDecor && ph) continue // layout/master placeholders are prompts, not content
      if (phInfo?.type === 'sldNum') continue // the editor numbers every slide itself
      const spPr = kid(n, 'spPr') || kid(n, 'grpSpPr')
      let xfrm = kid(spPr, 'xfrm') || kid(n, 'xfrm')
      if (!xfrm && phInfo) for (const q of [layout, master]) { xfrm = kid(findPh(q, phInfo), 'spPr', 'xfrm'); if (xfrm) break }
      const off = kid(xfrm, 'off'), ext = kid(xfrm, 'ext')
      const ox = +off?.getAttribute('x') || 0, oy = +off?.getAttribute('y') || 0, ecx = +ext?.getAttribute('cx') || 0, ecy = +ext?.getAttribute('cy') || 0
      // placed by its centre: groups may rotate it around theirs
      const [mx, my] = tf(ox + ecx / 2, oy + ecy / 2)
      const bw = Math.max(4, Math.round(px(ecx) * gs[0])), bh = Math.max(4, Math.round(px(ecy) * gs[1]))
      const box = { x: Math.round(dx + px(mx) - bw / 2), y: Math.round(dy + px(my) - bh / 2), w: bw, h: bh }
      const turn = { rot: grot + (+xfrm?.getAttribute('rot') || 0) / 60000, fh: xfrm?.getAttribute('flipH') === '1', fv: xfrm?.getAttribute('flipV') === '1' }
      if (n.localName === 'grpSp') {
        const ch = kid(xfrm, 'chOff'), ce = kid(xfrm, 'chExt')
        const sx = (ecx || 1) / (+ce?.getAttribute('cx') || 1), sy = (ecy || 1) / (+ce?.getAttribute('cy') || 1)
        const cox = +ch?.getAttribute('x') || 0, coy = +ch?.getAttribute('y') || 0
        const a = (+xfrm?.getAttribute('rot') || 0) / 60000 * Math.PI / 180, gx = ox + ecx / 2, gy = oy + ecy / 2
        const child = (x, y) => {
          const u = ox + (x - cox) * sx - gx, v = oy + (y - coy) * sy - gy
          return tf(gx + u * Math.cos(a) - v * Math.sin(a), gy + u * Math.sin(a) + v * Math.cos(a))
        }
        out.push(...await shapes(p, layout, master, n, child, [gs[0] * sx, gs[1] * sy], onlyDecor, turn.rot))
        continue
      }
      const turned = turn.rot % 360 || turn.fh || turn.fv
      if (!ext && !phInfo) continue
      // pictures, and shapes filled with a picture (icons are often freeforms with an SVG fill)
      if (n.localName === 'pic' || kid(spPr, 'blipFill') || (n.localName === 'graphicFrame' && all(n, 'blip').length && !all(n, 'tbl').length)) {
        const id = (all(n, 'svgBlip')[0] || all(n, 'blip')[0])?.getAttributeNS(R, 'embed')
        const img = p.rels?.[id]?.target && await zipImage(zip, p.rels[id].target, assets)
        // srcRect: cropped edges in 1/1000 %
        const crop = ['l', 't', 'r', 'b'].map(k => (+kid(n, 'blipFill', 'srcRect')?.getAttribute(k) || 0) / 100000)
        const cropped = crop.some(Boolean) && crop[0] + crop[2] < 1 && crop[1] + crop[3] < 1
        if (img && (turned || cropped)) { // the editor has no rotation or crop: the picture goes into an SVG that turns or clips it
          const iw = box.w / (1 - crop[0] - crop[2]), ih = box.h / (1 - crop[1] - crop[3])
          const r = turnSvg(`<svg width="${box.w}" height="${box.h}"><image href="${assets[img.asset]}" x="${r1(-crop[0] * iw)}" y="${r1(-crop[1] * ih)}" width="${r1(iw)}" height="${r1(ih)}" preserveAspectRatio="none"/></svg>`, box.w, box.h, turn)
          const key = JSON.stringify([img.asset, crop, turn, box.w, box.h]) // a layout band on every slide -> one asset
          const asset = (zipCache.get(assets)[key] ??= uid())
          assets[asset] = r.svg
          out.push({ type: 'image', x: Math.round(box.x + (box.w - r.w) / 2), y: Math.round(box.y + (box.h - r.h) / 2), w: Math.round(r.w), h: Math.round(r.h), asset, src: img.src.replace(/^(\/images\/)[^-]+/, '$1' + asset).replace(/\.\w+$/, '.svg') })
        } else if (img) out.push({ type: 'image', ...box, ...img })
        continue
      }
      const tbl = all(n, 'tbl')[0]
      if (tbl) {
        const cols = all(tbl, 'gridCol').map(c => +c.getAttribute('w') || 1), sum = cols.reduce((a, b) => a + b, 0)
        // merged-over cells stay (empty), so the cells after them keep their column
        const cells = kids(tbl, 'tr').map(tr => kids(tr, 'tc'))
        const merged = tc => /^(1|true)$/.test(tc.getAttribute('hMerge')) || /^(1|true)$/.test(tc.getAttribute('vMerge'))
        const tblPr = kid(tbl, 'tblPr'), st = tableStyle(kid(tblPr, 'tableStyleId')?.textContent)
        const flags = Object.fromEntries(['firstRow', 'lastRow', 'firstCol', 'lastCol', 'bandRow', 'bandCol'].map(f => [f, tblPr?.getAttribute(f) === '1']))
        const look = (r, c) => (st ? tableCell(st, flags, r, c, cells.length, cells[r].length) : {})
        // the style's text colour and bold for runs that set none; the cell's own fill beats the style's
        const rows = cells.map((row, r) => row.map((tc, c) => {
          if (merged(tc)) return ''
          const l = look(r, c), paras = paragraphs(kid(tc, 'txBody'), [], 1)
          for (const p of paras) for (const run of p.runs) { run.color ||= l.color; if (l.b) run.b = true }
          return parasHtml(paras)
        }))
        const fills = cells.map((row, r) => row.map((tc, c) => { const pr = kid(tc, 'tcPr'), l = look(r, c).fill; return kid(pr, 'noFill') ? '' : solid(pr) || (l && l !== 'none' ? l : '') }))
        // a style's header without fill stays clear (the app theme would paint its accent behind the style's text colour)
        if (st && flags.firstRow) fills[0] = fills[0].map(f => f || 'transparent')
        // borders [top, right, bottom, left]: the cell's own lines beat the style's
        const borders = cells.map((row, r) => row.map((tc, c) => { const pr = kid(tc, 'tcPr'), l = look(r, c); return ['T', 'R', 'B', 'L'].map(k => { const v = border(kid(pr, 'ln' + k)) ?? l['b' + k.toLowerCase()]; return v && v !== 'none' ? v : '' }) }))
        // the frame's size can be a placeholder (Google Slides writes 3000000 × 3000000): the grid has the real one
        const tw = px(sum) * gs[0], th = px(kids(tbl, 'tr').reduce((a, tr) => a + (+tr.getAttribute('h') || 0), 0)) * gs[1]
        // a first row filled unlike the next one is a header
        const trs = kids(tbl, 'tr'), headFill = fills[0]?.every(Boolean) && fills[0][0] !== fills[1]?.[0] && !st
        if (rows.length) out.push({
          type: 'table', x: box.x, y: box.y, w: Math.round(tw || box.w), h: Math.round(th || box.h), rows,
          ...(th && th / trs.length < 40 && { compact: true }), // low rows: the presets' padding would push the table out of its box
          header: flags.firstRow || headFill, preset: 'theme', widths: cols.map(w => r1(w / sum * 100)),
          ...(fills.some(r => r.some(Boolean)) && { fills }), ...(borders.some(r => r.some(b => b.some(Boolean))) && { borders }),
        })
        continue
      }
      // sp / cxnSp: the geometry (if visible), then its text on top
      const geom = kid(spPr, 'prstGeom')?.getAttribute('prst')
      const ln = kid(spPr, 'ln'), lnRef = kid(n, 'style', 'lnRef'), fillRef = kid(n, 'style', 'fillRef')
      const isLine = /^(line|straightConnector1|bentConnector\d|curvedConnector\d)$/.test(geom)
      const fill = kid(spPr, 'noFill') || isLine ? null
        : solid(spPr) || (fillRef && +fillRef.getAttribute('idx') ? colorOf(fillRef) : null)
      // outline: the shape's own line, else the style's (lnRef) – a missing <a:ln> still draws the theme line
      const stroke = kid(ln, 'noFill') ? null : solid(ln) || (lnRef && +lnRef.getAttribute('idx') ? colorOf(lnRef) : null)
      const sw = stroke ? Math.max(1, px(+ln?.getAttribute('w') || lnWidths[+lnRef?.getAttribute('idx') - 1] || 12700)) : 0
      const kind = SHAPE[geom]
      const cust = kid(spPr, 'custGeom')
      const arrows = ['headEnd', 'tailEnd'].map(e => (kid(ln, e)?.getAttribute('type') || 'none') !== 'none')
      const dash = kid(ln, 'prstDash')?.getAttribute('val')
      // a quarter turn of a symmetric shape is the same shape with width and height swapped
      const quarter = Math.round(turn.rot / 90) % 2 && Math.abs(turn.rot % 90) < 1 && !turn.fh && !turn.fv && ['rect', 'rounded', 'ellipse'].includes(kind)
      // the editor's own line is horizontal and solid
      const plain = kind && !arrows.some(Boolean) && !DASH[dash] && (kind !== 'line' || !ecy) && (!turned || quarter || (['rect', 'rounded', 'ellipse'].includes(kind) && !(turn.rot % 180)))
      const asSvg = r => { const id = uid(); assets[id] = r.svg; out.push({ type: 'image', x: Math.round(box.x + (box.w - r.w) / 2), y: Math.round(box.y + (box.h - r.h) / 2), w: Math.round(r.w), h: Math.round(r.h), asset: id, src: `/images/${id}-form.svg` }) }
      if (!(fill || stroke)) { /* invisible: text only */ }
      else if (cust) { const r = custSvg(cust, box.w, box.h, fill, stroke, sw, turn); if (r) asSvg(r) } // freeform: its path as an SVG picture
      else if (plain) {
        const sbox = quarter ? { x: Math.round(box.x + (box.w - box.h) / 2), y: Math.round(box.y + (box.h - box.w) / 2), w: box.h, h: box.w } : box
        out.push({
          type: 'shape', ...sbox, shape: kind, fill: kind === 'line' ? 'none' : fill || 'none', stroke: stroke || 'none',
          strokeWidth: stroke ? Math.round(sw) : 0, radius: kind === 'rounded' ? Math.round(Math.min(box.w, box.h) * 0.16) : 0,
        })
      } else { // turned, with arrowheads, or a preset the editor lacks: drawn as SVG (unknown presets are left out)
        const av = Object.fromEntries(all(kid(spPr, 'prstGeom'), 'gd').map(g => [g.getAttribute('name'), +g.getAttribute('fmla').replace(/^val\s+/, '')]))
        // lines keep their true size (a vertical one has no width)
        const r = isLine ? presetSvg(geom, px(ecx) * gs[0], px(ecy) * gs[1], av, fill, stroke, sw, arrows, turn, dash) : presetSvg(geom, box.w, box.h, av, fill, stroke, sw, arrows, turn, dash)
        if (r) asSvg(r)
      }
      const body = kid(n, 'txBody')
      if (body) {
        const scale = (+kid(body, 'bodyPr', 'normAutofit')?.getAttribute('fontScale') || 100000) / 100000
        const paras = paragraphs(body, chain(n, phInfo, layout, master), scale)
        // text insets (default 0.1" left/right, 0.05" top/bottom), also from the placeholder
        const bodies = [body, ...(phInfo ? [layout, master].map(q => kid(findPh(q, phInfo), 'txBody')) : [])].map(b => kid(b, 'bodyPr')).filter(Boolean)
        const inset = (a, d) => px(+(bodies.map(b => b.getAttribute(a)).find(v => v != null) ?? d))
        const [l, t, r, bt] = [['lIns', 91440], ['tIns', 45720], ['rIns', 91440], ['bIns', 45720]].map(([a, d]) => inset(a, d))
        // round shapes hold their text in the inscribed rectangle, as PowerPoint does
        const [ix, iy] = /^(ellipse|flowChartConnector|wedgeEllipseCallout)$/.test(geom) ? [box.w * (1 - Math.SQRT1_2) / 2, box.h * (1 - Math.SQRT1_2) / 2] : [0, 0]
        const tbox = { x: Math.round(box.x + ix + l), y: Math.round(box.y + iy + t), w: Math.max(4, Math.round(box.w - 2 * ix - l - r)), h: Math.max(4, Math.round(box.h - 2 * iy - t - bt)) }
        // vertical anchor: shape, then the layout's and master's placeholder (default: top)
        const anchor = bodies.map(b => b.getAttribute('anchor')).find(Boolean)
        if (hasText(paras)) out.push({ type: 'text', ...tbox, html: parasHtml(paras), ...(VALIGN[anchor] && { valign: VALIGN[anchor] }), ...(phInfo && phKey(phInfo.type) === 'title' && { title: true }) })
      }
    }
    return out
  }

  // background of the first part that defines one: colour -> rectangle, picture -> image
  async function background(parts) {
    for (const p of parts) {
      const bg = all(p.doc, 'bg')[0]
      if (!bg) continue
      const pr = kid(bg, 'bgPr'), full = { x: Math.round(dx), y: Math.round(dy), w: Math.round(cx * k), h: Math.round(cy * k) }
      const blip = all(pr, 'blip')[0]
      if (blip) {
        const id = blip.getAttributeNS(R, 'embed')
        const img = p.rels[id]?.target && await zipImage(zip, p.rels[id].target, assets)
        if (img) return [{ type: 'image', ...full, ...img, cls: 'object-cover' }]
      }
      const c = pr ? solid(pr) : colorOf(kid(bg, 'bgRef'))
      return c ? [{ type: 'shape', shape: 'rect', ...full, fill: c, stroke: 'none', strokeWidth: 0, radius: 0 }] : []
    }
    return []
  }

  const masters = new Map(), layouts = new Map()
  const cached = (m, path) => { if (!m.has(path)) m.set(path, part(path)); return m.get(path) }
  const slides = []
  let slideNo = 0 // for slide number fields
  const ids = all(pres, 'sldId').map(s => s.getAttributeNS(R, 'id'))
  for (const id of ids) {
    const path = presRels[id]?.target
    if (!path || !zip.file(path)) continue
    const s = await part(path)
    const hidden = s.doc.documentElement.getAttribute('show') === '0' // hidden in PowerPoint: stays hidden here
    slideNo++
    const layoutPath = Object.values(s.rels).find(r => r.type === 'slideLayout')?.target
    const layout = layoutPath ? await cached(layouts, layoutPath) : null
    const masterPath = layout && Object.values(layout.rels).find(r => r.type === 'slideMaster')?.target
    const fallback = masterPath || Object.values(presRels).find(r => r.type === 'slideMaster')?.target
    const master = fallback ? await cached(masters, fallback) : { ph: [], rels: {} } // no master: nothing inherited
    const showMaster = p => p?.doc?.documentElement.getAttribute('showMasterSp') !== '0'
    const elements = [
      ...await background([s, layout, master].filter(Boolean)),
      ...(showMaster(s) && showMaster(layout) ? await shapes(master, layout, master, undefined, undefined, [1, 1], true) : []),
      ...(layout && showMaster(s) ? await shapes(layout, layout, master, undefined, undefined, [1, 1], true) : []),
      ...await shapes(s, layout, master),
    ]
    const notesPath = Object.values(s.rels).find(r => r.type === 'notesSlide')?.target
    const notesDoc = notesPath && await read(notesPath)
    const notes = notesDoc ? all(notesDoc, 'sp').filter(sp => all(sp, 'ph')[0]?.getAttribute('type') === 'body').map(sp => all(sp, 'p').map(p => all(p, 't').map(t => t.textContent).join('')).join('\n')).join('\n').trim() : ''
    slides.push({ layout: 'default', notes, elements, ...(hidden && { hidden }) })
  }
  const title = all(await read('docProps/core.xml'), 'title')[0]?.textContent?.trim()
  return { title: title || file.name.replace(/\.\w+$/, ''), slides, assets, ...format }
}

// --- OpenDocument ---
const ODP_SHAPE = { rectangle: 'rect', rect: 'rect', 'round-rectangle': 'rounded', ellipse: 'ellipse', circle: 'ellipse', 'isosceles-triangle': 'triangle', 'right-arrow': 'arrow' }
const ODP_ALIGN = { start: 'left', left: 'left', center: 'center', end: 'right', right: 'right', justify: 'justify' }

export async function importOdp(file) {
  const zip = await JSZip.loadAsync(file)
  const content = xml(await zip.file('content.xml')?.async('text') || '')
  const stylesDoc = xml(await zip.file('styles.xml')?.async('text') || '<x/>')
  if (!all(content, 'page').length) throw new Error(t('Not a valid OpenDocument presentation'))
  const assets = {}
  const styles = new Map()
  for (const d of [stylesDoc, content]) for (const s of [...all(d, 'style'), ...all(d, 'page-layout')]) styles.set(s.getAttribute('style:family') + ':' + s.getAttribute('style:name'), s)
  const faces = Object.fromEntries([stylesDoc, content].flatMap(d => all(d, 'font-face')).map(f => [f.getAttribute('style:name'), f.getAttribute('svg:font-family')?.replace(/'/g, '')]))
  const byName = name => [...styles.entries()].find(([k]) => k.endsWith(':' + name))?.[1]
  // a style property, following parent styles (props: text-properties, graphic-properties …)
  function prop(name, props, attr, depth = 0) {
    const s = name && byName(name)
    if (!s || depth > 10) return null
    return kid(s, props)?.getAttribute(attr) ?? prop(s.getAttribute('style:parent-style-name'), props, attr, depth + 1)
  }
  const layout = all(stylesDoc, 'master-page')[0]
  const pl = byName(layout?.getAttribute('style:page-layout-name'))
  const len = v => { const m = String(v || '').match(/^(-?[\d.]+)(cm|mm|in|pt|pc|px)?$/); return m ? +m[1] * { cm: 72 / 2.54, mm: 72 / 25.4, in: 72, pt: 1, pc: 12, px: 0.75 }[m[2] || 'pt'] : 0 } // -> pt
  const pw = len(kid(pl, 'page-layout-properties')?.getAttribute('fo:page-width')) || 720, ph = len(kid(pl, 'page-layout-properties')?.getAttribute('fo:page-height')) || 405
  const { format, W, H } = slideFormat(pw, ph)
  const k = Math.min(W / pw, H / ph), dx = (W - pw * k) / 2, dy = (H - ph * k) / 2
  const px = v => len(v) * k
  const at = (n, a) => n.getAttribute(a)

  function paragraphs(box, frameStyles) {
    const out = []
    const run = (n, st, list) => {
      const cur = out.at(-1)
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { cur.runs.push({ text: c.textContent, ...st }); continue }
        if (c.nodeType !== 1) continue
        if (c.localName === 'line-break') cur.runs.push({ br: true })
        else if (c.localName === 's') cur.runs.push({ text: ' '.repeat(+at(c, 'text:c') || 1), ...st })
        else if (c.localName === 'tab') cur.runs.push({ text: '\t', ...st })
        else run(c, c.localName === 'span' ? textStyle(at(c, 'text:style-name'), st) : st, list)
      }
    }
    const textStyle = (name, base = {}) => {
      const g = a => prop(name, 'text-properties', a)
      const size = g('fo:font-size'), w = g('fo:font-weight'), it = g('fo:font-style'), u = g('style:text-underline-style'), col = g('fo:color'), font = g('fo:font-family') || faces[g('style:font-name')] || g('style:font-name')
      return { ...base, ...(size && !size.endsWith('%') && { size: px(size) }), ...(w && { b: w === 'bold' || +w >= 600 }), ...(it && { i: it === 'italic' }), ...(u && { u: u !== 'none' }), ...(col && { color: col }), ...(font && { font: font.replace(/'/g, '') }) }
    }
    const base = frameStyles.reduce((a, n) => textStyle(n, a), {})
    const walk = (n, list) => {
      for (const c of kids(n)) {
        if (c.localName === 'list') walk(c, at(c, 'text:style-name') && all(byName(at(c, 'text:style-name')) || c, 'list-level-style-number').length ? 'ol' : 'ul')
        else if (c.localName === 'list-item' || c.localName === 'list-header') walk(c, c.localName === 'list-header' ? null : list)
        else if (c.localName === 'p' || c.localName === 'h') {
          const ps = at(c, 'text:style-name')
          out.push({ align: ODP_ALIGN[prop(ps, 'paragraph-properties', 'fo:text-align') || frameStyles.map(s => prop(s, 'paragraph-properties', 'fo:text-align')).find(Boolean)], list, runs: [] })
          run(c, textStyle(ps, base), list)
        }
      }
    }
    walk(box, null)
    return out
  }

  async function shapes(parent, decor) {
    const out = []
    for (const n of kids(parent)) {
      if (n.localName === 'g') { out.push(...await shapes(n, decor)); continue }
      if (n.localName === 'notes' || n.localName === 'forms') continue
      if (decor && at(n, 'presentation:placeholder') === 'true') continue
      const cls = at(n, 'presentation:class')
      if (decor && cls && cls !== 'graphic') continue // header/footer/page-number fields of the master
      const box = n.localName === 'line'
        ? (() => { const [x1, y1, x2, y2] = ['svg:x1', 'svg:y1', 'svg:x2', 'svg:y2'].map(a => px(at(n, a))); return { x: Math.round(dx + Math.min(x1, x2)), y: Math.round(dy + Math.min(y1, y2)), w: Math.max(4, Math.round(Math.abs(x2 - x1))), h: Math.max(4, Math.round(Math.abs(y2 - y1))) } })()
        : { x: Math.round(dx + px(at(n, 'svg:x'))), y: Math.round(dy + px(at(n, 'svg:y'))), w: Math.max(4, Math.round(px(at(n, 'svg:width')))), h: Math.max(4, Math.round(px(at(n, 'svg:height')))) }
      const st = [at(n, 'presentation:style-name'), at(n, 'draw:style-name')].filter(Boolean)
      const gp = a => st.map(s => prop(s, 'graphic-properties', a)).filter(v => v != null).at(-1)
      const img = kid(n, 'image'), tbl = kid(n, 'table'), tb = kid(n, 'text-box')
      if (img && !tbl) { // tables carry a fallback picture
        const href = at(img, 'xlink:href')
        const im = href && !/^[a-z]+:/i.test(href) && await zipImage(zip, href.replace(/^\.\//, ''), assets)
        if (im) out.push({ type: 'image', ...box, ...im })
        continue
      }
      if (tbl) {
        // covered (merged-over) cells stay as empty cells, so the cells after them keep their column
        const cells = all(tbl, 'table-row').map(r => kids(r).filter(c => /^(covered-)?table-cell$/.test(c.localName)))
        const rows = cells.map(r => r.map(c => parasHtml(paragraphs(c, []))))
        // cell colour: the cell style's fill (LibreOffice) or background
        // the cell's own style, else its row's or column's default
        const colStyles = kids(tbl, 'table-column').map(c => at(c, 'table:default-cell-style-name'))
        const fill = (c, j) => { const st = at(c, 'table:style-name') || at(c.parentNode, 'table:default-cell-style-name') || colStyles[j]; return prop(st, 'graphic-properties', 'draw:fill') === 'solid' ? prop(st, 'graphic-properties', 'draw:fill-color') : prop(st, 'table-cell-properties', 'fo:background-color') || '' }
        const fills = cells.map(r => r.map((c, j) => (fill(c, j) || '').replace(/^transparent$/, '')))
        // borders "0.51pt solid #000000" per side, or for all four
        const cellBorder = (c, j, k) => {
          const st = at(c, 'table:style-name') || at(c.parentNode, 'table:default-cell-style-name') || colStyles[j]
          const m = (prop(st, 'table-cell-properties', 'fo:border-' + k) || prop(st, 'table-cell-properties', 'fo:border') || '').match(/^([\d.]+[a-z]+)\s+(solid|dashed|dotted|double)\s+(#[0-9a-f]{6})/i)
          return m ? `${Math.max(1, r1(px(m[1])))}px ${m[2]} ${m[3]}` : ''
        }
        const borders = cells.map(r => r.map((c, j) => ['top', 'right', 'bottom', 'left'].map(k => cellBorder(c, j, k))))
        if (rows.length) out.push({ type: 'table', ...box, rows, header: true, preset: 'theme', ...(fills.some(r => r.some(Boolean)) && { fills }), ...(borders.some(r => r.some(b => b.some(Boolean))) && { borders }) })
        continue
      }
      const geom = n.localName === 'custom-shape' ? ODP_SHAPE[at(kid(n, 'enhanced-geometry') || n, 'draw:type')?.replace(/^ooxml-/, '')] || 'rect'
        : { rect: 'rect', ellipse: 'ellipse', circle: 'ellipse', line: 'line', polygon: 'rect', path: 'rect' }[n.localName]
      const fill = gp('draw:fill') === 'solid' ? gp('draw:fill-color') : null
      const stroke = gp('draw:stroke') && gp('draw:stroke') !== 'none' ? gp('svg:stroke-color') || '#000000' : null
      if (geom && (fill || stroke)) out.push({ type: 'shape', ...box, shape: at(n, 'draw:corner-radius') ? 'rounded' : geom, fill: geom === 'line' ? 'none' : fill || 'none', stroke: stroke || 'none', strokeWidth: stroke ? Math.max(1, Math.round(px(gp('svg:stroke-width') || '1pt'))) : 0, radius: 0 })
      else if (tb && fill) out.push({ type: 'shape', ...box, shape: 'rect', fill, stroke: 'none', strokeWidth: 0, radius: 0 })
      const paras = paragraphs(tb || n, st)
      const va = VALIGN[gp('draw:textarea-vertical-align')]
      if (hasText(paras)) out.push({ type: 'text', ...box, html: parasHtml(paras), ...(va && { valign: va }), ...(cls === 'title' && { title: true }) })
    }
    return out
  }
  const bgOf = name => {
    const s = name && byName(name), p = kid(s, 'drawing-page-properties')
    return p?.getAttribute('draw:fill') === 'solid' && p.getAttribute('draw:fill-color')
  }
  const masterPages = new Map(all(stylesDoc, 'master-page').map(m => [at(m, 'style:name'), m]))
  const slides = []
  for (const page of all(content, 'page')) {
    const master = masterPages.get(at(page, 'draw:master-page-name')) || layout
    const bg = bgOf(at(page, 'draw:style-name')) || bgOf(master && at(master, 'draw:style-name'))
    const full = { x: Math.round(dx), y: Math.round(dy), w: Math.round(pw * k), h: Math.round(ph * k) }
    const notes = all(kid(page, 'notes'), 'frame').filter(f => at(f, 'presentation:class') === 'notes').flatMap(f => all(f, 'p').map(p => p.textContent)).join('\n').trim()
    slides.push({
      layout: 'default', notes, elements: [
        ...(bg ? [{ type: 'shape', shape: 'rect', ...full, fill: bg, stroke: 'none', strokeWidth: 0, radius: 0 }] : []),
        ...(master ? await shapes(master, true) : []),
        ...await shapes(page, false),
      ],
    })
  }
  const meta = zip.file('meta.xml') && xml(await zip.file('meta.xml').async('text'))
  return { title: all(meta, 'title')[0]?.textContent?.trim() || file.name.replace(/\.\w+$/, ''), slides, assets, ...format }
}

// --- PDF: every page as a picture (text is not editable) ---
export async function importPdf(file, progress = () => {}) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false /* CSP: no eval */ })
  const pdf = await task.promise
  try {
    const assets = {}, slides = []
    const first = (await pdf.getPage(1)).getViewport({ scale: 1 })
    const { format, W, H } = slideFormat(first.width, first.height) // pages of another size are fitted and centred
    for (let i = 1; i <= pdf.numPages; i++) {
      progress(i, pdf.numPages)
      const page = await pdf.getPage(i)
      const v = page.getViewport({ scale: 1 })
      const vp = page.getViewport({ scale: (W * 2) / v.width })
      const canvas = Object.assign(document.createElement('canvas'), { width: Math.ceil(vp.width), height: Math.ceil(vp.height) })
      await page.render({ canvas, viewport: vp }).promise
      const id = uid()
      assets[id] = canvas.toDataURL('image/jpeg', 0.92)
      canvas.width = canvas.height = 0 // Safari keeps canvas memory until GC otherwise
      const kk = Math.min(W / v.width, H / v.height), w = Math.round(v.width * kk), h = Math.round(v.height * kk)
      const text = (await page.getTextContent()).items.map(t => t.str + (t.hasEOL ? '\n' : '')).join('').trim()
      slides.push({ layout: 'default', notes: text, elements: [{ type: 'image', asset: id, src: `/images/page-${i}.jpg`, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h }] })
      page.cleanup()
    }
    const title = (await pdf.getMetadata().catch(() => null))?.info?.Title?.trim()
    return { title: title || file.name.replace(/\.\w+$/, ''), slides, assets, ...format }
  } finally {
    await task.destroy() // frees the worker and its page memory (pdfjs 6: the document proxy has no destroy)
  }
}
