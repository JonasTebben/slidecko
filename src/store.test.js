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
