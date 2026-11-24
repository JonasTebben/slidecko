// Code runner for runnable code blocks (runner.html, or inlined into the HTML export). The page only relays: every run gets a
// fresh worker, so globals don't leak between runs and an endless loop is stopped by terminating it.
// Messages in: { run, code }. Out: { run, k, t } with k = log | info | warn | error | debug | result, then end | timeout.
'use strict'
const LIMIT = 3000, MAX_LINES = 200, MAX_CHARS = 20000

// a value as a console would print it (strings bare at the top level, quoted inside)
function fmt(v, depth, seen) {
  depth = depth || 0; seen = seen || new Set()
  const t = typeof v
  if (t === 'string') return depth ? JSON.stringify(v) : v
  if (t === 'bigint') return v + 'n'
  if (t === 'function') return 'ƒ ' + (v.name || 'anonymous') + '()'
  if (t === 'symbol' || v == null || t !== 'object') return String(v)
  if (v instanceof Error) return v.name + ': ' + v.message
  if (v instanceof Date) return isNaN(v) ? 'Invalid Date' : v.toISOString()
  if (v instanceof RegExp) return String(v)
  if (seen.has(v)) return '[Circular]'
  if (depth > 3) return Array.isArray(v) ? '[…]' : '{…}'
  seen.add(v)
  const list = (items, open, close) => { const s = items.slice(0, 100); return open + s.join(', ') + (items.length > 100 ? ', …' : '') + close }
  let out
  if (Array.isArray(v)) out = list(v.map(x => fmt(x, depth + 1, seen)), '[', ']')
  else if (v instanceof Map) out = list([...v].map(([k, x]) => fmt(k, depth + 1, seen) + ' => ' + fmt(x, depth + 1, seen)), 'Map(' + v.size + ') {', '}')
  else if (v instanceof Set) out = list([...v].map(x => fmt(x, depth + 1, seen)), 'Set(' + v.size + ') {', '}')
  else if (v instanceof Promise) out = 'Promise {…}'
  else {
    const name = v.constructor && v.constructor !== Object && v.constructor.name ? v.constructor.name + ' ' : ''
    out = Object.keys(v).length ? name + list(Object.keys(v).map(k => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)) + ': ' + fmt(v[k], depth + 1, seen)), '{ ', ' }') : name + '{}'
  }
  seen.delete(v)
  return out
}
// an error with the line in the user's code (the eval is named code.js; off: lines added in front of it)
function errText(e, off) {
  if (!(e instanceof Error)) return 'Uncaught ' + fmt(e, 1)
  const m = String(e.stack || '').match(/code\.js:(\d+):(\d+)/)
  return e.name + ': ' + e.message + (m ? ' (line ' + (m[1] - off) + ')' : '')
}

// runs in the worker: console calls, the last expression's value and uncaught errors become messages; the run ends when
// the code has settled and no timer is left
function work() {
  const send = (k, t) => postMessage({ k, t })
  for (const k of ['log', 'info', 'warn', 'error', 'debug']) console[k] = (...a) => send(k, a.map(x => fmt(x)).join(' '))
  let settled = false, off = 0
  const timers = new Set(), [st, ct, si, ci] = [setTimeout, clearTimeout, setInterval, clearInterval]
  const finish = () => { if (settled && !timers.size) send('end') }
  const safe = f => (...a) => { try { if (typeof f === 'function') f(...a) } catch (e) { send('error', errText(e, off)) } }
  self.setTimeout = (f, ms, ...a) => { const id = st(() => { timers.delete(id); safe(f)(...a); finish() }, ms); timers.add(id); return id }
  self.setInterval = (f, ms, ...a) => { const id = si(safe(f), ms, ...a); timers.add(id); return id }
  self.clearTimeout = self.clearInterval = id => { ct(id); ci(id); timers.delete(id); finish() }
  self.importScripts = undefined // CSP lets 'self' scripts load (runner.js needs it); user code has no use for them
  self.onunhandledrejection = e => { e.preventDefault(); send('error', errText(e.reason, off)) }
  onmessage = async ({ data: code }) => {
    onmessage = null
    // top-level await needs an async function (which has no last value); plain code is evaluated as a script
    const wrap = /\bawait\b/.test(code)
    off = wrap ? 1 : 0
    try {
      const v = await (0, eval)((wrap ? '(async () => {\n' + code + '\n})()' : code) + '\n//# sourceURL=code.js')
      if (v !== undefined) send('result', fmt(v, 1))
    } catch (e) { send('error', errText(e, off)) }
    settled = true
    finish()
  }
}

if (typeof window !== 'undefined' && window.parent !== window) {
  const url = URL.createObjectURL(new Blob([`'use strict'\n${fmt}\n${errText}\n(${work})()`], { type: 'text/javascript' }))
  let worker = null, timer = null, current
  const stop = () => { if (worker) worker.terminate(); worker = null; clearTimeout(timer) }
  addEventListener('message', e => {
    if (e.source !== parent || !e.data || typeof e.data.code !== 'string') return
    if (worker) { stop(); parent.postMessage({ run: current, k: 'end' }, '*') } // a new run ends the one before
    const run = current = e.data.run, reply = (k, t) => parent.postMessage({ run, k, t }, '*')
    let lines = 0, chars = 0
    const w = worker = new Worker(url)
    w.onmessage = ({ data }) => {
      if (w !== worker) return
      if (data.k === 'end') { stop(); return reply('end') }
      const t = String(data.t ?? '').slice(0, 2000)
      if (lines >= MAX_LINES || chars >= MAX_CHARS) return
      lines++; chars += t.length
      reply(data.k, lines === MAX_LINES || chars >= MAX_CHARS ? t + ' …' : t)
    }
    // a syntax error in the code itself surfaces here
    w.onerror = ev => { ev.preventDefault(); if (w === worker) { reply('error', ev.message || 'Error'); stop(); reply('end') } }
    timer = setTimeout(() => { if (w === worker) { stop(); reply('timeout') } }, LIMIT)
    w.postMessage(e.data.code.slice(0, 100000))
  })
  parent.postMessage({ k: 'ready' }, '*')
}
