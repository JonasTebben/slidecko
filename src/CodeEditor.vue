<script setup>
// CSS code editor (CodeMirror: line numbers, highlighting, bracket closing, completion), loaded on first use
// so the app's main bundle stays without it
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps({ modelValue: { type: String, default: '' }, label: String })
const emit = defineEmits(['update:modelValue'])
const host = ref()
let view = null
// dark in the system's dark mode, switching live (the rest of the app has no dark mode of its own)
const dark = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
let onScheme = null

onMounted(async () => {
  const [{ EditorView, basicSetup }, { keymap }, { indentWithTab }, { css }, { Compartment }, { oneDark }] = await Promise.all([
    import('codemirror'), import('@codemirror/view'), import('@codemirror/commands'), import('@codemirror/lang-css'),
    import('@codemirror/state'), import('@codemirror/theme-one-dark'),
  ])
  const scheme = new Compartment()
  const look = () => (dark?.matches ? oneDark : [])
  if (!host.value) return // closed while loading
  view = new EditorView({
    parent: host.value,
    doc: props.modelValue,
    extensions: [
      basicSetup, css(), keymap.of([indentWithTab]), scheme.of(look()),
      EditorView.contentAttributes.of({ 'aria-label': props.label || '' }),
      EditorView.updateListener.of(u => { if (u.docChanged) emit('update:modelValue', u.state.doc.toString()) }),
    ],
  })
  onScheme = () => view.dispatch({ effects: scheme.reconfigure(look()) })
  dark?.addEventListener('change', onScheme)
})
// a new value from outside (another theme opened) replaces the text
watch(() => props.modelValue, v => {
  if (view && v !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } })
})
onBeforeUnmount(() => { dark?.removeEventListener('change', onScheme); view?.destroy() })
</script>

<template>
  <!-- Esc stays in the editor (CodeMirror's Esc, Tab leaves it) instead of closing the dialog with unsaved edits -->
  <div ref="host" class="code-editor" @keydown.esc.stop.prevent />
</template>
