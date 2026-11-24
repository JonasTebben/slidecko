<script setup>
// Icon picker (loaded on first open): search the bundled Iconify sets by name or alias, pick with mouse or keyboard.
// Inserts an icon element, or changes the one in picker.target. Only the first results are drawn: a few hundred SVGs stay quick.
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { ICON_SETS, picker, loadSet, searchIcons, iconIn, iconSvg, iconSet } from './icons.js'
import { cleanEl, W, H } from './store.js'
import { slide, addElement, toast } from './actions.js'
import { t } from './i18n.js'

const LIMIT = 240
const SET_KEY = 'slides-builder:icon-set'
const dlg = ref(), grid = ref(), input = ref()
const target = computed(() => picker.target && slide.value?.elements.find(e => e.id === picker.target))
const initial = (() => { try { return localStorage.getItem(SET_KEY) } catch { return null } })()
const set = ref(iconSet(target.value?.icon) || (ICON_SETS[initial] || initial === 'all' ? initial : 'lucide'))
const query = ref('')
const loaded = ref({}) // prefix -> set data
const loading = ref(false)

watch(set, async v => {
  try { localStorage.setItem(SET_KEY, v) } catch { /* private mode: not remembered */ }
  loading.value = true
  try {
    for (const k of v === 'all' ? Object.keys(ICON_SETS) : [v]) if (!loaded.value[k]) loaded.value = { ...loaded.value, [k]: await loadSet(k) }
  } catch (e) { toast(t('Error: {0}', e.message)) } finally { loading.value = false }
}, { immediate: true })

// [{ id: 'set:name', body, view }] of the chosen set(s)
const results = computed(() => {
  const keys = set.value === 'all' ? Object.keys(ICON_SETS) : [set.value]
  const out = []
  for (const k of keys) {
    const data = loaded.value[k]
    if (data) for (const n of searchIcons(data, query.value, LIMIT)) out.push({ id: `${k}:${n}`, ...iconIn(data, n) })
  }
  return query.value.trim() && keys.length > 1 ? out.sort((a, b) => a.id.length - b.id.length).slice(0, LIMIT) : out.slice(0, LIMIT)
})

function choose(r) {
  if (target.value) Object.assign(target.value, { icon: r.id, body: cleanEl({ type: 'icon', icon: r.id, body: r.body }).body, view: r.view })
  else {
    const el = cleanEl({ type: 'icon', icon: r.id, body: r.body, view: r.view, x: Math.round(W / 2 - 60), y: Math.round(H / 2 - 60), w: 120, h: 120 })
    if (el) addElement(el)
  }
  dlg.value.close()
}
// arrow keys move through the grid (a row: the buttons on the same line), Down from the search field enters it
function gridKey(e) {
  const btns = [...grid.value.querySelectorAll('button')], i = btns.indexOf(document.activeElement)
  if (i < 0) return
  const cols = btns.filter(b => b.offsetTop === btns[0].offsetTop).length
  const to = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: btns.length - 1 }[e.key]
  if (to == null) return
  e.preventDefault()
  if (to < 0 && e.key === 'ArrowUp') return input.value.focus()
  btns[Math.max(0, Math.min(btns.length - 1, to))].focus()
}
function inputKey(e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); grid.value.querySelector('button')?.focus() }
  if (e.key === 'Enter') { e.preventDefault(); if (results.value[0]) choose(results.value[0]) }
}
onMounted(() => { dlg.value.showModal(); nextTick(() => input.value.focus()) })
</script>

<template>
  <dialog ref="dlg" class="wide icon-picker" :aria-label="target ? t('Change icon') : t('Insert icon')" @close="Object.assign(picker, { open: false, target: null })">
    <h2>{{ target ? t('Change icon') : t('Insert icon') }}</h2>
    <div class="ip-bar">
      <input ref="input" v-model="query" type="search" :placeholder="t('Search icons (e.g. “home”, “arrow right”)')" :aria-label="t('Search icons')" @keydown="inputKey" />
      <select v-model="set" :aria-label="t('Icon set')">
        <option v-for="(s, k) in ICON_SETS" :key="k" :value="k">{{ s.name }}</option>
        <option value="all">{{ t('All sets') }}</option>
      </select>
    </div>
    <p class="ip-status" aria-live="polite">{{ loading ? t('Loading icons …') : results.length >= LIMIT ? t('First {0} icons – refine the search for more.', LIMIT) : results.length ? t('{0} icons', results.length) : t('No icon found') }}</p>
    <div ref="grid" class="ip-grid" role="group" :aria-label="t('Icons')" @keydown="gridKey">
      <button v-for="r in results" :key="r.id" type="button" class="ip-icon" :class="{ on: target?.icon === r.id }" :title="r.id" :aria-label="r.id" @click="choose(r)" v-html="iconSvg(r)" />
    </div>
    <p class="ip-note">{{ t('Icons from Lucide (ISC), Tabler (MIT), Material Design Icons (Apache 2.0), Carbon (Apache 2.0) and Phosphor (MIT), bundled with the app.') }}</p>
    <menu><button type="button" @click="dlg.close()">{{ t('Cancel') }}</button></menu>
  </dialog>
</template>

<style>
.icon-picker .ip-bar { display: flex; gap: 8px; }
.icon-picker .ip-bar input { flex: 1; min-width: 0; height: 36px; }
.icon-picker .ip-bar select { width: auto; max-width: 45%; }
.icon-picker .ip-status { margin: 8px 0 6px; font-size: 13px; }
.icon-picker .ip-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(48px, 1fr)); gap: 4px; height: min(380px, 50vh); overflow-y: auto; align-content: start; padding: 2px; }
.icon-picker .ip-icon { display: grid; place-items: center; aspect-ratio: 1; padding: 10px; border: 1px solid transparent; border-radius: 8px; background: none; color: var(--ui-fg); cursor: pointer; }
.icon-picker .ip-icon:hover { background: var(--ui-hover); }
.icon-picker .ip-icon:focus-visible, .icon-picker .ip-icon.on { border-color: var(--ui-accent); background: var(--ui-accent-soft); }
.icon-picker .ip-icon svg { width: 100%; height: 100%; }
.icon-picker .ip-note { margin: 8px 0 0; font-size: 12px; }
</style>
