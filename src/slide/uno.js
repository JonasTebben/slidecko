import { createGenerator } from '@unocss/core'
import presetWind3 from '@unocss/preset-wind3'

// Slidev styles slide content with UnoCSS utility classes (`flex gap-16`, `max-w-82`, …). The same
// generator runs here in the browser, scoped to slides, for every class the deck uses.
const generator = createGenerator({ presets: [presetWind3({ preflight: false })] })
const style = document.head.appendChild(document.createElement('style'))
style.id = 'uno'
let tokens = new Set()

// markup: any text containing class attributes; CSS for new tokens is appended
export async function applyUno(markup) {
  const gen = await generator
  const found = [...(markup.match(/class="([^"]*)"/g) || [])].flatMap(c => c.slice(7, -1).split(/\s+/)).filter(t => t && !tokens.has(t))
  if (!found.length) return
  for (const t of found) tokens.add(t)
  const { css } = await gen.generate(tokens, { preflights: false, scope: '.slide' })
  style.textContent = css
}
