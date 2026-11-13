import { uid } from './store.js'
import { CALLOUTS } from './themes.js'
import { t } from './i18n.js'

// Starter content is translated when created (make()/ELEMENTS run at insert time), then belongs to the user

// Elements the "Einfügen" menu creates (positions in slide units, centred-ish on the canvas)
const T = (html, o) => ({ type: 'text', html, ...o })
// colours and shape names shared by the inspector and the context menu
export const PALETTE = ['#0f172a', '#475569', '#94a3b8', '#ffffff', '#dc2626', '#ea580c', '#f59e0b', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777']
export const FILLS = ['#f1f5f9', '#e0f2fe', '#ecfdf5', '#fef9c3', '#fee2e2', '#ede9fe', ...PALETTE]
export const SHAPE_NAMES = { rect: 'Rechteck', rounded: 'Abgerundet', ellipse: 'Ellipse', triangle: 'Dreieck', arrow: 'Pfeil', line: 'Linie' }

export const ELEMENTS = {
  text: () => T(`<p>${t('Text eingeben …')}</p>`, { x: 120, y: 140, w: 420, h: 30 }),
  heading: () => T(`<h2>${t('Überschrift')}</h2>`, { x: 120, y: 120, w: 600, h: 40 }),
  list: () => T(`<ul><li>${t('Erster Punkt')}</li><li>${t('Zweiter Punkt')}</li><li>${t('Dritter Punkt')}</li></ul>`, { x: 120, y: 140, w: 420, h: 110 }),
  olist: () => T(`<ol><li>${t('Erster Schritt')}</li><li>${t('Zweiter Schritt')}</li><li>${t('Dritter Schritt')}</li></ol>`, { x: 120, y: 140, w: 420, h: 110 }),
  quote: () => T(`<blockquote><p>${t('„Ein gutes Zitat.“ — Quelle')}</p></blockquote>`, { x: 160, y: 200, w: 560, h: 40 }),
  callout: kind => T(`<div data-callout="${kind}"><p><strong>${t(CALLOUTS.find(c => c[0] === kind)[1])}:</strong> ${t('Wichtiger Hinweis.')}</p></div>`, { x: 120, y: 160, w: 480, h: 50 }),
  code: () => ({ type: 'code', x: 120, y: 140, w: 460, h: 120, lang: 'js', code: t("// Code eingeben\nconst greeting = 'Hallo'\nconsole.log(greeting)") }),
  table: (preset = 'theme', rows = 4, cols = 3) => ({
    type: 'table', x: 56, y: 110, w: 620, h: rows * 46, preset, header: true, align: Array(cols).fill(''),
    rows: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (r ? '' : t('Spalte {0}', c + 1)))),
  }),
  shape: shape => ({
    type: 'shape', shape, x: 360, y: 180, w: shape === 'line' ? 260 : 220, h: shape === 'line' ? 20 : shape === 'arrow' ? 90 : 140,
    fill: shape === 'line' ? 'none' : '#3b82f6', stroke: shape === 'line' ? '#334155' : 'none', strokeWidth: shape === 'line' ? 4 : 0, radius: 0,
  }),
  video: youtube => ({ type: 'video', youtube, x: 240, y: 120, w: 500, h: 281 }),
}

const el = o => ({ id: uid(), ...o })
const title = (text = t('Titel')) => el({ type: 'text', title: true, x: 56, y: 40, w: 868, h: 40, html: `<h1>${text}</h1>` })
const list = (x, y, w, items = [t('Erster Punkt'), t('Zweiter Punkt'), t('Dritter Punkt')]) =>
  el({ type: 'text', x, y, w, h: items.length * 36, html: `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>` })

// Slide layouts offered by "Neue Folie": a Slidev layout plus starting elements
export const SLIDE_PRESETS = [
  { id: 'title', name: 'Titelfolie', layout: 'cover', make: () => [
    el({ type: 'text', title: true, x: 60, y: 186, w: 860, h: 80, html: `<h1>${t('Titel der Präsentation')}</h1>` }),
    el({ type: 'text', x: 60, y: 280, w: 860, h: 36, html: `<h2>${t('Untertitel')}</h2>` })] },
  { id: 'content', name: 'Titel & Inhalt', layout: 'default', make: () => [title(), list(56, 110, 868)] },
  { id: 'two', name: 'Zwei Spalten', layout: 'default', make: () => [title(), list(56, 110, 410), list(514, 110, 410)] },
  { id: 'compare', name: 'Vergleich', layout: 'default', make: () => [title(t('Vergleich')), // translucent fills: a solid light box would hide the light text of dark themes
    el({ type: 'text', x: 56, y: 110, w: 410, h: 170, html: `<h3>${t('Vorher')}</h3><ul>${`<li>${t('Punkt')}</li>`.repeat(3)}</ul>`, fill: '#64748b', fillAlpha: 12 }),
    el({ type: 'text', x: 514, y: 110, w: 410, h: 170, html: `<h3>${t('Nachher')}</h3><ul>${`<li>${t('Punkt')}</li>`.repeat(3)}</ul>`, fill: '#16a34a', fillAlpha: 12 })] },
  { id: 'three', name: 'Drei Spalten', layout: 'default', make: () => [title(), ...[56, 359, 662].map((x, i) => el({ type: 'text', x, y: 110, w: 262, h: 120, html: `<h3>${t('Punkt {0}', i + 1)}</h3><p>${t('Kurze Erklärung zu diesem Punkt.')}</p>` }))] },
  { id: 'code', name: 'Code & Erklärung', layout: 'default', make: () => [title(t('Beispiel')), el({ ...ELEMENTS.code(), x: 56, y: 110, w: 500, h: 200 }), list(590, 110, 334, [t('Was passiert hier?'), t('Warum so?'), t('Was ist wichtig?')])] },
  { id: 'table', name: 'Tabelle', layout: 'default', make: () => [title(t('Übersicht')), el({ ...ELEMENTS.table('striped'), w: 868 })] },
  { id: 'section', name: 'Abschnitt', layout: 'section', make: () => [el({ type: 'text', title: true, x: 56, y: 220, w: 868, h: 80, html: `<h1>${t('Neuer Abschnitt')}</h1>` })] },
  { id: 'statement', name: 'Aussage', layout: 'statement', make: () => [el({ type: 'text', title: true, x: 80, y: 210, w: 820, h: 120, html: `<h1>${t('Eine klare Aussage.')}</h1>` })] },
  { id: 'fact', name: 'Kennzahl', layout: 'fact', make: () => [
    el({ type: 'text', title: true, x: 80, y: 180, w: 820, h: 100, html: `<h1>${t('42 %')}</h1>` }),
    el({ type: 'text', x: 80, y: 300, w: 820, h: 32, html: `<p>${t('Was diese Zahl bedeutet')}</p>` })] },
  { id: 'quote', name: 'Zitat', layout: 'quote', make: () => [el({ type: 'text', x: 100, y: 190, w: 780, h: 160, html: `<blockquote><p>${t('„Einfachheit ist die höchste Stufe der Vollendung.“')}</p></blockquote><p>— Leonardo da Vinci</p>` })] },
  { id: 'blank', name: 'Leer', layout: 'default', make: () => [] },
]
