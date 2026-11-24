import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isRun, autorun, toJs, withRun, withAutorun, setLines, cleanOutput, outLine } from './run.js'
import { codeOpts } from './hl.js'
import { parseSlidev } from './parseSlidev.js'
import { toSlidev, slideHash } from './toSlidev.js'

// the runner is a plain script (public/, loaded by the sandboxed iframe): its helpers, without the iframe part
const src = readFileSync(new URL('../public/runner.js', import.meta.url), 'utf8')
const { fmt, errText, work } = new Function(src + '\nreturn { fmt, errText, work }')()

test('runnable meta: Slidev {monaco-run} with autorun and line numbers', () => {
  assert.equal(withRun('{2,3}', true), '{monaco-run}')
  assert.equal(withRun('{2}{lines:true}', true), "{monaco-run} {lineNumbers:'on'}")
  assert.equal(withRun("{monaco-run} {lineNumbers:'on'}", false), '{lines:true}')
  assert.equal(withRun('{monaco-run}', false), undefined)
  assert.equal(withAutorun('{monaco-run}', false), '{monaco-run} {autorun:false}')
  assert.equal(withAutorun('{monaco-run} {autorun:false}', true), '{monaco-run}')
  assert.equal(setLines('{monaco-run} {autorun:false}', true), "{monaco-run} {autorun:false, lineNumbers:'on'}")
  assert.equal(setLines('{2}', true), '{2}{lines:true}')
  assert.ok(isRun('{monaco-run} {autorun:false}') && !autorun('{monaco-run} {autorun: false}') && autorun('{monaco-run}'))
  // {monaco-run} is no line range: nothing is dimmed; Monaco's lineNumbers count as line numbers
  assert.deepEqual(codeOpts("{monaco-run} {lineNumbers:'on'}"), { lines: true, start: 1, marked: null })
})

test('Slidev: {monaco-run} blocks are read back with their options and stay byte for byte', () => {
  const md = '# Run\n\n```ts {monaco-run} {autorun:false}\nconsole.log(1)\n```\n'
  const [s] = parseSlidev(md)
  const code = s.blocks.find(b => b.type === 'code')
  assert.deepEqual([code.lang, code.meta, code.code], ['ts', '{monaco-run} {autorun:false}', 'console.log(1)'])
  // a kept output does not make the slide "edited"
  const el = { id: 'c', type: 'code', x: 0, y: 0, w: 400, h: 100, lang: 'ts', meta: code.meta, code: code.code }
  const kept = { layout: 'default', md, elements: [el] }
  kept.hash = slideHash(kept)
  const withOut = { ...kept, elements: [{ ...el, output: [{ k: 'log', t: '1' }] }] }
  assert.ok(toSlidev({ title: 'T', theme: 'hell', entry: 'slides.md', slides: [withOut] }, {}).files['slides.md'].includes(md.trim()))
  // a new runnable block is written with Slidev's fence
  const written = toSlidev({ title: 'T', theme: 'hell', entry: 'slides.md', slides: [{ layout: 'default', elements: [{ ...el, x: 500, meta: '{monaco-run}', code: 'let a = 1\na' }] }] }, {}).files['slides.md']
  assert.match(written, /^```ts \{monaco-run\}\nlet a = 1\na\n```$/m)
})

test('cleanOutput keeps known kinds as plain text, capped', () => {
  assert.equal(cleanOutput('x'), undefined)
  assert.deepEqual(cleanOutput([{ k: 'log', t: 'a' }, { k: 'evil', t: 'b' }, { k: 'error', t: 5 }, null, { k: 'result', t: '<b>', x: 1 }]), [{ k: 'log', t: 'a' }, { k: 'result', t: '<b>' }])
  assert.equal(cleanOutput(Array.from({ length: 500 }, () => ({ k: 'log', t: 'x' }))).length, 200)
  assert.equal(cleanOutput([{ k: 'log', t: 'x'.repeat(5000) }])[0].t.length, 2000)
  assert.ok(cleanOutput(Array.from({ length: 50 }, () => ({ k: 'log', t: 'x'.repeat(2000) }))).length <= 11)
  assert.deepEqual([{ k: 'result', t: '3' }, { k: 'error', t: 'E' }, { k: 'log', t: 'l' }].map(outLine), ['← 3', '✖ E', 'l'])
})

test('runner formats values like a console and names the line of an error', () => {
  assert.equal(fmt('a'), 'a')
  assert.equal(fmt(['a', 1, null, undefined, 2n]), '["a", 1, null, undefined, 2n]')
  assert.equal(fmt({ a: { b: [1] }, 'x-y': () => 1 }), '{ a: { b: [1] }, "x-y": ƒ x-y() }')
  const o = { n: 1 }; o.self = o
  assert.equal(fmt(o), '{ n: 1, self: [Circular] }')
  assert.equal(fmt(new Map([[1, 'a']])), 'Map(1) {1 => "a"}')
  assert.equal(fmt(new TypeError('bad')), 'TypeError: bad')
  const e = new Error('boom'); e.stack = 'Error: boom\n    at code.js:3:7'
  assert.equal(errText(e, 1), 'Error: boom (line 2)')
  assert.equal(errText('x', 0), 'Uncaught "x"')
})

test('runner worker: console output, the last value, errors and timers', async () => {
  const url = URL.createObjectURL(new Blob([`'use strict'\n${fmt}\n${errText}\n(${work})()`], { type: 'text/javascript' }))
  const run = code => new Promise(resolve => {
    const w = new Worker(url), out = []
    w.onmessage = ({ data }) => { if (data.k === 'end') { w.terminate(); resolve(out) } else out.push(data.k + ':' + data.t) }
    w.postMessage(code)
  })
  assert.deepEqual(await run('console.log("hi", {a: 1}); console.warn(2); 1 + 2'), ['log:hi { a: 1 }', 'warn:2', 'result:3'])
  assert.match((await run('const x = 1\nx.y.z'))[0], /^error:TypeError: .* \(line 2\)$/)
  assert.match((await run('let = ;'))[0], /^error:SyntaxError/)
  assert.deepEqual(await run('setTimeout(() => console.log("later"), 20); "now"'), ['result:"now"', 'log:later'])
  assert.deepEqual(await run('await new Promise(r => setTimeout(r, 10)); console.log("awaited")'), ['log:awaited'])
})

test('TypeScript runs as JavaScript: types go, lines stay, enums work, JavaScript is untouched', async () => {
  const ts = 'interface P { n: number }\nconst p: P = { n: 2 }\nenum E { A, B }\nfunction f<T>(x: T): T { return x }\nf<number>(p.n) + E.B as number'
  const js = await toJs(ts, 'ts')
  assert.equal(js.split('\n').length, ts.split('\n').length)
  assert.equal(new Function(js.replace(/\n([^\n]*)$/, '\nreturn $1'))(), 3)
  assert.equal(await toJs('let a: = 1', 'js'), 'let a: = 1')
  await assert.rejects(toJs('let a: = 1', 'typescript'))
})
