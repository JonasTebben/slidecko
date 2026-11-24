// Rehearsal mode: the talk practised against the clock. Pure functions, times in ms while running, seconds when stored.

// a run: slide being timed, since = when timing it began (null while paused), ms = time spent per slide index
export const start = (slide, now) => ({ slide, since: now, ms: [] })
const bank = (r, now) => { if (r.since != null) { r.ms[r.slide] = (r.ms[r.slide] || 0) + now - r.since; r.since = now } }
// click steps do not call this: they count toward the slide they are on
export function visit(r, slide, now) { bank(r, now); r.slide = slide }
export function pause(r, now) { bank(r, now); r.since = null }
export function resume(r, now) { r.since ??= now }
const live = (r, now) => (r.since == null ? 0 : Math.max(0, now - r.since))
export const onSlide = (r, now) => (r.ms[r.slide] || 0) + live(r, now)
export const total = (r, now) => r.ms.reduce((a, b) => a + (b || 0), 0) + live(r, now)

const sum = list => list.reduce((a, b) => a + (b || 0), 0)
// planned seconds per slide index: a slide's own duration, else an equal share of what the talk length leaves; null: no plan (or hidden)
export function plan(slides, talk = 0) {
  const shown = slides.filter(s => !s.hidden), free = shown.filter(s => !s.duration).length
  const left = talk - sum(shown.map(s => s.duration)), each = free && left > 0 ? left / free : 0
  return slides.map(s => (s.hidden ? null : s.duration || each || null))
}
// seconds behind the plan (negative: ahead) on slide i; null without any plan
export function pace(plans, i, totalSec) {
  if (!plans.some(Boolean)) return null
  return totalSec - sum(plans.slice(0, i + 1))
}
// one slide: 'over' its planned time, 'near' it (80 %), 'ok'; null without a plan
export const status = (spent, planned) => (!planned ? null : spent > planned ? 'over' : spent > planned * 0.8 ? 'near' : 'ok')

// what is kept of a finished run: seconds per slide (null: not shown), the plan it was measured against
export const record = (r, plans, at) => ({ at, times: Array.from({ length: plans.length }, (_, i) => (r.ms[i] == null ? null : Math.round(r.ms[i] / 1000))), planned: plans.map(p => (p ? Math.round(p) : null)) })
export const REHEARSALS = 5
export const addRehearsal = (list, rec) => [rec, ...list].slice(0, REHEARSALS)
// from a project file or IndexedDB: untrusted
const secs = v => (Number.isFinite(v) && v >= 0 && v <= 86400 ? Math.round(v) : null)
const secList = v => (Array.isArray(v) ? v.slice(0, 2000).map(secs) : [])
export const cleanRehearsals = list => (Array.isArray(list) ? list : []).filter(r => r && Number.isFinite(r.at) && Array.isArray(r.times))
  .slice(0, REHEARSALS).map(r => ({ at: r.at, times: secList(r.times), planned: secList(r.planned) }))
// a planned time: whole seconds, 1 s to 24 h
export const validDuration = v => Number.isFinite(v) && v >= 1 && v <= 86400

// Slidev headmatter `duration` (its presenter timer): "30min", "1h", "1h30min", "90s", "45" (minutes) -> seconds; null when unreadable
export function parseDuration(s) {
  const v = String(s ?? '').trim().toLowerCase()
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(+v * 60)
  const parts = [...v.matchAll(/(\d+(?:\.\d+)?)\s*(h|min|m|s)/g)]
  if (!parts.length || parts.map(m => m[0]).join('').replace(/\s/g, '') !== v.replace(/\s/g, '')) return null
  return Math.round(parts.reduce((a, [, n, u]) => a + n * { h: 3600, min: 60, m: 60, s: 1 }[u], 0))
}
export const slidevDuration = sec => (sec % 60 ? `${sec}s` : `${sec / 60}min`)
