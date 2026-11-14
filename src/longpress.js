// iOS Safari never fires contextmenu for touch: holding a finger still opens the app's menus there too.
// Browsers that do fire it on a long press (Android) are noticed on the first one and left alone.
const HOLD = 550, SLOP = 10
let native = false, timer = 0, start = null, fired = false
const clear = () => { clearTimeout(timer); timer = 0 }
// in a field or a text being typed the system's own selection menu stays
const typing = el => el.closest?.('input, textarea, select, [contenteditable="true"]')
const opts = { capture: true }

addEventListener('pointerdown', e => {
  clear(); fired = false
  if (native || e.pointerType !== 'touch' || !e.isPrimary || typing(e.target)) return
  start = e
  timer = setTimeout(() => {
    timer = 0; fired = true
    start.target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, button: 2, clientX: start.clientX, clientY: start.clientY, screenX: start.screenX, screenY: start.screenY }))
  }, HOLD)
}, opts)
addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) > SLOP) clear() }, opts)
addEventListener('pointerup', clear, opts)
addEventListener('pointercancel', clear, opts) // scrolling took over
addEventListener('dragstart', e => { if (fired) e.preventDefault(); else clear() }, opts)
addEventListener('contextmenu', e => {
  if (!e.isTrusted) return
  if (fired) { e.preventDefault(); e.stopImmediatePropagation() } // ours already opened the menu
  else if (timer) { native = true; clear() }
}, opts)
// lifting the finger after the menu opened must not also click what was under it
addEventListener('click', e => { if (fired) { fired = false; e.preventDefault(); e.stopImmediatePropagation() } }, opts)
