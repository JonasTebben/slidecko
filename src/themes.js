// Themes, table presets and callouts. Everything here is plain CSS text built from one source, so
// the editor and the exported Slidev project use the very same rules:
//   root = '.slide' + layout(n) = '.layout-n'      in the editor
//   root = '.slidev-layout' + layout(n) = '.n'     in Slidev (style.css / per-slide <style>)
// A theme is a set of CSS variables, optionally with own CSS (`css`, nested under `.theme-<id>`, `&` = the slide).
// Built-in themes live here; the user's own ones (custom: true) are kept in this browser and can be
// exported/imported as .theme.json (e.g. themes/jbt.theme.json). A theme with `slidev`/`pkg` is a Slidev
// theme package: the Slidev export names it as `theme:` and adds it to package.json.
import { reactive, toRaw } from 'vue'

const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
const SERIF = "Georgia, 'Iowan Old Style', 'Palatino Linotype', Palatino, serif"
const ROUND = "'Avenir Next', Avenir, Nunito, 'Segoe UI', system-ui, sans-serif"
const GEO = "Futura, 'Century Gothic', 'Trebuchet MS', system-ui, sans-serif"
const HUMAN = "'Gill Sans', 'Gill Sans MT', Optima, Candara, 'Segoe UI', sans-serif"
const MONO = "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace"
// fonts a text box can pick instead of the theme's (el.font); system fonts only, so exports need nothing to embed
export const FONTS = { sans: ['Sans', SANS], serif: ['Serif', SERIF], round: ['Round', ROUND], geo: ['Geometric', GEO], human: ['Humanist', HUMAN], mono: ['Mono', MONO] }
export const fontStack = k => (Object.hasOwn(FONTS, k) ? FONTS[k][1] : undefined)
// a CSS font-family as written or as the browser serializes it -> its FONTS key
const bare = s => s.replace(/["'\s]/g, '').toLowerCase()
export const fontKey = stack => stack && Object.keys(FONTS).find(k => bare(FONTS[k][1]) === bare(stack))

const BUILTIN = {
  hell: { name: 'Clear', vars: { bg: '#ffffff', fg: '#1f2937', title: '#0f172a', accent: '#2563eb', 'code-bg': '#f1f5f9', 'code-fg': '#0f172a', font: SANS, 'cover-bg': 'linear-gradient(135deg, #eff6ff, #ffffff 60%)', rule: '#2563eb' } },
  dunkel: { name: 'Night', dark: true, vars: { bg: '#0f172a', fg: '#cbd5e1', title: '#f8fafc', accent: '#38bdf8', 'accent-fg': '#0f172a', 'code-bg': '#1e293b', 'code-fg': '#e2e8f0', font: SANS, 'cover-bg': 'radial-gradient(circle at 20% 20%, #1e3a8a, #0f172a 70%)' } },
  serif: { name: 'Paper', vars: { bg: '#fbf8f1', fg: '#3b342b', title: '#7c2d12', accent: '#a4452c', 'code-bg': '#f0e9da', 'code-fg': '#3b342b', font: SERIF, 'heading-weight': '400', 'cover-bg': '#f4ecdc' } },
  ozean: { name: 'Ocean', vars: { bg: '#ffffff', fg: '#16324f', title: '#0b2545', accent: '#0e7490', 'code-bg': '#ecfeff', 'code-fg': '#083344', font: SANS, bar: 'linear-gradient(90deg, #0b2545, #0e7490)', 'bar-fg': '#ffffff', 'cover-bg': 'linear-gradient(135deg, #0b2545, #0e7490 60%, #22d3ee)', 'cover-fg': '#ffffff' } },
  wald: { name: 'Forest', vars: { bg: '#fbfdf8', fg: '#22311f', title: '#1f4d2b', accent: '#3f7d3a', 'code-bg': '#eef5e9', 'code-fg': '#1f2a1c', font: HUMAN, 'cover-bg': 'linear-gradient(160deg, #1f4d2b, #3f7d3a)', 'cover-fg': '#f1f8ec', rule: '#8fbc5a' } },
  sonne: { name: 'Sunset', vars: { bg: '#fffaf6', fg: '#3d2a24', title: '#9a3412', accent: '#c74b0a', 'code-bg': '#fff1e6', 'code-fg': '#3d2a24', font: ROUND, 'heading-weight': '700', bar: 'linear-gradient(90deg, #c2410c, #be185d)', 'bar-fg': '#ffffff', 'cover-bg': 'linear-gradient(135deg, #c2410c, #be185d 55%, #7c3aed)', 'cover-fg': '#ffffff' } },
  nord: { name: 'Nord', vars: { bg: '#eceff4', fg: '#3b4252', title: '#2e3440', accent: '#4d6d95', 'code-bg': '#e5e9f0', 'code-fg': '#2e3440', font: SANS, 'cover-bg': '#2e3440', 'cover-fg': '#eceff4', rule: '#88c0d0' } },
  dracula: { name: 'Dracula', dark: true, vars: { bg: '#282a36', fg: '#f8f8f2', title: '#ff79c6', accent: '#bd93f9', 'accent-fg': '#282a36', 'code-bg': '#1e1f29', 'code-fg': '#f8f8f2', font: SANS, 'cover-bg': 'linear-gradient(135deg, #282a36, #44475a)' } },
  solarized: { name: 'Solarized', vars: { bg: '#fdf6e3', fg: '#586e75', title: '#cb4b16', accent: '#2076b2', 'code-bg': '#eee8d5', 'code-fg': '#073642', font: SANS, 'cover-bg': '#073642', 'cover-fg': '#fdf6e3' } },
  pastell: { name: 'Pastel', vars: { bg: '#fffbfe', fg: '#4a4458', title: '#6d4c9f', accent: '#cb3f76', 'code-bg': '#f6eefc', 'code-fg': '#3b3049', font: ROUND, 'heading-weight': '700', 'cover-bg': 'linear-gradient(135deg, #fde2f3, #e0e7ff 55%, #ccfbf1)', rule: '#d9739b' } },
  mono: { name: 'Contrast', vars: { bg: '#ffffff', fg: '#111111', title: '#000000', accent: '#000000', 'code-bg': '#f2f2f2', 'code-fg': '#111111', font: GEO, 'heading-weight': '800', 'cover-bg': '#000000', 'cover-fg': '#ffffff', rule: '#000000' } },
  neon: { name: 'Neon', dark: true, vars: { bg: '#0b0b1a', fg: '#d6d6f5', title: '#22d3ee', accent: '#f472b6', 'accent-fg': '#0b0b1a', 'code-bg': '#15152e', 'code-fg': '#e0e0ff', font: MONO, 'cover-bg': 'radial-gradient(circle at 70% 30%, #4c1d95, #0b0b1a 65%)', 'cover-fg': '#f0abfc' } },
  business: { name: 'Business', vars: { bg: '#ffffff', fg: '#27303f', title: '#0b2545', accent: '#b91c1c', 'code-bg': '#f3f4f6', 'code-fg': '#111827', font: SANS, bar: '#0b2545', 'bar-fg': '#ffffff', 'cover-bg': 'linear-gradient(180deg, #0b2545 72%, #b91c1c 72%, #b91c1c 74%, #0b2545 74%)', 'cover-fg': '#ffffff' } },
}
export const DEFAULT_THEME = 'hell'
// built-in and own themes; reactive, so menus and the editor CSS follow edits
export const THEMES = reactive({ ...BUILTIN })
export const themeOf = id => THEMES[id] || THEMES[DEFAULT_THEME]
export const isBuiltin = id => Object.hasOwn(BUILTIN, id)
// ids for menus: the built-in ones or the user's own (the editor's preview draft is neither)
export const themeIds = own => Object.keys(THEMES).filter(id => !THEMES[id].draft && !!THEMES[id].custom === !!own)

// --- own themes ---
// the variables a theme may set (the editor offers these)
export const THEME_VARS = ['bg', 'fg', 'title', 'accent', 'accent-fg', 'code-bg', 'code-fg', 'rule', 'bar', 'bar-fg', 'cover-bg', 'cover-fg', 'font', 'heading-font', 'heading-weight']
export const validThemeId = id => typeof id === 'string' && /^[\w-]{1,40}$/.test(id)
const THEME_KEY = 'slides-builder:themes'
// a theme from storage or a file (untrusted): known variables only, values that cannot leave their declaration
export function cleanTheme(th) {
  const name = typeof th?.name === 'string' ? th.name.trim().slice(0, 60) : ''
  if (!name) return null
  const vars = Object.fromEntries(Object.entries(th.vars && typeof th.vars === 'object' ? th.vars : {})
    .filter(([k, v]) => THEME_VARS.includes(k) && typeof v === 'string' && v.trim() && !/[;{}<>]/.test(v)).map(([k, v]) => [k, v.trim().slice(0, 1000)]))
  const layouts = (Array.isArray(th.layouts) ? th.layouts : []).filter(l => Array.isArray(l) && /^[\w-]{1,30}$/.test(l[0]) && typeof l[1] === 'string').map(([id, n]) => [id, n.slice(0, 40)])
  // no '<': the CSS also lands in the <style> of HTML exports
  const css = typeof th.css === 'string' ? th.css.replace(/</g, '').trim().slice(0, 200_000) : ''
  return {
    name, custom: true, ...(th.dark === true && { dark: true }), vars, ...(css && { css }), ...(th.base === false && { base: false }),
    ...(layouts.length && { layouts }), ...(/^[\w@/.-]{1,100}$/.test(th.slidev) && { slidev: th.slidev }), ...(/^[\w@/.:#+-]{1,200}$/.test(th.pkg) && { pkg: th.pkg }),
  }
}
try {
  const own = JSON.parse(globalThis.localStorage?.getItem(THEME_KEY) || '{}')
  for (const [id, th] of Object.entries(own || {})) { const c = cleanTheme(th); if (c && validThemeId(id) && !isBuiltin(id)) THEMES[id] = c }
} catch { /* private mode or broken entry: no own themes */ }
const persistThemes = () => {
  try { localStorage.setItem(THEME_KEY, JSON.stringify(Object.fromEntries(themeIds(true).map(id => [id, toRaw(THEMES[id])])))) } catch {}
}
// a free id for a theme name ('Mein Theme' -> 'mein-theme', 'mein-theme-2' …)
export function newThemeId(name) {
  const base = String(name).toLowerCase().normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'theme'
  let id = base
  for (let n = 2; THEMES[id]; n++) id = `${base}-${n}`
  return id
}
// stores an own theme (new or changed); built-in ids stay built-in
export function saveTheme(id, th) {
  const c = cleanTheme(th)
  if (!c || !validThemeId(id) || isBuiltin(id)) throw new Error('invalid theme')
  THEMES[id] = c
  persistThemes()
  return id
}
export function deleteTheme(id) {
  if (!THEMES[id]?.custom) return
  delete THEMES[id]
  persistThemes()
}
// the editor's live preview: an unsaved theme under its own id, never stored
export const DRAFT = '_draft'
export function setDraft(th) {
  const c = th && cleanTheme(th)
  if (c) THEMES[DRAFT] = { ...c, draft: true }
  else delete THEMES[DRAFT]
}
// .theme.json: what an export writes and an import reads
export function themeFile(id) {
  const { custom, draft, ...th } = toRaw(THEMES[id])
  return { format: 'slidecko-theme', version: 1, id, ...th }
}
// own CSS must stay one block inside .theme-x { … }: a stray } would let it style the editor itself
export function containedCss(css) {
  // braces must balance outside comments, strings and escapes (an unclosed { would swallow the rules after it)
  let depth = 0
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '\\') i++
    else if (ch === '/' && css[i + 1] === '*') { i = css.indexOf('*/', i + 2); if (i < 0) return false; i++ }
    else if (ch === '"' || ch === "'") {
      for (i++; i < css.length && css[i] !== ch; i++) { if (css[i] === '\n') break; if (css[i] === '\\') i++ }
    } else if (ch === '{') depth++
    else if (ch === '}' && --depth < 0) return false
  }
  if (depth !== 0) return false
  if (typeof CSSStyleSheet !== 'function') return true // no CSSOM (tests)
  try {
    const s = new CSSStyleSheet()
    s.replaceSync('.theme-x{' + css + '}')
    return s.cssRules.length === 1 && s.cssRules[0].selectorText === '.theme-x'
  } catch { return false }
}
// an imported theme keeps its id (so projects using it find it again) unless that is a built-in one
export function importTheme(d) {
  const c = cleanTheme(d)
  if (!c) throw new Error('invalid theme')
  if (c.css && !containedCss(c.css)) delete c.css // could close the theme's block and style the whole app
  const id = validThemeId(d.id) && !isBuiltin(d.id) && d.id !== DRAFT ? d.id : newThemeId(c.name)
  return saveTheme(id, c)
}

// CSS variables of a theme as an inline style object (editor) or declaration text (export)
// relative brightness 0..1 of a hex or rgb() colour
// shortcut: colour names count as light (the editor only writes hex/rgb), use a canvas if names ever matter
export function lightness(c = '') {
  let h = /^#([\da-f]{3,8})$/i.exec(c.trim())?.[1]
  if (h && h.length < 6) h = [...h.slice(0, 3)].map(x => x + x).join('')
  const v = h ? [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) : c.match(/[\d.]+/g)?.slice(0, 3).map(Number)
  return v?.length === 3 ? (0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2]) / 255 : 1
}
// a code block's background (own colour or the theme's) is dark: syntax colours switch to a dark scheme
// a faint background (< 50 %) mostly shows the slide, so the slide's background decides
export const codeDark = (el, id) => {
  const v = themeOf(id).vars || {}
  return lightness((el.fillAlpha ?? 100) >= 50 ? el.fill || v['code-bg'] || '#f5f5f5' : v.bg || '#ffffff') < 0.5
}
// element shadows, straight down: offset and blur in px, opacity of black (CSS drop-shadow, PPTX/ODP outer shadow)
export const SHADOWS = { soft: { y: 2, blur: 6, a: 0.25 }, strong: { y: 6, blur: 14, a: 0.45 } }
export const shadowCss = k => SHADOWS[k] && `drop-shadow(0 ${SHADOWS[k].y}px ${SHADOWS[k].blur}px rgb(0 0 0 / ${SHADOWS[k].a}))`
// the title bar is a background layer, where a plain colour is invalid (and drops the slide's whole
// background); a colour becomes a one-colour gradient
const barImage = v => (/\(/.test(v) && !/^\s*(rgba?|hsla?|color-mix|oklch|oklab|lab|lch|hwb|color)\(/i.test(v) ? v : `linear-gradient(${v}, ${v})`)
export const themeStyle = id => Object.fromEntries(Object.entries(themeOf(id).vars || {}).map(([k, v]) => ['--' + k, k === 'bar' ? barImage(v) : v]))
const decls = id => Object.entries(themeStyle(id)).map(([k, v]) => `${k}: ${v};`).join(' ')

// Slidev layouts whose content is vertically centred (my-auto inside a grid)
export const CENTERED = ['cover', 'intro', 'quiz', 'section', 'statement', 'fact', 'quote', 'center', 'end']

// project-wide type sizes ({ text, title, code } in px) on top of any theme; R = slide selector,
// L = layout class selector. Used by the editor (.slide) and the Slidev export (.slidev-layout).
export function typoCss(R, t = {}, L = l => `.layout-${l}`) {
  let css = ''
  if (t.text) css += `${R} { font-size: ${t.text}px !important; }\n`
  const plain = `${R}:not(${CENTERED.map(L).join(', ')})`
  if (t.title) css += `${plain} h1 { font-size: ${t.title}px !important; line-height: ${t.titleLine ? t.titleLine + 'px' : 1.2} !important; }\n`
  if (t.h2) css += `${plain} h2 { font-size: ${t.h2}px !important; }\n`
  if (t.h3) css += `${plain} h3 { font-size: ${t.h3}px !important; }\n`
  if (t.line) css += `${R} p { line-height: ${t.line} !important; }\n`
  if (t.liLine) css += `${R} li { line-height: ${t.liLine} !important; }\n`
  if (t.code) {
    const line = t.codeLine || Math.round(t.code * 1.4 * 10) / 10
    css += `${R} { --code-size: ${t.code}px !important; --code-line: ${line}px !important; --slidev-code-font-size: ${t.code}px !important; --slidev-code-line-height: ${line}px !important; }\n`
  }
  return css
}
// layouts offered in the editor; theme-specific ones only for that theme
export const LAYOUTS = [
  ['default', 'Content'], ['cover', 'Title slide'], ['intro', 'Intro'], ['section', 'Section'],
  ['statement', 'Statement'], ['fact', 'Key figure'], ['quote', 'Quote'], ['center', 'Centered'], ['end', 'End'],
]
export const themeLayouts = id => [...LAYOUTS, ...(themeOf(id).layouts || [])]

export function themeCss(R, L) {
  const cover = CENTERED.map(n => R + L(n)).join(', ')
  const content = `${R}:not(${CENTERED.map(L).join(', ')})`
  return `
${R} { background: var(--bg); color: var(--fg); }
${R} :is(h1, h2, h3, h4) { font-family: var(--heading-font, inherit); color: var(--title); font-weight: var(--heading-weight, 600); }
${R} h1 { font-size: 34px; line-height: 42px; letter-spacing: -0.01em; }
${R} a { color: var(--accent); }
${R} th { background: var(--accent); color: var(--accent-fg); font-weight: 600; }
${R} blockquote { border-left-width: 4px; }
${content} { background: var(--bar, none) 0 0 / 100% 85px no-repeat, var(--bg); }
${content} h1 { color: var(--bar-fg, var(--title)); }
${content} h1 { box-shadow: 0 3px 0 var(--rule, transparent); }
${cover} { background: var(--cover-bg, var(--bg)); color: var(--cover-fg, var(--fg)); text-align: center; }
:is(${cover}) :is(h1, h2, h3) { color: var(--cover-fg, var(--title)); }
/* the accent often vanishes on the cover background (black on black in Kontrast); links take the cover's text colour, underlined */
:is(${cover}) a { color: var(--cover-fg, var(--accent)); text-decoration: underline; }
${R}${L('cover')} h1, ${R}${L('intro')} h1 { font-size: 56px; line-height: 64px; }
${R}${L('cover')} h2, ${R}${L('intro')} h2 { font-size: 26px; line-height: 34px; font-weight: 400; opacity: 0.85; }
${R}${L('section')} h1 { font-size: 52px; line-height: 60px; }
${R}${L('statement')} h1 { font-size: 52px; line-height: 60px; }
${R}${L('fact')} h1 { font-size: 96px; line-height: 1; font-weight: 800; color: var(--cover-fg, var(--accent)); } /* the accent vanishes on a coloured cover background (Ozean, Wald, Kontrast) */
${R}${L('quote')} blockquote, ${R}${L('quote')} p { font-size: 30px; line-height: 40px; font-style: italic; background: none; border: 0; color: inherit; } /* without the code box, the code colour would vanish on the quote background (dark on dark in Nord) */
${R}${L('cover')} .pageno, ${R}${L('intro')} .pageno { display: none; }`
}

// --- table presets ---
export const TABLE_PRESETS = [
  ['theme', 'Theme'], ['striped', 'Striped'], ['minimal', 'Minimal'], ['grid', 'Grid'],
  ['bold', 'Strong'], ['accent', 'Accent column'], ['cards', 'Cards'], ['soft', 'Soft'],
]
const TABLE_RULES = {
  theme: '',
  striped: `$ th { background: var(--accent); color: var(--accent-fg); font-weight: 600; border: 0; }
$ td { background: transparent; border: 0; }
@ tr:nth-child(even) > td { background: var(--stripe); }`,
  minimal: `$ th { background: none; color: var(--title, inherit); font-weight: 700; border: 0; border-bottom: 2px solid currentColor; }
$ td { background: none; border: 0; border-bottom: 1px solid var(--border); }`,
  grid: `$ :is(td, th) { border: 1px solid var(--border); background: none; color: inherit; }
$ th { background: var(--stripe); font-weight: 700; }`,
  bold: `$ th { background: var(--fg); color: var(--bg); font-weight: 700; border: 0; }
$ td { background: none; border: 0; border-bottom: 1px solid var(--border); }
@ tr:nth-child(even) > td { background: var(--stripe); }`,
  accent: `$ th { background: var(--accent); color: var(--accent-fg); border: 0; font-weight: 600; }
$ td { background: none; border: 0; border-bottom: 1px solid var(--border); }
$ td:first-child { background: color-mix(in srgb, var(--accent) 12%, transparent); font-weight: 700; color: var(--accent); }`,
  cards: `@ { border-collapse: separate; border-spacing: 0 6px; }
$ th { background: none; color: inherit; opacity: 0.6; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; border: 0; }
$ td { background: var(--stripe); border: 0; }
$ td:first-child { border-radius: 8px 0 0 8px; }
$ td:last-child { border-radius: 0 8px 8px 0; }`,
  soft: `$ th { background: color-mix(in srgb, var(--accent) 16%, transparent); color: inherit; font-weight: 700; border: 0; }
$ th:first-child { border-radius: 8px 0 0 0; }
$ th:last-child { border-radius: 0 8px 0 0; }
$ td { background: none; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--accent) 20%, transparent); }`,
}
// '@' = the preset's table, '$' = its cells' row (`… table tr >`); this specificity wins over theme
// rules like `tr:nth-child(even) td`
export function tableCss(R, presets = Object.keys(TABLE_RULES)) {
  return presets.map(p => (TABLE_RULES[p] || '').replaceAll('@', `${R} [data-table="${p}"] table`).replaceAll('$', `${R} [data-table="${p}"] table tr >`)).join('\n') + `
${R} [data-table]:not([data-table="theme"]) table tr { border-bottom: 0; }
${R} [data-table][data-firstcol] table tr > td:first-child { font-weight: 700; }
${R} [data-table][data-compact] table tr > :is(td, th) { padding: 5px 8px; }
${R} [data-table][data-borders] table :is(tr, tr > td, tr > th) { border: 0; }`
}

// --- callouts (Hinweis, Tipp, Warnung, Achtung) ---
export const CALLOUTS = [['info', 'Note', '#2563eb'], ['tip', 'Tip', '#059669'], ['warn', 'Warning', '#d97706'], ['danger', 'Caution', '#dc2626']]
export const calloutCss = R => `
${R} [data-callout] { --c: #2563eb; padding: 12px 16px; border-radius: 8px; border-left: 4px solid var(--c); background: color-mix(in srgb, var(--c) 10%, transparent); }
${R} [data-callout] > * { margin: 0; }
${R} [data-callout] > * + * { margin-top: 6px; }
${CALLOUTS.map(([k, , c]) => `${R} [data-callout="${k}"] { --c: ${c}; }`).join('\n')}`

// all rules the editor needs; themes with base: false bring all their rules in their own CSS
const ownCss = (R, th) => th.css ? `${R} {\n${th.css}\n}\n` : ''
export const editorCss = () => {
  const own = Object.keys(THEMES).filter(id => THEMES[id].base === false).map(id => `.theme-${id}`)
  return themeCss(own.length ? `.slide:not(${own.join(', ')})` : '.slide', n => `.layout-${n}`) + tableCss('.slide') + calloutCss('.slide') + '\n' +
    Object.entries(THEMES).map(([id, th]) => ownCss(`.theme-${id}`, th)).join('')
}

// style.css of an exported Slidev project using a theme that is no Slidev package
// shortcut: own CSS maps `.layout-x` to Slidev's `.x` by text, enough for selectors written like the editor's
export const slidevThemeCss = id => {
  const th = themeOf(id)
  return `/* Theme "${th.name}", generated by Slidecko */
.slidev-layout { --accent-fg: #fff; --stripe: color-mix(in srgb, var(--fg) 6%, transparent); --border: color-mix(in srgb, var(--fg) 16%, transparent); ${decls(id)} font-family: var(--font, inherit); }
${th.base === false ? '' : themeCss('.slidev-layout', n => `.${n}`)}
${th.css ? ownCss('.slidev-layout', { css: th.css.replace(/\.layout-([\w-]+)/g, '.$1') }) : ''}`
}
