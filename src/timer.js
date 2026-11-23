import { reactive, ref } from 'vue'

// Timer elements: a countdown (seconds > 0) or a stopwatch (0) started by a click while presenting.
// The running state is not part of the project: every presentation starts fresh.

// "10", "10:00", "1:30:00" -> seconds (plain numbers are minutes); null when unreadable
export function parseClock(s) {
  const p = String(s).trim().split(':')
  if (!p.every(x => /^\d+$/.test(x)) || p.length > 3) return null
  if (p.length === 1) return +p[0] * 60
  return p.reduce((a, x) => a * 60 + +x, 0)
}
// seconds -> "9:05", "1:02:03"
export function clock(sec) {
  sec = Math.max(0, Math.ceil(sec))
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = String(sec % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

// id -> { acc: ms counted before the last start, since: start time while running }
export const runs = reactive({})
export const now = ref(Date.now())
let tick = null
const sync = () => {
  const on = Object.values(runs).some(r => r.since)
  if (on && !tick) tick = setInterval(() => { now.value = Date.now() }, 250)
  if (!on && tick) { clearInterval(tick); tick = null }
}
const elapsed = id => { const r = runs[id]; return r ? r.acc + (r.since ? now.value - r.since : 0) : 0 }
// what the timer shows now, and whether a countdown has run out
export const shown = el => (el.seconds ? Math.max(0, el.seconds - elapsed(el.id) / 1000) : elapsed(el.id) / 1000)
export const done = el => !!el.seconds && shown(el) <= 0
export const running = id => !!runs[id]?.since
// click: start, pause, go on; a finished countdown starts over
export function toggle(el) {
  now.value = Date.now()
  const r = runs[el.id] ||= { acc: 0, since: 0 }
  if (done(el)) Object.assign(r, { acc: 0, since: now.value })
  else if (r.since) Object.assign(r, { acc: r.acc + now.value - r.since, since: 0 })
  else r.since = now.value
  sync()
}
export function reset(id) { delete runs[id]; sync() }
