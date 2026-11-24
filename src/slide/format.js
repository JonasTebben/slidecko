// Slide format (Slidev headmatter aspectRatio/canvasWidth); pure, so node tests can import it.

// 16/9, '16:9', '4 / 3', '1.6' or 1.777… → ratio, or null for anything unusable
export function parseRatio(v) {
  let r = null
  if (typeof v === 'number') r = v
  else if (typeof v === 'string') {
    const m = v.trim().match(/^(\d*\.?\d+)\s*(?:[/:]\s*(\d*\.?\d+))?$/)
    if (m) r = m[2] ? m[1] / m[2] : +m[1]
  }
  return Number.isFinite(r) && r >= 0.25 && r <= 4 ? r : null
}

// Slidev: height = ceil(canvasWidth / aspectRatio), so 980 at 16/9 → 552 (epsilon: float noise like 735.0000001)
export const formatSize = (ratio, width) => ({ w: width, h: Math.ceil(width / ratio - 1e-9) })
