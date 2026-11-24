import { reactive } from 'vue'

// Icons like Slidev's Iconify icons (<mdi-home />). The sets are bundled (@iconify-json/*): each set's JSON is its own
// chunk, loaded on first use, so nothing is requested from another server and the startup bundle stays small.
// Pure apart from the picker state, so it is tested in Node.
export const ICON_SETS = {
  lucide: { name: 'Lucide', license: 'ISC', load: () => import('@iconify-json/lucide/icons.json') },
  tabler: { name: 'Tabler', license: 'MIT', load: () => import('@iconify-json/tabler/icons.json') },
  mdi: { name: 'Material Design Icons', license: 'Apache-2.0', load: () => import('@iconify-json/mdi/icons.json') },
  carbon: { name: 'Carbon', license: 'Apache-2.0', load: () => import('@iconify-json/carbon/icons.json') },
  ph: { name: 'Phosphor', license: 'MIT', load: () => import('@iconify-json/ph/icons.json') },
}
// the version range a Slidev export puts into package.json (the bundled ones are 1.2.x)
export const ICONIFY_JSON = '^1.2.0'
export const ICON_NAME = /^([a-z0-9]+):([a-z0-9]+(?:-[a-z0-9]+)*)$/
export const iconSet = id => ICON_NAME.exec(id || '')?.[1]

// the picker dialog (IconPicker.vue): open, and the icon element it changes (none: it inserts a new one)
export const picker = reactive({ open: false, target: null })

const sets = {}
export const loadSet = prefix => (sets[prefix] ||= ICON_SETS[prefix].load().then(m => m.default || m).catch(e => { delete sets[prefix]; throw e }))

// { body, view } of a name or alias in a loaded set; undefined if the set has no such icon
export function iconIn(data, name) {
  for (let i = 0; i < 6 && data.aliases?.[name] && !data.icons[name]; i++) name = data.aliases[name].parent
  const ic = data.icons[name]
  if (!ic) return undefined
  return { body: ic.body, view: [ic.left || 0, ic.top || 0, ic.width || data.width || 16, ic.height || data.height || 16].join(' ') }
}
// the element data of "set:name": { icon, body, view }, or null when the set is not bundled or has no such icon
export async function getIcon(id) {
  const set = iconSet(id)
  if (!ICON_SETS[set]) return null
  const ic = iconIn(await loadSet(set), id.slice(set.length + 1))
  return ic ? { icon: id, ...ic } : null
}
// names in a loaded set matching every word of q (names and aliases; hidden icons only by exact name), best first
export function searchIcons(data, q, limit = 300) {
  const words = q.toLowerCase().trim().split(/[\s:]+/).filter(Boolean)
  const names = [...Object.keys(data.icons).filter(n => !data.icons[n].hidden), ...Object.keys(data.aliases || {})]
  if (!words.length) return names.slice(0, limit)
  const hit = names.filter(n => words.every(w => n.includes(w)))
  const rank = n => (n === words.join('-') ? 0 : n.startsWith(words[0]) ? 1 : 2) + n.length / 1000
  return hit.sort((a, b) => rank(a) - rank(b)).slice(0, limit)
}

const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
// the icon as standalone SVG: rotation (quarter turns) and flips baked in, like Iconify; color replaces currentColor
// (PowerPoint's SVG renderer has no CSS), width/height give the PNG fallback its size
export function iconSvg(el, { color, width = '100%', height = '100%' } = {}) {
  let [x, y, w, h] = (el.view || '0 0 24 24').split(' ').map(Number)
  const cx = x + w / 2, cy = y + h / 2, r = el.rotate || 0
  const sx = el.flip?.includes('h') ? -1 : 1, sy = el.flip?.includes('v') ? -1 : 1
  const tf = r || sx < 0 || sy < 0 ? ` transform="rotate(${r * 90} ${cx} ${cy}) translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})"` : ''
  if (r % 2) [x, y, w, h] = [cx - h / 2, cy - w / 2, h, w] // a quarter turn swaps the sides
  const a11y = el.label ? `role="img" aria-label="${attr(el.label)}"` : 'aria-hidden="true"'
  const body = color ? el.body.replace(/currentColor/g, color) : el.body
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${w} ${h}" ${a11y}>${el.label ? `<title>${attr(el.label).replace(/>/g, '&gt;')}</title>` : ''}<g${tf}>${body}</g></svg>`
}

// --- Slidev: icons are components named after the icon, <mdi-account-circle />, also <i-mdi-home /> and <mdi:home /> ---
// CSS of the icon in Slidev: colour (none: the theme's accent), quarter turns and flips (Slidev has no props for them)
export function iconStyle(el) {
  const tf = [el.rotate && `rotate(${el.rotate * 90}deg)`, el.flip?.includes('h') && 'scaleX(-1)', el.flip?.includes('v') && 'scaleY(-1)'].filter(Boolean).join(' ')
  return `width:100%;height:100%;color:${el.color || 'var(--accent, var(--slidev-theme-primary))'}${tf ? `;transform:${tf}` : ''}`
}
export const iconTag = el => `<${el.icon.replace(':', '-')} style="${iconStyle(el)}"${el.label ? ` role="img" aria-label="${attr(el.label)}"` : ' aria-hidden="true"'} />`

// icon tags of bundled sets that stand on their own line become <div data-icon> placeholders the import measures
// (inline ones in text, other sets and fenced code stay as they are); 1.2em is the size Slidev gives them
const TAG = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[`~]*[ \t]*$|^([ \t]*)<(?:i-)?([a-z0-9]+)[-:]([a-z0-9]+(?:-[a-z0-9]+)*)((?:\s+[^<>]*?)?)\s*(?:\/>|>\s*<\/(?:i-)?\3[-:]\4>)[ \t]*$/gm
const attrOf = (attrs, k) => attrs.match(new RegExp(`(?:^|\\s)${k}="([^"]*)"`))?.[1]
export const iconTags = md => md.replace(TAG, (m, fence, ind, set, name, attrs = '') => {
  if (fence || !ICON_SETS[set]) return m
  const cls = attrOf(attrs, 'class'), style = attrOf(attrs, 'style'), label = attrOf(attrs, 'aria-label')
  return `${ind}<div data-icon="${set}:${name}"${cls ? ` class="${attr(cls)}"` : ''}${label ? ` data-label="${attr(label)}"` : ''} style="display:inline-block;vertical-align:middle;width:1.2em;height:1.2em;${attr(style || '')}"></div>`
})
// colour, turns and flips of a placeholder's CSS (as iconStyle writes them); no colour is the text colour, as in Slidev
export function readIconStyle(style) {
  const color = !style.color ? 'currentColor' : style.color.startsWith('var(--accent') ? undefined : style.color
  const turn = Math.round(parseFloat(style.transform.match(/rotate\(([-\d.]+)deg\)/)?.[1] || 0) / 90) % 4
  const flip = (/scaleX\(-1\)/.test(style.transform) ? 'h' : '') + (/scaleY\(-1\)/.test(style.transform) ? 'v' : '')
  return { color, ...(turn && { rotate: (turn + 4) % 4 }), ...(flip && { flip }) }
}
