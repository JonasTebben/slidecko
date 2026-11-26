// Fonts beyond the system stacks: open-source fonts shipped with the app (public/fonts/<key>/, SIL OFL,
// from the @fontsource-variable packages) and fonts a project brings along (deck.fonts: asset id -> name,
// the file itself is a data URL in deck.assets). Both are plain @font-face rules on the app's own origin:
// the browser fetches a file only when text uses it, and exports find them like any other web font.

const SANS = 'ui-sans-serif, system-ui, sans-serif', SERIF = 'Georgia, serif', MONO = 'ui-monospace, Menlo, Consolas, monospace'
// key -> [family, fallback, weight range of the variable font, has italics]
export const BUNDLED = {
  inter: ['Inter', SANS, '100 900', true], montserrat: ['Montserrat', SANS, '100 900', true], nunito: ['Nunito', SANS, '200 1000', true],
  'source-serif': ['Source Serif 4', SERIF, '200 900', true], lora: ['Lora', SERIF, '400 700', true], playfair: ['Playfair Display', SERIF, '400 900', true],
  'fira-code': ['Fira Code', MONO, '300 700', false],
}
const RANGES = {
  latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  'latin-ext': 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
}
export const bundledStack = k => `'${BUNDLED[k][0]}', ${BUNDLED[k][1]}`
export const ownStack = name => `'${name}', ${SANS}`
// a bundled font's files below fonts/ with their descriptors: [file, family, descriptors]
export const bundledFaces = k => {
  const [family, , weight, italic] = BUNDLED[k]
  return (italic ? ['', '-italic'] : ['']).flatMap(st => Object.entries(RANGES).map(([sub, range]) =>
    [`${k}/${sub}${st}.woff2`, family, `font-weight: ${weight}; font-style: ${st ? 'italic' : 'normal'}; unicode-range: ${range}; `]))
}
export const face = (family, src, more = '') => `@font-face { font-family: '${family}'; src: url("${String(src).replace(/["\\\n]/g, encodeURIComponent)}"); font-display: swap; ${more}}`
// @font-face rules of the bundled fonts (keys) and own fonts (fonts: id -> name; src: id -> URL or data URL)
export const fontCss = (keys, fonts = {}, src = {}, dir = 'fonts/') => [
  ...keys.flatMap(k => bundledFaces(k).map(([f, family, more]) => face(family, dir + f, more))),
  ...Object.entries(fonts).filter(([id]) => src[id]).map(([id, name]) => face(name, src[id])),
].join('\n')

// does CSS or markup name this family? Every stack the app writes quotes its first family.
// shortcut: an unquoted family in hand-written theme CSS is missed (its file is then not embedded)
export const usesFamily = (text, family) => text.includes(`'${family}'`) || text.includes(`"${family}"`)

// --- uploaded fonts (untrusted files) ---
export const FONT_MAX = 5 * 1024 * 1024
const MAGIC = { wOF2: 'font/woff2', wOFF: 'font/woff', OTTO: 'font/otf', true: 'font/ttf', '\0\x01\0\0': 'font/ttf' }
// the MIME type from the file's first bytes, undefined for anything that is no font
export const fontType = bytes => bytes.length >= 4 ? MAGIC[String.fromCharCode(...bytes.slice(0, 4))] : undefined
export const FONT_EXT = { 'font/woff2': 'woff2', 'font/woff': 'woff', 'font/ttf': 'ttf', 'font/otf': 'otf' }
// a family name that cannot leave its quotes in CSS ("Roboto Slab-Bold.ttf" -> "Roboto Slab Bold"), not one already taken
export function fontLabel(name, taken = []) {
  const base = String(name).replace(/\.\w+$/, '').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Font'
  let label = base
  for (let n = 2; taken.some(x => x.toLowerCase() === label.toLowerCase()); n++) label = `${base} ${n}`
  return label
}
// deck.fonts from a file or storage: only names that stay inside their quotes, only ids whose file is a font
export const cleanFonts = (fonts, assets = {}) => Object.fromEntries(Object.entries(fonts && typeof fonts === 'object' ? fonts : {})
  .filter(([id, name]) => /^[\w-]{1,20}$/.test(id) && id !== '__proto__' && typeof name === 'string' && /^data:font\//.test(assets[id]))
  .map(([id, name]) => [id, fontLabel(name)]))
