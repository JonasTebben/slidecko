import { joinSlides, splitSource, diffSlides, lintSource, formatSource } from './source.js'

const a = '---\nlayout: cover\n---\n\n# Title\n', b = '# Plain\n\n- one\n', c = '---\nlayout: center\n---\n\n```js\n---\n```\n'

test('a file splits back into the slide texts it was joined from', () => {
  expect(splitSource(joinSlides([a, b, c]))).toEqual([a, b, c])
  expect(splitSource(joinSlides([b, a]))).toEqual([b, a])
})

test('unchanged texts keep their slide, edited and new ones are parsed', () => {
  const s1 = { id: 1 }, s2 = { id: 2 }
  expect(diffSlides([{ slide: s1, md: a }, { slide: s2, md: b }], [b, '# New\n', a])).toEqual([{ keep: s2 }, { md: '# New\n' }, { keep: s1 }])
})

test('lint checks slide bodies and reports file line numbers', async () => {
  const text = '---\nlayout: cover\n---\n\n# Title\n\n---\n\n#Bad heading\n'
  const p = await lintSource(text)
  expect(p.map(x => [x.rule, x.line])).toEqual([['MD018', 9]])
})

test('format tidies bodies and leaves frontmatter and separators alone', async () => {
  const out = await formatSource('---\nlayout: cover\n---\n\n# Title\n* one\n* two\n\n---\n\n| a | b |\n|-|-|\n| long cell | x |\n')
  expect(out).toBe('---\nlayout: cover\n---\n\n# Title\n\n- one\n- two\n\n---\n\n| a         | b   |\n| --------- | --- |\n| long cell | x   |\n')
})
