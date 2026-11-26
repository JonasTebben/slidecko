import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSlidev, headFormat, codeEl, slidevTags } from './parseSlidev.js'

// the agent skill's example deck (skills/slidecko/SKILL.md) is read the way the skill says; the full import
// of every element (timer, quiz, chart …) is a step in scripts/smoke.js
export const skillDeck = () => readFileSync(join(import.meta.dir, '../../skills/slidecko/SKILL.md'), 'utf8').match(/````markdown\n([\s\S]*?)\n````/)[1]

test('the agent skill example is read as the skill describes', () => {
  const md = skillDeck()
  expect(headFormat(md)).toEqual({ aspectRatio: '16/9', transition: 'fade', duration: 900 })
  const s = parseSlidev(md)
  expect(s.map(x => x.layout)).toEqual(['cover', 'default', 'section', 'default', 'section', 'default', 'default', 'default', 'fact', 'default', 'default', 'end'])
  expect(s[0].notes).toContain('lost a cactus')
  expect(s[3].notes).toContain('[click] Shade lovers.')
  expect([...new Set(s[5].blocks.filter(b => b.col).map(b => b.col.index))]).toEqual([0, 1])
  const m = s[6].blocks.find(b => b.lang === 'mermaid')
  expect(codeEl(m.code, m.lang).type).toBe('diagram')
  expect(slidevTags(s[1].md)).toContain('data-toc')
  // the JSON of Slidecko's own blocks is valid
  for (const [, json] of md.matchAll(/data-(?:chart|quiz|picks)='([^']*)'/g)) expect(() => JSON.parse(json)).not.toThrow()
})
