// Smoke test of the whole app in a browser: every module loads, the main dialogs open, every export
// downloads and imports again, in the dev server and in the production build. Run with `bun run smoke`
// (installs Chromium for Playwright once and builds first). Exits with 1 when a step fails.
import { chromium } from 'playwright'
import { readdirSync, statSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const OUT = join(ROOT, '.smoke-tmp')
const DEV = 'http://localhost:5197/', PROD = 'http://localhost:5196/'
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const fails = []
let current // the page a failing step screenshots
const step = async (name, fn) => {
  try { await fn(); console.log('ok   ', name) } catch (e) {
    fails.push(name)
    await current?.screenshot({ path: join(OUT, `fail-${name.replace(/\W+/g, '-')}.png`) }).catch(() => {})
    console.log('FAIL ', name, '–', String(e?.message || e).split('\n')[0]) }
}

// servers: Vite for the sources, server.js for dist/
const servers = [
  Bun.spawn(['bunx', 'vite', '--port', '5197', '--strictPort'], { cwd: ROOT, stdout: 'ignore', stderr: 'ignore' }),
  Bun.spawn(['bun', 'server.js'], { cwd: ROOT, env: { ...process.env, PORT: '5196' }, stdout: 'ignore', stderr: 'ignore' }),
]
const stop = () => servers.forEach(s => s.kill())
process.on('exit', stop)
for (const url of [DEV, PROD]) {
  for (let i = 0; ; i++) {
    try { if ((await fetch(url)).ok) break } catch { /* not up yet */ }
    if (i > 60) { console.log('FAIL  server did not start:', url); process.exit(1) }
    await Bun.sleep(500)
  }
}

const modules = []
const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(js|vue)$/.test(f) && !f.endsWith('.test.js') && f !== 'main.js' && modules.push('/' + relative(ROOT, p)) } }
walk(join(ROOT, 'src'))

// one slide per kind of content
const DECK = {
  title: 'Smoke deck', theme: 'ozean',
  slides: [
    { layout: 'cover', notes: 'Notes [click] more', elements: [
      { type: 'text', title: true, x: 60, y: 186, w: 860, h: 80, html: '<h1>Smoke deck</h1>' },
      { type: 'text', x: 60, y: 280, w: 860, h: 36, html: '<h2>Subtitle</h2>' }] },
    { layout: 'default', elements: [
      { type: 'text', title: true, x: 56, y: 40, w: 868, h: 40, html: '<h1>Chart</h1>' },
      { type: 'chart', kind: 'column', legend: true, categories: ['A', 'B', 'C'], series: [{ name: 'S1', values: [1, 3, 2] }], x: 56, y: 110, w: 560, h: 380 },
      { type: 'text', x: 650, y: 130, w: 274, h: 220, html: '<ul><li>one</li><li>two $x^2$</li></ul>' }] },
    { layout: 'default', elements: [
      { type: 'text', title: true, x: 56, y: 40, w: 868, h: 40, html: '<h1>Diagram</h1>' },
      { type: 'diagram', code: 'flowchart LR\n  A --> B', x: 56, y: 120, w: 868, h: 220 },
      { type: 'math', tex: 'E = mc^2', fontSize: 36, x: 460, y: 360, w: 464, h: 90 }] },
    { layout: 'quiz', elements: [
      { type: 'quiz', question: 'Q?', answers: [{ text: 'a', correct: true }, { text: 'b' }], x: 80, y: 60, w: 800, h: 420 }] },
    { layout: 'default', elements: [
      { type: 'text', title: true, x: 56, y: 40, w: 868, h: 40, html: '<h1>Picker</h1>' },
      { type: 'picker', names: ['x', 'y'], fontSize: 56, x: 56, y: 170, w: 440, h: 180 },
      { type: 'timer', seconds: 60, fontSize: 56, x: 560, y: 170, w: 364, h: 180 },
      { type: 'code', lang: 'js', code: 'const a = 1\nconsole.log(a)', x: 56, y: 380, w: 500, h: 120 }] },
  ],
}

const browser = await chromium.launch()
const errors = []
const open = async (url, label, viewport = { width: 1280, height: 800 }) => {
  const ctx = await browser.newContext({ viewport, locale: 'en', acceptDownloads: true })
  await ctx.addInitScript(() => localStorage.setItem('slides-builder:tour', 'done'))
  const page = current = await ctx.newPage()
  page.on('pageerror', e => errors.push(`${label}: ${e.message}`))
  page.on('console', m => m.type() === 'error' && errors.push(`${label}: ${m.text()}`))
  page.on('response', r => r.status() >= 400 && errors.push(`${label}: HTTP ${r.status()} ${r.url()}`))
  await page.goto(url + '?lang=en')
  await page.waitForSelector('.home', { timeout: 20000 })
  return page
}
// waits for the palette and clicks the command itself: typing ahead of the UI, or a similar command ranked higher, picks another one
const palette = async (page, cmd) => {
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+k')
  await page.waitForSelector('dialog[open] input', { timeout: 5000 })
  await page.keyboard.type(cmd)
  await page.locator('dialog[open] li', { hasText: cmd }).first().click({ timeout: 5000 })
}
const dialog = async (page, cmd, selector = 'dialog[open]') => { await palette(page, cmd); await page.waitForSelector(selector, { timeout: 10000 }); await page.keyboard.press('Escape') }
const download = async (page, trigger, label) => {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), trigger()])
  const path = join(OUT, `${label}-${d.suggestedFilename()}`)
  await d.saveAs(path)
  if (statSync(path).size < 200) throw new Error('file too small')
  return { path, name: d.suggestedFilename() }
}
// arrow keys would nudge a selected element: the slide list switches slides
const go = async (page, i) => { await page.keyboard.press('Escape'); await page.locator('.slide-list .thumb').nth(i).click(); await page.keyboard.press('Escape') }

const EXPORTS = [['Export: PowerPoint (all)', 'pptx'], ['Export: PowerPoint for Google', 'google'], ['Export: OpenDocument', 'odp'], ['Export: HTML presentation', 'html'],
  ['Export: PNG images', 'png'], ['Export: PowerPoint as images', 'pptx-images'], ['Export: Slidev project', 'slidev'], ['Save project as file', 'json']]

// the same checks on the dev server and the production build
async function editor(page, label) {
  await step(`${label}: slides and slide list render`, async () => {
    await page.waitForSelector('.stage .slide', { timeout: 10000 })
    if ((await page.locator('.slide-list .thumb').count()) !== DECK.slides.length) throw new Error('wrong number of thumbnails')
  })
  await step(`${label}: chart and its inspector`, async () => {
    await go(page, 1)
    await page.locator('.stage .el.chart').first().click()
    await page.locator('.inspector select:has(option[value="line"])').selectOption('line', { timeout: 5000 })
    await page.waitForSelector('.stage .el.chart svg')
  })
  await step(`${label}: diagram and formula`, async () => {
    await go(page, 2)
    await page.waitForSelector('.stage .el.diagram img, .stage .el.diagram svg', { timeout: 15000 })
    await page.waitForSelector('.stage .katex', { timeout: 10000 })
  })
  await step(`${label}: Markdown source editor`, async () => { await palette(page, 'Edit all Markdown'); await page.waitForSelector('.cm-editor', { timeout: 20000 }); await page.keyboard.press('Escape') })
  await step(`${label}: accessibility check`, () => dialog(page, 'accessibility', 'dialog.a11y[open]'))
  await step(`${label}: keyboard shortcuts`, () => dialog(page, 'Keyboard shortcuts'))
  await step(`${label}: theme editor`, () => dialog(page, 'Edit theme'))
  await step(`${label}: snapshot and version history`, async () => { await palette(page, 'Save snapshot'); await dialog(page, 'Version history') })
  await step(`${label}: tour`, async () => {
    await palette(page, 'Take the tour')
    await page.waitForSelector('.tour-bubble', { timeout: 10000 }).catch(async e => {
      throw new Error(`${e.message.split('\n')[0]} (tour bubbles: ${await page.locator('[class*=tour]').count()})`)
    })
    await page.keyboard.press('Escape')
  })
  // the find field keeps the focus: the next command goes to the slide list first (go)
  await step(`${label}: find`, async () => { await palette(page, 'Find'); await page.keyboard.type('Chart'); await page.keyboard.press('Escape') })
  await step(`${label}: presenter view`, async () => {
    await go(page, 0)
    await palette(page, 'Presenter view'); await page.waitForSelector('.presenter', { timeout: 10000 })
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Escape')
  })
  await step(`${label}: rehearse`, async () => { await palette(page, 'Rehearse'); await page.waitForTimeout(1000); await page.keyboard.press('Escape'); await page.keyboard.press('Escape') })
  await step(`${label}: export dialog`, () => dialog(page, 'Export …'))
  const files = {}
  for (const [cmd, key] of EXPORTS) await step(`${label}: ${cmd}`, async () => { files[key] = await download(page, () => palette(page, cmd), `${label}-${key}`) })
  return files
}

// 1. dev server: modules, the deck, lazy dialogs, every export and its import
let page = await open(DEV, 'dev')
await step(`dev: all ${modules.length} modules import`, async () => {
  const bad = await page.evaluate(async list => {
    const out = []
    for (const m of list) try { await import(m) } catch (e) { out.push(`${m}: ${e.message}`) }
    return out
  }, modules)
  if (bad.length) throw new Error(bad.join('; '))
})
await step('dev: create project', async () => {
  await page.evaluate(async d => {
    const S = await import('/src/core/store.js')
    await S.createProject({ ...d, slides: d.slides.map(s => ({ ...s, elements: s.elements.map(e => ({ id: S.uid(), ...e })) })) })
  }, DECK)
  await page.waitForSelector('.stage .slide')
})
await step('dev: icon picker', async () => {
  await page.evaluate(async () => { Object.assign((await import('/src/slide/icons.js')).picker, { open: true, target: null }) })
  await page.waitForSelector('dialog[open]', { timeout: 10000 }); await page.keyboard.type('home'); await page.waitForTimeout(1000); await page.keyboard.press('Escape')
})
await step('dev: Markdown tutorial', async () => {
  await page.evaluate(async () => { (await import('/src/editor/tutorial.js')).tutorial.open = true })
  await page.waitForSelector('dialog[open]', { timeout: 10000 })
  await page.evaluate(async () => { (await import('/src/editor/tutorial.js')).tutorial.open = false })
})
const files = await editor(page, 'dev')
await step('dev: Export Git project', async () => {
  files.git = await download(page, () => page.evaluate(async () => { (await import('/src/core/actions.js')).slidev({ git: true }) }), 'dev-git')
})
await step('dev: insert text, shape, table', () => page.evaluate(async () => { const A = await import('/src/core/actions.js'); for (const k of ['text', 'shape', 'table']) A.insert(k) }))
for (const key of ['pptx', 'odp', 'html', 'slidev', 'git', 'json']) if (files[key]) await step(`dev: import ${key} export again`, async () => {
  const [opened, slides] = await page.evaluate(async ({ b64, name }) => {
    const A = await import('/src/core/actions.js'), S = await import('/src/core/store.js')
    const before = S.deck.id
    await A.importPresentations([new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name)])
    return [S.deck.id !== before, S.deck.slides.length]
  }, { b64: readFileSync(files[key].path).toString('base64'), name: files[key].name })
  // the project file restores the project it was saved from (same id); every other import opens a new project
  if (!opened && key !== 'json') throw new Error('no new project opened')
  if (slides < DECK.slides.length) throw new Error(`${slides} slides`)
})
await page.context().close()

// 2. production build: the saved project file through the start page, then the same checks
page = await open(PROD, 'prod')
await step('prod: open the project file on the start page', async () => {
  await page.locator('input[type=file][accept*=".pptx"]').setInputFiles(files.json.path)
  await page.waitForSelector('.stage .slide', { timeout: 20000 })
})
await editor(page, 'prod')
await page.context().close()

// 3. phone layout
page = await open(PROD, 'phone', { width: 390, height: 844 })
await step('phone: start page', () => page.screenshot({ path: join(OUT, 'phone-home.png') }))
await browser.close()

for (const e of [...new Set(errors)]) { fails.push(e); console.log('ERROR', e.split('\n')[0]) }
console.log(fails.length ? `\n${fails.length} problem(s), files in .smoke-tmp/` : '\nall passed')
stop()
process.exit(fails.length ? 1 : 0)
