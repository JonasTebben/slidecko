<script setup>
// O while presenting (Slidev's overview): every slide as a thumbnail; arrows, Enter, a typed number or a click jump there
import { ref, computed, onMounted, nextTick } from 'vue'
import Icon from './Icon.vue'
import SlideView from './SlideView.vue'
import { t } from './i18n.js'
import { deck, format, ui } from './store.js'
import { gridMove } from './recording.js'

const emit = defineEmits(['go', 'close'])
const dlg = ref(), grid = ref(), at = ref(ui.slide), typed = ref('')
// phones: two columns across the screen, elsewhere 200 px thumbnails
const w = Math.min(200, Math.floor((innerWidth - 96) / 2)) // 96: dialog margins and padding, the gap, the thumb borders
const scale = computed(() => w / format.w)
const thumbs = () => [...grid.value.children]
const focusAt = i => { at.value = i; thumbs()[i]?.focus(); thumbs()[i]?.scrollIntoView({ block: 'nearest' }) }
// the column count comes from the layout: items that share the first one's top edge
const cols = () => { const ts = thumbs(); return Math.max(1, ts.filter(x => x.offsetTop === ts[0].offsetTop).length) }
let typedTimer = 0
function key(e) {
  if (/^[0-9]$/.test(e.key)) {
    typed.value += e.key
    clearTimeout(typedTimer)
    typedTimer = setTimeout(() => { typed.value = '' }, 2000)
    const n = +typed.value - 1
    if (n >= 0 && n < deck.slides.length) focusAt(n)
    return e.preventDefault()
  }
  if (e.key === 'Enter') { e.preventDefault(); return emit('go', typed.value ? Math.min(deck.slides.length, Math.max(1, +typed.value)) - 1 : at.value) }
  if (e.key === 'Escape' || e.key.toLowerCase() === 'o' || e.key.toLowerCase() === 'g') { e.preventDefault(); return emit('close') }
  const to = gridMove(at.value, e.key, cols(), deck.slides.length)
  if (to !== at.value || /^(Arrow|Home|End|Page)/.test(e.key)) { e.preventDefault(); focusAt(to) }
}
onMounted(async () => { dlg.value.showModal(); await nextTick(); focusAt(at.value) })
</script>

<template>
  <!-- keys and clicks stay in here: the presenter behind would turn the slide or end the talk -->
  <dialog ref="dlg" class="pv-overview" :aria-label="t('Slide overview')" @keydown.stop="key" @click.stop="e => e.target === dlg && emit('close')" @cancel.prevent="emit('close')">
    <header>
      <h2>{{ t('Slide overview') }}</h2>
      <span class="pv-ov-hint" aria-live="polite">{{ typed ? t('Slide {0}', typed) : t('Arrow keys, Enter or a slide number') }}</span>
      <button class="tb icon small" :title="t('Close') + ' (Esc)'" :aria-label="t('Close')" @click="emit('close')"><Icon name="x" :size="16" /></button>
    </header>
    <div ref="grid" class="pv-ov-grid" :style="{ gridTemplateColumns: `repeat(auto-fill, ${w + 4}px)` }">
      <button v-for="(s, i) in deck.slides" :key="s.id" class="thumb" :class="{ 'is-hidden': s.hidden }" :tabindex="i === at ? 0 : -1"
        :style="{ width: w + 4 + 'px', height: Math.round(format.h * scale) + 4 + 'px' }" :aria-current="i === ui.slide"
        :aria-label="t('Slide {0}', i + 1) + (s.hidden ? ` (${t('hidden')})` : '') + (i === ui.slide ? ` (${t('current')})` : '')"
        @click="emit('go', i)" @focus="at = i">
        <SlideView :slide="s" :index="i" :style="{ transform: `scale(${scale})` }" inert aria-hidden="true" />
        <span class="pv-ov-num" aria-hidden="true">{{ i + 1 }}</span>
        <span v-if="s.hidden" class="hidden-badge" aria-hidden="true"><Icon name="eyeOff" :size="14" /></span>
      </button>
    </div>
  </dialog>
</template>
