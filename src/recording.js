// pure helpers for recording a talk and the slide overview (the browser parts live in Recorder.vue)

// MP4 first (plays everywhere, Chrome 126+ and Safari record it), else WebM; '' = the browser's own choice
const VIDEO = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
export const pickMime = (supported = () => false) => VIDEO.find(m => supported(m)) || ''
export const extOf = mime => /mp4/.test(mime) ? 'mp4' : 'webm'

// "My talk 2026-11-24 14-05.mp4": project title and local start time, safe as a file name everywhere
export function recordingName(title, date, mime) {
  const p = n => String(n).padStart(2, '0')
  const name = (title || '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Recording'
  return `${name} ${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}-${p(date.getMinutes())}.${extOf(mime)}`
}

// 0:07, 12:34, 1:02:03
export function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, p = n => String(n).padStart(2, '0')
  return h ? `${h}:${p(m)}:${p(s % 60)}` : `${m}:${p(s % 60)}`
}

// arrow keys in a grid of n items with cols columns; the last row may be short
export function gridMove(i, key, cols, n) {
  const to = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: n - 1, PageDown: i + cols * 3, PageUp: i - cols * 3 }[key]
  if (to == null || (key === 'ArrowUp' && to < 0)) return i
  if (key === 'ArrowDown' && to >= n) return Math.floor((n - 1) / cols) > Math.floor(i / cols) ? n - 1 : i // a short last row: land on its last item
  return Math.min(n - 1, Math.max(0, to))
}

// set while a recording starts or runs: the browser's share picker can drop full screen, which must not end the presentation
export const capturing = { on: false }
