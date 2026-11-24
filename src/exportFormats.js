import { toPng, toJpeg, getFontEmbedCSS } from 'html-to-image'
import JSZip from 'jszip'
import { W, H, readDataUrl, deckFile } from './store.js'
import { lang, t } from './i18n.js'
import { morphPairs, playMorph } from './morph.js'
import { usesFamily } from './fonts.js'

// Exports that reuse the rendered slides (root: one .slide per slide at 1:1) as they are:
// pictures of each slide and a self-contained HTML presentation. Both look exactly like the editor.

const AT_ORIGIN = { position: 'relative', left: '0', top: '0', margin: '0', transform: 'none' }

// PNG (or JPEG) data URLs, one per slide; scale 2 = 1960×1104 px
export async function slideImages(root, scale = 2, progress = () => {}, jpeg = false) {
  const nodes = [...root.querySelectorAll('.slide')]
  if (!nodes.length) return []
  const fontEmbedCSS = await getFontEmbedCSS(root) // once for all slides instead of per slide; root: the fonts of every slide, not only the first's
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
.deck > .slide.on, .deck > .slide.moving { visibility: visible; }
@media screen { .deck .el.unshown, .deck .el li.unshown { visibility: hidden; } }
.deck { --tr-w: 100vw; --tr-h: 100vh; }
.hud { position: fixed; right: 14px; bottom: 10px; padding: 4px 4px 4px 10px; border-radius: 9px; background: #000a; font: 12px/1 system-ui, sans-serif; color: #fffc; user-select: none; opacity: 0; transition: opacity .3s; }
.hud.show, .hud:hover, .hud:focus-within { opacity: 1; }
.hud button { font: inherit; color: inherit; background: #fff1; border: 0; border-radius: 6px; padding: 6px 9px; margin-left: 4px; cursor: pointer; }
.hud button:hover { background: #fff3; color: #fff; }
@media (hover: none) { .hud { opacity: 1; } .hud button { min-width: 44px; min-height: 44px; } }
.hud button[aria-pressed=true] { background: #fff4; color: #fff; }
body[data-tool=laser], body[data-tool=laser] * { cursor: none !important; }
body[data-tool=pen] .deck { touch-action: none; cursor: crosshair; }
body[data-tool=pen] .deck * { pointer-events: none; }
.laser { position: fixed; left: -7px; top: -7px; width: 14px; height: 14px; border-radius: 50%; background: #ff2a2a; box-shadow: 0 0 6px 3px #ff2a2acc, 0 0 18px 8px #ff2a2a66; pointer-events: none; }
.ink { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 9999; pointer-events: none; fill: none; stroke-linecap: round; stroke-linejoin: round; }
body[data-tool=arrow] .deck { touch-action: none; cursor: crosshair; }
body[data-tool=arrow] .deck * { pointer-events: none; }
.inks { position: fixed; right: 12px; bottom: 58px; display: flex; gap: 4px; align-items: center; padding: 4px 6px; border-radius: 10px; background: #000a; }
.inks[hidden] { display: none; }
.inks button { width: 26px; height: 26px; border: 2px solid #fff6; border-radius: 50%; padding: 0; margin: 0; cursor: pointer; }
.inks button[aria-pressed=true] { outline: 2px solid #fff; outline-offset: 1px; }
.inks .w { border-radius: 6px; background: #fff1; display: grid; place-items: center; }
.inks .w i { display: block; width: 14px; border-radius: 4px; background: #fff; }
@media (hover: none) { .inks button { width: 40px; height: 40px; } .inks { bottom: 70px; } }
@media print {
  html, body { height: auto; overflow: visible; background: none; }
  .deck { position: static; }
  .deck > .slide { position: relative !important; left: 0 !important; top: 0 !important; transform: none !important; visibility: visible; box-shadow: none; break-after: page; }
  .hud { display: none; }
}
@page { size: ${W}px ${H}px; margin: 0; }`

// arrows/space/click/swipe navigate, F = full screen, the URL hash keeps the slide number
const viewerJs = () => `
const project = JSON.parse(document.getElementById('slides-builder-project').textContent), assets = project.assets
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
// as when presenting in the editor: the earlier slide's transition (Slidev's rule), reversed when going back
const still = matchMedia('(prefers-reduced-motion: reduce)')
const BACK = { 'slide-left': 'slide-right', 'slide-up': 'slide-down' }
const morphPairs = ${morphPairs}, playMorph = ${playMorph}
const settle = s => s.classList.remove('moving', ...[...s.classList].filter(c => c.startsWith('tr-')))
for (const s of slides) s.addEventListener('animationend', e => { if (e.target === s) settle(s) })
// click steps (Slidev v-click): elements and list items with data-click (their step) appear one step at a time, as when presenting in the editor
const stepsOf = s => [...new Set([...s.querySelectorAll('[data-click]')].map(e => +e.dataset.click))].sort((a, b) => a - b)
let k = 0
function reveal() {
  const st = stepsOf(slides[i])
  for (const e of slides[i].querySelectorAll('[data-click]')) e.classList.toggle('unshown', !(k && +e.dataset.click <= st[k - 1]))
}
// next/back: a step first, then the slide; arriving backwards shows all steps
function step(d) {
  if (d > 0 ? k < stepsOf(slides[i]).length : k > 0) { k += d; reveal() } else if (slides[i + d]) go(i + d, d < 0)
}
function go(n, back) {
  n = Math.max(0, Math.min(slides.length - 1, n))
  if (n !== i) clearInk()
  slides.forEach(settle)
  const name = (project.slides[Math.min(i, n)] || {}).transition || project.transition || 'none'
  const from = name === 'morph' && n !== i && slides[i], pairs = from && !still.matches ? morphPairs(project.slides[i]?.elements, project.slides[n]?.elements) : []
  if (n !== i && name !== 'none' && name !== 'morph' && !still.matches) {
    const tr = 'tr-' + (n < i ? BACK[name] || name : name)
    slides[i].classList.add('moving', tr + '-leave-active')
    slides[n].classList.add('moving', tr + '-enter-active')
  }
  i = n
  k = back ? stepsOf(slides[i]).length : 0
  reveal()
  if (from) playMorph(from, slides[i], pairs)
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
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) step(1)
  else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) step(-1)
  else if (e.key === 'Home') go(0)
  else if (e.key === 'End') go(slides.length - 1)
  else if (e.key === 'Escape' && tool) setTool(tool)
  else if (e.metaKey || e.ctrlKey || e.altKey) return
  else if (e.key === 'l') setTool('laser')
  else if (e.key === 'd') setTool('pen')
  else if (e.key === 'a') setTool('arrow')
  else if (e.key === 'e' || e.key === 'c') clearInk()
  else if (e.key === 'f') full()
  else return
  e.preventDefault()
})
// timers: a click starts or pauses, a double click sets back, a run-out countdown starts over (same as in the editor)
const clock = sec => { sec = Math.max(0, Math.ceil(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = String(sec % 60).padStart(2, '0'); return h ? h + ':' + String(m).padStart(2, '0') + ':' + s : m + ':' + s }
for (const f of document.querySelectorAll('.timer-face')) {
  const total = +f.dataset.timer || 0, p = f.querySelector('p')
  let acc = 0, since = 0, tick = null
  const left = () => { const e = (acc + (since ? Date.now() - since : 0)) / 1000; return total ? Math.max(0, total - e) : e }
  const draw = () => { p.textContent = clock(left()); f.classList.toggle('done', !!total && left() <= 0) }
  const run = on => { clearInterval(tick); tick = on ? setInterval(draw, 250) : null; draw() }
  f.addEventListener('click', e => {
    e.stopPropagation()
    if (total && left() <= 0) { acc = 0; since = Date.now() } else if (since) { acc += Date.now() - since; since = 0 } else since = Date.now()
    run(!!since)
  })
  f.addEventListener('dblclick', () => { acc = 0; since = 0; run(false) })
}
// quizzes: a click marks an answer, the button (or Q) shows the solution (same as in the editor)
for (const q of document.querySelectorAll('.el > .quiz')) {
  const b = document.createElement('button')
  b.className = 'quiz-reveal'
  b.textContent = q.dataset.reveal
  b.addEventListener('click', e => { e.stopPropagation(); b.textContent = q.classList.toggle('revealed') ? q.dataset.hide : q.dataset.reveal })
  q.append(b)
  for (const tile of q.querySelectorAll('.quiz-tile')) tile.addEventListener('click', e => { e.stopPropagation(); tile.classList.toggle('picked') })
}
addEventListener('keydown', e => { if (e.key.toLowerCase() === 'q' && !e.metaKey && !e.ctrlKey && !e.altKey) for (const b of slides[i].querySelectorAll('.quiz-reveal')) b.click() })
// random pickers: a click draws a name, nobody twice until everyone was drawn, a double click starts over (same as in the editor)
for (const f of document.querySelectorAll('.picker-face')) {
  const names = JSON.parse(f.dataset.picks || '[]'), label = [...f.childNodes]
  let left = []
  f.setAttribute('role', 'button'); f.setAttribute('aria-live', 'polite')
  f.addEventListener('click', e => {
    e.stopPropagation()
    if (!names.length) return
    if (!left.length) left = names.slice()
    const p = document.createElement('p'), s = document.createElement('small')
    p.className = 'pick'
    p.textContent = left.splice(Math.floor(Math.random() * left.length), 1)[0]
    s.textContent = f.dataset.left.replace('{0}', left.length).replace('{1}', names.length)
    f.replaceChildren(p, s)
  })
  f.addEventListener('dblclick', () => { left = []; f.replaceChildren(...label) })
}
// runnable code: Run executes it in a sandboxed iframe (opaque origin, own CSP, no network), as in the editor
const runnerSrc = document.getElementById('slides-builder-runner'), runCb = {}
let runBox = null, runReady = null, runSeq = 0
function runner() {
  return runReady || (runReady = new Promise(ok => {
    addEventListener('message', e => {
      if (!runBox || e.source !== runBox.contentWindow || !e.data) return
      if (e.data.k === 'ready') return ok()
      if (runCb[e.data.run]) runCb[e.data.run](e.data)
    })
    runBox = document.createElement('iframe')
    runBox.setAttribute('sandbox', 'allow-scripts')
    runBox.hidden = true
    runBox.srcdoc = '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \\'none\\'; script-src \\'unsafe-inline\\' \\'unsafe-eval\\'; worker-src blob:; connect-src \\'none\\'"><script>' + runnerSrc.textContent + '<\\/script>'
    document.body.append(runBox)
  }))
}
if (runnerSrc) for (const pre of document.querySelectorAll('pre[data-run]')) {
  const out = pre.parentElement.querySelector('.run-out'), bar = document.createElement('div'), b = document.createElement('button')
  bar.className = 'run-bar'
  b.textContent = '▶ ' + runnerSrc.dataset.run
  bar.append(b)
  pre.parentElement.append(bar)
  const add = (k, text) => {
    if (out.childNodes.length >= 200) return
    const s = document.createElement('span')
    s.className = 'out-' + k
    s.textContent = (k === 'result' ? '← ' : k === 'error' ? '✖ ' : k === 'warn' ? '⚠ ' : '') + String(text).slice(0, 2000) + '\\n'
    out.append(s)
  }
  b.addEventListener('click', async e => {
    e.stopPropagation()
    b.disabled = true
    await runner()
    const id = ++runSeq
    out.replaceChildren()
    runCb[id] = d => {
      if (d.k !== 'end' && d.k !== 'timeout') return add(d.k, d.t)
      delete runCb[id]
      b.disabled = false
      if (d.k === 'timeout') add('error', runnerSrc.dataset.stopped)
    }
    runBox.contentWindow.postMessage({ run: id, code: pre.dataset.run }, '*')
  })
}
document.querySelector('.deck').addEventListener('click', e => { if (!tool && !e.target.closest('a, iframe, video')) step(1) })
let x0 = null
addEventListener('touchstart', e => { x0 = e.touches[0].clientX }, { passive: true })
addEventListener('touchend', e => { if (!tool && x0 != null && Math.abs(e.changedTouches[0].clientX - x0) > 40) step(e.changedTouches[0].clientX < x0 ? 1 : -1); x0 = null })
document.querySelector('[data-prev]').onclick = () => step(-1)
document.querySelector('[data-next]').onclick = () => step(1)
// iOS Safari has no Fullscreen API for pages: the button is hidden there, F does nothing
function full() { if (document.fullscreenElement) document.exitFullscreen?.()?.catch(() => {}); else document.documentElement.requestFullscreen?.()?.catch(() => {}) }
const fullBtn = document.querySelector('[data-full]')
if (document.fullscreenEnabled) fullBtn.onclick = full; else fullBtn.hidden = true
// laser pointer (L) and pen (D) as in the editor: E or C clears, Esc leaves the tool, a slide change wipes the drawing
// arrow (A) draws a straight arrow; pen and arrow take one of the editor's colours and widths
const dot = document.querySelector('.laser'), btn = { laser: document.querySelector('[data-laser]'), pen: document.querySelector('[data-pen]'), arrow: document.querySelector('[data-arrow]') }
const inks = document.querySelector('.inks'), pen = { color: '#e5202a', width: 6 }
let tool = null, ink = null, line = null, start = null
function setTool(t) {
  tool = tool === t ? null : t
  document.body.dataset.tool = tool || ''
  dot.hidden = true
  inks.hidden = tool !== 'pen' && tool !== 'arrow'
  for (const k in btn) btn[k].setAttribute('aria-pressed', tool === k)
}
for (const b of inks.querySelectorAll('button')) b.onclick = e => {
  e.stopPropagation()
  if (b.dataset.color) pen.color = b.dataset.color; else pen.width = +b.dataset.width
  for (const o of inks.querySelectorAll('button')) o.setAttribute('aria-pressed', o.dataset.color ? o.dataset.color === pen.color : +o.dataset.width === pen.width)
}
// the two barbs of an arrow from a to b, as in the editor (draw.js arrowHead)
function head(a, b) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), len = 10 + pen.width * 3
  const barb = d => [b[0] - len * Math.cos(ang + d), b[1] - len * Math.sin(ang + d)]
  return [barb(0.45), b, barb(-0.45)].map(p => p.join(',')).join(' ')
}
function clearInk() { if (ink) ink.remove(); ink = line = null }
// the ink lives inside the slide in slide units (viewBox), so it scales with it
function at(e) {
  const r = slides[i].getBoundingClientRect()
  return [+((e.clientX - r.left) / r.width * ${W}).toFixed(1), +((e.clientY - r.top) / r.height * ${H}).toFixed(1)]
}
function addPoint(e) {
  const p = at(e)
  if (tool === 'arrow') { line.firstChild.setAttribute('points', start + ' ' + p); line.lastChild.setAttribute('points', head(start, p)); return }
  line.setAttribute('points', (line.getAttribute('points') || '') + ' ' + p)
}
const svg = (parent, tag) => parent.appendChild(document.createElementNS('http://www.w3.org/2000/svg', tag))
addEventListener('pointerdown', e => {
  if ((tool !== 'pen' && tool !== 'arrow') || !e.isPrimary || e.button > 0 || e.target.closest('.hud, .inks')) return
  if (!ink) { ink = svg(slides[i], 'svg'); ink.setAttribute('class', 'ink'); ink.setAttribute('viewBox', '0 0 ${W} ${H}') }
  line = svg(ink, tool === 'arrow' ? 'g' : 'polyline')
  line.setAttribute('stroke', pen.color); line.setAttribute('stroke-width', pen.width)
  if (tool === 'arrow') { start = at(e); svg(line, 'polyline'); svg(line, 'polyline') }
  addPoint(e); if (tool === 'pen') addPoint(e) // two points: a tap leaves a dot
})
addEventListener('pointermove', e => {
  if (tool === 'laser') { dot.hidden = false; dot.style.translate = e.clientX + 'px ' + e.clientY + 'px' }
  if (line && e.isPrimary) addPoint(e)
})
addEventListener('pointerup', () => { line = null })
addEventListener('pointercancel', () => { line = null })
btn.laser.onclick = () => setTool('laser')
btn.pen.onclick = () => setTool('pen')
btn.arrow.onclick = () => setTool('arrow')
document.querySelector('[data-clear]').onclick = clearInk
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
  const rules = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules].map(r => r.cssText).filter(keep) } catch { return [] } })
  // every image is stored once, in the project JSON; the slides point to it (data-a) and the viewer fills src in
  const data = JSON.parse(deckFile(list)), byData = new Map(Object.entries(data.assets).map(([id, d]) => [d, id]))
  const ext = d => ({ 'svg+xml': 'svg', jpeg: 'jpg', 'x-icon': 'ico' })[d.match(/^data:(?:image|font)\/([\w.+-]+)/)?.[1]] || d.match(/^data:(?:image|font)\/(\w+)/)?.[1] || 'bin'
  if (files) for (const [id, d] of Object.entries(data.assets)) { files[`images/${id}.${ext(d)}`] = d; data.assets[id] = `images/${id}.${ext(d)}` }
  const project = JSON.stringify(data)
  // runnable code blocks: the runner (public/runner.js) rides along and runs in a sandboxed srcdoc iframe
  const runner = root.querySelector('pre[data-run]') ? await fetch('runner.js').then(r => (r.ok ? r.text() : ''), () => '') : ''
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
  // only the fonts the slides or their themes name are embedded (all bundled and project fonts are declared)
  const named = rules.filter(r => !r.startsWith('@font-face')).join('\n') + slides
  // KaTeX names its fonts unquoted, per class: those the formulas made the browser load (all of them are there by now)
  const math = slides.includes('class="katex'), loaded = new Set([...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, '')))
  const wanted = r => { const f = r.match(/font-family:\s*["']?([^;"']+)/)?.[1]; return /^KaTeX_/.test(f) ? math && loaded.has(f) : usesFamily(named, f) }
  const css = await inlineUrls(rules.filter(r => (r.startsWith('@font-face') ? wanted(r) : math || !r.includes('.katex'))).join('\n'), files)
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
<div class="hud"><span></span><button data-prev aria-label="Previous">‹</button><button data-next aria-label="Next">›</button><button data-laser aria-label="Laser pointer" title="Laser pointer (L)" aria-pressed="false">◉</button><button data-pen aria-label="Pen" title="Pen (D)" aria-pressed="false">✎</button><button data-arrow aria-label="Arrow" title="Arrow (A)" aria-pressed="false">➚</button><button data-clear aria-label="Clear drawing" title="Clear drawing (E)">⌫</button><button data-full aria-label="Full screen">⛶</button></div>
<div class="inks" hidden>${['#e5202a', '#facc15', '#16a34a', '#2563eb', '#ffffff'].map(c => `<button data-color="${c}" style="background:${c}" aria-label="Pen colour ${c}" aria-pressed="${c === '#e5202a'}"></button>`).join('')}${[3, 6, 12].map(w => `<button class="w" data-width="${w}" aria-label="Line width ${w}" aria-pressed="${w === 6}"><i style="height:${w / 2 + 1}px"></i></button>`).join('')}</div>
<div class="laser" hidden></div>
<script type="application/json" id="slides-builder-project">${project.replace(/</g, '\\u003c')}</script>
${runner ? `<script type="text/plain" id="slides-builder-runner" data-run="${esc(t('Run'))}" data-stopped="${esc(t('Stopped after 3 seconds (endless loop?)'))}">${runner.replace(/<\/script/gi, '<\\/script')}</script>\n` : ''}<script>${viewerJs()}</script>
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
