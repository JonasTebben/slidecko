// Product tour: step data, bubble placement and the shared state. Pure apart from the reactive state,
// so it stays testable; Tour.vue draws it. Texts are the English t() keys.
import { reactive } from 'vue'

export const TOUR_KEY = 'slides-builder:tour' // 'done': the start page stops offering the tour

// target: a data-tour="…" anchor (none = centred); edit: the hands-on title step;
// tutorial: Next hands over to the Markdown tutorial; only: 'short' | 'full'
export const STEPS = [
  { id: 'welcome', title: 'Welcome to Slidecko', text: 'A quick look around. Everything stays in your browser: no account, no upload, no tracking.' },
  { id: 'slides', target: 'slides', title: 'Your slides', text: 'All slides of the project. Click one to edit it, drag to reorder, right-click for more.' },
  { id: 'canvas', target: 'canvas', edit: true, title: 'Try it: the slide', text: 'Double-click the title and type your name. Click outside the box when you are done.' },
  { id: 'insert', target: 'insert', title: 'Insert things', text: 'Text, images, tables, shapes, code, videos, timers – or a new slide from a layout.' },
  { id: 'inspector', target: 'inspector', title: 'Properties', text: 'Select something on the slide and change its font, colour, size and position here.' },
  { id: 'theme', target: 'theme', title: 'Theme', text: 'One click changes colours and fonts of the whole presentation.' },
  { id: 'present', target: 'present', only: 'short', title: 'Present', text: 'Starts the full-screen presentation. Arrow keys move on, Esc ends it.' },
  { id: 'export', target: 'export', only: 'short', title: 'Export', text: 'PDF, PowerPoint, OpenDocument, HTML or Slidev Markdown – made on your device.' },
  { id: 'palette', target: 'palette', title: 'Every command', text: 'Search all commands and their shortcuts. {0}K opens it from anywhere.' },
  { id: 'md', only: 'full', tutorial: true, title: 'Next: slides from Markdown', text: 'Now you write a few slides yourself in Markdown, step by step. At the end you open them as a new presentation.' },
  { id: 'present2', target: 'present', only: 'full', after: true, title: 'Your new presentation', text: 'This is what you wrote. Present it right away …' },
  { id: 'export2', target: 'export', only: 'full', after: true, title: 'Take it with you', text: '… or export it as PDF, PowerPoint or Slidev Markdown.' },
  { id: 'markdown', target: 'markdown', only: 'full', after: true, title: 'Edit as Markdown later', text: 'M (or this button) opens the Markdown of the current slide. {0}K finds everything else. Have fun!' },
]
export const stepsFor = full => STEPS.filter(s => !s.only || s.only === (full ? 'full' : 'short'))

// the next step from i in direction d whose anchor is on screen (hidden panels, phone layout); -1: none
export function nextStep(steps, i, d, shown) {
  for (let j = i + d; j >= 0 && j < steps.length; j += d) if (!steps[j].target || shown(steps[j].target)) return j
  return -1
}

// bubble position for target rect r (null: centred) in a viewport of vw × vh: below, above, right, left,
// else over the target's lower part; always clamped into the margin m so it stays on screen
export function place(r, w, h, vw, vh, gap = 12, m = 16) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, Math.max(lo, hi)))
  const x = v => clamp(v, m, vw - w - m), y = v => clamp(v, m, vh - h - m)
  if (!r) return { x: x((vw - w) / 2), y: y((vh - h) / 2), side: 'center' }
  const cx = r.left + r.width / 2 - w / 2, cy = r.top + r.height / 2 - h / 2
  if (r.bottom + gap + h + m <= vh) return { x: x(cx), y: r.bottom + gap, side: 'below' }
  if (r.top - gap - h >= m) return { x: x(cx), y: r.top - gap - h, side: 'above' }
  if (r.right + gap + w + m <= vw) return { x: r.right + gap, y: y(cy), side: 'right' }
  if (r.left - gap - w >= m) return { x: r.left - gap - w, y: y(cy), side: 'left' }
  return { x: x(cx), y: y(r.bottom - h - gap), side: 'over' }
}

// on: tour visible; i: index into stepsFor(full); created: the sample project the tour made (removed on an early skip)
export const tour = reactive({ on: false, full: false, i: 0, created: null })
export function begin(full, created = null) {
  try { localStorage.setItem(TOUR_KEY, 'done') } catch {}
  Object.assign(tour, { on: true, full, i: 0, created })
}
