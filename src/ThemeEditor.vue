<script setup>
// Theme editor: changes an own theme in place; a built-in theme is never changed, its edits become a new own theme
import { ref, reactive, computed, watch } from 'vue'
import SlideView from './SlideView.vue'
import { t } from './i18n.js'
import { THEMES, DRAFT, setDraft, saveTheme, deleteTheme, newThemeId, themeFile, isBuiltin, themeOf, containedCss, LAYOUTS } from './themes.js'
import { download } from './actions.js'
import CodeEditor from './CodeEditor.vue'
import FontOptions from './FontOptions.vue'

const emit = defineEmits(['saved', 'deleted'])
const dlg = ref()
const editId = ref(null) // own theme being edited; null: the result is a new theme
const draft = reactive({ name: '', vars: {}, css: '', base: true })
const keep = ref({}) // what the editor does not show (layouts, Slidev package) stays as it was
const sure = ref(false)

const COLORS = [
  ['bg', 'Background'], ['fg', 'Text'], ['title', 'Headings'], ['accent', 'Accent (links, table header)'], ['accent-fg', 'Text on accent'],
  ['code-bg', 'Code background'], ['code-fg', 'Code text'], ['rule', 'Line below the title'], ['bar', 'Title bar'], ['bar-fg', 'Text in the title bar'],
  ['cover-bg', 'Title slide: background'], ['cover-fg', 'Title slide: text'],
]
// what own CSS can address: selectors that exist in the editor and in every export
const VARS = [...COLORS, ['font', 'Font'], ['heading-font', 'Heading font'], ['heading-weight', 'Heading weight']]
const PARTS = [
  ['h1', 'Title'], ['h2', 'Subtitle'], ['p', 'Paragraph'], ['ul, ol, li', 'Lists'], ['a', 'Links'], [':not(pre) > code', 'Inline code'],
  ['pre', 'Code block'], ['blockquote', 'Quote'], ['th', 'Table header'], ['td', 'Table cells'], ['[data-callout]', 'Callouts'], ['.pageno', 'Slide number'],
]
const WEIGHTS = ['300', '400', '500', '600', '700', '800']
const hex = v => /^#[\da-f]{6}$/i.test(v || '') ? v : /^#[\da-f]{3}$/i.test(v || '') ? '#' + [...v.slice(1)].map(c => c + c).join('') : '#000000'

// from: theme id to start from; own themes are edited, others copied
function open(from) {
  const th = themeOf(from)
  const own = THEMES[from]?.custom && !isBuiltin(from)
  editId.value = own ? from : null
  Object.assign(draft, { name: own ? th.name : t('{0} (own)', t(th.name)), vars: { ...th.vars }, css: th.css || '', base: th.base !== false })
  // a copy is no longer the Slidev package it came from: its changes would not reach the export
  keep.value = { dark: th.dark, layouts: th.layouts, ...(own && { slidev: th.slidev, pkg: th.pkg }) }
  sure.value = false
  dlg.value.showModal()
}
defineExpose({ open })

const theme = () => ({ ...keep.value, name: draft.name, vars: Object.fromEntries(Object.entries(draft.vars).filter(([, v]) => v?.trim())), css: draft.css, base: draft.base })
watch(draft, () => dlg.value?.open && setDraft(theme()), { deep: true })
// unbalanced CSS would leak into the app, saveTheme refuses it
const valid = computed(() => draft.name.trim() && containedCss(draft.css || '') && !Object.values(draft.vars).some(v => /[;{}<>]/.test(v || '')))

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
    { id: 'a', type: 'text', title: true, x: 90, y: 170, w: 800, h: 90, html: `<h1>${t('Title')}</h1>` },
    { id: 'b', type: 'text', x: 90, y: 280, w: 800, h: 50, html: `<h2>${t('Subtitle')}</h2>` },
  ] },
  { layout: 'default', elements: [
    { id: 't', type: 'text', title: true, x: 56, y: 22, w: 868, h: 60, html: `<h1>${t('Title')}</h1>` },
    { id: 'l', type: 'text', x: 56, y: 120, w: 440, h: 200, html: `<ul><li>${t('Item one')}</li><li>${t('Item')} <a href="#">${t('two')}</a></li><li><code>code</code></li></ul>` },
    { id: 'c', type: 'code', x: 540, y: 120, w: 380, h: 120, lang: 'js', code: 'const a = 1\nlog(a)' },
    { id: 'g', type: 'table', x: 56, y: 340, w: 500, h: 140, header: true, preset: 'theme', align: ['', '', ''], rows: [['A', 'B', 'C'], ['1', '2', '3'], ['4', '5', '6']] },
  ] },
])
</script>

<template>
  <dialog ref="dlg" class="wide theme-editor" @close="setDraft(null)">
    <form method="dialog" @submit.prevent="valid && save()">
      <h2>{{ editId ? t('Edit theme') : t('New theme') }}</h2>
      <p v-if="!editId">{{ t('Built-in themes stay unchanged – your changes are saved as an own theme.') }}</p>
      <div class="te-body">
        <div class="te-fields">
          <label class="te-row">{{ t('Name') }}<input v-model="draft.name" maxlength="60" required autofocus /></label>
          <label v-for="[k, n] in COLORS" :key="k" class="te-row">{{ t(n) }}
            <span class="te-color">
              <input type="color" :value="hex(draft.vars[k])" :aria-label="t(n)" @input="draft.vars[k] = $event.target.value" />
              <input v-model="draft.vars[k]" :placeholder="t('Default')" :aria-label="t('{0} as CSS value', t(n))" spellcheck="false" />
            </span>
          </label>
          <label class="te-row">{{ t('Font') }}
            <select v-model="draft.vars.font"><option :value="undefined">{{ t('Default') }}</option><FontOptions stacks /></select>
          </label>
          <label class="te-row">{{ t('Heading font') }}
            <select v-model="draft.vars['heading-font']"><option :value="undefined">{{ t('same as text') }}</option><FontOptions stacks /></select>
          </label>
          <label class="te-row">{{ t('Heading weight') }}
            <select v-model="draft.vars['heading-weight']"><option :value="undefined">{{ t('Default') }}</option><option v-for="w in WEIGHTS" :key="w" :value="w">{{ w }}</option></select>
          </label>
          <details class="te-css" :open="!!draft.css">
            <summary>{{ t('Custom CSS') }}</summary>
            <p>{{ t('Applies to this theme only; & stands for the slide, e.g. & h1 { … } or &.layout-cover { … }.') }}</p>
            <details class="te-ref">
              <summary>{{ t('What you can style') }}</summary>
              <p>{{ t('The fields above set these variables. Use them with var(--accent) or set them in & { … }.') }}</p>
              <dl>
                <dt>{{ t('Variables') }}</dt>
                <dd v-for="[k, n] in VARS" :key="k"><code>--{{ k }}</code> {{ t(n) }}</dd>
                <dt>{{ t('Layouts') }}</dt>
                <dd v-for="[k, n] in [...LAYOUTS, ...(keep.layouts || [])]" :key="k"><code>&amp;.layout-{{ k }}</code> {{ t(n) }}</dd>
                <dt>{{ t('Elements') }}</dt>
                <dd v-for="[k, n] in PARTS" :key="k"><code>&amp; {{ k }}</code> {{ t(n) }}</dd>
              </dl>
            </details>
            <CodeEditor v-model="draft.css" :label="t('Custom CSS')" />
            <label class="check"><input v-model="draft.base" type="checkbox" /> {{ t('Apply the common theme rules (title bar, title slide …)') }}</label>
          </details>
        </div>
        <div class="te-preview" aria-hidden="true">
          <span v-for="(s, i) in PREVIEWS" :key="i" class="te-mini"><SlideView :slide="s" :index="i" :theme="DRAFT" :style="{ transform: 'scale(0.34)' }" inert /></span>
        </div>
      </div>
      <menu>
        <template v-if="editId">
          <button type="button" class="danger" @click="remove">{{ sure ? t('Really delete?') : t('Delete') }}</button>
          <button type="button" @click="exportFile">{{ t('Export') }}</button>
        </template>
        <span class="te-gap" />
        <button type="button" @click="dlg.close()">{{ t('Cancel') }}</button>
        <button class="primary" type="submit" :disabled="!valid">{{ editId ? t('Save') : t('Save as own theme') }}</button>
      </menu>
    </form>
  </dialog>
</template>
