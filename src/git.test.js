import { gitRepo } from './git.js'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { inflateSync } from 'node:zlib'

const commits = [
  { at: 1700000000000, message: 'First', files: { 'slides.md': '# Hello\n', 'public/a.png': new Uint8Array([1, 2, 3]) } },
  { at: 1700000600000, message: 'Second', files: { 'slides.md': '# Hello again\n', 'public/a.png': new Uint8Array([1, 2, 3]), 'pages/ä b.md': 'x' } },
]

test('blobs are zlib-compressed objects with the hash git gives them', async () => {
  const out = await gitRepo([{ at: 0, message: 'm', files: { 'a.txt': 'hello\n' } }])
  const blob = out['.git/objects/ce/013625030ba8dba906f756967f9e9ca394464a'] // git hash-object of "hello\n"
  expect(inflateSync(blob).toString()).toBe('blob 6\0hello\n')
  expect(new TextDecoder().decode(out['.git/HEAD'])).toBe('ref: refs/heads/main\n')
})

test('no commits: only HEAD and config', async () => {
  expect(Object.keys(await gitRepo([])).sort()).toEqual(['.git/HEAD', '.git/config'])
})

// with git installed: the unpacked repository is valid, has both commits and a clean working tree
const git = Bun.which('git')
test.if(!!git)('git accepts the repository', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'slidecko-git-'))
  try {
    const files = { ...commits[1].files, ...(await gitRepo(commits)) }
    for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), c) }
    const run = (...a) => Bun.spawnSync([git, '-C', dir, ...a], { env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } })
    expect(run('fsck', '--strict').exitCode).toBe(0)
    expect(run('log', '--format=%s %at').stdout.toString()).toBe('Second 1700000600\nFirst 1700000000\n')
    expect(run('status', '--porcelain').stdout.toString()).toBe('')
    expect(run('show', 'HEAD~1:slides.md').stdout.toString()).toBe('# Hello\n')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
