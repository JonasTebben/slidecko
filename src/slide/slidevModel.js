// The parts of the Slidev model the editor itself needs (shapes, fields, layouts, hashes, paths); the Markdown writer
// (toSlidev.js, with Turndown) loads only when a project is exported to Slidev
import { fmGet } from '../import/parseSlidev.js'
import { themeOf } from './themes.js'

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

// a line's ends: straight through the middle, or corner to corner (slope down / up)
export const lineEnds = ({ w, h, slope }) => (slope === 'down' ? [[0, 0], [w, h]] : slope === 'up' ? [[0, h], [w, 0]] : [[0, h / 2], [w, h / 2]])

// the line, shortened under its arrowheads (filled triangles in the line's colour, sized by its width)
function lineSvg(el) {
  const c = el.stroke && el.stroke !== 'none' ? el.stroke : el.fill, lw = el.strokeWidth || 3
  let [a, b] = lineEnds(el)
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len
  const L = Math.min(len / 2, Math.max(10, lw * 3.5)), W = Math.max(6, lw * 2)
  // a triangle with its tip at the end, pointing along d (+1: towards the end, -1: towards the start); returns [svg, its base]
  const head = (tip, d) => {
    const bx = tip[0] - d * ux * L, by = tip[1] - d * uy * L
    return [`<polygon points="${tip[0]},${tip[1]} ${bx - uy * W},${by + ux * W} ${bx + uy * W},${by - ux * W}" fill="${c}"/>`, [bx, by]]
  }
  let heads = ''
  if (el.head === 'end' || el.head === 'both') { const [p, base] = head(b, 1); heads += p; b = base }
  if (el.head === 'start' || el.head === 'both') { const [p, base] = head(a, -1); heads += p; a = base }
  return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${c}" stroke-width="${lw}" stroke-linecap="${el.head ? 'butt' : 'round'}"/>${heads}`
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
    line: lineSvg(el),
  }[el.shape] || ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="overflow:visible">${body}</svg>`
}

// --- master and layouts (slide types) ---
// a field in master or layout text: <span data-field="page">#</span>, shown as the slide number, slide count or project title
export const FIELDS = { page: 'Slide number', total: 'Slide count', title: 'Project title' }

export const FIELD = /(<span\b[^>]*\bdata-field="(page|total|title)"[^>]*>)[^<]*(<\/span>)/g

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

// master and layouts from a Slidev export of Slidecko: { master, layouts: [{ ...layout, slug }] } (slug: the file name slides use)
export function readLayers(files = {}) {
  const read = p => { try { return JSON.parse(files[p].match(/^<!-- slidecko-\w+ (.*) -->/)[1]) } catch { return undefined } }
  const paths = Object.keys(files)
  const layouts = paths.filter(p => /(^|\/)layouts\/[\w-]+\.vue$/.test(p)).map(p => ({ ...read(p), slug: p.match(/([\w-]+)\.vue$/)[1] })).filter(l => Array.isArray(l.elements))
  const master = read(paths.find(p => /(^|\/)global-(top|bottom)\.vue$/.test(p)))?.elements
  return { master: Array.isArray(master) ? master : undefined, layouts }
}

// one frontmatter key set to v (removed when v is empty), unchanged when it already says so
export const fmSet = (fm, key, v) => ((fmGet(fm, key) ?? '') === String(v ?? '') ? fm : [fm.replace(new RegExp(`^${key}:.*\\n?`, 'm'), '').trim(), v != null && v !== '' && `${key}: ${v}`].filter(Boolean).join('\n'))

// returns { files: { path: text }, images: { path: assetId } }
// projectFiles: the project's other files (theme, package.json …), written back unchanged
// shapeFont: element id -> font size the editor shrank its shape text to
// fonts: what the project files need from the app, zip path -> 'fonts/…' (a bundled file) or an asset id (an uploaded font)
// image path in the Markdown -> asset id, for every image of these slides
export function imageMap(slides) {
  const images = {}
  for (const s of slides) if (s.bg) images[imagePath(s.bg.src)] = s.bg.asset // a slide's background picture
  for (const s of slides) for (const el of s.elements) {
    if ((el.type === 'image' || el.type === 'media') && el.src) images[imagePath(el.src)] = el.asset // pictures, video and sound files
    for (const m of JSON.stringify(el.html || el.rows || '').matchAll(/<img[^>]*?>/g)) {
      const id = m[0].match(/data-asset=\\"([^"\\]+)/)?.[1], src = m[0].match(/src=\\"([^"\\]+)/)?.[1]
      if (id && src && !/^(data|https?):/.test(src)) images[imagePath(src)] = id
    }
  }
  return images
}
