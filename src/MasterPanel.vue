<script setup>
import { computed } from 'vue'
import Icon from './Icon.vue'
import SlideView from './SlideView.vue'
import { deck, ui, format } from './store.js'
import { themeLayouts } from './themes.js'
import { FIELDS } from './toSlidev.js'
import * as A from './actions.js'
import { t } from './i18n.js'

// Master and layouts mode (ui.master set): takes the slide list's place; the canvas edits the chosen one's elements
const THUMB = computed(() => 176 / format.w)
const items = computed(() => [{ id: 'master', name: t('Master'), slide: { id: 'master', layout: 'default', elements: deck.master } }, ...deck.layouts.map(l => ({ id: l.id, name: l.name, slide: l }))])
const cur = computed(() => deck.layouts.find(l => l.id === ui.master))
const used = id => deck.slides.filter(s => s.type === id).length
// the theme's layouts; a layout keeps a Slidev layout the theme does not know
const bases = computed(() => { const l = themeLayouts(deck.theme); return cur.value && !l.some(x => x[0] === cur.value.layout) ? [...l, [cur.value.layout, cur.value.layout]] : l })
const sel = A.selection
const isPlaceholder = computed(() => sel.value.length > 0 && sel.value.every(e => e.placeholder))
const setPlaceholder = on => { for (const e of sel.value) if (on) e.placeholder = true; else delete e.placeholder }
const emit = defineEmits(['ask']) // the app's own confirm dialog (App.vue ask), not the browser's
function remove(l) {
  const n = used(l.id)
  emit('ask', n ? t('Delete layout “{0}”? Its {1} slides keep their content and get the default layout.', l.name, n) : t('Delete layout “{0}”?', l.name), () => A.deleteLayout(l.id), t('Delete'))
}
</script>

<template>
  <nav class="slides-panel master-panel" :aria-label="t('Master and layouts')">
    <div class="panel-head">
      <span>{{ t('Master and layouts') }}</span>
      <button class="tb icon small" :title="t('New layout')" :aria-label="t('New layout')" @click="A.addLayout()"><Icon name="plus" :size="16" /></button>
    </div>
    <div class="ms-props">
      <template v-if="cur">
        <label>{{ t('Name') }}<input v-model="cur.name" maxlength="60" /></label>
        <label>{{ t('Slidev layout') }}
          <select :value="cur.layout" @change="A.setLayoutBase(cur, $event.target.value)"><option v-for="[id, n] in bases" :key="id" :value="id">{{ t(n) }}</option></select>
        </label>
        <label class="check"><input type="checkbox" :checked="isPlaceholder" :disabled="!sel.length" @change="setPlaceholder($event.target.checked)" />{{ t('Placeholder: copied into new slides') }}</label>
        <p class="hint">{{ t('Other elements are drawn behind every slide with this layout. Used by {0} slides.', used(cur.id)) }}</p>
        <div class="ms-row">
          <button class="tb small" @click="A.addLayout(cur)"><Icon name="copy" :size="16" />{{ t('Duplicate') }}</button>
          <button class="tb small danger" :disabled="deck.layouts.length < 2" @click="remove(cur)"><Icon name="trash" :size="16" />{{ t('Delete') }}</button>
        </div>
      </template>
      <p v-else class="hint">{{ t('Shown behind every slide. A slide can switch it off in its properties.') }}</p>
      <div class="ms-row">
        <button v-for="(n, k) in FIELDS" :key="k" class="tb small" :title="t('Insert a text box with this field')" @click="A.insertField(k)">+ {{ t(n) }}</button>
      </div>
    </div>
    <div class="slide-list">
      <div v-for="it in items" :key="it.id" class="ms-item">
        <button class="thumb" :style="{ height: Math.round(format.h * THUMB) + 4 + 'px' }" :aria-current="ui.master === it.id" :aria-label="it.name" @click="A.editMaster(it.id)">
          <SlideView :slide="it.slide" :index="ui.slide" :style="{ transform: `scale(${THUMB})` }" inert aria-hidden="true" />
        </button>
        <span class="ms-name">{{ it.name }}</span>
      </div>
      <button class="add-slide" @click="A.addLayout()"><Icon name="plus" :size="16" /> {{ t('New layout') }}</button>
    </div>
    <Teleport defer to=".stage">
      <div class="master-banner" role="status">
        <span>{{ t('Editing master and layouts') }}</span>
        <button class="tb small" @click="ui.master = null">{{ t('Close') }}</button>
      </div>
    </Teleport>
  </nav>
</template>

<style>
.master-panel .ms-props { display: flex; flex-direction: column; gap: 8px; padding: 2px 12px 12px; border-bottom: 1px solid var(--ui-line); font-size: 12px; }
.master-panel .ms-props > label:not(.check) { display: flex; flex-direction: column; gap: 4px; color: var(--ui-muted); }
.master-panel .ms-props .hint { margin: 0; font-size: 11.5px; color: var(--ui-muted); }
.master-panel .ms-row { display: flex; flex-wrap: wrap; gap: 4px; }
.master-panel .ms-item { display: flex; flex-direction: column; gap: 2px; padding: 6px 0 2px 24px; }
.master-panel .ms-name { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.master-banner { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 3; display: flex; align-items: center; gap: 10px; padding: 3px 4px 3px 14px; border: 1px solid var(--ui-accent-line); border-radius: 20px; background: var(--ui-accent-soft); color: var(--ui-fg); font-size: 12.5px; font-weight: 600; white-space: nowrap; }
/* master and layout elements behind a slide are not edited there; placeholders of a layout get a dashed frame */
.stage .el.decor { pointer-events: none; }
.stage .el.placeholder:not(.selected) { outline: calc(1px / var(--s, 1)) dashed var(--ui-line-strong); }
</style>
