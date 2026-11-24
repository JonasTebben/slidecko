<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import Icon from './Icon.vue'
import { deck, ui } from './store.js'
import { applyFix, slideTitle } from './a11yCheck.js'
import * as A from './actions.js'
import { t } from './i18n.js'

// Accessibility check (View menu, ⌘K): non-modal, the canvas stays usable and the list follows every edit
const props = defineProps({ findings: { type: Array, required: true } })
const emit = defineEmits(['close'])
const root = ref()
const SEV = { error: 'Error', warning: 'Warning', tip: 'Tip' }
const RULES = { alt: 'Alt text', contrast: 'Contrast', size: 'Font size', title: 'Slide title', 'duplicate-title': 'Duplicate title', order: 'Reading order', 'table-header': 'Table header', link: 'Link text', empty: 'Empty text box', captions: 'Captions' }
const FIX = { decorative: 'Mark as decorative', title: 'Mark as title', header: 'Add header row', delete: 'Delete box', order: 'Fix reading order' }
const groups = computed(() => {
  const out = []
  for (const f of props.findings) {
    if (out.at(-1)?.slide !== f.slide) out.push({ slide: f.slide, name: slideTitle(deck.slides[f.slide] || { elements: [] }), items: [] })
    out.at(-1).items.push(f)
  }
  return out
})
const count = s => props.findings.filter(f => f.severity === s).length
const elOf = f => deck.slides[f.slide]?.elements.find(e => e.id === f.el)
// shows the slide and selects the element, as a click on the canvas would
function go(f) {
  Object.assign(ui, { master: null, editing: null })
  A.go(f.slide)
  nextTick(() => { ui.sel = f.el ? [f.el] : [] })
}
// after a fix its entry goes away: focus stays at the same place in the list
let refocus = null
const keep = f => { const i = props.findings.indexOf(f); if (i >= 0) refocus = i } // Enter and change both fire: the second one is gone
watch(() => props.findings, () => nextTick(() => {
  if (refocus == null) return
  const items = root.value?.querySelectorAll('.a11y-go') || []
  ;(items[Math.min(refocus, items.length - 1)] || root.value?.querySelector('.a11y-close'))?.focus()
  refocus = null
}))
function fix(f) { keep(f); applyFix(deck.slides[f.slide], f); if (f.fix !== 'delete') go(f) }
function setAlt(f, v) { const el = elOf(f); if (!el || !v.trim()) return; keep(f); el.alt = v.trim() }
onMounted(() => { root.value.show(); root.value.querySelector('.a11y-go, .a11y-close')?.focus() })
</script>

<template>
  <dialog ref="root" class="a11y" aria-labelledby="a11y-title" @keydown.esc.stop.prevent="emit('close')" @close="emit('close')">
    <header class="a11y-head">
      <h2 id="a11y-title"><Icon name="eye" :size="16" />{{ t('Accessibility check') }}</h2>
      <span class="a11y-badge" :class="{ ok: !findings.length }" role="img" :aria-label="t('{0} issues', findings.length)" :title="t('{0} issues', findings.length)">{{ findings.length }}</span>
      <button type="button" class="tb icon small a11y-close" :title="t('Close (Esc)')" :aria-label="t('Close')" @click="emit('close')"><Icon name="x" :size="14" /></button>
    </header>
    <p class="a11y-sum" role="status">
      <template v-if="findings.length">{{ t('{0} errors, {1} warnings, {2} tips', count('error'), count('warning'), count('tip')) }}</template>
      <template v-else><Icon name="check" :size="14" /> {{ t('No issues found. Hidden slides are not checked.') }}</template>
    </p>
    <div class="a11y-list">
      <section v-for="g in groups" :key="g.slide" :aria-labelledby="'a11y-s' + g.slide">
        <h3 :id="'a11y-s' + g.slide">{{ t('Slide {0}', g.slide + 1) }}<span v-if="g.name"> · {{ g.name }}</span></h3>
        <ul>
          <li v-for="(f, i) in g.items" :key="f.rule + (f.el || '') + i" class="a11y-item">
            <button type="button" class="a11y-go" :title="t('Show on the slide')" @click="go(f)">
              <span class="a11y-sev" :class="f.severity">{{ t(SEV[f.severity]) }}</span>
              <span><b>{{ t(RULES[f.rule]) }}:</b> {{ t(f.msg, ...f.params) }}</span>
            </button>
            <div v-if="f.fix" class="a11y-fix">
              <input v-if="f.rule === 'alt'" type="text" :aria-label="t('Alt text for this picture')" :placeholder="t('Describe the picture, then Enter')" @keydown.enter.prevent="setAlt(f, $event.target.value)" @change="setAlt(f, $event.target.value)" />
              <button type="button" class="tb small" @click="fix(f)">{{ t(FIX[f.fix]) }}</button>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </dialog>
</template>

<style>
/* severity chips: text, not colour alone; 7:1 or more in both schemes */
:root { --a11y-error-bg: #fde8e8; --a11y-error: #8f1d1d; --a11y-warning-bg: #fff1cc; --a11y-warning: #6b4100; --a11y-tip-bg: #e8f0fe; --a11y-tip: #1d4793; }
:root[data-scheme="dark"] { --a11y-error-bg: #4a1f22; --a11y-error: #ffd0d0; --a11y-warning-bg: #45360f; --a11y-warning: #ffe3a3; --a11y-tip-bg: #1f2f52; --a11y-tip: #cddcff; }
dialog.a11y { position: fixed; inset: auto 16px 16px auto; margin: 0; z-index: 30; width: min(400px, calc(100vw - 32px)); max-height: min(560px, calc(100dvh - 120px)); padding: 0; display: none; flex-direction: column; border: 1px solid var(--ui-line); }
dialog.a11y[open] { display: flex; }
.a11y-head { display: flex; align-items: center; gap: 8px; padding: 10px 10px 4px 14px; }
.a11y-head h2 { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 14px; flex: 1; }
.a11y-badge { min-width: 22px; height: 20px; padding: 0 6px; border-radius: 10px; background: var(--a11y-error-bg); color: var(--a11y-error); font-size: 12px; font-weight: 700; line-height: 20px; text-align: center; }
.thumb .a11y-count { position: absolute; left: 4px; bottom: 4px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--a11y-error-bg); color: var(--a11y-error); font-size: 11px; font-weight: 700; line-height: 18px; text-align: center; box-shadow: 0 1px 2px #0003; }
.a11y-badge.ok { background: var(--a11y-tip-bg); color: var(--a11y-tip); }
dialog.a11y .a11y-sum { display: flex; align-items: center; gap: 4px; margin: 0; padding: 0 14px 8px; font-size: 12px; border-bottom: 1px solid var(--ui-line); }
.a11y-list { overflow: auto; padding: 4px 0 8px; }
.a11y-list h3 { margin: 8px 14px 4px; font-size: 11.5px; font-weight: 600; color: var(--ui-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.a11y-list ul { list-style: none; margin: 0; padding: 0; }
.a11y-item { padding: 2px 8px; }
.a11y-go { display: flex; align-items: flex-start; gap: 8px; width: 100%; padding: 6px; border: 0; border-radius: 6px; background: none; text-align: left; line-height: 1.4; cursor: pointer; }
.a11y-go:hover { background: var(--ui-hover); }
.a11y-sev { flex: none; min-width: 58px; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; text-align: center; }
.a11y-sev.error { background: var(--a11y-error-bg); color: var(--a11y-error); }
.a11y-sev.warning { background: var(--a11y-warning-bg); color: var(--a11y-warning); }
.a11y-sev.tip { background: var(--a11y-tip-bg); color: var(--a11y-tip); }
.a11y-fix { display: flex; gap: 6px; padding: 0 6px 6px 72px; }
.a11y-fix input { flex: 1; min-width: 0; height: 26px; }
.a11y-fix .tb { border: 1px solid var(--ui-line-strong); border-radius: 6px; background: var(--ui-panel); white-space: nowrap; }
.a11y-fix .tb:hover { background: var(--ui-hover); }
@media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
  dialog.a11y { inset: auto 8px max(8px, env(safe-area-inset-bottom)) 8px; width: auto; max-height: 50dvh; }
  .a11y-fix { padding-left: 6px; flex-wrap: wrap; }
}
</style>
