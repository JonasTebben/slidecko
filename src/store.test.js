import test from 'node:test'
import assert from 'node:assert/strict'
// the store wants a browser: just enough of one
globalThis.document ??= { activeElement: null, createElement: () => ({}), querySelector: () => null }
globalThis.indexedDB ??= { open: () => ({}) }
const { mergeList } = await import('./store.js')

const p = (id, updated, title = id) => ({ id, title, updated })
const merge = (stored, mine, o = {}) => mergeList(stored, new Map(mine.map(x => [x.id, x])), { added: new Set(o.added), removed: new Set(o.removed), own: o.own || (() => false) }).map(x => x.id + ':' + x.title)

test('mergeList keeps what other tabs stored and adds this tab’s new projects', () => {
  // B created Q; A only has P in memory and created R
  assert.deepEqual(merge([p('Q', 3), p('P', 1)], [p('P', 1), p('R', 2)], { added: ['R'] }), ['Q:Q', 'R:R', 'P:P'])
})
test('mergeList never writes back a project deleted in another tab', () => {
  // P was deleted elsewhere; this tab still lists it in memory
  assert.deepEqual(merge([p('Q', 3)], [p('P', 5), p('Q', 3)]), ['Q:Q'])
})
test('mergeList drops what this tab deleted and replaces only its own entries', () => {
  const stored = [p('P', 1, 'old'), p('Q', 2, 'theirs'), p('X', 0)]
  const mine = [p('P', 4, 'new'), p('Q', 1, 'stale')]
  assert.deepEqual(merge(stored, mine, { removed: ['X'], own: id => id === 'P' }), ['P:new', 'Q:theirs'])
})

// a fresh store on a fake IndexedDB: requests succeed before their transaction commits or aborts, as in browsers
const data = new Map()
let quota = false // the next write transaction aborts with a full disk, after its request succeeded
const fakeIdb = {
  open() {
    const later = f => setTimeout(f, 0)
    const db = { objectStoreNames: { contains: () => true }, transaction(_, mode) {
      const tx = { error: null }, writes = []
      let rq
      tx.objectStore = () => {
        const req = (f, w) => { rq = {}; later(() => { if (w) writes.push(w); rq.result = f(); rq.onsuccess?.(); finish() }); return rq }
        return { get: k => req(() => data.get(k)), put: (v, k) => req(() => undefined, () => data.set(k, v)), delete: k => req(() => undefined, () => data.delete(k)) }
      }
      const finish = () => later(() => {
        if (mode === 'readwrite' && quota) { quota = false; tx.error = { name: 'QuotaExceededError', message: 'quota' }; return tx.onabort?.() }
        writes.forEach(w => w()); tx.oncomplete?.()
      })
      return tx
    } }
    const r = { result: db }
    setTimeout(() => r.onsuccess?.(), 0)
    return r
  },
}
const real = globalThis.indexedDB
globalThis.indexedDB = fakeIdb
const S = await import('./store.js?idb')
globalThis.indexedDB = real

test('a write the browser aborts (full disk) is a failed save, not a saved one', async () => {
  data.set('p:x', JSON.stringify({ title: 'Old', slides: [] }))
  quota = true
  await assert.rejects(S.renameProject('x', 'New'))
  assert.equal(JSON.parse(data.get('p:x')).title, 'Old')
})

test('cleanSlides skips entries that are no slide', () => {
  assert.equal(S.cleanSlides([null, 1, { layout: 'cover', elements: [null] }]).length, 1)
})

test('groups: cleanEl keeps a valid group id, a click selects the group, copies get a new one', () => {
  const box = g => S.cleanEl({ type: 'shape', group: g })
  assert.equal(box('g1').group, 'g1')
  assert.equal(box('<x>').group, undefined)
  const els = [{ id: 'a', group: 'g' }, { id: 'b' }, { id: 'c', group: 'g' }]
  assert.deepEqual(S.withGroups(els, ['a']), ['c', 'a'])
  assert.deepEqual(S.withGroups(els, ['b']), ['b'])
  const copy = S.regroup([{ group: 'g' }, { group: 'g' }, {}])
  assert.ok(copy[0].group !== 'g' && copy[0].group === copy[1].group && !copy[2].group)
})

test('hidden slides: only true is kept, exports leave them out, presenting skips them', async () => {
  const { cleanSlides, shownSlides, nextShown } = await import('./store.js')
  const s = cleanSlides([{ hidden: true }, { hidden: 'yes' }, {}, { hidden: true }])
  assert.deepEqual(s.map(x => x.hidden), [true, undefined, undefined, true])
  assert.equal(shownSlides(s).length, 2)
  assert.equal(nextShown(s, 1, 1), 2)
  assert.equal(nextShown(s, 2, 1), 2) // nothing visible after: stays
  assert.equal(nextShown(s, 2, -1), 1)
  assert.equal(nextShown(s, -1, 1), 1) // first shown
})

test('snapshots: newest first, at most SNAP_MAX, the same content not twice', () => {
  const s = (at, json = 'j' + at) => ({ at, slides: 1, json })
  let list = []
  for (let i = 1; i <= S.SNAP_MAX + 3; i++) list = S.addSnap(list, s(i))
  assert.equal(list.length, S.SNAP_MAX)
  assert.deepEqual([list[0].at, list.at(-1).at], [S.SNAP_MAX + 3, 4])
  assert.deepEqual(S.addSnap(list, s(99, list[0].json)), list)
  assert.deepEqual(S.addSnap([s(5)], s(3)).map(x => x.at), [5, 3]) // a stored list from another tab stays ordered
})
test('snapshots keep only the images a kept snapshot uses', () => {
  const json = JSON.stringify({ slides: [{ elements: [{ asset: 'a' }, { html: '<img data-asset="b">' }] }] })
  assert.deepEqual(S.snapAssets([{ json }], { a: 1, b: 2, c: 3 }), { a: 1, b: 2 })
})
test('snapshots are stored apart from the project: a full disk fails only the snapshot', async () => {
  Object.assign(S.deck, { id: 'snap', slides: [{ id: 's', elements: [] }] })
  await S.saveSnapshot()
  await S.saveSnapshot() // unchanged: not kept twice
  assert.equal((await S.listSnapshots()).length, 1)
  data.set('p:snap', 'project')
  quota = true
  await assert.rejects(S.saveSnapshot(JSON.stringify({ slides: [] })))
  assert.equal(data.get('p:snap'), 'project')
  assert.equal((await S.listSnapshots()).length, 1)
  await S.deleteSnapshot((await S.listSnapshots())[0].at)
  assert.equal((await S.listSnapshots()).length, 0)
  S.deck.id = ''
})

test('cleanSlides keeps only the transitions the editor offers', async () => {
  const { cleanSlides } = await import('./store.js')
  assert.deepEqual(cleanSlides([{ transition: 'fade' }, { transition: 'none' }, { transition: 'slide-right' }, { transition: '<x>' }]).map(s => s.transition), ['fade', 'none', undefined, undefined])
})

test('runnable code: output kept as capped plain lines, panel side and size validated', () => {
  const el = S.cleanEl({ type: 'code', code: 'x', meta: '{monaco-run}', output: [{ k: 'log', t: 'a' }, { k: 'x', t: 'b' }, ...Array(300).fill({ k: 'log', t: 'c' })], outPos: 'right', outH: 9999 })
  assert.deepEqual([el.meta, el.output[0], el.output.length, el.outPos, el.outH], ['{monaco-run}', { k: 'log', t: 'a' }, 199, 'right', 400])
  const none = S.cleanEl({ type: 'code', code: 'x', output: [], outPos: 'top' })
  assert.ok(!('output' in none) && !('outPos' in none) && !('outH' in none))
})

test('timer: seconds are kept within a day-sized range, a bad colour is dropped', () => {
  assert.equal(S.cleanEl({ type: 'timer', seconds: 600.4 }).seconds, 600)
  assert.equal(S.cleanEl({ type: 'timer', seconds: -5 }).seconds, 0)
  assert.equal(S.cleanEl({ type: 'timer', seconds: 'x' }).seconds, 0)
  assert.equal(S.cleanEl({ type: 'timer', seconds: 1e9 }).seconds, 359999)
  assert.equal(S.cleanEl({ type: 'timer', color: 'red;x' }).color, undefined)
})

test('picker: names are trimmed strings, empty lines and non-strings dropped, length and count limited', () => {
  assert.deepEqual(S.cleanEl({ type: 'picker', names: [' Ana ', '', 3, null, 'Ben'] }).names, ['Ana', 'Ben'])
  assert.deepEqual(S.cleanEl({ type: 'picker', names: 'Ana' }).names, [])
  assert.equal(S.cleanEl({ type: 'picker', names: ['x'.repeat(500)] }).names[0].length, 100)
  assert.equal(S.cleanEl({ type: 'picker', names: Array(500).fill('a') }).names.length, 200)
})

test('click steps: next reveals a step before the slide changes, back hides it, arriving backwards shows all', async () => {
  const { stepMove, clickSteps, revealed } = await import('./store.js')
  const el = click => ({ click })
  const s = [{ elements: [el(), el(3), el(1), el(3)] }, { hidden: true, elements: [el(1)] }, { elements: [] }, { elements: [el(2)] }]
  assert.deepEqual(clickSteps(s[0]), [1, 3])
  assert.deepEqual([0, 1, 2].map(k => s[0].elements.filter(e => revealed(e, [1, 3], k)).length), [1, 2, 4])
  assert.deepEqual(stepMove(s, 0, 0, 1), { slide: 0, step: 1 })
  assert.deepEqual(stepMove(s, 0, 2, 1), { slide: 2, step: 0 }) // all shown: next slide, the hidden one skipped
  assert.deepEqual(stepMove(s, 0, 1, -1), { slide: 0, step: 0 })
  assert.deepEqual(stepMove(s, 0, 0, -1), { slide: 0, step: 0 }) // first slide: stays
  assert.deepEqual(stepMove(s, 2, 0, -1), { slide: 0, step: 2 })
  assert.deepEqual(stepMove(s, 3, 1, 1), { slide: 3, step: 1 }) // end: stays
  assert.deepEqual(stepMove(s, 0, 5, 1), { slide: 2, step: 0 }) // a step past the end (elements removed) counts as all shown
})
test('list items one by one: every top-level item is a click step, later steps move back', async () => {
  const { stepMove, clickSteps, stepOf, markItems } = await import('./store.js')
  const html = '<p>x</p><ul><li>a<ul><li>nested</li></ul></li><li>b</li></ul><ol><li>c</li></ol>'
  const list = { clickItems: true, html, click: 2 }, after = { click: 3 }, bare = { clickItems: true, html: '<ul><li>d</li><li>e</li></ul>' }
  const s = { elements: [{ click: 2 }, after, list, bare, { clickItems: true, html: '<p>no list</p>' }] }
  assert.deepEqual(clickSteps(s), [2, 2, 2, 3, 100, 100]) // a, b, c; then the next number; the box without a number last
  assert.deepEqual([list, after, bare].map(e => stepOf(s, e)), [1, 4, 5])
  assert.deepEqual(stepMove([s], 0, 5, 1), { slide: 0, step: 6 })
  assert.deepEqual(stepMove([s], 0, 6, 1), { slide: 0, step: 6 }) // all shown, last slide: stays
  const marked = markItems(html, 1, 2)
  assert.deepEqual([...marked.matchAll(/<li( data-click="\d")?( data-unshown)?>/g)].map(m => m.slice(1).join('')), [' data-click="1"', '', ' data-click="2"', ' data-click="3" data-unshown'])
})
test('click order is kept as a whole number from 1 to 99', () => {
  assert.equal(S.cleanEl({ type: 'shape', click: '2.4' }).click, 2)
  assert.equal(S.cleanEl({ type: 'shape', click: 500 }).click, 99)
  for (const v of [0, -1, 'x', null]) assert.equal(S.cleanEl({ type: 'shape', click: v }).click, undefined)
})

test('notes box: the "editable while presenting" flag is kept only on text boxes and only as true', async () => {
  const { default: DOMPurify } = await import('dompurify')
  const real = DOMPurify.sanitize
  DOMPurify.sanitize = String // no DOM here; the sanitizing itself is not under test
  try {
    assert.equal(S.cleanEl({ type: 'text', html: '<p>x</p>', board: true }).board, true)
    assert.equal(S.cleanEl({ type: 'text', html: '<p>x</p>', board: 'yes' }).board, undefined)
    assert.equal(S.cleanEl({ type: 'timer', seconds: 60, board: true }).board, undefined)
  } finally { DOMPurify.sanitize = real }
})

test('quiz: plain one-line text with length limits, 2–6 answers, only true marks one correct', () => {
  const q = S.cleanEl({ type: 'quiz', question: '  Why\n<b>x</b>?  ' + 'a'.repeat(400), answers: [{ text: 'A', correct: 'yes' }, null, { text: 7, correct: true }, ...Array(9).fill({ text: 'z'.repeat(300) })] })
  assert.equal(q.question.length, 300)
  assert.ok(q.question.startsWith('Why <b>x</b>?')) // stays text: rendered with {{ }}, never as HTML
  assert.equal(q.answers.length, 6)
  assert.deepEqual(q.answers.slice(0, 2), [{ text: 'A' }, { text: '', correct: true }])
  assert.equal(q.answers[2].text.length, 200)
  assert.deepEqual(S.cleanEl({ type: 'quiz', answers: 'x' }).answers, [{ text: '' }, { text: '' }])
})

test('layouts: a project without them gets the presets plus one per other Slidev layout its slides use, and every slide a type', async () => {
  const { default: DOMPurify } = await import('dompurify')
  const real = DOMPurify.sanitize
  DOMPurify.sanitize = String
  try {
    const slides = S.cleanSlides([{ layout: 'cover' }, { layout: 'default' }, { layout: 'center' }, { layout: 'default', type: 'two' }])
    const { layouts, master } = S.setupLayouts({}, slides)
    assert.deepEqual(master, [])
    assert.ok(layouts.some(l => l.id === 'content' && l.elements.length && l.elements.every(e => e.placeholder)))
    assert.deepEqual(slides.map(s => s.type), ['title', 'content', 'center', 'two'])
    assert.equal(layouts.find(l => l.id === 'center').layout, 'center')
    // stored layouts are cleaned: bad id, base and name, a repeated id
    const kept = S.setupLayouts({ layouts: [{ id: 'a', name: ' A ', layout: 'cover', elements: [{ type: 'shape' }, { type: 'nope' }] }, { id: 'a', layout: 'x y' }, 'junk'], master: [{ type: 'shape', placeholder: 'yes' }] }, [])
    assert.equal(kept.layouts.length, 2)
    assert.deepEqual([kept.layouts[0].name, kept.layouts[0].layout, kept.layouts[0].elements.length], ['A', 'cover', 1])
    assert.notEqual(kept.layouts[1].id, 'a')
    assert.equal(kept.layouts[1].layout, 'default')
    assert.equal(kept.master[0].placeholder, undefined)
  } finally { DOMPurify.sanitize = real }
})

test('layouts: the master and a layout’s decorations are drawn behind a slide, placeholders are not', () => {
  const m = { id: 'm', type: 'shape' }, deco = { id: 'd', type: 'shape' }, ph = { id: 'p', type: 'text', placeholder: true }
  const L = { id: 'L', name: 'L', layout: 'cover', elements: [deco, ph] }
  const d = { master: [m], layouts: [{ id: 'c', layout: 'default', elements: [] }, L], slides: [] }
  assert.deepEqual(S.underlay({ type: 'L', layout: 'cover', elements: [] }, d), [m, deco])
  assert.deepEqual(S.underlay({ layout: 'cover', elements: [] }, d), [m, deco]) // no type: the first layout with its Slidev layout
  assert.deepEqual(S.underlay({ type: 'L', layout: 'cover', hideMaster: true, elements: [] }, d), [deco])
  assert.deepEqual(S.underlay({ type: 'L', layout: 'section', elements: [] }, d), [m]) // the slide's Slidev layout changed: no longer L
  assert.deepEqual(S.underlay(L, d), [m]) // editing a layout shows the master behind it
  assert.deepEqual(S.underlay({ id: 'master', elements: d.master }, d), [])
})

test('layouts: deleting one moves its slides to the default layout, keeping their content; the last one stays', () => {
  const el = { id: 'e', type: 'shape' }
  const d = { master: [], layouts: [{ id: 'c', layout: 'default', elements: [] }, { id: 'L', layout: 'cover', elements: [] }], slides: [{ type: 'L', layout: 'cover', elements: [el] }] }
  S.removeLayout('L', d)
  assert.deepEqual(d.layouts.map(l => l.id), ['c'])
  assert.deepEqual(d.slides[0], { type: 'c', layout: 'default', elements: [el] })
  S.removeLayout('c', d)
  assert.equal(d.layouts.length, 1)
})

test('icon: set:name pattern, SVG body without scripts or outside links, view box, turns, flips and label', async () => {
  const { default: DOMPurify } = await import('dompurify')
  DOMPurify.sanitize ??= String // no DOM here: the pre-check is under test, DOMPurify's SVG profile runs in the browser
  const body = '<path fill="currentColor" d="M0 0h24v24z"/>'
  const ok = S.cleanEl({ type: 'icon', icon: 'mdi:home', body, view: '0 0 24 24', rotate: 2, flip: 'hv', label: '  Home ', color: 'currentColor' })
  const { icon, view, rotate, flip, label, color } = ok
  assert.deepEqual({ icon, body: ok.body, view, rotate, flip, label, color }, { icon: 'mdi:home', body, view: '0 0 24 24', rotate: 2, flip: 'hv', label: 'Home', color: 'currentColor' })
  for (const icon of ['home', 'mdi:Home', 'mdi:../x', 'mdi:home"', ':home', 'mdi:']) assert.equal(S.cleanEl({ type: 'icon', icon, body }), null, icon)
  for (const bad of ['<script>alert(1)</script>', '<path onload="x" d="M0"/>', '<a href="https://x"><path d="M0"/></a>', '<use href="https://x/y.svg#a"/>', '<path fill="url(https://x)"/>', '<foreignObject><p>x</p></foreignObject>', '<image href="x.png"/>', '<animate attributeName="href" to="javascript:alert(1)"/>', '', 42])
    assert.equal(S.cleanEl({ type: 'icon', icon: 'mdi:home', body: bad }), null, String(bad))
  const odd = S.cleanEl({ type: 'icon', icon: 'mdi:home', body: '<use href="#a"/>', view: '0 0 24 x', rotate: 4, flip: 'x', color: 'red;x' })
  assert.deepEqual([odd.view, odd.rotate, odd.flip, odd.color], ['0 0 24 24', undefined, undefined, undefined])
})

test('cleanEl: missing optional keys stay absent (not set to undefined)', () => {
  const e = S.cleanEl({ type: 'shape', shape: 'rect' })
  for (const k of ['group', 'morph', 'mid']) assert.ok(!(k in e), k)
})
