import { reactive } from 'vue'
import { withLines } from './hl.js'

// Runnable code blocks (Slidev's ```ts {monaco-run} {autorun:false}): the flag and its options live in the code's meta,
// so the Slidev source stays as written. The code runs in public/runner.html: a sandboxed iframe (opaque origin, no
// access to the app or its storage) that starts a worker per run, stopped after 3 s.

export const RUN_LANGS = ['js', 'javascript', 'ts', 'typescript']
export const isRun = meta => /\{monaco-run\}/.test(meta || '')
export const autorun = meta => !/autorun:\s*false/.test(meta || '')
const opts = meta => (meta || '').match(/\{[^}]*:[^}]*\}/)?.[0]
// meta with one option of the options group set (value: Slidev's text) or removed (undefined)
function setOpt(meta, key, value) {
  const o = opts(meta), body = o ? o.slice(1, -1).split(',').map(s => s.trim()).filter(s => s && !s.startsWith(key + ':')) : []
  if (value !== undefined) body.push(`${key}:${value}`)
  const group = body.length ? `{${body.join(', ')}}` : ''
  return (o ? meta.replace(o, group) : `${meta || ''} ${group}`).replace(/\s+/g, ' ').trim() || undefined
}
// Slidev's monaco-run takes only its options group: highlighted lines go, line numbers become Monaco's lineNumbers
export function withRun(meta, on) {
  const lines = /lines:\s*true|lineNumbers:\s*['"]on/.test(meta || '')
  if (on) return lines ? "{monaco-run} {lineNumbers:'on'}" : '{monaco-run}'
  return lines ? '{lines:true}' : undefined
}
export const withAutorun = (meta, on) => setOpt(meta, 'autorun', on ? undefined : 'false')
export const withRunLines = (meta, on) => setOpt(meta, 'lineNumbers', on ? "'on'" : undefined)
// line numbers on or off: Monaco's lineNumbers for runnable code, Slidev's lines:true otherwise
export const setLines = (meta, on) => (isRun(meta) ? withRunLines(meta, on) : withLines(meta, on))

// output lines as stored in the element (shown in every export) and sent by the runner: capped, plain text
export const KINDS = ['log', 'info', 'warn', 'error', 'debug', 'result']
export function cleanOutput(list) {
  if (!Array.isArray(list)) return undefined
  let chars = 0
  const out = []
  for (const l of list.slice(0, 200)) {
    if (!l || !KINDS.includes(l.k) || typeof l.t !== 'string' || chars >= 20000) continue
    const t = l.t.slice(0, 2000)
    chars += t.length
    out.push({ k: l.k, t })
  }
  return out
}
// the panel's lines as text: errors and the value stand out by a prefix, so exports read like the slide
export const outLine = l => (l.k === 'result' ? '← ' : l.k === 'error' ? '✖ ' : l.k === 'warn' ? '⚠ ' : '') + l.t

// while presenting: id -> { code: the edited code, out: lines, busy }; not part of the project until "Keep changes"
export const live = reactive({})
export const resetLive = () => { for (const k in live) delete live[k] }

let frame = null, ready = null, seq = 0
const waiting = new Map() // run id -> message handler
function runner() {
  if (ready) return ready
  ready = new Promise(resolve => {
    addEventListener('message', e => {
      // only our iframe, and it has an opaque origin ("null"): anything else is not the runner
      if (!frame || e.source !== frame.contentWindow || e.origin !== 'null' || !e.data || typeof e.data !== 'object') return
      if (e.data.k === 'ready') return resolve()
      waiting.get(e.data.run)?.(e.data)
    })
    frame = Object.assign(document.createElement('iframe'), { src: 'runner.html', title: 'Code runner', hidden: true })
    frame.setAttribute('sandbox', 'allow-scripts') // never allow-same-origin: the code would get the app's origin
    frame.setAttribute('aria-hidden', 'true')
    document.body.append(frame)
  })
  return ready
}
// runs code; onLine gets each output line; resolves with all lines ({ timeout: true } when stopped)
export async function runCode(code, onLine = () => {}) {
  await runner()
  const run = ++seq, out = []
  return new Promise(resolve => {
    waiting.set(run, d => {
      if (d.k === 'end' || d.k === 'timeout') { waiting.delete(run); return resolve(Object.assign(out, { timeout: d.k === 'timeout' })) }
      const l = cleanOutput([d])?.[0]
      if (l && out.length < 200) { out.push(l); onLine(l) }
    })
    frame.contentWindow.postMessage({ run, code: String(code) }, '*')
  })
}
// runs an element's code while presenting (edited code from live); the lines show as they come
export async function runLive(el, stopped) {
  const s = live[el.id] ??= { code: el.code, out: [] }
  if (s.busy) return
  s.busy = s.ran = true
  s.out = []
  const out = await runCode(s.code, l => s.out.push(l))
  if (out.timeout) s.out.push({ k: 'error', t: stopped })
  s.busy = false
}
// the editor's Run button: the output becomes the element's (shown in the exports), one undo step
export async function runInto(el, stopped) {
  const res = await runCode(el.code), out = [...res]
  if (res.timeout) out.push({ k: 'error', t: stopped })
  el.output = out.length ? out : undefined
}
