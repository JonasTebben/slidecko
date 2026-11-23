import { marked } from 'marked'
import { parseSlidev, headFormat, stripNonContent } from './parseSlidev.js'
import { imagePath } from './toSlidev.js'
import { uid, clean, readDataUrl } from './store.js'
import { parseRatio, formatSize } from './format.js'
import { CENTERED, themeStyle, fontKey, SHADOWS } from './themes.js'
import { applyUno } from './uno.js'
import { t } from './i18n.js'

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
const special = el => el.dataset.shape || el.dataset.video || el.dataset.table || el.dataset.callout

// path: the markdown file to import; files: Map of project-relative path -> File (markdown files it
// embeds via `src:` and all images are read from it).
// a background written as color-mix(in srgb, <colour> N%, transparent) -> { fill, fillAlpha }; var(--…) = the theme's colour
function unmix(bg) {
  const m = bg.match(/^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%,\s*transparent(?:\s+[\d.]+%)?\)$/) // Chrome adds the second share
  if (!m) return { fill: bg }
  return { ...(!m[1].startsWith('var(') && { fill: m[1] }), fillAlpha: +m[2] }
}
export async function importSlidev(path, files, theme) {
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
    const file = files.get(p) || files.get('public/' + p)
    return (bySrc[src] = file ? storeAsset(await readDataUrl(file)) : null)
  }

  const parsed = parseSlidev(texts.get(path), read, path)
  // measured at the deck's own size; createProject() applies the returned format
  const format = headFormat(texts.get(path))
  const size = formatSize(parseRatio(format.aspectRatio) || 16 / 9, format.canvasWidth || 980)
  // Slidev's markdown-it and marked agree on CommonMark + GFM + raw HTML
  // sanitized: the markdown may come from a pasted text or a downloaded project (raw HTML, onerror=…)
  const htmls = parsed.map(s => clean(marked.parse(stripNonContent(s.md))))
  await applyUno(htmls.join('\n'))

  const host = document.body.appendChild(document.createElement('div'))
  host.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden'
  const slides = []
  try {
    for (const [i, s] of parsed.entries()) {
      const centered = CENTERED.includes(s.layout)
      const slide = Object.assign(document.createElement('div'), { className: `slide theme-${theme} layout-${s.layout}` })
      for (const [k, v] of Object.entries(themeStyle(theme))) slide.style.setProperty(k, v)
      Object.assign(slide.style, { width: size.w + 'px', height: size.h + 'px' })
      slide.innerHTML = `<div class="flow${centered ? ' center' : ''}">${centered ? `<div class="center-wrap">${htmls[i]}</div>` : htmls[i]}</div>`
      host.replaceChildren(slide)

      for (const pre of slide.querySelectorAll('pre')) pre.classList.add('code')
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
      slides.push({ layout: s.layout, elements: measure(slide, s), fm: s.fm, md: s.md, file: s.file, notes: s.notes, gap: s.gap, hidden: s.hidden, transition: s.transition })
    }
  } finally {
    host.remove()
  }
  return { slides, assets, missing, missingFiles, ...format }
}

function measure(slide, parsed) {
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
  const textual = m => !special(m) && m.tagName !== 'IMG' && !isImageOnly(m) && m.tagName !== 'PRE' && m.tagName !== 'TABLE' && !styled(m)

  const elements = []
  let titled = false
  for (let i = 0; i < leaves.length; i++) {
    const n = leaves[i], box = boxOf(n), r = rect(n)
    if (r.r - r.x < 1 && r.b - r.y < 1) continue
    const el = { id: uid() }
    const img = n.tagName === 'IMG' ? n : isImageOnly(n) ? n.firstElementChild : null

    if (n.dataset.shape) {
      Object.assign(el, { type: 'shape', shape: n.dataset.shape, fill: n.dataset.fill || 'none', stroke: n.dataset.stroke || 'none', strokeWidth: +n.dataset.sw || 0, radius: +n.dataset.radius || 0, ...(n.dataset.alpha && { fillAlpha: +n.dataset.alpha }) })
      const text = n.querySelector('.shape-text > div') || n.querySelector('.shape-text') // written by toSlidev for text in shapes
      if (text?.textContent.trim()) el.html = text.innerHTML
    } else if (n.dataset.video) {
      Object.assign(el, { type: 'video', youtube: n.dataset.video })
    } else if (img) {
      if (!img.dataset.asset) continue
      Object.assign(el, { type: 'image', asset: img.dataset.asset, src: img.dataset.src, ...(img.getAttribute('class') && { cls: img.getAttribute('class') }) })
      const crop = box?.dataset.crop?.split(',').map(Number) // written by toSlidev for cropped pictures
      if (crop?.length === 4) el.crop = { x: crop[0], y: crop[1], w: crop[2], h: crop[3] }
      if (!box) sized(el, [rect(img)])
    } else if (n.tagName === 'PRE') {
      const code = n.querySelector('code')
      Object.assign(el, { type: 'code', code: (code || n).textContent.replace(/\n$/, ''), lang: code?.className.match(/language-(\S+)/)?.[1] || 'plaintext' })
      if (codeMeta[codeIndex]) el.meta = codeMeta[codeIndex]
      codeIndex++
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
      while (!isTitle && textual(n) && leaves[i + 1]?.parentElement === n.parentElement && textual(leaves[i + 1])) group.push(leaves[++i])
      let content = html(group)
      const parent = n.parentElement
      // dissolved wrappers that still matter: click animations and inherited alignment
      if (/^V-/.test(parent.tagName)) {
        const tag = parent.tagName.toLowerCase()
        content = `<${tag}${[...parent.attributes].map(a => ` ${a.name}="${a.value}"`).join('')}>${content}</${tag}>`
      }
      const align = getComputedStyle(parent).textAlign
      Object.assign(el, { type: 'text', html: content, ...(isTitle && { title: true }), ...(align !== rootAlign && !box && { align }) })
      if (isTitle) titled = true
      if (!box) sized(el, group.map(rect))
    }
    if (box) fromBox(box, el)
    else if (el.w == null) sized(el, [r])
    elements.push(el)
  }
  return elements
}
