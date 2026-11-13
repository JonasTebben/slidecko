// UI state of this tab that a reload should bring back and the URL does not hold (overview, project and slide are
// in the hash, see viewHash): selection, folded decks, scroll position of the slide list, the search text and whether
// YouTube was allowed. project and slide are kept only to tell which project and slide the selection belongs to.
// sessionStorage: survives a reload, a new tab starts fresh. Nothing here leaves the browser.
const KEY = 'slides-builder:session'

export function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(KEY)) || {} } catch { return {} }
}
export function saveSession(s) {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode or full storage: nothing to restore then */ }
}

// the selection is kept as element positions on the slide, not ids: untouched imported slides are measured
// afresh after loading and get new element ids, in the same order
export const selIndexes = (slide, sel) => sel.map(id => slide?.elements.findIndex(e => e.id === id)).filter(i => i >= 0)
export const selIds = (slide, indexes) => indexes.map(i => slide?.elements[i]?.id).filter(Boolean)

// the saved view, checked against the project as it is now (slides or decks may be gone)
export function sessionView(s, deck) {
  if (!deck.id || s.project !== deck.id) return null
  const slide = Math.max(0, Math.min(Number.isInteger(s.slide) ? s.slide : 0, deck.slides.length - 1))
  const files = new Set(deck.slides.map(x => x.file || deck.entry))
  return {
    slide,
    sel: (Array.isArray(s.sel) ? s.sel : []).filter(i => Number.isInteger(i) && i >= 0),
    collapsed: (Array.isArray(s.collapsed) ? s.collapsed : []).filter(f => files.has(f)),
    listTop: Number(s.listTop) || 0,
  }
}

// the view in the URL hash, so reload, links and the browser's back and forward bring it back:
// #home = project overview, #<project>/<slide no.>; no or another hash = no view (the app opens the last project)
export const viewHash = (home, project, slide) => (home || !project ? '#home' : `#${project}/${slide + 1}`)
export function parseViewHash(hash) {
  if (hash === '#home') return { home: true }
  const m = /^#([a-z0-9]+)\/(\d+)$/.exec(hash)
  return m ? { project: m[1], slide: Math.max(0, Number(m[2]) - 1) } : null
}
