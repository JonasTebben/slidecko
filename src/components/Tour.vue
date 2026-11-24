<script setup>
// Coach marks over the real editor: a spotlight on a data-tour="…" anchor and a small, non-modal bubble.
// The page stays usable underneath (hands-on steps), so nothing here blocks pointer events but the bubble.
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { tour, stepsFor, nextStep, place } from '../editor/tour.js'
import { deck, ui, removeProject } from '../core/store.js'
import { t } from '../core/i18n.js'
import { kbd } from '../core/keys.js'
import { openTutorial } from '../editor/tutorial.js'

const steps = computed(() => stepsFor(tour.full))
const step = computed(() => steps.value[tour.i])
const bubble = ref(), spot = ref(null), pos = ref({ x: 0, y: 0 }), count = ref([0, 0])

// a wrapper with display: contents (around a Menu) has no box of its own: its button has
const anchor = k => { const el = document.querySelector(`[data-tour="${k}"]`); return el && getComputedStyle(el).display === 'contents' ? el.firstElementChild : el }
const shown = k => { const r = anchor(k)?.getBoundingClientRect(); return !!r && r.width > 0 && r.height > 0 }

function measure() {
  if (!tour.on || !step.value || !bubble.value) return
  const el = step.value.target && anchor(step.value.target)
  const r = el?.getBoundingClientRect()
  spot.value = r ? { left: r.left - 6 + 'px', top: r.top - 6 + 'px', width: r.width + 12 + 'px', height: r.height + 12 + 'px' } : null
  pos.value = place(r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }, bubble.value.offsetWidth, bubble.value.offsetHeight, innerWidth, innerHeight)
  const list = steps.value.filter(s => s.after === steps.value[tour.i].after && (!s.target || shown(s.target)))
  count.value = [list.indexOf(step.value) + 1, list.length]
}
async function show() {
  if (!tour.on) return
  // the anchor may be gone (panel folded, phone layout): on to the next one that is there
  if (step.value?.target && !shown(step.value.target)) { const j = nextStep(steps.value, tour.i, 1, shown); return j < 0 ? end() : (tour.i = j) }
  await nextTick()
  if (step.value?.target) anchor(step.value.target)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  measure()
  bubble.value?.focus({ preventScroll: true })
  if (step.value?.edit) startEdit()
}
watch(() => [tour.on, tour.i], show)
onMounted(() => { show(); addEventListener('resize', measure); addEventListener('scroll', measure, true) })
onBeforeUnmount(() => { removeEventListener('resize', measure); removeEventListener('scroll', measure, true); stopEdit?.() })

function go(d) {
  if (d > 0 && step.value.tutorial) return handOver()
  const j = nextStep(steps.value, tour.i, d, shown)
  if (j < 0) return d > 0 && end()
  tour.i = j
}
async function end(skip) {
  const early = skip && tour.i === 0 && tour.created && tour.created === deck.id
  tour.on = false
  if (early) await removeProject(tour.created) // skipped right away: no empty sample project left behind
}
function startTutorial() { end(); openTutorial() }
// full tour: the tutorial takes over; when its "Open as new presentation" made a project, the closing steps follow there
function handOver() {
  tour.on = false
  const after = steps.value.findIndex(s => s.after)
  openTutorial({ fromTour: true, onClose: ({ created }) => { if (created) Object.assign(tour, { on: true, i: after }) } })
}

// hands-on: the title of the slide changed and editing ended → on to the next step
let stopEdit
function startEdit() {
  stopEdit?.()
  const el = deck.slides[ui.slide]?.elements.find(e => e.title), before = el?.html
  if (!el) return
  stopEdit = watch(() => [el.html, ui.editing], ([html, editing]) => {
    if (html === before || editing || !step.value?.edit) return
    stopEdit(); stopEdit = null
    go(1)
  })
}
watch(() => step.value?.edit, e => { if (!e) { stopEdit?.(); stopEdit = null } })

function key(e) {
  const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]
  if (e.key === 'Enter' || e.key === ' ') return e.stopPropagation() // presses the button, not the editor's Enter-to-edit
  if (e.key === 'Escape') end(true)
  else if (d && !e.target.closest('input, textarea')) go(d)
  else return
  e.preventDefault()
  e.stopPropagation() // not the editor's own arrow and Esc handling as well
}
</script>

<template>
  <div v-if="tour.on && step" class="tour">
    <div v-if="spot" class="tour-spot" :style="spot" aria-hidden="true" />
    <div ref="bubble" class="tour-bubble" :style="{ left: pos.x + 'px', top: pos.y + 'px' }" role="dialog" aria-modal="false"
      aria-labelledby="tour-title" aria-describedby="tour-text" tabindex="-1" @keydown="key">
      <small class="tour-count">{{ t('{0} of {1}', count[0], count[1]) }}</small>
      <h2 id="tour-title">{{ t(step.title) }}</h2>
      <p id="tour-text">{{ t(step.text, kbd('palette'), kbd('editMarkdown')) }}</p>
      <button v-if="!tour.full && step.id === 'palette'" type="button" class="tb small tour-extra" @click="startTutorial">{{ t('Learn Markdown slides (hands-on)') }}</button>
      <div class="tour-actions">
        <button type="button" class="tb small" @click="end(true)">{{ t('Skip tour') }}</button>
        <span />
        <button v-if="count[0] > 1" type="button" class="tb small" @click="go(-1)">{{ t('Previous') }}</button>
        <button type="button" class="tb small primary" @click="go(1)">{{ step.tutorial ? t('Start the tutorial') : count[0] === count[1] ? t('Done') : t('Next') }}</button>
      </div>
    </div>
  </div>
</template>
