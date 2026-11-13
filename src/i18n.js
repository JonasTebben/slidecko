// UI translations. The German text is the key; a missing translation falls back to it.
// Add a language: create locales/<code>.js (German → translation) and list it in LOCALES.
import { ref, watchEffect } from 'vue'
import en from './locales/en.js'

export const LOCALES = { de: { name: 'Deutsch', dict: {} }, en: { name: 'English', dict: en } }
const KEY = 'slides-builder:lang'

const pick = () => {
  if (!globalThis.document?.documentElement) return 'de' // node tests assert the German source text
  try { const s = localStorage.getItem(KEY); if (LOCALES[s]) return s } catch {}
  const nav = globalThis.navigator?.languages || []
  return nav.map(l => l.slice(0, 2)).find(l => LOCALES[l]) || 'en'
}
export const lang = ref(pick())

if (globalThis.document?.documentElement) watchEffect(() => {
  document.documentElement.lang = lang.value
  try { localStorage.setItem(KEY, lang.value) } catch {}
})

// t('{0} von {1}', a, b) – reading lang.value makes every caller re-render on switch
export const t = (de, ...args) => (LOCALES[lang.value].dict[de] ?? de).replace(/\{(\d+)\}/g, (_, i) => args[i] ?? '')
