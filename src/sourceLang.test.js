import { parser } from '@lezer/markdown'
import { slidev } from './sourceLang.js'

const names = text => {
  const out = [], p = parser.configure(slidev)
  p.parse(text).iterate({ enter: n => { if (n.type.name !== 'Document') out.push(n.name) } })
  return out
}

test('frontmatter, separators and headings are told apart', () => {
  const t = names('---\nlayout: cover\n---\n\n# Title\ntext\n---\n\nmore\n')
  expect(t.slice(0, 6)).toEqual(['SlideFrontmatter', 'FmMark', 'FmKey', 'FmValue', 'FmMark', 'ATXHeading1'])
  expect(t).toContain('SlideSeparator')
  expect(t).not.toContain('SetextHeading2')
})
