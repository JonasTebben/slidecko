import { LOCALES } from './i18n.js'

const holes = s => (s.match(/\{\d+\}/g) || []).sort().join()

test('every language translates the same texts as German and keeps the {0} placeholders', () => {
  const keys = Object.keys(LOCALES.de.dict)
  for (const [code, { dict }] of Object.entries(LOCALES)) {
    if (code === 'en') continue
    expect([code, keys.filter(k => !(k in dict))]).toEqual([code, []])
    expect([code, Object.keys(dict).filter(k => !(k in LOCALES.de.dict))]).toEqual([code, []])
    expect([code, keys.filter(k => holes(k) !== holes(dict[k]))]).toEqual([code, []])
  }
})

// every literal t('…') in the source has a German entry (and so, by the test above, one in every language)
test('every interface string in the source is translated', () => {
  const { readdirSync, readFileSync, statSync } = require('node:fs')
  const { join } = require('node:path')
  const files = []
  const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? f !== 'locales' && walk(p) : /\.(js|vue)$/.test(f) && !f.endsWith('.test.js') && files.push(p) } }
  walk(join(import.meta.dir, '..'))
  const missing = []
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/(?<![\w.$])t\('((?:[^'\\]|\\.)*)'/g)) {
    const key = m[1].replace(/\\(.)/g, (_, c) => (c === 'n' ? '\n' : c))
    if (!(key in LOCALES.de.dict)) missing.push(`${f.split('/src/')[1]}: ${key}`)
  }
  expect(missing).toEqual([])
})
