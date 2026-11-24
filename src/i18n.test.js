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
