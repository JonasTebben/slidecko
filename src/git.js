// A Git repository as plain files (.git/…), written without git: loose objects, one branch and an index,
// so after unpacking "git log" lists the versions and "git status" is clean
const enc = new TextEncoder()
const bytes = c => (typeof c === 'string' ? enc.encode(c) : c)
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) { out.set(p, i); i += p.length }
  return out
}
const sha1 = async b => new Uint8Array(await crypto.subtle.digest('SHA-1', b))
export const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('')
// CompressionStream 'deflate' is zlib-wrapped, the format of Git's loose objects
const zlib = async b => new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer())
// Git orders tree and index entries by their bytes, not by JavaScript's UTF-16 order
const byBytes = (a, b) => {
  const x = enc.encode(a), y = enc.encode(b)
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i]
  return x.length - y.length
}
const nest = files => {
  const root = {}
  for (const [path, content] of Object.entries(files)) {
    const parts = path.split('/')
    let node = root
    for (const dir of parts.slice(0, -1)) node = node[dir] ??= {}
    node[parts.at(-1)] = bytes(content)
  }
  return root
}

// commits: [{ files: { path: text or Uint8Array }, at: ms, message }], oldest first; returns { '.git/…': Uint8Array }
export async function gitRepo(commits, { author = 'Slidecko <noreply@slidecko.de>', branch = 'main' } = {}) {
  const out = {}
  const object = async (type, body) => {
    const raw = concat(enc.encode(`${type} ${body.length}\0`), body), id = await sha1(raw), h = hex(id)
    out[`.git/objects/${h.slice(0, 2)}/${h.slice(2)}`] ??= await zlib(raw)
    return id
  }
  const tree = async node => {
    const entries = await Promise.all(Object.entries(node).map(async ([name, v]) =>
      v instanceof Uint8Array ? ['100644', name, await object('blob', v)] : ['40000', name, await tree(v)]))
    entries.sort(([m1, a], [m2, b]) => byBytes(a + (m1 === '40000' ? '/' : ''), b + (m2 === '40000' ? '/' : ''))) // a folder sorts as "name/"
    return object('tree', concat(...entries.flatMap(([mode, name, id]) => [enc.encode(`${mode} ${name}\0`), id])))
  }
  let head
  for (const c of commits) {
    const who = `${author} ${Math.floor(c.at / 1000)} +0000`
    const tid = await tree(nest(c.files))
    head = await object('commit', enc.encode(`tree ${hex(tid)}\n${head ? `parent ${hex(head)}\n` : ''}author ${who}\ncommitter ${who}\n\n${c.message}\n`))
  }
  out['.git/HEAD'] = enc.encode(`ref: refs/heads/${branch}\n`)
  out['.git/config'] = enc.encode('[core]\n\trepositoryformatversion = 0\n\tfilemode = false\n\tbare = false\n')
  if (!head) return out
  out[`.git/refs/heads/${branch}`] = enc.encode(hex(head) + '\n')
  // index v2 of the newest commit; stat fields stay 0, git compares the content once and then keeps it
  const files = Object.entries(commits.at(-1).files).map(([p, c]) => [p, bytes(c)]).sort(([a], [b]) => byBytes(a, b))
  const entries = await Promise.all(files.map(async ([path, data]) => {
    const name = enc.encode(path), e = new Uint8Array(Math.ceil((62 + name.length + 1) / 8) * 8), v = new DataView(e.buffer)
    v.setUint32(24, 0o100644)
    v.setUint32(36, data.length)
    e.set(await sha1(concat(enc.encode(`blob ${data.length}\0`), data)), 40)
    v.setUint16(60, Math.min(name.length, 0xfff))
    e.set(name, 62)
    return e
  }))
  const head12 = new Uint8Array(12), hv = new DataView(head12.buffer)
  head12.set(enc.encode('DIRC'))
  hv.setUint32(4, 2)
  hv.setUint32(8, entries.length)
  const index = concat(head12, ...entries)
  out['.git/index'] = concat(index, await sha1(index))
  return out
}
