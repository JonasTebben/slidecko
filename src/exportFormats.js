import { toPng, toJpeg, getFontEmbedCSS } from 'html-to-image'
import JSZip from 'jszip'
import { W, H, readDataUrl, deckFile } from './store.js'
import { lang } from './i18n.js'

// Exports that reuse the rendered slides (root: one .slide per slide at 1:1) as they are:
// pictures of each slide and a self-contained HTML presentation. Both look exactly like the editor.

const AT_ORIGIN = { position: 'relative', left: '0', top: '0', margin: '0', transform: 'none' }

// PNG (or JPEG) data URLs, one per slide; scale 2 = 1960×1104 px
export async function slideImages(root, scale = 2, progress = () => {}, jpeg = false) {
  const nodes = [...root.querySelectorAll('.slide')]
  if (!nodes.length) return []
  const fontEmbedCSS = await getFontEmbedCSS(nodes[0]) // once for all slides instead of per slide
  const out = []
  for (const [i, node] of nodes.entries()) {
    const o = { width: W, height: H, pixelRatio: scale, style: AT_ORIGIN, fontEmbedCSS, filter: n => !n.classList?.contains('yt-consent') }
    const restore = hoistBottomMargins(node), gcs = window.getComputedStyle
    window.getComputedStyle = exactFontSize(gcs)
    try { out.push(await (jpeg ? toJpeg(node, { ...o, quality: 0.92 }) : toPng(node, o))) } finally { restore(); window.getComputedStyle = gcs }
    progress(i + 1, nodes.length)
  }
  return out
}

// html-to-image copies a "15.2px" font size as floor - 0.1 = "14.9px" (code 14.8 -> 13.9, ~6 % smaller);
// "calc(15.2px)" is the same size but skips that rounding
export const exactFontSize = gcs => function (el, pseudo) {
  const s = gcs.call(window, el, pseudo)
  return new Proxy(s, {
    get(t, k) {
      if (k === 'getPropertyValue') return n => (n === 'font-size' && !pseudo ? `calc(${t.fontSize})` : t.getPropertyValue(n))
      const v = Reflect.get(t, k)
      return typeof v === 'function' ? v.bind(t) : v
    },
  })
}

// html-to-image gives every cloned element its computed height, so a last child's bottom margin
// no longer collapses through its parent (a list's last item's margin before a quote vanishes).
// Copying that margin onto the parent changes nothing here (it collapses anyway) but keeps it in the clone.
export function hoistBottomMargins(root) {
  const changed = []
  const walk = el => {
    for (const c of el.children) walk(c)
    const last = [...el.children].reverse().find(c => !['absolute', 'fixed'].includes(getComputedStyle(c).position) && getComputedStyle(c).display !== 'none')
    if (!last) return
    const s = getComputedStyle(el), m = parseFloat(getComputedStyle(last).marginBottom)
    if (!['block', 'list-item'].includes(s.display) || s.overflow !== 'visible' || parseFloat(s.paddingBottom) || parseFloat(s.borderBottomWidth)) return
    // shortcut: positive margins only and collapse detected geometrically (child flush with the parent's bottom)
    if (!(m > parseFloat(s.marginBottom)) || Math.abs(last.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom) > 0.5) return
    changed.push([el, el.style.marginBottom])
    el.style.marginBottom = m + 'px'
  }
  for (const c of root.children) walk(c) // not the slide itself: the capture overrides its margin
  return () => { for (const [el, v] of changed) el.style.marginBottom = v }
}

// url(…) in CSS (theme backgrounds, web fonts) -> data URLs, so the file works offline and alone;
// with files (ZIP export): into files as assets/<name> instead
async function inlineUrls(css, files) {
  const urls = [...new Set([...css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)].map(m => m[2]).filter(u => !u.startsWith('data:') && !u.startsWith('#')))]
  const data = {}
  await Promise.all(urls.map(async u => {
    try { data[u] = await readDataUrl(await (await fetch(new URL(u, document.baseURI))).blob()) } catch { /* unreachable resource: keep the URL */ }
  }))
  if (files) {
    const path = {}
    for (const u of Object.keys(data)) {
      let p = 'assets/' + (u.split(/[?#]/)[0].split('/').pop().replace(/[^\w.-]+/g, '_') || 'file')
      while (files[p]) p = p.replace(/(\.\w+)?$/, '-1$1')
      files[p] = data[u]
      path[u] = p
    }
    return css.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => (path[u] ? `url("${path[u]}")` : m))
  }
  // an image used by several rules is embedded once, as a custom property (fonts cannot: @font-face takes no var())
  const count = {}
  for (const m of css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) count[m[2]] = (count[m[2]] || 0) + 1
  const shared = Object.keys(data).filter(u => count[u] > 1 && data[u].startsWith('data:image/'))
  const out = css.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, u) => (shared.includes(u) ? `var(--img${shared.indexOf(u)})` : data[u] ? `url("${data[u]}")` : m))
  return (shared.length ? `:root { ${shared.map((u, i) => `--img${i}: url("${data[u]}");`).join(' ')} }\n` : '') + out
}

const viewerCss = () => `
html, body { margin: 0; height: 100%; background: #0b0d12; overflow: hidden; }
.deck { position: fixed; inset: 0; touch-action: manipulation; }
.deck > .slide { position: absolute !important; left: 50% !important; top: 50% !important; width: ${W}px !important; height: ${H}px !important; margin: 0 !important; visibility: hidden; box-shadow: 0 8px 40px #0008; }
.deck > .slide.on { visibility: visible; }
.hud { position: fixed; right: 14px; bottom: 10px; padding: 4px 4px 4px 10px; border-radius: 9px; background: #000a; font: 12px/1 system-ui, sans-serif; color: #fffc; user-select: none; opacity: 0; transition: opacity .3s; }
.hud.show, .hud:hover, .hud:focus-within { opacity: 1; }
.hud button { font: inherit; color: inherit; background: #fff1; border: 0; border-radius: 6px; padding: 6px 9px; margin-left: 4px; cursor: pointer; }
.hud button:hover { background: #fff3; color: #fff; }
@media (hover: none) { .hud { opacity: 1; } .hud button { min-width: 44px; min-height: 44px; } }
@media print {
  html, body { height: auto; overflow: visible; background: none; }
  .deck { position: static; }
  .deck > .slide { position: relative !important; left: 0 !important; top: 0 !important; transform: none !important; visibility: visible; box-shadow: none; break-after: page; }
  .hud { display: none; }
}
@page { size: ${W}px ${H}px; margin: 0; }`

// arrows/space/click/swipe navigate, F = full screen, the URL hash keeps the slide number
const viewerJs = () => `
const assets = JSON.parse(document.getElementById('slides-builder-project').textContent).assets
for (const img of document.querySelectorAll('img[data-a]')) img.src = assets[img.dataset.a]
const slides = [...document.querySelectorAll('.deck > .slide')], no = document.querySelector('.hud span')
let i = Math.min(slides.length, Math.max(1, parseInt(location.hash.slice(1)) || 1)) - 1
function fit() {
  const k = Math.min(innerWidth / ${W}, innerHeight / ${H})
  for (const s of slides) {
    s.style.transformOrigin = '0 0'
    s.style.transform = 'translate(' + (-${W} * k / 2) + 'px, ' + (-${H} * k / 2) + 'px) scale(' + k + ')'
  }
}
function go(n) {
  i = Math.max(0, Math.min(slides.length - 1, n))
  slides.forEach((s, j) => s.classList.toggle('on', j === i))
  no.textContent = (i + 1) + ' / ' + slides.length
  history.replaceState(null, '', '#' + (i + 1))
}
addEventListener('resize', fit)
addEventListener('hashchange', () => { const n = parseInt(location.hash.slice(1)); if (n && n - 1 !== i) go(n - 1) })
// the controls appear while the mouse moves
const hud = document.querySelector('.hud')
let hideTimer
addEventListener('mousemove', () => { hud.classList.add('show'); clearTimeout(hideTimer); hideTimer = setTimeout(() => hud.classList.remove('show'), 1800) })
addEventListener('keydown', e => {
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) go(i + 1)
  else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) go(i - 1)
  else if (e.key === 'Home') go(0)
  else if (e.key === 'End') go(slides.length - 1)
  else if (e.key === 'f') full()
  else return
  e.preventDefault()
})
document.querySelector('.deck').addEventListener('click', e => { if (!e.target.closest('a, iframe, video')) go(i + 1) })
let x0 = null
addEventListener('touchstart', e => { x0 = e.touches[0].clientX }, { passive: true })
addEventListener('touchend', e => { if (x0 != null && Math.abs(e.changedTouches[0].clientX - x0) > 40) go(i + (e.changedTouches[0].clientX < x0 ? 1 : -1)); x0 = null })
document.querySelector('[data-prev]').onclick = () => go(i - 1)
document.querySelector('[data-next]').onclick = () => go(i + 1)
// iOS Safari has no Fullscreen API for pages: the button is hidden there, F does nothing
function full() { if (document.fullscreenElement) document.exitFullscreen?.()?.catch(() => {}); else document.documentElement.requestFullscreen?.()?.catch(() => {}) }
const fullBtn = document.querySelector('[data-full]')
if (document.fullscreenEnabled) fullBtn.onclick = full; else fullBtn.hidden = true
fit(); go(i)`

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

// one .html file: the slides' markup with the editor's own CSS, works offline in every browser
// The project itself rides along as JSON, so the file can be opened in the editor again.
// files: ZIP export – images and fonts go there as files (path -> data URL), the HTML links them
export async function htmlDeck(root, title, list, files) {
  // rules of themes the slides do not use are left out (with their background images)
  const used = new Set([...root.querySelectorAll('.slide')].flatMap(n => [...n.classList].filter(c => c.startsWith('theme-'))))
  const usedRe = new RegExp(`\\.(${[...used].join('|') || '-'})(?![\\w-])`)
  const keep = t => !/\.theme-[\w-]/.test(t) || usedRe.test(t)
  const rules = [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).filter(keep).join('\n') } catch { return '' } }).join('\n')
  const css = await inlineUrls(rules, files)
  // every image is stored once, in the project JSON; the slides point to it (data-a) and the viewer fills src in
  const data = JSON.parse(deckFile(list)), byData = new Map(Object.entries(data.assets).map(([id, d]) => [d, id]))
  const ext = d => ({ 'svg+xml': 'svg', jpeg: 'jpg', 'x-icon': 'ico' })[d.match(/^data:image\/([\w.+-]+)/)?.[1]] || d.match(/^data:image\/(\w+)/)?.[1] || 'bin'
  if (files) for (const [id, d] of Object.entries(data.assets)) { files[`images/${id}.${ext(d)}`] = d; data.assets[id] = `images/${id}.${ext(d)}` }
  const project = JSON.stringify(data)
  const slides = [...root.querySelectorAll('.slide')].map(n => {
    const c = n.cloneNode(true)
    c.classList.remove('on')
    for (const img of c.querySelectorAll('img[src^="data:"]')) {
      const id = byData.get(img.getAttribute('src'))
      if (id && files) img.setAttribute('src', data.assets[id])
      else if (id) { img.removeAttribute('src'); img.dataset.a = id }
    }
    for (const el of c.querySelectorAll('[contenteditable]')) el.removeAttribute('contenteditable')
    return c.outerHTML
  }).join('\n')
  const html = `<!doctype html>
<html lang="${lang.value}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Slidecko">
<title>${esc(title)}</title>
<style>${css}</style>
<style>${viewerCss()}</style>
</head>
<body>
<div class="deck">
${slides}
</div>
<div class="hud"><span></span><button data-prev aria-label="Previous">‹</button><button data-next aria-label="Next">›</button><button data-full aria-label="Full screen">⛶</button></div>
<script type="application/json" id="slides-builder-project">${project.replace(/</g, '\\u003c')}</script>
<script>${viewerJs()}</script>
</body>
</html>
`
  return new Blob([html], { type: 'text/html' })
}
// the same presentation as index.html with images/ and assets/ beside it: smaller, no base64
export async function htmlZip(root, title, list) {
  const files = {}, zip = new JSZip()
  zip.file('index.html', await htmlDeck(root, title, list, files))
  for (const [p, d] of Object.entries(files)) {
    const [head, body] = [d.slice(0, d.indexOf(',')), d.slice(d.indexOf(',') + 1)]
    zip.file(p, head.endsWith(';base64') ? body : decodeURIComponent(body), { base64: head.endsWith(';base64') })
  }
  return zip.generateAsync({ type: 'blob' })
}

// Print/PDF engines ignore background-blend-mode (the JBT quiz layout uses it): those slide
// backgrounds are rendered once as on screen and printed as a picture
export async function flattenBackgrounds(root) {
  const cache = new Map()
  for (const node of root.querySelectorAll('.slide')) {
    const cs = getComputedStyle(node)
    if (cs.backgroundBlendMode.split(',').every(m => m.trim() === 'normal')) continue
    const key = [cs.backgroundImage, cs.backgroundSize, cs.backgroundColor, cs.backgroundBlendMode, cs.borderTopWidth].join('|')
    if (!cache.has(key)) cache.set(key, await toJpeg(node, { width: W, height: H, pixelRatio: 2, quality: 0.92, style: AT_ORIGIN, filter: () => false }))
    Object.assign(node.style, { background: `url("${cache.get(key)}") 0 0 / 100% 100% no-repeat border-box`, backgroundBlendMode: 'normal' })
  }
}
