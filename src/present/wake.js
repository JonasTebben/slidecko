// keeps the screen on while presenting (iPads dim and lock mid-talk otherwise); the browser drops the lock when the
// page is hidden, so it is taken again on return. Without the Wake Lock API (older Safari) nothing happens
let lock = null, want = false
const take = async () => { try { lock = await navigator.wakeLock?.request('screen') } catch { lock = null } }
export function stayAwake(on) {
  want = on
  if (on && (!lock || lock.released)) return take()
  if (!on) { lock?.release().catch(() => {}); lock = null }
}
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', () => { if (want && document.visibilityState === 'visible') take() })
