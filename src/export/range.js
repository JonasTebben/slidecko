// slides to export, written like Slidev's --range and print dialogs: "1, 6-8, 10" (numbers as in the slide list,
// from 1). Returns the 0-based indexes in order, [] for an empty field (all slides), null when it cannot be read
export function parseRange(text, count) {
  const parts = String(text || '').split(/[,;\s]+/).filter(Boolean)
  const out = new Set()
  for (const p of parts) {
    const m = p.match(/^(\d+)(?:[-–—](\d+)?)?$/) // "8-" runs to the last slide
    if (!m) return null
    const a = +m[1], b = m[2] ? +m[2] : p.length > m[1].length ? count : a
    if (a < 1 || b < a || b > count) return null
    for (let i = a; i <= b; i++) out.add(i - 1)
  }
  return [...out].sort((x, y) => x - y)
}
