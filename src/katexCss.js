import css from 'katex/dist/katex.min.css?raw'

// KaTeX's stylesheet with only its woff2 fonts, served from the app itself (no CDN; woff and ttf are not
// shipped: every browser the app supports reads woff2). Loaded with KaTeX, on the first formula.
const fonts = import.meta.glob('../node_modules/katex/dist/fonts/*.woff2', { query: '?url', import: 'default', eager: true })
const url = Object.fromEntries(Object.entries(fonts).map(([p, u]) => [p.split('/').pop(), u]))
export default css
  .replace(/,url\([^)]*\) format\("(woff|truetype)"\)/g, '')
  .replace(/url\(fonts\/([\w-]+\.woff2)\)/g, (m, f) => (url[f] ? `url("${url[f]}")` : m))
