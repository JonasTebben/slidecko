// Offline use: the service worker (sw.template.js) keeps the app's files; this tracks the connection and new versions
import { ref, watchEffect } from 'vue'

export const online = ref(typeof navigator === 'undefined' || navigator.onLine !== false)
if (typeof addEventListener === 'function') {
  addEventListener('online', () => { online.value = true })
  addEventListener('offline', () => { online.value = false })
}
// a class on the page while offline: content from other sites shows why it is missing (CSS in slide.css); exported
// slides do not keep it, the HTML presentation sets it itself
if (typeof document !== 'undefined' && document.documentElement?.classList) watchEffect(() => document.documentElement.classList.toggle('offline-net', !online.value))
export const updateReady = ref(null) // a new version, installed and waiting for applyUpdate()
export const offlineReady = ref(false) // set once, when the app has just become usable offline

export async function registerOffline() {
  const sw = navigator.serviceWorker
  if (!sw || (navigator.connection?.saveData && !sw.controller)) return // data saver: no 5 MB download nobody asked for
  const first = !sw.controller // no earlier version: nothing to update, the app becomes offline-ready
  const reg = await sw.register('sw.js').catch(() => null)
  if (!reg) return
  const follow = w => w?.addEventListener('statechange', () => {
    if (w.state === 'installed' && sw.controller && !first) updateReady.value = w
    if (w.state === 'activated' && first) offlineReady.value = true
  })
  if (reg.waiting && sw.controller) updateReady.value = reg.waiting
  follow(reg.installing)
  reg.addEventListener('updatefound', () => follow(reg.installing))
}
// the new version takes over and the page reloads with it (the project is saved continuously in this browser)
export function applyUpdate() {
  const w = updateReady.value
  if (!w) return
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true })
  w.postMessage('update')
}
