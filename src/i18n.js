// UI translations. The German text is the key; a missing translation falls back to it.
// Add a language: create locales/<code>.js (German → translation) and list it in LOCALES.
import { ref, watch, watchEffect } from 'vue'
import en from './locales/en.js'

export const LOCALES = { de: { name: 'Deutsch', dict: {} }, en: { name: 'English', dict: en } }
const KEY = 'slides-builder:lang'

const pick = () => {
  if (!globalThis.document?.documentElement) return 'de' // node tests assert the German source text
  // a link can choose, ahead of the stored choice, and it is stored like a switch (as on the static pages)
  const url = new URLSearchParams(location.search).get('lang')
  if (LOCALES[url]) { try { localStorage.setItem(KEY, url) } catch {} return url }
  try { const s = localStorage.getItem(KEY); if (LOCALES[s]) return s } catch {}
  const nav = globalThis.navigator?.languages || []
  return nav.map(l => l.slice(0, 2)).find(l => LOCALES[l]) || 'en'
}
export const lang = ref(pick())

if (globalThis.document?.documentElement) {
  watchEffect(() => { document.documentElement.lang = lang.value })
  // a switch is stored; the URL follows it so a reload does not bring back the old ?lang=
  watch(lang, v => {
    try { localStorage.setItem(KEY, v) } catch {}
    const url = new URL(location.href)
    if (url.searchParams.has('lang')) { url.searchParams.set('lang', v); history.replaceState(history.state, '', url) }
  })
}

// t('{0} von {1}', a, b) – reading lang.value makes every caller re-render on switch
export const t = (de, ...args) => (LOCALES[lang.value].dict[de] ?? de).replace(/\{(\d+)\}/g, (_, i) => args[i] ?? '')
