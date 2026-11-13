import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hlLines, codeOpts, withLines } from './hl.js'

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
