<script setup>
// Hands-on Markdown tutorial: type Markdown, the real slides appear beside it (below it on phones). Opened via openTutorial() (tutorial.js)
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'
import SlideView from './SlideView.vue'
import { deck, cleanSlides } from './store.js'
import { importSlidev } from './importSlidev.js'
import { importProject } from './actions.js'
import { highlight } from './hl.js'
import { t } from './i18n.js'
import { LESSONS, tutorial, closeTutorial, typed } from './tutorial.js'

const dlg = ref(), pane = ref(), area = ref()
const intro = ref(!tutorial.fromTour) // the tour has its own welcome
const at = ref(0) // lesson index; LESSONS.length is the closing screen
const last = LESSONS.length - 1
const texts = ref(LESSONS.map(l => (l.start ? t(l.start) : '')))
const done = ref(new Set())
const hint = ref(false)
const created = ref(false)
const lesson = computed(() => LESSONS[at.value])
const end = computed(() => at.value > last)
const text = computed({ get: () => texts.value[Math.min(at.value, last)], set: v => { texts.value[at.value] = v } })
const solved = computed(() => !end.value && lesson.value.check(text.value))
// the lessons up to the first unsolved one can be visited
const unlocked = computed(() => { const i = LESSONS.findIndex((_, k) => !done.value.has(k)); return i < 0 ? LESSONS.length : i })
watch(solved, v => { if (v) done.value = new Set(done.value).add(at.value) }, { immediate: true })
const go = i => { at.value = i; hint.value = false; nextTick(() => area.value?.focus()) }
const next = () => { if (solved.value) go(at.value + 1) }
let solveShown = false
const solve = () => { solveShown = true; texts.value[at.value] = t(lesson.value.solution); nextTick(() => { solveShown = false }) } // a shown solution is not timed

// stopwatch of the challenge: from the first key press until it is solved
const start = ref(null), stop = ref(null), now = ref(Date.now())
const tick = setInterval(() => { now.value = Date.now() }, 250)
onBeforeUnmount(() => clearInterval(tick))
const onInput = () => { if (lesson.value?.challenge) start.value ??= Date.now() }
// also from the text itself: phone keyboards (autocorrect, dictation, composition) do not always send an input event first
watch(text, v => { if (v && lesson.value?.challenge && !solveShown) onInput() })
watch(solved, v => { if (v && lesson.value.challenge && start.value) stop.value ??= Date.now() })
const seconds = computed(() => (start.value ? Math.floor(((stop.value || now.value) - start.value) / 1000) : 0))

// live preview through the same import as "Insert slides from Markdown"; debounced, the newest text wins
// shortcut: always measured at 16:9 / 980 px; a headmatter aspectRatio is ignored here
const slides = ref([])
let timer, seq = 0
watch(text, v => {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    const n = ++seq
    try {
      const r = await importSlidev('tutorial.md', new Map([['tutorial.md', v]]), deck.theme)
      if (n === seq) slides.value = cleanSlides(r.slides)
    } catch {} // half-typed Markdown: the last preview stays
  }, 250)
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(timer))
const scale = ref(0.4)
const ro = new ResizeObserver(([e]) => { scale.value = Math.max(0.1, (e.contentRect.width - 2) / 980) })
onMounted(() => dlg.value.showModal())
watch(pane, (el, old) => { if (old) ro.unobserve(old); if (el) ro.observe(el) }) // the preview exists only during the lessons
onBeforeUnmount(() => ro.disconnect())

const stats = computed(() => ({ ...typed(texts.value[last]), slides: slides.value.length, elements: slides.value.reduce((n, s) => n + s.elements.length, 0) }))
const create = async () => {
  const before = deck.id
  await importProject([new File([texts.value[last]], 'slides.md')], 'slides.md')
  if (deck.id === before) return // the import failed and showed why
  deck.title = t('My Markdown talk')
  created.value = true
  dlg.value.close()
}
const onKey = e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); next() } }
</script>

<template>
  <!-- keydown.stop: the editor's window shortcuts (present, find, save …) would act on the slides behind -->
  <dialog ref="dlg" class="tutorial" :aria-label="t('Markdown tutorial')" @keydown.stop @close="closeTutorial({ finished: done.has(last), created })">
    <header class="tut-head">
      <h2><Icon name="markdown" /> {{ t('Markdown tutorial') }}</h2>
      <nav v-if="!intro" class="tut-steps" :aria-label="t('Lessons')">
        <button v-for="(l, i) in LESSONS" :key="i" class="tut-dot" :class="{ done: done.has(i) }" :disabled="i > unlocked" :aria-current="i === at ? 'step' : null"
          :title="t(l.title)" :aria-label="`${i + 1}. ${t(l.title)}${done.has(i) ? ' ✓' : ''}`" @click="go(i)">{{ done.has(i) ? '✓' : i + 1 }}</button>
      </nav>
      <button class="tb icon" :title="t('Close')" :aria-label="t('Close')" @click="dlg.close()"><Icon name="x" /></button>
    </header>

    <section v-if="intro" class="tut-intro">
      <h3>{{ t('Slides in minutes, with a few signs') }}</h3>
      <p>{{ t('Learn the Markdown that Slidev and Slidecko understand by doing it: 10 short tasks, each in a few seconds. You type Markdown, and the real slides appear while you type.') }}</p>
      <menu><button class="primary" autofocus @click="intro = false; go(0)">{{ t('Start') }}</button></menu>
    </section>

    <section v-else-if="end" class="tut-intro">
      <h3>{{ t('You wrote a talk in Markdown') }}</h3>
      <p v-if="stop">{{ seconds <= 60 ? t('In {0} seconds – under a minute.', seconds) : t('In {0} seconds.', seconds) }}</p>
      <div class="tut-stats">
        <div><small>{{ t('You typed') }}</small><b>{{ t('{0} characters', stats.chars) }}</b><b>{{ t('{0} lines', stats.lines) }}</b></div>
        <Icon name="chevronR" :size="28" />
        <div><small>{{ t('You got') }}</small><b>{{ t('{0} slides', stats.slides) }}</b><b>{{ t('{0} laid-out elements', stats.elements) }}</b></div>
      </div>
      <p>{{ t('No dragging, no aligning, no formatting menus: the structure is the design.') }}</p>
      <p>{{ t('Later, open the Markdown of any slide with M, or insert new slides from Markdown with ⇧M (also in the File menu).') }}</p>
      <menu>
        <button @click="go(last)">{{ t('Back to the lessons') }}</button>
        <button class="primary" autofocus @click="create">{{ t('Open as new presentation') }}</button>
      </menu>
    </section>

    <template v-else>
      <div class="tut-lesson">
        <h3>{{ at + 1 }}. {{ t(lesson.title) }}</h3>
        <p>{{ t(lesson.text) }}</p>
        <p class="tut-task"><b>{{ t('Task:') }}</b> {{ t(lesson.task) }}
          <!-- right above the editor: on phones the keyboard covers the footer while typing -->
          <span v-if="lesson.challenge" class="tut-clock" role="timer" :aria-label="t('Stopwatch')">⏱ {{ seconds }} s</span></p>
        <p v-if="hint" class="tut-hint">{{ t(lesson.hint) }}</p>
      </div>
      <div class="tut-work">
        <div class="md-wrap">
          <div class="md-mirror text-mirror" aria-hidden="true" v-html="highlight(text, 'markdown') + '​'" />
          <textarea ref="area" v-model="text" class="md-editor" spellcheck="false" aria-label="Markdown" :placeholder="lesson.challenge ? t('# My talk …') : null"
            @input="onInput" @keydown="onKey" @scroll="$event.target.previousElementSibling.scrollTop = $event.target.scrollTop" />
        </div>
        <div ref="pane" class="tut-preview" :aria-label="t('Preview')" role="region">
          <div v-for="(s, i) in slides" :key="s.id" class="tut-slide" :style="{ width: 980 * scale + 'px', height: 552 * scale + 'px' }">
            <SlideView :slide="s" :index="i" inert :style="{ transform: `scale(${scale})`, '--slide-w': '980px', '--slide-h': '552px' }" />
          </div>
          <p v-if="!slides.length" class="tut-empty">{{ t('Your slides appear here.') }}</p>
        </div>
      </div>
      <footer class="tut-foot">
        <span class="tut-result" role="status">
          <template v-if="solved"><Icon name="check" /> {{ lesson.challenge && stop ? t('Done – in {0} seconds!', seconds) : t('Well done!') }}</template>
        </span>
        <menu>
          <button v-if="!hint" @click="hint = true">{{ t('Hint') }}</button>
          <button @click="solve">{{ t('Show solution') }}</button>
          <button v-if="at" @click="go(at - 1)">{{ t('Back') }}</button>
          <button class="primary" :disabled="!solved" :title="solved ? null : t('Solve the task first')" @click="next">{{ at === last ? t('Finish') : t('Next') }}</button>
        </menu>
      </footer>
    </template>
  </dialog>
</template>

<style>
dialog.tutorial { width: min(1200px, calc(100vw - 32px)); max-height: calc(100vh - 32px); max-height: calc(100svh - 32px); display: flex; flex-direction: column; gap: 10px; }
dialog.tutorial:not([open]) { display: none; }
.tut-head { display: flex; align-items: center; gap: 12px; }
.tut-head h2 { display: flex; align-items: center; gap: 6px; margin: 0 auto 0 0; }
.tut-steps { display: flex; flex-wrap: wrap; gap: 4px; }
.tut-dot { width: 28px; height: 28px; padding: 0; border: 1px solid var(--ui-line-strong); border-radius: 50%; background: var(--ui-panel); color: var(--ui-fg); font-size: 12px; cursor: pointer; }
.tut-dot.done { background: var(--ui-accent-soft); border-color: var(--ui-accent-line); }
.tut-dot[aria-current] { outline: 2px solid var(--ui-accent); outline-offset: 1px; }
.tut-dot:disabled { cursor: default; color: var(--ui-muted); }
.tut-intro { max-width: 640px; }
.tut-intro h3, .tut-lesson h3 { margin: 4px 0 6px; font-size: 16px; }
dialog.tutorial .tut-lesson p { margin: 0 0 6px; }
dialog.tutorial .tut-task { color: var(--ui-fg); }
.tut-hint { padding: 6px 10px; border-radius: 6px; background: var(--ui-accent-soft); color: var(--ui-fg) !important; }
.tut-work { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; min-height: 0; flex: 1; }
dialog.tutorial .md-editor { height: min(50vh, 460px); height: min(50svh, 460px); }
.tut-preview { display: flex; flex-direction: column; gap: 8px; overflow: auto; max-height: min(50vh, 460px); max-height: min(50svh, 460px); }
.tut-slide { flex: none; overflow: hidden; border: 1px solid var(--ui-line); border-radius: 4px; }
.tut-empty { color: var(--ui-muted); }
.tut-foot { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.tut-foot menu { margin: 0 0 0 auto; }
.tut-result { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.tut-result svg { color: var(--ui-accent); }
.tut-clock { display: inline-block; margin-left: 6px; padding: 0 8px; border-radius: 999px; border: 1px solid var(--ui-line-strong); font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
.tut-stats { display: flex; align-items: center; gap: 16px; margin: 12px 0; }
.tut-stats > div { display: flex; flex-direction: column; padding: 12px 16px; border: 1px solid var(--ui-line); border-radius: 10px; }
.tut-stats small { color: var(--ui-muted); }
@media (max-width: 760px) {
  .tut-work { grid-template-columns: 1fr; }
  dialog.tutorial .md-editor, .tut-preview { height: auto; min-height: 160px; max-height: 32vh; max-height: 32svh; }
}
</style>
