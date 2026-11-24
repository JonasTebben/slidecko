// Charts: data + options + box size -> inline SVG text. Pure (no DOM), so the editor, every export and the Slidev
// project draw the same picture. Text is currentColor in the inherited font, so labels take the theme's (AA) text colour.

export const CHART_KINDS = { column: 'Column chart', bar: 'Bar chart', line: 'Line chart', pie: 'Pie chart', donut: 'Donut chart' }
// series colours after the first, which is the theme's accent: PALETTE's strong colours (presets.js)
export const SERIES_COLORS = ['#ea580c', '#16a34a', '#7c3aed', '#db2777', '#0891b2', '#f59e0b', '#dc2626', '#475569']
export const seriesColor = (el, i, accent = '#2563eb') => el.series?.[i]?.color || (i ? SERIES_COLORS[(i - 1) % SERIES_COLORS.length] : accent)

// "{" as an entity: Slidev compiles slides as Vue templates, where "{{" would be read as an interpolation
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\{/g, '&#123;')
const r1 = v => Math.round(v * 10) / 10
export const fmt = v => String(Math.round(v * 100) / 100)

// a "nice" axis around lo..hi (1, 2, 2.5 or 5 times a power of ten per step); a fixed min/max replaces its end
export function niceScale(lo, hi, fixMin, fixMax, ticks = 5) {
  if (Number.isFinite(fixMin)) lo = fixMin
  if (Number.isFinite(fixMax)) hi = fixMax
  if (!(hi > lo)) hi = lo + (lo ? Math.abs(lo) : 1)
  const raw = (hi - lo) / ticks, p = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(k => k * p).find(s => s >= raw)
  const min = Number.isFinite(fixMin) ? fixMin : Math.floor(lo / step + 1e-9) * step
  const max = Number.isFinite(fixMax) ? fixMax : Math.ceil(hi / step - 1e-9) * step
  const out = []
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-6; v += step) out.push(Math.round(v / step) * step || 0)
  return { min, max, ticks: out }
}

// a pie slice from angle a to b (radians, 0 = 12 o'clock, clockwise); r0 > 0 cuts a donut hole
export function slicePath(cx, cy, r, a, b, r0 = 0) {
  const pt = (rad, t) => `${r1(cx + rad * Math.sin(t))},${r1(cy - rad * Math.cos(t))}`
  if (b - a >= Math.PI * 2 - 1e-9) { // the whole circle: two half arcs (one arc with equal ends draws nothing)
    const ring = rad => `M${pt(rad, 0)}A${rad},${rad} 0 1 1 ${pt(rad, Math.PI)}A${rad},${rad} 0 1 1 ${pt(rad, 0)}Z`
    return ring(r) + (r0 ? ring(r0) : '')
  }
  const big = b - a > Math.PI ? 1 : 0
  return r0
    ? `M${pt(r, a)}A${r},${r} 0 ${big} 1 ${pt(r, b)}L${pt(r0, b)}A${r0},${r0} 0 ${big} 0 ${pt(r0, a)}Z`
    : `M${r1(cx)},${r1(cy)}L${pt(r, a)}A${r},${r} 0 ${big} 1 ${pt(r, b)}Z`
}
// angles of the positive values (others get no slice), as [start, end] pairs
export function pieAngles(values) {
  const pos = values.map(v => (v > 0 ? v : 0)), sum = pos.reduce((a, b) => a + b, 0)
  let a = 0
  return pos.map(v => { const s = a; a += sum ? (v / sum) * Math.PI * 2 : 0; return [s, a] })
}

// rough text width (no DOM): 0.58 em per character
const tw = (s, fs) => String(s).length * fs * 0.58
const text = (x, y, s, fs, o = '') => `<text x="${r1(x)}" y="${r1(y)}" font-size="${r1(fs)}"${o}>${esc(s)}</text>`

export function chartSvg(el, accent) {
  const W = Math.max(1, el.w), H = Math.max(1, el.h), fs = el.fontSize || 16
  const cats = el.categories || [], series = el.series || []
  const color = i => seriesColor(el, i, accent)
  const pie = el.kind === 'pie' || el.kind === 'donut'
  let top = 4, bottom = H - 4
  const out = []
  if (el.title) { out.push(text(W / 2, top + fs * 1.1, el.title, fs * 1.25, ' text-anchor="middle" font-weight="600"')); top += fs * 1.6 }
  // legend at the bottom, wrapping into rows: the categories of a pie, else the series
  const entries = !el.legend ? [] : pie ? cats.map((c, i) => [c, i]) : series.map((s, i) => [s.name, i])
  if (entries.length) {
    const rows = [[]]
    let x = 0
    for (const [name, i] of entries) {
      const w = fs * 1.2 + tw(name, fs * 0.85) + fs
      if (x + w > W - 8 && rows.at(-1).length) { rows.push([]); x = 0 }
      rows.at(-1).push([name, i, x, w]); x += w
    }
    const lh = fs * 1.3
    bottom -= rows.length * lh
    rows.forEach((row, k) => {
      const width = row.reduce((a, e) => a + e[3], 0) - fs, y = bottom + k * lh + lh / 2
      for (const [name, i, x] of row) {
        const lx = (W - width) / 2 + x
        out.push(`<rect data-s="${i}" x="${r1(lx)}" y="${r1(y - fs * 0.35)}" width="${r1(fs * 0.7)}" height="${r1(fs * 0.7)}" rx="2" style="fill:${color(i)}"/>`)
        out.push(text(lx + fs, y + fs * 0.3, name, fs * 0.85))
      }
    })
    bottom -= 4
  }
  const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${r1(W)} ${r1(H)}" fill="currentColor" style="overflow:visible;font-family:inherit">${out.join('')}${body}</svg>`
  const h = bottom - top
  if (h < 10 || !cats.length || !series.length) return svg('')

  if (pie) {
    const vals = cats.map((_, i) => series[0].values[i] || 0), sum = vals.reduce((a, v) => a + (v > 0 ? v : 0), 0)
    const r = Math.max(4, Math.min(W / 2 - (el.values ? fs * 3 : 4), h / 2 - (el.values ? fs * 1.4 : 0))), cx = W / 2, cy = top + h / 2
    const body = pieAngles(vals).map(([a, b], i) => {
      if (b <= a) return ''
      const m = (a + b) / 2, lr = r + fs * 0.9
      const label = el.values ? text(cx + lr * Math.sin(m), cy - lr * Math.cos(m) + fs * 0.35, fmt(vals[i]), fs * 0.85, ` text-anchor="${Math.sin(m) > 0.1 ? 'start' : Math.sin(m) < -0.1 ? 'end' : 'middle'}"`) : ''
      return `<path data-s="${i}" d="${slicePath(cx, cy, r, a, b, el.kind === 'donut' ? r * 0.55 : 0)}" style="fill:${color(i)};stroke:var(--bg, #fff);stroke-width:1.5"/>${label}`
    }).join('')
    return svg(sum ? body : '')
  }

  // value range: stacked bars add up (positives and negatives apart), bars always include 0
  const stacked = el.stacked && el.kind !== 'line'
  const all = stacked
    ? cats.flatMap((_, j) => [series.reduce((a, s) => a + Math.max(0, s.values[j] || 0), 0), series.reduce((a, s) => a + Math.min(0, s.values[j] || 0), 0)])
    : series.flatMap(s => s.values.slice(0, cats.length).map(v => v || 0))
  let lo = Math.min(...all), hi = Math.max(...all)
  if (el.kind !== 'line' || lo === hi) { lo = Math.min(0, lo); hi = Math.max(0, hi) }
  const sc = niceScale(lo, hi, el.min, el.max)
  const horiz = el.kind === 'bar'
  // margins: tick labels on the value axis, category labels on the other
  const left = 6 + (horiz ? Math.min(W * 0.35, Math.max(...cats.map(c => tw(c, fs * 0.85)))) : Math.max(...sc.ticks.map(v => tw(fmt(v), fs * 0.85)))) + 6
  const plotB = bottom - fs * 1.4, plotR = W - 8 - (horiz && el.values ? fs * 2 : 0), plotT = top + (el.values && !horiz ? fs : 4)
  if (plotB - plotT < 10 || plotR - left < 10) return svg('')
  const clamp = v => Math.min(sc.max, Math.max(sc.min, v))
  const val = v => (horiz ? left + ((clamp(v) - sc.min) / (sc.max - sc.min)) * (plotR - left) : plotB - ((clamp(v) - sc.min) / (sc.max - sc.min)) * (plotB - plotT))
  const band = (horiz ? plotB - plotT : plotR - left) / cats.length
  const catAt = j => (horiz ? plotT : left) + band * j // start of category j's band
  const g = []
  // grid lines and tick labels (lines faint, labels in full text colour for contrast)
  for (const v of sc.ticks) {
    const p = r1(val(v))
    g.push(horiz ? `<line x1="${p}" y1="${r1(plotT)}" x2="${p}" y2="${r1(plotB)}"/>` : `<line x1="${r1(left)}" y1="${p}" x2="${r1(plotR)}" y2="${p}"/>`)
    out.push(horiz ? text(p, plotB + fs * 1.1, fmt(v), fs * 0.85, ' text-anchor="middle"') : text(left - 6, p + fs * 0.3, fmt(v), fs * 0.85, ' text-anchor="end"'))
  }
  const zero = r1(val(0))
  const axis = horiz ? `<line x1="${zero}" y1="${r1(plotT)}" x2="${zero}" y2="${r1(plotB)}"/>` : `<line x1="${r1(left)}" y1="${zero}" x2="${r1(plotR)}" y2="${zero}"/>`
  cats.forEach((c, j) => out.push(horiz
    ? text(left - 6, catAt(j) + band / 2 + fs * 0.3, c, fs * 0.85, ' text-anchor="end"')
    : text(catAt(j) + band / 2, plotB + fs * 1.1, c, fs * 0.85, ' text-anchor="middle"')))
  const marks = []
  // a rectangle between values a and b in the band slot [s, s + w]
  const rect = (i, s, w, a, b) => { const p = val(a), q = val(b), lo = Math.min(p, q), len = Math.abs(p - q); return `<rect data-s="${i}" ${horiz ? `x="${r1(lo)}" y="${r1(s)}" width="${r1(len)}" height="${r1(w)}"` : `x="${r1(s)}" y="${r1(lo)}" width="${r1(w)}" height="${r1(len)}"`} style="fill:${color(i)}"/>` }
  const label = (v, s, w, end) => { // the value just past the bar's end
    const p = val(end), neg = end < 0
    return horiz ? text(p + (neg ? -4 : 4), s + w / 2 + fs * 0.3, fmt(v), fs * 0.8, ` text-anchor="${neg ? 'end' : 'start'}"`) : text(s + w / 2, p + (neg ? fs : -4), fmt(v), fs * 0.8, ' text-anchor="middle"')
  }
  if (el.kind === 'line') {
    series.forEach((s, i) => {
      const pts = cats.map((_, j) => [catAt(j) + band / 2, val(s.values[j] || 0)])
      marks.push(`<polyline data-s="${i}" points="${pts.map(p => p.map(r1).join(',')).join(' ')}" style="fill:none;stroke:${color(i)};stroke-width:3;stroke-linejoin:round"/>`)
      pts.forEach(([x, y], j) => {
        marks.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="4" style="fill:${color(i)}"/>`)
        if (el.values) marks.push(text(x, y - 8, fmt(s.values[j] || 0), fs * 0.8, ' text-anchor="middle"'))
      })
    })
  } else {
    const inner = band * 0.72, gap = (band - inner) / 2
    cats.forEach((_, j) => {
      let up = 0, down = 0
      series.forEach((s, i) => {
        const v = s.values[j] || 0, at = catAt(j) + gap
        if (stacked) {
          const from = v >= 0 ? up : down, to = from + v
          if (v >= 0) up = to; else down = to
          marks.push(rect(i, at, inner, from, to))
          // inside the segment: there is no room outside; tall enough segments only
          if (el.values && v && Math.abs(val(to) - val(from)) > fs) marks.push(`<g style="fill:${inkOn(color(i))}">${text(horiz ? (val(from) + val(to)) / 2 : at + inner / 2, (horiz ? at + inner / 2 : (val(from) + val(to)) / 2) + fs * 0.3, fmt(v), fs * 0.8, ' text-anchor="middle"')}</g>`)
        } else {
          const w = inner / series.length, s0 = at + w * i
          marks.push(rect(i, s0, w, 0, v))
          if (el.values) marks.push(label(v, s0, w, v))
        }
      })
    })
  }
  return svg(`<g style="stroke:currentColor;stroke-opacity:0.18;stroke-width:1">${g.join('')}</g><g style="stroke:currentColor;stroke-opacity:0.6;stroke-width:1.5">${axis}</g>${marks.join('')}`)
}

// black or white text, whichever reads better on a colour (#rgb/#rrggbb; others keep the text colour)
export function inkOn(c) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c || '')
  if (!m) return 'currentColor'
  const h = m[1].length === 3 ? [...m[1]].map(x => x + x).join('') : m[1]
  const lin = k => { const v = parseInt(h.slice(k, k + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const L = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4)
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#000000' : '#ffffff'
}

// --- the data grid: first row series names, first column categories (like a spreadsheet) ---
export const toGrid = el => [['', ...el.series.map(s => s.name)], ...el.categories.map((c, j) => [c, ...el.series.map(s => (s.values[j] == null ? '' : fmt(s.values[j])))])]
// "1.234,5", "1,234.5", "12 %", "€ 3" -> a number; the last of "," and "." is the decimal mark when both appear
export function parseNum(s) {
  let t = String(s ?? '').replace(/[\s %€$£¥]/g, '')
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  else if (/^-?[1-9]\d{0,2}([,.]\d{3})+$/.test(t)) t = t.replace(/[,.]/g, '') // 1,234,567 or 1.500: thousands (0,125 stays a fraction)
  else t = t.replace(',', '.')
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}
export function fromGrid(grid) {
  const cols = Math.max(2, ...grid.map(r => r.length)), head = grid[0] || []
  const body = grid.slice(1)
  return {
    categories: body.map(r => String(r[0] ?? '')),
    series: Array.from({ length: cols - 1 }, (_, i) => ({ name: String(head[i + 1] ?? ''), values: body.map(r => parseNum(r[i + 1])) })),
  }
}
// the grid back into the element; series keep their own colours by position
export function applyGrid(el, grid) {
  const d = fromGrid(grid)
  el.categories = d.categories
  el.series = d.series.map((s, i) => (el.series[i]?.color ? { ...s, color: el.series[i].color } : s))
}
