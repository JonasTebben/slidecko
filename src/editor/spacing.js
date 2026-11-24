// Equal spacing while moving a box: for two boxes in one row (or column) with a gap between them,
// the moving box can sit after them, before them or centred between them with that same gap.
const span = (e, ax) => (ax === 'x' ? [e.x, e.x + e.w] : [e.y, e.y + e.h])

// others: the boxes that stay; size: the moving box's width (ax 'x') or height (ax 'y').
// Each snap: pos = where the moving box starts on that axis, gaps = the equal gaps to draw, cross = the shared row.
// shortcut: a box lying between the two is not checked, fine for the few boxes on a slide
export function gapSnaps(others, size, ax) {
  const cx = ax === 'x' ? 'y' : 'x', out = []
  for (const a of others) for (const b of others) {
    const [a0, a1] = span(a, ax), [b0, b1] = span(b, ax)
    if (a1 >= b0) continue // a must end before b starts
    const [ac0, ac1] = span(a, cx), [bc0, bc1] = span(b, cx)
    const cross = [Math.max(ac0, bc0), Math.min(ac1, bc1)]
    if (cross[0] >= cross[1]) continue // not side by side
    const g = b0 - a1
    out.push({ pos: b1 + g, gaps: [[a1, b0], [b1, b1 + g]], cross })
    out.push({ pos: a0 - g - size, gaps: [[a0 - g, a0], [a1, b0]], cross })
    if (g > size) { const m = (g - size) / 2; out.push({ pos: a1 + m, gaps: [[a1, a1 + m], [a1 + m + size, b0]], cross }) }
  }
  return out
}

// the closest snap within dist whose row the moving box [c0, c1] shares
export function nearestGap(snaps, pos, [c0, c1], dist) {
  let best = null
  for (const s of snaps) {
    const d = Math.abs(s.pos - pos)
    if (d < dist && c0 < s.cross[1] && c1 > s.cross[0] && (!best || d < best.dist)) best = { ...s, d: s.pos - pos, dist: d }
  }
  return best
}
