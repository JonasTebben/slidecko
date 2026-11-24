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
// seconds -> "9:05", "1:02:03"; tenths (a stopwatch): "0:07.3", the time already passed (floored)
export function clock(sec, tenths) {
  if (tenths) { const t = Math.floor(Math.max(0, sec) * 10 + 1e-6); return clock(Math.floor(t / 10)) + '.' + (t % 10) }
  sec = Math.max(0, Math.ceil(sec))
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = String(sec % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

// id -> { acc: ms counted before the last start, since: start time while running }
export const runs = reactive({})
export const now = ref(Date.now())
let tick = null
// the end of a countdown: three short tones, made by Web Audio (no sound file); silent where audio is unavailable
let audio
export function chime() {
  try {
    audio ||= new AudioContext()
    for (const k of [0, 1, 2]) {
      const o = audio.createOscillator(), g = audio.createGain(), at = audio.currentTime + k * 0.3
      o.frequency.value = 880
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(0.4, at + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25)
      o.connect(g).connect(audio.destination)
      o.start(at)
      o.stop(at + 0.26)
    }
  } catch { /* no audio: the blinking stays */ }
}
// every tick: a running countdown that just ran out rings once (unless its sound is off)
function ring() {
  for (const r of Object.values(runs)) if (r.since && r.total && !r.rung && r.acc + Date.now() - r.since >= r.total * 1000) { r.rung = true; if (r.sound) chime() }
}
const sync = () => {
  const on = Object.values(runs).some(r => r.since)
  if (on && !tick) tick = setInterval(() => { now.value = Date.now(); ring() }, 100) // tenths of a stopwatch
  if (!on && tick) { clearInterval(tick); tick = null }
}
const elapsed = id => { const r = runs[id]; return r ? r.acc + (r.since ? now.value - r.since : 0) : 0 }
// what the timer shows now, and whether a countdown has run out
export const shown = el => (el.seconds ? Math.max(0, el.seconds - elapsed(el.id) / 1000) : elapsed(el.id) / 1000)
export const done = el => !!el.seconds && shown(el) <= 0
export const running = id => !!runs[id]?.since
// the digits: a stopwatch with tenths; live: while presenting (else its start value)
export const face = (el, live) => (el.seconds ? clock(live ? shown(el) : el.seconds) : clock(live ? shown(el) : 0, true))
// ring and bar: the share of a countdown left (full before the start), a stopwatch's second hand within its minute
export const progress = (el, live) => (el.seconds ? (live ? shown(el) / el.seconds : 1) : live ? (shown(el) % 60) / 60 : 0)
// "last minute in red": a running-down countdown in its last 60 seconds
export const warning = (el, live) => !!(live && el.warn && el.seconds && shown(el) > 0 && shown(el) <= 60)
// click: start, pause, go on; a finished countdown starts over
export function toggle(el) {
  now.value = Date.now()
  const r = runs[el.id] ||= { acc: 0, since: 0 }
  Object.assign(r, { total: el.seconds, sound: !el.silent })
  if (done(el)) Object.assign(r, { acc: 0, since: now.value, rung: false })
  else if (r.since) Object.assign(r, { acc: r.acc + now.value - r.since, since: 0 })
  else r.since = now.value
  sync()
}
export function reset(id) { delete runs[id]; sync() }
// "starts when the slide appears": once per presentation, a timer that was never started
export function autostart(els) { for (const el of els) if (el.type === 'timer' && el.auto && !runs[el.id]) toggle(el) }
