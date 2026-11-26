// a second window for the audience (the projector), run by this app: Vue renders the slide into it (Teleport), so timers,
// quizzes, drawings and the laser are the same state as here. The app's styles are copied over, also those added later
// (lazily loaded parts). onKey gets its keys (F: its own full screen), onClose runs when it is closed
export function openAudience({ title, onKey, onClose, onResize }) {
  const win = window.open('', 'slidecko-audience', 'popup,width=960,height=560')
  if (!win) return null
  const d = win.document
  d.title = title
  d.documentElement.lang = document.documentElement.lang
  const copy = n => d.importNode(n, true)
  d.head.replaceChildren(...[...document.querySelectorAll('style, link[rel=stylesheet]')].map(copy))
  const styles = new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.matches?.('style, link[rel=stylesheet]')) d.head.append(copy(n)) })
  styles.observe(document.head, { childList: true })
  const root = d.createElement('div')
  d.body.style.margin = '0'
  d.body.replaceChildren(root)
  win.addEventListener('keydown', e => {
    if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); return d.fullscreenElement ? d.exitFullscreen() : d.documentElement.requestFullscreen?.().catch(() => {}) }
    onKey(e)
  })
  win.addEventListener('resize', onResize)
  const end = () => { clearInterval(watch); styles.disconnect() }
  const watch = setInterval(() => { if (win.closed) { end(); onClose() } }, 500) // closing it by hand ends the second screen
  return { win, root, close: () => { end(); win.close() } }
}
