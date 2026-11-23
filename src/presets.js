import { uid } from './store.js'
import { CALLOUTS } from './themes.js'
import { t } from './i18n.js'

// Starter content is translated when created (make()/ELEMENTS run at insert time), then belongs to the user

// Elements the "Insert" menu creates (positions in slide units, centred-ish on the canvas)
const T = (html, o) => ({ type: 'text', html, ...o })
// colours and shape names shared by the inspector and the context menu
export const PALETTE = ['#0f172a', '#475569', '#94a3b8', '#ffffff', '#dc2626', '#ea580c', '#f59e0b', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777']
export const FILLS = ['#f1f5f9', '#e0f2fe', '#ecfdf5', '#fef9c3', '#fee2e2', '#ede9fe', ...PALETTE]
export const SHAPE_NAMES = { rect: 'Rectangle', rounded: 'Rounded', ellipse: 'Ellipse', triangle: 'Triangle', arrow: 'Arrow', line: 'Line' }

export const ELEMENTS = {
  text: () => T(`<p>${t('Enter text …')}</p>`, { x: 120, y: 140, w: 420, h: 30 }),
  heading: () => T(`<h2>${t('Heading')}</h2>`, { x: 120, y: 120, w: 600, h: 40 }),
  list: () => T(`<ul><li>${t('First point')}</li><li>${t('Second point')}</li><li>${t('Third point')}</li></ul>`, { x: 120, y: 140, w: 420, h: 110 }),
  olist: () => T(`<ol><li>${t('First step')}</li><li>${t('Second step')}</li><li>${t('Third step')}</li></ol>`, { x: 120, y: 140, w: 420, h: 110 }),
  quote: () => T(`<blockquote><p>${t('“A good quote.” — Source')}</p></blockquote>`, { x: 160, y: 200, w: 560, h: 40 }),
  callout: kind => T(`<div data-callout="${kind}"><p><strong>${t(CALLOUTS.find(c => c[0] === kind)[1])}:</strong> ${t('Important note.')}</p></div>`, { x: 120, y: 160, w: 480, h: 50 }),
  code: () => ({ type: 'code', x: 120, y: 140, w: 460, h: 120, lang: 'js', code: t("// Enter code\nconst greeting = 'Hello'\nconsole.log(greeting)") }),
  table: (preset = 'theme', rows = 4, cols = 3) => ({
    type: 'table', x: 56, y: 110, w: 620, h: rows * 46, preset, header: true, align: Array(cols).fill(''),
    rows: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (r ? '' : t('Column {0}', c + 1)))),
  }),
  shape: shape => ({
    type: 'shape', shape, x: 360, y: 180, w: shape === 'line' ? 260 : 220, h: shape === 'line' ? 20 : shape === 'arrow' ? 90 : 140,
    fill: shape === 'line' ? 'none' : '#3b82f6', stroke: shape === 'line' ? '#334155' : 'none', strokeWidth: shape === 'line' ? 4 : 0, radius: 0,
  }),
  video: youtube => ({ type: 'video', youtube, x: 240, y: 120, w: 500, h: 281 }),
  // notes box for the class: typed into while presenting, Enter adds a bullet; no fill, so the theme's text colour stays readable
  board: () => T(`<p><strong>${t('Ideas from the class …')}</strong></p><ul><li><br></li></ul>`, { board: true, x: 120, y: 110, w: 720, h: 360, stroke: '#94a3b8', strokeWidth: 2, strokeStyle: 'dashed' }),
  timer: () => ({ type: 'timer', seconds: 600, fontSize: 64, x: 340, y: 210, w: 300, h: 110 }),
  picker: () => ({ type: 'picker', names: [1, 2, 3, 4].map(n => t('Group {0}', n)), fontSize: 64, x: 280, y: 190, w: 420, h: 160 }),
  quiz: () => ({ type: 'quiz', question: t('Question?'), answers: [{ text: t('Answer {0}', 1), correct: true }, { text: t('Answer {0}', 2) }, { text: t('Answer {0}', 3) }, { text: t('Answer {0}', 4) }], x: 80, y: 90, w: 800, h: 360 }),
}

const el = o => ({ id: uid(), ...o })
const title = (text = t('Title')) => el({ type: 'text', title: true, x: 56, y: 40, w: 868, h: 40, html: `<h1>${text}</h1>` })
const list = (x, y, w, items = [t('First point'), t('Second point'), t('Third point')]) =>
  el({ type: 'text', x, y, w, h: items.length * 36, html: `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>` })

// Slide layouts offered by "New slide": a Slidev layout plus starting elements
export const SLIDE_PRESETS = [
  { id: 'title', name: 'Title slide', layout: 'cover', make: () => [
    el({ type: 'text', title: true, x: 60, y: 186, w: 860, h: 80, html: `<h1>${t('Presentation title')}</h1>` }),
    el({ type: 'text', x: 60, y: 280, w: 860, h: 36, html: `<h2>${t('Subtitle')}</h2>` })] },
  { id: 'content', name: 'Title & content', layout: 'default', make: () => [title(), list(56, 110, 868)] },
  { id: 'two', name: 'Two columns', layout: 'default', make: () => [title(), list(56, 110, 410), list(514, 110, 410)] },
  { id: 'compare', name: 'Comparison', layout: 'default', make: () => [title(t('Comparison')), // translucent fills: a solid light box would hide the light text of dark themes
    el({ type: 'text', x: 56, y: 110, w: 410, h: 170, html: `<h3>${t('Before')}</h3><ul>${`<li>${t('Item')}</li>`.repeat(3)}</ul>`, fill: '#64748b', fillAlpha: 12 }),
    el({ type: 'text', x: 514, y: 110, w: 410, h: 170, html: `<h3>${t('After')}</h3><ul>${`<li>${t('Item')}</li>`.repeat(3)}</ul>`, fill: '#16a34a', fillAlpha: 12 })] },
  { id: 'three', name: 'Three columns', layout: 'default', make: () => [title(), ...[56, 359, 662].map((x, i) => el({ type: 'text', x, y: 110, w: 262, h: 120, html: `<h3>${t('Point {0}', i + 1)}</h3><p>${t('A short explanation of this point.')}</p>` }))] },
  { id: 'code', name: 'Code & explanation', layout: 'default', make: () => [title(t('Example')), el({ ...ELEMENTS.code(), x: 56, y: 110, w: 500, h: 200 }), list(590, 110, 334, [t('What happens here?'), t('Why this way?'), t('What matters?')])] },
  { id: 'table', name: 'Table', layout: 'default', make: () => [title(t('Overview')), el({ ...ELEMENTS.table('striped'), w: 868 })] },
  { id: 'section', name: 'Section', layout: 'section', make: () => [el({ type: 'text', title: true, x: 56, y: 220, w: 868, h: 80, html: `<h1>${t('New section')}</h1>` })] },
  { id: 'statement', name: 'Statement', layout: 'statement', make: () => [el({ type: 'text', title: true, x: 80, y: 210, w: 820, h: 120, html: `<h1>${t('One clear statement.')}</h1>` })] },
  { id: 'fact', name: 'Key figure', layout: 'fact', make: () => [
    el({ type: 'text', title: true, x: 80, y: 180, w: 820, h: 100, html: `<h1>${t('42%')}</h1>` }),
    el({ type: 'text', x: 80, y: 300, w: 820, h: 32, html: `<p>${t('What this number means')}</p>` })] },
  { id: 'quote', name: 'Quote', layout: 'quote', make: () => [el({ type: 'text', x: 100, y: 190, w: 780, h: 160, html: `<blockquote><p>${t('“Simplicity is the ultimate sophistication.”')}</p></blockquote><p>— Leonardo da Vinci</p>` })] },
  { id: 'blank', name: 'Blank', layout: 'default', make: () => [] },
]
