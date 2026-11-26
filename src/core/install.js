// Slidecko as an app on the home screen: Chromium browsers (Chrome, Edge, Samsung Internet) offer their install prompt,
// on iPhone and iPad only Safari's "Add to Home Screen" is described (other iOS browsers name themselves in the user
// agent; one that looks exactly like Safari gets the Safari steps). The start page offers it once; a dismissal or an
// installation is remembered, the command "Install as app" stays available
import { ref } from 'vue'

export const INSTALL_KEY = 'slides-builder:install-hint' // 'done': the start page stops offering it
let deferred = null
export const canPrompt = ref(false)
if (typeof addEventListener === 'function') {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; canPrompt.value = true })
  addEventListener('appinstalled', () => { canPrompt.value = false; dismissInstall() })
}
export const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
export const iosSafari = (ua = navigator.userAgent, nav = navigator) =>
  (/iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)) && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo|Brave/.test(ua)
export const installDismissed = ref((() => { try { return localStorage.getItem(INSTALL_KEY) === 'done' } catch { return false } })())
export function dismissInstall() { installDismissed.value = true; try { localStorage.setItem(INSTALL_KEY, 'done') } catch {} }
// the browser's own install dialog; false when it has none to offer
export async function promptInstall() {
  if (!deferred) return false
  deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  canPrompt.value = false
  if (outcome === 'accepted') dismissInstall()
  return true
}
