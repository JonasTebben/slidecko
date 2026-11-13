<script setup>
import { ref, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'

// Dropdown on the native Popover API: top layer, light dismiss and Esc for free.
// manual (context menu): no light dismiss, it stays open while the pointer moves or scrolls;
// Esc or a left click outside closes it (that click still does its own job)
const props = defineProps({ label: String, icon: String, title: String, primary: Boolean, wide: Boolean, manual: Boolean })
const pop = ref(), btn = ref()
let at = null // context menu: the pointer position instead of the button
const open = ref(false) // slot prop: heavy content (previews) renders only while open
const keep = ref(false) // keep the focus where it is (a code editor that ends on blur): items don't take it either
const id = 'menu-' + Math.random().toString(36).slice(2)

const escape = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); pop.value?.hidePopover() } }
const outside = e => { if (e.button === 0 && !pop.value?.contains(e.target)) pop.value.hidePopover() }
const listen = on => {
  const f = on ? addEventListener : removeEventListener
  f('keydown', escape, true)
  f('pointerdown', outside, true)
}
onBeforeUnmount(() => listen(false))
function place(e) {
  open.value = e.newState === 'open'
  if (props.manual) listen(open.value)
  if (!open.value) return
  const r = at ? { left: at.x, bottom: at.y } : btn.value.getBoundingClientRect(), p = pop.value
  p.style.top = Math.max(8, Math.min(r.bottom + (at ? 0 : 6), innerHeight - p.offsetHeight - 8)) + 'px'
  p.style.left = Math.max(8, Math.min(r.left, innerWidth - p.offsetWidth - 8)) + 'px'
  at = null
  if (!keep.value) p.querySelector('button:not(:disabled), [tabindex="0"]')?.focus()
}
// any item closes the menu, except controls marked data-keep
function clicked(e) {
  if (e.target.closest('button, label, [role="menuitem"]') && !e.target.closest('[data-keep]')) pop.value.hidePopover()
}
function keys(e) {
  const items = [...pop.value.querySelectorAll('button:not(:disabled), label.mi')]
  const i = items.indexOf(document.activeElement)
  const d = { ArrowDown: 1, ArrowUp: -1 }[e.key]
  if (d) { e.preventDefault(); items[(i + d + items.length) % items.length]?.focus() }
}
defineExpose({
  close: () => pop.value?.hidePopover(),
  openAt(x, y, keepFocus = false) { pop.value.hidePopover(); at = { x, y }; keep.value = keepFocus; pop.value.showPopover() },
})
</script>

<template>
  <button v-if="label || icon" ref="btn" class="tb" :class="{ primary }" :popovertarget="id" :title="title" :aria-label="label || title">
    <Icon v-if="icon" :name="icon" />
    <span v-if="label">{{ label }}</span>
    <Icon name="chevron" :size="14" class="chev" />
  </button>
  <div :id="id" ref="pop" :popover="manual ? 'manual' : 'auto'" class="menu" :class="{ wide }" @mousedown="keep && $event.preventDefault()" @toggle="place" @click="clicked" @keydown="keys">
    <slot :open="open" />
  </div>
</template>
