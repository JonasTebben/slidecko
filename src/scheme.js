// Light/dark UI: the user's choice (system, light, dark), remembered per browser. The effective scheme
// lands on <html data-scheme="light|dark">, which app.css reads; slides keep their own colours.
import { ref, computed, watchEffect } from 'vue'

const KEY = 'slides-builder:scheme'
export const SCHEMES = [['system', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']]
const read = () => { try { const s = localStorage.getItem(KEY); if (SCHEMES.some(x => x[0] === s)) return s } catch {} return 'system' }
export const scheme = ref(read())

const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
const systemDark = ref(!!media?.matches)
media?.addEventListener('change', e => { systemDark.value = e.matches })
export const isDark = computed(() => scheme.value === 'dark' || (scheme.value === 'system' && systemDark.value))

// runs once right away (main.js imports this before mounting), so the first paint has the right scheme
if (globalThis.document?.documentElement) watchEffect(() => {
  document.documentElement.dataset.scheme = isDark.value ? 'dark' : 'light'
  try { localStorage.setItem(KEY, scheme.value) } catch {}
})
