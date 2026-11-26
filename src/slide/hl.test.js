import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hlLines, codeOpts, withLines, highlight } from './hl.js'

test('hlLines keeps spans balanced on every line', () => {
  const lines = hlLines('/* a\nb */\nx = 1', 'js')
  assert.equal(lines.length, 3)
  for (const l of lines) assert.equal((l.match(/<span/g) || []).length, (l.match(/<\/span>/g) || []).length)
  assert.match(lines[1], /^<span class="hljs-comment">b \*\/<\/span>$/)
})

test('codeOpts reads highlighted lines and numbering', () => {
  assert.deepEqual(codeOpts('{2,4-5}'), { lines: false, start: 1, marked: new Set([2, 4, 5]) })
  assert.deepEqual(codeOpts('{1|3}{lines:true,startLine:5}'), { lines: true, start: 5, marked: new Set([1]) })
  assert.equal(codeOpts('{all|2}').marked, null)
  assert.equal(codeOpts(undefined).marked, null)
})

test('withLines switches numbering and keeps the rest', () => {
  assert.equal(withLines(undefined, true), '{lines:true}')
  assert.equal(withLines('{2,3}', true), '{2,3}{lines:true}')
  assert.equal(withLines('{2,3}{lines:true}', false), '{2,3}')
  assert.equal(withLines('{lines:true}', false), undefined)
  assert.equal(withLines('{2}{startLine:5}', true), '{2}{lines:true,startLine:5}')
  assert.equal(withLines('{2}{lines:true,startLine:5}', false), '{2}{startLine:5}')
})
test('hlLines memo returns the same lines and stays bounded', () => {
  const a = hlLines('const x = 1\nlog(x)', 'js')
  assert.equal(hlLines('const x = 1\nlog(x)', 'js'), a)
  assert.notEqual(hlLines('const x = 1\nlog(x)', 'ts'), a) // the language is part of the key
  for (let i = 0; i < 300; i++) hlLines('x' + i, 'js')
  assert.notEqual(hlLines('const x = 1\nlog(x)', 'js'), a) // evicted, computed again
  assert.deepEqual(hlLines('const x = 1\nlog(x)', 'js'), a)
})

test('Astro: the frontmatter is highlighted as script, the template as HTML', () => {
  const h = highlight('---\nconst title = "A";\n---\n<h1>{title}</h1>', 'astro')
  assert.match(h, /^---\n<span class="hljs-keyword">const<\/span>/)
  assert.match(h, /\n---\n<span class="hljs-tag">/)
})
