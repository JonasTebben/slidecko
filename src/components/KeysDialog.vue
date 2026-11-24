<script setup>
import { ref, computed, nextTick } from 'vue'
import { t } from '../core/i18n.js'
import { DEFAULTS, PRESENT_LABELS, overrides, keyOf, kbd, setKey, resetKeys, comboOf, problem, conflictOf, format } from '../core/keys.js'

// Keyboard shortcuts (View menu, ⌘K): every command with its key; "Change" records the next combination
const props = defineProps({ commands: { type: Array, required: true } }) // [label, action, id] of the editor
const dlg = ref(), q = ref('')
const recording = ref(null), pending = ref(null), msg = ref('')
const labelOf = id => (PRESENT_LABELS[id] ? t(PRESENT_LABELS[id]) : props.commands.find(c => c[2] === id)?.[0] || id)
const sections = computed(() => {
  const w = q.value.toLowerCase().split(/\s+/).filter(Boolean)
  const hit = id => w.every(x => labelOf(id).toLowerCase().includes(x) || kbd(id).toLowerCase() === x)
  const editor = [...new Set(props.commands.map(c => c[2]).filter(id => id in DEFAULTS))]
  return [[t('Editor'), editor.filter(hit)], [t('While presenting'), Object.keys(PRESENT_LABELS).filter(hit)]].filter(s => s[1].length)
})
const changed = id => id in overrides.value

function open() { q.value = ''; stop(); dlg.value.returnValue = ''; dlg.value.showModal() }
function stop(text = '') { recording.value = null; pending.value = null; msg.value = text }
function record(id) {
  stop()
  recording.value = id
  msg.value = t('Press the new keys for “{0}”. Esc cancels, Backspace removes the shortcut.', labelOf(id))
}
function assign(id, spec) {
  setKey(id, spec)
  stop(spec ? t('“{0}” is now {1}.', labelOf(id), kbd(id)) : t('“{0}” has no shortcut now.', labelOf(id)))
  nextTick(() => dlg.value?.querySelector(`[data-key="${id}"]`)?.focus())
}
function replace() {
  const { id, spec, other } = pending.value
  setKey(other, '')
  assign(id, spec)
}
// capture phase: while recording no key reaches the dialog (Esc would close it) or the editor's shortcuts
function onKey(e) {
  const id = recording.value
  if (!id || e.key === 'Tab') return
  e.preventDefault()
  e.stopPropagation()
  const plain = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey
  if (e.key === 'Escape') return stop(t('Not changed.'))
  if (plain && (e.key === 'Backspace' || e.key === 'Delete')) return assign(id, '')
  const spec = comboOf(e)
  if (!spec) return // a modifier alone: wait for the key
  const why = problem(id, spec)
  if (why) { msg.value = why; return }
  const other = conflictOf(overrides.value, id, spec)
  if (!other) return assign(id, spec)
  recording.value = null
  pending.value = { id, spec, other }
  msg.value = t('{0} is already used by “{1}”. Replace it?', format(spec), labelOf(other))
  nextTick(() => dlg.value?.querySelector('.keys-replace')?.focus())
}
defineExpose({ open })
</script>

<template>
  <dialog ref="dlg" class="keys-dlg wide" aria-labelledby="keys-title" @keydown.capture="onKey" @close="stop()">
    <h2 id="keys-title">{{ t('Keyboard shortcuts') }}</h2>
    <input v-model="q" type="search" class="keys-search" :placeholder="t('Search shortcuts …')" :aria-label="t('Search shortcuts')" />
    <div class="keys-list">
      <section v-for="[name, ids] in sections" :key="name" :aria-label="name">
        <h3>{{ name }}</h3>
        <ul>
          <li v-for="id in ids" :key="id" :class="{ rec: recording === id }">
            <span class="keys-name">{{ labelOf(id) }}</span>
            <kbd v-if="keyOf(id)">{{ kbd(id) }}</kbd><span v-else class="keys-none">{{ t('none') }}</span>
            <button type="button" :data-key="id" :aria-pressed="recording === id" :aria-label="t('Change shortcut for “{0}”', labelOf(id))" @click="recording === id ? stop(t('Not changed.')) : record(id)">{{ recording === id ? t('Press keys …') : t('Change') }}</button>
            <button v-if="changed(id)" type="button" :aria-label="t('Reset “{0}”', labelOf(id))" :title="DEFAULTS[id] ? format(DEFAULTS[id]) : t('none')" @click="setKey(id, DEFAULTS[id]); stop()">{{ t('Reset') }}</button>
          </li>
        </ul>
      </section>
      <p v-if="!sections.length" class="keys-none">{{ t('No command found') }}</p>
    </div>
    <p class="keys-msg" role="status" aria-live="polite">{{ msg }}</p>
    <div v-if="pending" class="keys-ask">
      <button type="button" class="primary keys-replace" @click="replace">{{ t('Replace') }}</button>
      <button type="button" @click="stop(t('Not changed.'))">{{ t('Cancel') }}</button>
    </div>
    <menu>
      <button type="button" :disabled="!Object.keys(overrides).length" @click="resetKeys(); stop(t('All shortcuts are back to their defaults.'))">{{ t('Reset all') }}</button>
      <button type="button" class="primary" @click="dlg.close()">{{ t('Close') }}</button>
    </menu>
  </dialog>
</template>

<style scoped>
.keys-search { width: 100%; height: 36px; margin: 6px 0 10px; }
.keys-list { max-height: min(60vh, 520px); overflow: auto; margin: 0 -6px; padding: 0 6px; }
h3 { font-size: 13px; margin: 12px 0 4px; color: var(--ui-muted); }
ul { list-style: none; margin: 0; padding: 0; }
li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 5px 6px; border-radius: 6px; }
li:hover, li.rec { background: var(--ui-hover); }
.keys-name { flex: 1 1 12em; min-width: 0; }
kbd, .keys-none { font-size: 12px; color: var(--ui-muted); }
li button, .keys-ask button { height: 28px; padding: 0 10px; border: 1px solid var(--ui-line-strong); border-radius: 6px; cursor: pointer; }
li button, .keys-ask button:not(.primary) { background: var(--ui-panel); color: inherit; }
li.rec button[aria-pressed=true] { border-color: var(--ui-accent); font-weight: 600; }
.keys-msg { min-height: 1.5em; margin: 10px 0 0; }
.keys-ask { display: flex; gap: 8px; }
</style>
