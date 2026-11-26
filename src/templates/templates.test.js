import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseSlidev, headFormat } from '../import/parseSlidev.js'
import { LOCALES } from '../core/i18n.js'

// every template exists in every language, and each translation has the same slides as the English one
const read = (id, l) => readFileSync(join(import.meta.dir, `${id}.${l}.md`), 'utf8')
const langs = Object.keys(LOCALES)
const ids = readdirSync(import.meta.dir).filter(f => f.endsWith('.en.md')).map(f => f.split('.')[0])

test('templates: one file per language, same layouts and blocks as the English one, valid JSON', () => {
  expect(readdirSync(import.meta.dir).filter(f => f.endsWith('.md')).length).toBe(ids.length * langs.length)
  for (const id of ids) {
    const en = parseSlidev(read(id, 'en'))
    for (const l of langs) {
      const md = read(id, l), s = parseSlidev(md)
      expect(headFormat(md).aspectRatio).toBe('16/9')
      expect(s.map(x => x.layout)).toEqual(en.map(x => x.layout))
      for (const k of ['timer', 'picks', 'quiz', 'chart', 'callout']) expect(md.split(`data-${k}=`).length).toBe(read(id, 'en').split(`data-${k}=`).length)
      for (const [, json] of md.matchAll(/data-(?:chart|quiz|picks)='([^']*)'/g)) expect(() => JSON.parse(json)).not.toThrow()
    }
  }
})
