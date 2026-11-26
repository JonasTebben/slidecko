import { marked } from 'marked'
import { parseSlidev, headFormat, stripNonContent, slots, slidevComponents, snippets, snippetPath, SNIPPET, clickOf, clickAttrs, fmGet, codeEl, slidevTags } from './parseSlidev.js'
import { imagePath, readLayers } from '../export/toSlidev.js'
import { uid, clean, readDataUrl, webUrl } from '../core/store.js'
import { parseRatio, formatSize } from '../slide/format.js'
import { CENTERED, themeStyle, fontKey, SHADOWS } from '../slide/themes.js'
import { applyUno } from '../slide/uno.js'
import { t } from '../core/i18n.js'
import { listItems, codeStages } from '../present/clicks.js'
import { iconTags, readIconStyle, getIcon } from '../slide/icons.js'
import { loadMath, formulaHtml } from '../slide/math.js'
import { isRun } from '../present/run.js'

// Slidev markdown -> slides of absolutely positioned elements.
//
// Every slide is rendered the way Slidev renders it (markdown -> HTML, UnoCSS utilities, theme
// CSS, layout padding/centering) into a hidden slide of the deck's format (headmatter aspectRatio/canvasWidth), and the boxes the browser computes
// become the element positions. Wrapper <div>s (columns, grids, spacing) are dissolved into their
// measured children; text that sits together stays one text box.

const CONTAINERS = new Set(['DIV', 'V-CLICKS', 'V-CLICK', 'V-AFTER', 'SECTION', 'ARTICLE', 'MAIN'])
const SKIP = new Set(['STYLE', 'SCRIPT', 'BR', 'TEMPLATE'])
const TRANSPARENT = /^(transparent|rgba\(0, 0, 0, 0\))$/

const styled = (el, cs = getComputedStyle(el)) =>
  !TRANSPARENT.test(cs.backgroundColor) || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none' ||
  ['Top', 'Right', 'Bottom', 'Left'].some(s => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none')
const hasText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.data.trim())
// a box written by toSlidev.js: <div style="position:absolute;left:…px;…">
const savedBox = el => el.tagName === 'DIV' && el.style.position === 'absolute' && el.style.width.endsWith('px')
const isImageOnly = el => el.tagName === 'P' && el.children.length === 1 && el.firstElementChild.tagName === 'IMG' && !hasText(el)
// <v-clicks> around lists only (written by toSlidev): the text box's "list items one by one"
const itemClicks = el => el?.tagName === 'V-CLICKS' && [...el.attributes].every(a => a.name === 'at') && [...el.children].every(c => /^[OU]L$/.test(c.tagName))
// a leaf with its own click attribute is an element of its own
const clicky = el => ['v-click', 'v-click.hide', 'v-after'].some(a => el.hasAttribute(a))
// Slidev's <v-click at="2" hide> / <v-after> around exactly an element's leaves: its click, as the attribute forms
const soleIn = (p, n) => /^V-(CLICK|AFTER)$/.test(p?.tagName) && p.children.length === n
const compAttr = c => k => (c.tagName === 'V-AFTER' ? (k === 'v-after' ? '' : null)
  : k === (c.hasAttribute('hide') ? 'v-click.hide' : 'v-click') ? c.getAttribute('at') ?? '' : null)
const special = el => el.dataset.toc || el.dataset.shape || el.dataset.video || el.dataset.web || el.dataset.timer || el.dataset.picks || el.dataset.quiz || el.dataset.chart || el.dataset.table || el.dataset.callout || el.dataset.icon || el.dataset.math

// path: the markdown file to import; files: Map of project-relative path -> File (markdown files it
// embeds via `src:` and all images are read from it).
// known: image path -> id of an asset the project already has (Markdown of its own slides, edited in the app)
// a background written as color-mix(in srgb, <colour> N%, transparent) -> { fill, fillAlpha }; var(--…) = the theme's colour
function unmix(bg) {
  const m = bg.match(/^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%,\s*transparent(?:\s+[\d.]+%)?\)$/) // Chrome adds the second share
  if (!m) return { fill: bg }
  return { ...(!m[1].startsWith('var(') && { fill: m[1] }), fillAlpha: +m[2] }
}
// slide numbers in links ("#5", "/5", data-to) -> slide ids; ids: the slides by Slidev number
function slideLinks(els, ids) {
  for (const e of els) {
    if (e.html) e.html = e.html.replace(/href="[#/](\d+)"/g, (m, n) => (ids[n - 1] ? `href="#slide-${ids[n - 1]}"` : m))
    if (e.toNum) e.to = ids[e.toNum - 1]
    delete e.toNum
  }
}
// a frontmatter background that is a picture (not a colour or gradient)
const bgPath = v => (v && !/^(#|rgb|hsl|linear-|radial-)/i.test(v) && /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$|^data:image\//i.test(v) ? v : null)
// known: path -> existing asset id; slideIds: what slide numbers in links mean (default: the imported slides)
export async function importSlidev(path, files, theme, known = {}, { slideIds } = {}) {
  const assets = {}, bySrc = {}, missingFiles = []
  let missing = 0
  const texts = new Map(await Promise.all(
    [...files].filter(([p]) => p.endsWith('.md') && !p.includes('node_modules')).map(async ([p, f]) => [p, typeof f === 'string' ? f : await f.text()])))
  const read = p => (texts.has(p) ? texts.get(p) : void missingFiles.push(p))
  if (!texts.has(path)) throw new Error(t('{0} was not found', path))

  const storeAsset = data => {
    const id = uid()
    assets[id] = data
    return id
  }
  const asset = async src => {
    if (src in bySrc) return bySrc[src]
    if (/^data:image\//.test(src)) return (bySrc[src] = storeAsset(src))
    const p = imagePath(src)
    if (known[p]) return (bySrc[src] = known[p])
    const file = files.get(p) || files.get('public/' + p)
    return (bySrc[src] = file ? storeAsset(await readDataUrl(file)) : null)
  }

  // layouts a Slidecko export wrote (layouts/<name>.vue): their slides are measured with the Slidev layout they stand for
  const vue = Object.fromEntries(await Promise.all([...files].filter(([p]) => /(^|\/)layouts\/[\w-]+\.vue$/.test(p)).map(async ([p, f]) => [p, typeof f === 'string' ? f : await f.text()])))
  const ownLayouts = readLayers(vue).layouts
  const baseOf = l => ownLayouts.find(o => o.slug === l)?.layout || l
  const parsed = parseSlidev(texts.get(path), read, path)
  // Slidev shows a whole deck's first slide without a layout as a cover (a fragment, with slideIds, is not a deck's start)
  if (!slideIds && parsed[0] && !fmGet(parsed[0].fm, 'layout')) parsed[0].layout = 'cover'
  // measured at the deck's own size; createProject() applies the returned format
  const format = headFormat(texts.get(path))
  const size = formatSize(parseRatio(format.aspectRatio) || 16 / 9, format.canvasWidth || 980)
  // Slidev's markdown-it and marked agree on CommonMark + GFM + raw HTML
  // sanitized: the markdown may come from a pasted text or a downloaded project (raw HTML, onerror=…)
  // the code files that `<<<` snippets name, read now (the Markdown is turned into HTML synchronously)
  const root = path.split('/').slice(0, -1).join('/'), dirOf = f => f.split('/').slice(0, -1).join('/'), code = new Map()
  for (const s of parsed) for (const [, p] of s.md.matchAll(SNIPPET)) {
    const full = snippetPath(p, root, dirOf(s.file)), f = files.get(full)
    if (f && !code.has(full)) code.set(full, typeof f === 'string' ? f : await f.text())
    else if (!f) missingFiles.push(full)
  }
  const htmls = parsed.map(s => clean(marked.parse(slidevTags(iconTags(slots(slidevComponents(snippets(stripNonContent(s.md), p => code.get(p), root, dirOf(s.file))))), Math.min(10, parsed.length)))))
  await applyUno(htmls.join('\n'))

  const host = document.body.appendChild(document.createElement('div'))
  host.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden'
  const slides = []
  try {
    for (const [i, s] of parsed.entries()) {
      const centered = CENTERED.includes(baseOf(s.layout))
      const slide = Object.assign(document.createElement('div'), { className: `slide theme-${theme} layout-${baseOf(s.layout)}` })
      for (const [k, v] of Object.entries(themeStyle(theme))) slide.style.setProperty(k, v)
      Object.assign(slide.style, { width: size.w + 'px', height: size.h + 'px' })
      slide.innerHTML = `<div class="flow${centered ? ' center' : ''}">${centered ? `<div class="center-wrap">${htmls[i]}</div>` : htmls[i]}</div>`
      // Slidev's image-left/-right: the picture (frontmatter image:) takes one half, the content the other
      const half = { 'image-left': 'left', 'image-right': 'right', 'iframe-left': 'left', 'iframe-right': 'right' }[baseOf(s.layout)]
      if (half) Object.assign(slide.firstChild.style, half === 'left' ? { left: '50%' } : { right: '50%' })
      host.replaceChildren(slide)

      for (const pre of slide.querySelectorAll('pre')) pre.classList.add('code')
      // formulas measured as KaTeX draws them (Slidev renders them too); the source stays in data-tex
      const formulas = slide.querySelectorAll('[data-math]')
      if (formulas.length) await loadMath()
      for (const f of formulas) { f.dataset.tex = f.textContent.slice(2, -2).trim(); f.innerHTML = formulaHtml(f.dataset.tex) }
      await Promise.all([...slide.querySelectorAll('img[src]')].map(async img => {
        const src = img.getAttribute('src')
        const id = await asset(src)
        if (!id) return missing++
        Object.assign(img.dataset, { asset: id, src })
        img.src = assets[id]
        await img.decode().catch(() => {})
        // Firefox may reject decode() for big off-screen images; measuring before the load gives tiny boxes
        if (!img.complete || !img.naturalWidth) await new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 5000) })
      }))
      // icons of bundled sets get their SVG; unknown names are left out (the slide's Markdown keeps them), a picker keeps its die
      const elements = (await Promise.all(measure(slide, s).map(async e => (e.type === 'icon' || (e.type === 'picker' && e.icon) ? Object.assign(e, await getIcon(e.icon).catch(() => null)) : e)))).filter(e => e.type !== 'icon' || e.body)
      // the picture of Slidev's image layouts (image:) as an image element; toSlidev leaves it out while the layout shows it
      const pic = /^image(-left|-right)?$/.test(baseOf(s.layout)) && bgPath(fmGet(s.fm, 'image')), picId = pic && await asset(pic)
      if (pic && !picId) missing++
      if (picId) elements.unshift({ id: uid(), type: 'image', asset: picId, src: pic, x: half === 'right' ? size.w / 2 : 0, y: 0, w: half ? size.w / 2 : size.w, h: size.h, decorative: true })
      // the page of Slidev's iframe layouts (url:) as a web page element
      const page = /^iframe(-left|-right)?$/.test(baseOf(s.layout)) && webUrl(fmGet(s.fm, 'url'))
      if (page) elements.unshift({ id: uid(), type: 'video', url: page, x: half === 'right' ? size.w / 2 : 0, y: 0, w: half ? size.w / 2 : size.w, h: size.h })
      const bg = bgPath(fmGet(s.fm, 'background')), bgId = bg && await asset(bg)
      slides.push({ id: uid(), layout: s.layout, elements,
        ...(bgId && { bg: { asset: bgId, src: bg, fit: fmGet(s.fm, 'backgroundSize'), dim: +fmGet(s.fm, 'backgroundDim') || undefined } }),
        ...(fmGet(s.fm, 'hideInToc') === 'true' && { hideInToc: true }), cls: fmGet(s.fm, 'class'), fm: s.fm, md: s.md, file: s.file, notes: s.notes, gap: s.gap, hidden: s.hidden, transition: s.transition, hideMaster: fmGet(s.fm, 'hideMaster') === 'true', duration: +fmGet(s.fm, 'plannedTime') || undefined })
    }
  } finally {
    host.remove()
  }
  const ids = slideIds || slides.filter(s => !s.hidden).map(s => s.id)
  for (const s of slides) slideLinks(s.elements, ids)
  return { slides, assets, missing, missingFiles, ...format }
}

// an empty block written by hand (<div data-timer="300"></div>) has no height of its own: it gets the height of
// the element it becomes (as inserted in the editor), so it is usable and what follows moves below it
const BLOCK_H = { timer: 110, picks: 160, chart: 300, quiz: 240 }
function measure(slide, parsed) {
  for (const [k, h] of Object.entries(BLOCK_H)) for (const n of slide.querySelectorAll(`[data-${k}]`)) if (!savedBox(n) && n.offsetHeight < 8) n.style.minHeight = h + 'px'
  const base = slide.getBoundingClientRect()
  const ox = base.left + slide.clientLeft, oy = base.top + slide.clientTop // inside the border, like `position:absolute`
  const rootAlign = getComputedStyle(slide).textAlign
  const codeMeta = parsed.blocks.filter(b => b.type === 'code').map(b => b.meta)
  let codeIndex = 0

  // leaves in document order: everything that is not a dissolvable wrapper
  const leaves = []
  const walk = node => {
    for (const el of node.children) {
      if (SKIP.has(el.tagName)) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none') continue
      const wrapper = CONTAINERS.has(el.tagName) && el.children.length && !hasText(el) && !special(el)
      if (wrapper && (cs.display === 'contents' || !styled(el, cs))) walk(el)
      else leaves.push(el)
    }
  }
  walk(slide.firstElementChild)

  const rect = el => {
    const r = el.getBoundingClientRect()
    return { x: r.left - ox, y: r.top - oy, r: r.right - ox, b: r.bottom - oy }
  }
  const boxOf = el => {
    for (let n = el; n && n !== slide; n = n.parentElement) if (savedBox(n)) return n
  }
  const px = v => parseFloat(v) || 0
  const fromBox = (box, el) => {
    Object.assign(el, { x: px(box.style.left), y: px(box.style.top), w: px(box.style.width), h: px(box.style.height) })
    if (box.style.fontSize) el.fontSize = px(box.style.fontSize)
    if (box.style.color) el.color = box.style.color
    if (fontKey(box.style.fontFamily)) el.font = fontKey(box.style.fontFamily)
    if (box.style.textAlign) el.align = box.style.textAlign
    if (box.style.display === 'flex' && box.style.flexDirection === 'column') el.valign = { center: 'middle', 'flex-end': 'bottom' }[box.style.justifyContent]
    if (box.style.backgroundColor) Object.assign(el, unmix(box.style.backgroundColor))
    if (box.style.borderTopStyle && box.style.borderTopStyle !== 'none') Object.assign(el, { stroke: box.style.borderTopColor, strokeWidth: px(box.style.borderTopWidth), ...(box.style.borderTopStyle !== 'solid' && { strokeStyle: box.style.borderTopStyle }) })
    if (box.style.getPropertyValue('--locked')) el.locked = true
    if (box.style.getPropertyValue('--group')) el.group = box.style.getPropertyValue('--group').trim()
    if (box.style.getPropertyValue('--board')) Object.assign(el, { board: true, liveTemp: box.style.getPropertyValue('--board').trim() === '2' })
    if (box.style.getPropertyValue('--lh')) el.line = parseFloat(box.style.getPropertyValue('--lh')) // cleanEl checks both
    if (box.style.getPropertyValue('--ps')) el.para = parseFloat(box.style.getPropertyValue('--ps'))
    if (box.style.getPropertyValue('--morph')) el.morph = box.style.getPropertyValue('--morph').trim()
    // shadow written by toSlidev: drop-shadow(… 0px Ypx BLURpx), recognised by its blur
    const blur = box.style.filter.match(/drop-shadow\(.*?([\d.]+)px\)?\s*\)?$/)?.[1]
    if (blur) el.shadow = Object.keys(SHADOWS).find(k => SHADOWS[k].blur === +blur)
    return el
  }
  const sized = (el, rs) => {
    const x = Math.min(...rs.map(r => r.x)), y = Math.min(...rs.map(r => r.y))
    // +1: rounding must never make a line wrap that did not wrap in Slidev
    return Object.assign(el, { x: Math.round(x), y: Math.round(y), w: Math.ceil(Math.max(...rs.map(r => r.r)) - x) + 1, h: Math.ceil(Math.max(...rs.map(r => r.b)) - y) })
  }
  // markup of nodes, with image paths instead of the data URLs used for measuring
  const html = nodes => clean(nodes.map(n => {
    const c = n.cloneNode(true)
    for (const img of [c, ...c.querySelectorAll('img')]) if (img.tagName === 'IMG' && img.dataset.src) img.setAttribute('src', img.dataset.src)
    return c.outerHTML
  }).join('\n'))
  // in a saved box such a <v-clicks> does not split the box's text
  const up = m => (itemClicks(m.parentElement) && savedBox(m.parentElement.parentElement) ? m.parentElement.parentElement : m.parentElement)
  const textual = m => !special(m) && m.tagName !== 'IMG' && !isImageOnly(m) && m.tagName !== 'PRE' && m.tagName !== 'TABLE' && !styled(m)

  const elements = []
  let titled = false, clicks = 0
  const wrapClicks = new Map() // <div v-click> around several elements: they all take its one step
  const tabGroups = new Map() // <div data-tabs> -> the code element its blocks become tabs of
  for (let i = 0; i < leaves.length; i++) {
    const n = leaves[i], box = boxOf(n), r = rect(n)
    if (r.r - r.x < 1 && r.b - r.y < 1) continue
    const el = { id: uid() }
    let span = 1 // leaves the element is made of
    const img = n.tagName === 'IMG' ? n : isImageOnly(n) ? n.firstElementChild : null

    if (n.dataset.shape) {
      Object.assign(el, { type: 'shape', shape: n.dataset.shape, fill: n.dataset.fill || 'none', stroke: n.dataset.stroke || 'none', strokeWidth: +n.dataset.sw || 0, radius: +n.dataset.radius || 0, ...(n.dataset.alpha && { fillAlpha: +n.dataset.alpha }), ...(n.dataset.slope && { slope: n.dataset.slope }), ...(n.dataset.head && { head: n.dataset.head }) })
      const text = n.querySelector('.shape-text > div') || n.querySelector('.shape-text') // written by toSlidev for text in shapes
      if (text?.textContent.trim()) el.html = text.innerHTML
    } else if (n.dataset.web) {
      Object.assign(el, { type: 'video', url: n.dataset.web })
    } else if (n.dataset.video) {
      Object.assign(el, { type: 'video', youtube: n.dataset.video })
    } else if (n.dataset.icon) {
      Object.assign(el, { type: 'icon', icon: n.dataset.icon, ...readIconStyle(n.style), ...(n.dataset.label && { label: n.dataset.label }) })
      const c = getComputedStyle(n).color // a colour class (text-red-500)
      if (el.color === 'currentColor' && c !== getComputedStyle(n.parentElement).color) el.color = c
    } else if (n.dataset.timer) {
      Object.assign(el, { type: 'timer', seconds: +n.dataset.timer || 0, face: n.dataset.face, accent: n.dataset.accent, fill: n.dataset.fill, warn: n.dataset.warn === '1', auto: n.dataset.auto === '1', silent: n.dataset.silent === '1' }) // cleanEl checks them
    } else if (n.dataset.picks) {
      let names = []
      try { names = JSON.parse(n.dataset.picks) } catch { /* a broken list: an empty picker, cleanEl checks the rest */ }
      Object.assign(el, { type: 'picker', names, repeat: n.dataset.repeat === '1', look: n.dataset.look, heading: n.dataset.heading, noIcon: n.dataset.noicon === '1', icon: n.dataset.pickIcon, fontSize: 64 }) // the icon's SVG from its set below; the name's size as inserted in the editor (a saved box keeps its own)
    } else if (n.dataset.quiz) {
      let q = {}
      try { q = JSON.parse(n.dataset.quiz) } catch { /* broken data: an empty quiz, cleanEl checks the rest */ }
      Object.assign(el, { type: 'quiz', question: q?.question, answers: q?.answers, look: q?.look })
    } else if (n.dataset.toc) {
      let o = {}
      try { o = JSON.parse(n.dataset.toc) } catch { /* broken data: the default options */ }
      Object.assign(el, { type: 'toc', ...o })
    } else if (n.dataset.chart) {
      let d = {}
      try { d = JSON.parse(n.dataset.chart) } catch { /* broken data: an empty chart, cleanEl checks the rest */ }
      const { kind, categories, series, legend, values, stacked, title, min, max, percent, catColors, palette } = d || {}
      Object.assign(el, { type: 'chart', kind, categories, series, legend, values, stacked, title, min, max, percent, catColors, palette })
    } else if (img) {
      if (!img.dataset.asset) continue
      Object.assign(el, { type: 'image', asset: img.dataset.asset, src: img.dataset.src, ...(img.getAttribute('class') && { cls: img.getAttribute('class') }),
        ...(img.getAttribute('role') === 'presentation' ? { decorative: true } : img.getAttribute('alt')?.trim() && { alt: img.getAttribute('alt') }) })
      const crop = box?.dataset.crop?.split(',').map(Number) // written by toSlidev for cropped pictures
      if (crop?.length === 4) el.crop = { x: crop[0], y: crop[1], w: crop[2], h: crop[3] }
      if (!box) sized(el, [rect(img)])
    } else if (n.dataset.math) {
      Object.assign(el, { type: 'math', tex: n.dataset.tex })
      if (!box) sized(el, [r])
    } else if (n.tagName === 'PRE') {
      const code = n.querySelector('code')
      Object.assign(el, codeEl((code || n).textContent.replace(/\n$/, ''), code?.className.match(/language-(\S+)/)?.[1]))
      if (codeMeta[codeIndex] && el.type === 'code') el.meta = codeMeta[codeIndex]
      codeIndex++
      // a code group (::code-group): the tab's name in brackets; the group's later blocks become tabs of its first
      const label = el.meta?.match(/\[([^\]\n]*)\]/)?.[1]?.trim()
      if (el.meta) el.meta = el.meta.replace(/\[[^\]\n]*\]/, '').trim() || undefined
      const group = el.type === 'code' && n.closest('[data-tabs]')
      if (group && tabGroups.has(group)) {
        const first = tabGroups.get(group)
        if (!box && !first.tabs.length) first.h += 32 // room for the tab names
        first.tabs.push({ code: el.code, lang: el.lang, ...(label && { label }) })
        if (!box) first.h = Math.max(first.h, Math.ceil(r.b - r.y) + 32)
        continue
      }
      if (group) { tabGroups.set(group, el); el.tabs = []; if (label) el.label = label }
      // a diagram measured as its source text: at least a usable height for the picture
      if (el.type === 'diagram' && !box) { sized(el, [r]); el.h = Math.max(el.h, Math.min(320, slide.clientHeight - el.y - 20)) }
      // own background, opacity and corners (written by toSlidev as Slidev's code variables)
      const bg = box?.style.getPropertyValue('--slidev-code-background').trim(), rad = box?.style.getPropertyValue('--slidev-code-radius')
      if (bg) Object.assign(el, unmix(bg))
      if (rad) el.radius = parseFloat(rad)
    } else if (n.tagName === 'TABLE' || n.dataset.table) {
      const t = n.tagName === 'TABLE' ? n : n.querySelector('table')
      if (!t) continue
      const wrap = n.dataset.table ? n : box?.querySelector('[data-table]') || box
      Object.assign(el, {
        type: 'table', preset: wrap?.dataset.table || 'theme', header: !!t.tHead,
        rows: [...t.rows].map(row => [...row.cells].map(c => clean(c.innerHTML.trim()))),
        align: [...(t.rows[0]?.cells || [])].map(c => c.getAttribute('align') || c.style.textAlign || ''),
        // as written (the CSSOM would turn #006b96 into rgb(0, 107, 150))
        fills: [...t.rows].map(row => [...row.cells].map(c => c.getAttribute('style')?.match(/background(?:-color)?:\s*([^;]+)/)?.[1].trim() || '')),
        borders: [...t.rows].map(row => [...row.cells].map(c => ['top', 'right', 'bottom', 'left'].map(k => c.getAttribute('style')?.match(new RegExp(`border-${k}:\\s*([^;]+)`))?.[1].trim() || ''))),
      })
      if (wrap?.dataset.firstcol != null) el.firstCol = true
      if (wrap?.dataset.compact != null) el.compact = true
    } else {
      // text: this leaf plus the following text leaves of the same parent
      const group = [n]
      const isTitle = !titled && n.tagName === 'H1' && !box
      while (!isTitle && textual(n) && !clicky(n) && leaves[i + 1] && up(leaves[i + 1]) === up(n) && textual(leaves[i + 1]) && !clicky(leaves[i + 1])) group.push(leaves[++i])
      let content = html(group)
      const parent = n.parentElement, items = group.map(m => m.parentElement).find(itemClicks)
      if (items) Object.assign(el, { clickItems: true, ...(!box && { click: clickOf(items.getAttribute('at') ?? '', clicks) }) })
      // dissolved wrappers that still matter: click animations and inherited alignment
      span = group.length
      if (/^V-/.test(parent.tagName) && !items && !soleIn(parent, span)) {
        const tag = parent.tagName.toLowerCase()
        content = `<${tag}${[...parent.attributes].map(a => ` ${a.name}="${a.value}"`).join('')}>${content}</${tag}>`
      }
      const align = getComputedStyle(parent).textAlign
      Object.assign(el, { type: 'text', html: content, ...(isTitle && { title: true }), ...(align !== rootAlign && !box && { align }) })
      if (isTitle) titled = true
      if (!box) sized(el, group.map(rect))
    }
    const to = (box || img || n).getAttribute('data-to') // a jump to a slide (number), written by toSlidev on the box
    if (+to) el.toNum = +to
    // Slidev's appear/disappear on click: toSlidev writes it on the box; a <v-click>/<v-after> around just this element counts too
    const comp = !box && soleIn(n.parentElement, span) && n.parentElement, src = box || img || n
    // a plain element (a <div v-click> with Markdown inside) around this one gives it its click
    const wrap = !box && !comp && !clicky(src) && n.parentElement?.closest('[v-click], [v-after], [v-click\\.hide]')
    const c = wrap && wrapClicks.has(wrap) ? { ...wrapClicks.get(wrap), last: clicks } : clickAttrs(comp ? compAttr(comp) : k => (wrap || src).getAttribute(k), clicks)
    if (wrap) wrapClicks.set(wrap, c)
    clicks = c.last
    if (c.click) el.click = c.click
    if (c.clickUntil) el.clickUntil = c.clickUntil
    // now the element's own: kept in its text it would count twice in a Slidev export
    if (src === n && el.html && (c.click || c.clickUntil)) el.html = el.html.replace(/^<[^>]+>/, tag => tag.replace(/\s(v-click(\.hide)?|v-after)(="[^"]*")?/g, ''))
    if (el.clickItems) clicks = Math.max(clicks, (el.click || clicks + 1) + listItems(el.html) - 1)
    if (codeStages(el) > 1) clicks += codeStages(el) - 1 // code line steps are relative clicks in Slidev
    if (box) fromBox(box, el)
    else if (el.w == null) sized(el, [r])
    if (!box && el.type === 'code' && isRun(el.meta)) el.h += 84 // runnable: room for its output panel (80px) below the code
    elements.push(el)
  }
  return elements
}
