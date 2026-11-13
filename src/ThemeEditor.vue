<script setup>
// Theme editor: changes an own theme in place; a built-in theme is never changed, its edits become a new own theme
import { ref, reactive, computed, watch } from 'vue'
import SlideView from './SlideView.vue'
import { t } from './i18n.js'
import { THEMES, FONTS, DRAFT, setDraft, saveTheme, deleteTheme, newThemeId, themeFile, isBuiltin, themeOf } from './themes.js'
import { download } from './actions.js'
import CodeEditor from './CodeEditor.vue'

const emit = defineEmits(['saved', 'deleted'])
const dlg = ref()
const editId = ref(null) // own theme being edited; null: the result is a new theme
const draft = reactive({ name: '', vars: {}, css: '', base: true })
const keep = ref({}) // what the editor does not show (layouts, Slidev package) stays as it was
const sure = ref(false)

const COLORS = [
  ['bg', 'Hintergrund'], ['fg', 'Text'], ['title', 'Überschriften'], ['accent', 'Akzent (Links, Tabellenkopf)'], ['accent-fg', 'Text auf Akzent'],
  ['code-bg', 'Code-Hintergrund'], ['code-fg', 'Code-Text'], ['rule', 'Linie unter dem Titel'], ['bar', 'Titelleiste'], ['bar-fg', 'Text in der Titelleiste'],
  ['cover-bg', 'Titelfolie: Hintergrund'], ['cover-fg', 'Titelfolie: Text'],
]
const WEIGHTS = ['300', '400', '500', '600', '700', '800']
const hex = v => /^#[\da-f]{6}$/i.test(v || '') ? v : /^#[\da-f]{3}$/i.test(v || '') ? '#' + [...v.slice(1)].map(c => c + c).join('') : '#000000'

// from: theme id to start from; own themes are edited, others copied
function open(from) {
  const th = themeOf(from)
  const own = THEMES[from]?.custom && !isBuiltin(from)
  editId.value = own ? from : null
  Object.assign(draft, { name: own ? th.name : t('{0} (eigenes)', t(th.name)), vars: { ...th.vars }, css: th.css || '', base: th.base !== false })
  // a copy is no longer the Slidev package it came from: its changes would not reach the export
  keep.value = { dark: th.dark, layouts: th.layouts, ...(own && { slidev: th.slidev, pkg: th.pkg }) }
  sure.value = false
  dlg.value.showModal()
}
defineExpose({ open })

const theme = () => ({ ...keep.value, name: draft.name, vars: Object.fromEntries(Object.entries(draft.vars).filter(([, v]) => v?.trim())), css: draft.css, base: draft.base })
watch(draft, () => dlg.value?.open && setDraft(theme()), { deep: true })
const valid = computed(() => draft.name.trim() && !Object.values(draft.vars).some(v => /[;{}<>]/.test(v || '')))

function save() {
  const id = saveTheme(editId.value || newThemeId(draft.name), theme())
  dlg.value.close()
  emit('saved', id)
}
function remove() {
  if (!sure.value) return (sure.value = true)
  const id = editId.value
  deleteTheme(id)
  dlg.value.close()
  emit('deleted', id)
}
const exportFile = () => download(new Blob([JSON.stringify(themeFile(editId.value), null, 2) + '\n'], { type: 'application/json' }), `${editId.value}.theme.json`)

const PREVIEWS = computed(() => [
  { layout: 'cover', elements: [
    { id: 'a', type: 'text', title: true, x: 90, y: 170, w: 800, h: 90, html: `<h1>${t('Titel')}</h1>` },
    { id: 'b', type: 'text', x: 90, y: 280, w: 800, h: 50, html: `<h2>${t('Untertitel')}</h2>` },
  ] },
  { layout: 'default', elements: [
    { id: 't', type: 'text', title: true, x: 56, y: 22, w: 868, h: 60, html: `<h1>${t('Titel')}</h1>` },
    { id: 'l', type: 'text', x: 56, y: 120, w: 440, h: 200, html: `<ul><li>${t('Punkt eins')}</li><li>${t('Punkt')} <a href="#">${t('zwei')}</a></li><li><code>code</code></li></ul>` },
    { id: 'c', type: 'code', x: 540, y: 120, w: 380, h: 120, lang: 'js', code: 'const a = 1\nlog(a)' },
    { id: 'g', type: 'table', x: 56, y: 340, w: 500, h: 140, header: true, preset: 'theme', align: ['', '', ''], rows: [['A', 'B', 'C'], ['1', '2', '3'], ['4', '5', '6']] },
  ] },
])
</script>

<template>
  <dialog ref="dlg" class="wide theme-editor" @close="setDraft(null)">
    <form method="dialog" @submit.prevent="valid && save()">
      <h2>{{ editId ? t('Theme bearbeiten') : t('Neues Theme') }}</h2>
      <p v-if="!editId">{{ t('Vorgegebene Themes bleiben unverändert – deine Änderungen werden als eigenes Theme gespeichert.') }}</p>
      <div class="te-body">
        <div class="te-fields">
          <label class="te-row">{{ t('Name') }}<input v-model="draft.name" maxlength="60" required /></label>
          <label v-for="[k, n] in COLORS" :key="k" class="te-row">{{ t(n) }}
            <span class="te-color">
              <input type="color" :value="hex(draft.vars[k])" :aria-label="t(n)" @input="draft.vars[k] = $event.target.value" />
              <input v-model="draft.vars[k]" :placeholder="t('Standard')" :aria-label="t('{0} als CSS-Wert', t(n))" spellcheck="false" />
            </span>
          </label>
          <label class="te-row">{{ t('Schrift') }}
            <select v-model="draft.vars.font"><option :value="undefined">{{ t('Standard') }}</option><option v-for="(f, k) in FONTS" :key="k" :value="f[1]">{{ t(f[0]) }}</option></select>
          </label>
          <label class="te-row">{{ t('Schrift der Überschriften') }}
            <select v-model="draft.vars['heading-font']"><option :value="undefined">{{ t('wie Text') }}</option><option v-for="(f, k) in FONTS" :key="k" :value="f[1]">{{ t(f[0]) }}</option></select>
          </label>
          <label class="te-row">{{ t('Stärke der Überschriften') }}
            <select v-model="draft.vars['heading-weight']"><option :value="undefined">{{ t('Standard') }}</option><option v-for="w in WEIGHTS" :key="w" :value="w">{{ w }}</option></select>
          </label>
          <details class="te-css" :open="!!draft.css">
            <summary>{{ t('Eigenes CSS') }}</summary>
            <p>{{ t('Gilt nur für dieses Theme; & steht für die Folie, z. B. & h1 { … } oder &.layout-cover { … }.') }}</p>
            <CodeEditor v-model="draft.css" :label="t('Eigenes CSS')" />
            <label class="check"><input v-model="draft.base" type="checkbox" /> {{ t('Grundregeln der Themes anwenden (Titelleiste, Titelfolie …)') }}</label>
          </details>
        </div>
        <div class="te-preview" aria-hidden="true">
          <span v-for="(s, i) in PREVIEWS" :key="i" class="te-mini"><SlideView :slide="s" :index="i" :theme="DRAFT" :style="{ transform: 'scale(0.34)' }" inert /></span>
        </div>
      </div>
      <menu>
        <template v-if="editId">
          <button type="button" class="danger" @click="remove">{{ sure ? t('Wirklich löschen?') : t('Löschen') }}</button>
          <button type="button" @click="exportFile">{{ t('Exportieren') }}</button>
        </template>
        <span class="te-gap" />
        <button type="button" @click="dlg.close()">{{ t('Abbrechen') }}</button>
        <button class="primary" type="submit" :disabled="!valid">{{ editId ? t('Speichern') : t('Als eigenes Theme speichern') }}</button>
      </menu>
    </form>
  </dialog>
</template>
