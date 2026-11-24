import { reactive } from 'vue'
import { themeOf } from './themes.js'
import { cleanSvg } from './store.js'

// Mermaid diagrams, rendered once per code + theme into a sanitized SVG data URL (an <img>: its styles stay
// inside, and every export takes it like a picture). Mermaid itself is loaded on the first diagram.
const cache = reactive(new Map()) // theme + code -> { src } | { error }
const started = new Set()
const last = new Map() // element + theme -> its last good picture, shown while the code has an error
let queue = Promise.resolve(), n = 0
const color = v => (/^#[0-9a-f]{3,8}$/i.test(v ?? '') ? v : undefined) // mermaid computes shades and fails on gradients or var()
const PIE = ['#2563eb', '#db2777', '#16a34a', '#7c3aed', '#0891b2', '#c2410c', '#dc2626', '#475569', '#0f766e', '#9333ea', '#be123c', '#1d4ed8']

async function render(code, theme) {
  try {
    const { default: mermaid } = await import('mermaid') // inside try: a failed chunk load must not stop the queue
    const th = themeOf(theme), v = th.vars || {}
    const vars = { background: color(v.bg), primaryColor: color(v['code-bg']), primaryTextColor: color(v['code-fg'] || v.fg), primaryBorderColor: color(v.accent), lineColor: color(v.fg), textColor: color(v.fg), fontFamily: v.font }
    // mind map branches and other colour scales: the accent with readable text (accent-fg, else the background)
    for (let i = 0; i < 12; i++) Object.assign(vars, { ['cScale' + i]: color(v.accent), ['cScaleLabel' + i]: color(v['accent-fg'] || v.bg) })
    // pie slices: strong colours that carry white labels, first the accent unless it is a light one (accent-fg set)
    PIE.forEach((c, i) => { vars['pie' + (i + 1)] = (!i && !v['accent-fg'] && color(v.accent)) || c })
    Object.assign(vars, { pieOpacity: '1', pieSectionTextColor: '#ffffff', pieStrokeColor: color(v.bg), pieOuterStrokeColor: color(v.fg), pieTitleTextColor: color(v.fg), pieLegendTextColor: color(v.fg) })
    // one global config: renders run one after another (queue), each with its theme
    // gantt: a fixed width, otherwise it takes the whole window's and gets flat and tiny in its box
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme: 'base', htmlLabels: false, fontFamily: v.font, gantt: { useWidth: 900 }, themeVariables: Object.fromEntries(Object.entries(vars).filter(e => e[1] != null)) })
    await mermaid.parse(code)
    const { svg } = await mermaid.render('mermaid-' + ++n, code)
    return { src: toSrc(svg) }
  } catch (e) {
    return { error: String(e?.message || e).trim().slice(0, 500) }
  }
}
// intrinsic size from the viewBox, so the picture scales into its box (and exports know its size)
function toSrc(svg) {
  const s = cleanSvg(svg).querySelector('svg')
  if (!s) throw new Error('No SVG')
  const [, , w, h] = (s.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number)
  if (w > 0 && h > 0) { s.setAttribute('width', w); s.setAttribute('height', h); s.style.removeProperty('max-width') }
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(s))
}

// the rendered diagram ({ src } or { error }); undefined while it renders
export function diagram(code, theme) {
  const key = theme + '\n' + code
  if (!started.has(key)) {
    started.add(key)
    queue = queue.then(() => render(code, theme)).then(r => {
      if (cache.size > 300) { const k = cache.keys().next().value; cache.delete(k); started.delete(k) } // old drafts typed in the inspector
      cache.set(key, r)
    })
  }
  return cache.get(key)
}
// what a slide shows: the picture, or the last good one while the code is broken or still rendering
export function diagramSrc(el, theme) {
  const r = diagram(el.code, theme), k = el.id + '\n' + theme
  if (r?.src) last.set(k, r.src)
  return r?.src || last.get(k) || ''
}
// resolves when every diagram asked for so far is rendered (exports wait for it)
export const diagramsReady = () => queue
