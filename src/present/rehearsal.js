// Rehearsal: the presenter view against the clock (rehearse.js); the result is kept with the project
import { ref, computed, watch, nextTick } from 'vue'
import { deck, ui, nextShown } from '../core/store.js'
import * as A from '../core/actions.js'
import { t } from '../core/i18n.js'
import * as R from './rehearse.js'
import { clock } from './timer.js'

// from App.vue: the clock tick, the presenter view switch, starting and moving the presentation, the dialog opener
export function useRehearsal({ now, presenterView, present, presentGo, presenting, openDlg }) {
  const rehearsal = ref(null), rhDialog = ref(), rhResult = ref(null)
  const rhPlan = computed(() => R.plan(deck.slides, deck.duration))
  const sumOf = list => list.reduce((a, b) => a + (b || 0), 0)
  const rhTotal = computed(() => (rehearsal.value ? Math.floor(R.total(rehearsal.value, now.value) / 1000) : 0))
  const rhSlide = computed(() => (rehearsal.value ? Math.floor(R.onSlide(rehearsal.value, now.value) / 1000) : 0))
  const rhPace = computed(() => R.pace(rhPlan.value, ui.slide, rhTotal.value))
  const rhState = computed(() => R.status(rhSlide.value, rhPlan.value[ui.slide]))
  const tick = () => (now.value = Date.now())
  async function rehearse() {
    presenterView.value = true
    await present(0)
    rehearsal.value = R.start(ui.slide, tick())
  }
  watch(() => ui.slide, i => { if (rehearsal.value) R.visit(rehearsal.value, i, tick()) })
  const rhPause = () => { const r = rehearsal.value; r.since == null ? R.resume(r, tick()) : R.pause(r, tick()) }
  const rhRestart = () => { presentGo(deck.slides[0]?.hidden ? nextShown(deck.slides, 0, 1) : 0); rehearsal.value = R.start(ui.slide, tick()) }
  // Esc, the end button or leaving full screen: the run is kept and its summary shown
  watch(presenting, v => {
    const r = rehearsal.value
    if (v || !r) return
    rehearsal.value = null
    R.pause(r, Date.now())
    if (!r.ms.some(Boolean)) return
    const rec = R.record(r, rhPlan.value, Date.now())
    rhResult.value = { rec, prev: deck.rehearsals[0] }
    deck.rehearsals = R.addRehearsal(deck.rehearsals, rec)
    nextTick(() => openDlg(rhDialog.value))
  })
  const slideName = s => { const e = s?.elements.find(e => e.title && e.html); return e ? new DOMParser().parseFromString(e.html, 'text/html').body.textContent.trim() : '' }
  const rhSum = computed(() => { const x = rhResult.value; return x && { time: sumOf(x.rec.times), plan: sumOf(x.rec.planned), prev: x.prev && sumOf(x.prev.times) } })
  const rhRows = computed(() => {
    const x = rhResult.value
    if (!x) return []
    const rows = x.rec.times.map((time, i) => ({ i, name: slideName(deck.slides[i]), time, plan: x.rec.planned[i], prev: x.prev?.times[i] })).filter(r => r.time != null || r.plan)
    const max = Math.max(1, ...rows.map(r => Math.max(r.time || 0, r.plan || 0)))
    return rows.map(r => ({ ...r, bar: ((r.time || 0) / max) * 100 + '%', mark: r.plan && (r.plan / max) * 100 + '%', diff: r.plan && r.time != null ? r.time - r.plan : null }))
  })
  const signed = d => (d > 0 ? '+' : d < 0 ? '−' : '±') + clock(Math.abs(d))
  function rhUseTimes() {
    rhResult.value.rec.times.forEach((v, i) => { if (v > 0 && deck.slides[i]) deck.slides[i].duration = v })
    A.toast(t('The rehearsed times are now the planned times.'))
  }
  const rhAgain = () => { rhDialog.value.close(); rehearse() }
  return { rehearsal, rhPlan, sumOf, rhTotal, rhSlide, rhPace, rhState, rehearse, rhPause, rhRestart, rhSum, rhRows, signed, rhUseTimes, rhAgain, rhDialog, rhResult }
}
