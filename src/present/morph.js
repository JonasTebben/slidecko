// Magic move: elements that are the same thing on two slides move, resize and blend from one to the other.
// morphPairs and playMorph use nothing outside themselves: the HTML export embeds them as source (see viewerJs).

// [[idOnA, idOnB], …]: same "Magic move name" first, then the key a duplicated slide keeps, then
// same type and content (text, image, shape kind …), the nearest first
export function morphPairs(a = [], b = []) {
  const text = e => String(e.html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  const kind = e => e.type + ':' + ({ text: text(e), image: e.asset, shape: e.shape, code: e.code, video: e.youtube, table: JSON.stringify(e.rows), quiz: e.question }[e.type] ?? '')
  const pairs = [], left = new Set(a), used = new Set()
  const take = (x, y) => { pairs.push([x.id, y.id]); left.delete(x); used.add(y) }
  for (const key of [e => e.morph, e => e.mid]) {
    for (const x of [...left]) { const y = key(x) && b.find(y => !used.has(y) && key(y) === key(x)); if (y) take(x, y) }
  }
  const far = (x, y) => Math.hypot(x.x + x.w / 2 - y.x - y.w / 2, x.y + x.h / 2 - y.y - y.h / 2)
  // a named element only pairs by its name
  const c = [...left].filter(x => !x.morph).flatMap(x => b.filter(y => !used.has(y) && !y.morph && kind(x) === kind(y)).map(y => [far(x, y), x, y]))
  for (const [, x, y] of c.sort((p, q) => p[0] - q[0])) if (left.has(x) && !used.has(y)) take(x, y)
  return pairs
}

// from: the slide shown before (may be detached, read only), to: the slide now shown (a .slide each, logical units).
// Paired elements fly from their old box to the new one (cross-fading when they look different), the rest fade.
export function playMorph(from, to, pairs, ms = 700) {
  const els = root => new Map([...root.querySelectorAll(':scope > .el[data-el]')].filter(n => !n.matches('[data-unshown], .unshown')).map(n => [n.dataset.el, n]))
  const box = n => ['left', 'top', 'width', 'height'].map(k => parseFloat(n.style[k]) || 0) // inline px: also right for a detached slide
  // the box itself moves and resizes (left/top/width/height), so text reflows instead of being squeezed by a scale
  const at = q => ({ left: q[0] + 'px', top: q[1] + 'px', width: q[2] + 'px', height: q[3] + 'px' })
  const look = n => n.innerHTML + n.className + n.style.cssText.replace(/(left|top|width|height):[^;]*;?/g, '')
  const opt = { duration: ms, easing: 'cubic-bezier(.45, 0, .25, 1)', fill: 'backwards' }
  const fly = (n, k) => n.animate(k, opt)
  // a copy of an element of the old slide, drawn on the new one while it fades
  const ghost = (n, k) => {
    const c = n.cloneNode(true)
    c.removeAttribute('data-el')
    c.style.pointerEvents = 'none'
    to.append(c)
    fly(c, k).finished.then(() => c.remove(), () => c.remove())
  }
  const A = els(from), B = els(to), done = new Set()
  for (const [ia, ib] of pairs) {
    const na = A.get(ia), nb = B.get(ib)
    if (!na || !nb) continue
    done.add(ia).add(ib)
    const pa = box(na), pb = box(nb), same = look(na) === look(nb)
    fly(nb, [{ ...at(pa), opacity: same ? 1 : 0 }, { ...at(pb), opacity: 1 }])
    if (!same) ghost(na, [{ ...at(pa), opacity: 1 }, { ...at(pb), opacity: 0 }])
  }
  // the same element on both (the master's): stays as it is
  for (const [id, n] of A) if (!done.has(id) && !B.has(id)) ghost(n, [{ opacity: 1 }, { opacity: 0 }])
  for (const [id, n] of B) if (!done.has(id) && !A.has(id)) fly(n, [{ opacity: 0 }, { opacity: 1 }])
}

// from/to: the two .slide roots, a/b: the slides' data; with reduced motion nothing flies, everything only fades
export function morphSlides(from, to, a, b) {
  if (!from || !to || from === to || !to.animate) return
  playMorph(from, to, matchMedia('(prefers-reduced-motion: reduce)').matches ? [] : morphPairs(a?.elements, b?.elements))
}
