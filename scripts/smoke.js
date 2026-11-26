// Smoke test of the whole app in a browser: every module loads, the main dialogs open, every export
// downloads and imports again, in the dev server and in the production build. Run with `bun run smoke`
// (installs Chromium for Playwright once and builds first). Exits with 1 when a step fails.
import { chromium, devices } from 'playwright'
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
    // every other kind of element, so each export's round trip can be checked element by element (ROUND_TRIP)
    { layout: 'default', elements: [
      { type: 'text', title: true, x: 56, y: 20, w: 868, h: 40, html: '<h1>Everything else</h1>' },
      { type: 'text', x: 56, y: 70, w: 400, h: 50, html: '<div data-callout="tip"><p><strong>Tip:</strong> water.</p></div>' },
      { type: 'text', x: 56, y: 130, w: 400, h: 30, click: 1, html: '<p>Some <span data-mark="circle" data-mark-color="orange">marked</span> words, slide <span data-field="page">#</span></p>' },
      { type: 'shape', shape: 'ellipse', fill: '#2563eb', stroke: 'none', strokeWidth: 0, radius: 0, x: 480, y: 70, w: 120, h: 80 },
      { type: 'table', header: true, rows: [['A', 'B'], ['1', '2']], x: 620, y: 70, w: 300, h: 90 },
      { type: 'shape', shape: 'line', slope: 'up', head: 'end', fill: 'none', stroke: '#334155', strokeWidth: 4, radius: 0, x: 170, y: 370, w: 160, h: 60 },
      { type: 'icon', icon: 'lucide:sprout', x: 56, y: 180, w: 60, h: 60 },
      { type: 'video', youtube: 'VIDEO_ID_11', x: 140, y: 180, w: 320, h: 180 },
      { type: 'toc', x: 480, y: 180, w: 440, h: 160 },
      { type: 'image', asset: 'P1', src: '/images/p.png', alt: 'A dot', x: 56, y: 380, w: 100, h: 100 },
      { type: 'text', board: true, x: 480, y: 380, w: 440, h: 120, html: '<p>Notes box</p>' }] },
  ],
  // a 1×1 PNG for the image element
  assets: { P1: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' },
}

const browser = await chromium.launch()
const errors = []
const open = async (url, label, viewport = { width: 1280, height: 800 }, device = {}) => {
  const ctx = await browser.newContext({ viewport, ...device, locale: 'en', acceptDownloads: true })
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
    const S = await import('/src/core/store.js'), { getIcon } = await import('/src/slide/icons.js')
    for (const s of d.slides) for (const e of s.elements) if (e.type === 'icon') Object.assign(e, await getIcon(e.icon))
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
await step('dev: the agent skill example imports with every element it describes', async () => {
  const md = readFileSync(new URL('../skills/slidecko/SKILL.md', import.meta.url), 'utf8').match(/````markdown\n([\s\S]*?)\n````/)[1]
  const types = await page.evaluate(async md => {
    const { importSlidev } = await import('/src/import/importSlidev.js')
    const r = await importSlidev('slides.md', new Map([['slides.md', md]]), 'hell')
    return r.slides.flatMap(s => s.elements.map(e => (e.click ? 'click:' : '') + e.type + (/data-callout|data-mark/.test(e.html) ? '+' : '')))
  }, md)
  for (const t of ['toc', 'click:text', 'click:text+', 'icon', 'text+', 'diagram', 'chart', 'timer', 'picker', 'quiz'])
    if (!types.includes(t)) throw new Error(`${t} missing: ${types}`)
})
await step('dev: HTML presentation: its own timer (T), a draw starts over with its button', async () => {
  const p = await page.context().newPage()
  await p.goto('file://' + files.html.path)
  await p.keyboard.press('t')
  await p.locator('.clock [data-more]').click()
  if ((await p.locator('.clock [data-face]').innerText()) !== '6:00') throw new Error('minutes not set')
  await p.locator('.clock [data-face]').click(); await p.waitForTimeout(1200)
  if ((await p.locator('.clock [data-face]').innerText()) !== '5:59') throw new Error('not running')
  for (let k = 0; k < 4; k++) await p.keyboard.press('ArrowRight')
  const face = p.locator('.slide.on .picker-face')
  if (await face.count()) {
    await face.click(); await p.waitForTimeout(100); await face.click()
    if (!(await face.locator('.pick').count())) throw new Error('two clicks did not draw')
    await face.locator('.pick-reset').click()
    if (await face.locator('.pick').count()) throw new Error('not started over')
  } else throw new Error('no picker on slide 5')
  await p.close()
})
// what each format brings back of the deck's elements (see "Formats" in AGENTS.md): Office files what Office has
const ALL = ['shape+up-end', 'chart', 'code', 'diagram', 'icon', 'image', 'math', 'picker', 'quiz', 'shape', 'table', 'text', 'text+callout', 'text+mark+field+click', 'text+board', 'timer', 'toc', 'video']
const ROUND_TRIP = { html: ALL, slidev: ALL, git: ALL, json: ALL, pptx: ['shape+up-end', 'chart', 'image', 'shape', 'table', 'text', 'text+click'], odp: ['shape+up-end', 'image', 'shape', 'table', 'text', 'text+click'] }
for (const key of ['pptx', 'odp', 'html', 'slidev', 'git', 'json']) if (files[key]) await step(`dev: import ${key} export again`, async () => {
  const [opened, slides, kinds] = await page.evaluate(async ({ b64, name }) => {
    const A = await import('/src/core/actions.js'), S = await import('/src/core/store.js')
    const before = S.deck.id
    await A.importPresentations([new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name)])
    // each element as its type, plus what makes it special (callout, mark, field, live box, a click step)
    const kinds = S.deck.slides.flatMap(s => s.elements.map(e => e.type + (/data-callout/.test(e.html) ? '+callout' : '') + (/data-mark/.test(e.html) ? '+mark' : '') + (/data-field/.test(e.html) ? '+field' : '') + (e.board ? '+board' : '') + (e.head ? `+${e.slope}-${e.head}` : '') + (e.click ? '+click' : '')))
    return [S.deck.id !== before, S.deck.slides.length, [...new Set(kinds)]]
  }, { b64: readFileSync(files[key].path).toString('base64'), name: files[key].name })
  const lost = ROUND_TRIP[key].filter(k => !kinds.includes(k))
  if (lost.length) throw new Error(`lost on the way: ${lost.join(', ')} (came back: ${kinds.sort().join(' ')})`)
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

// 3. presenting with a mouse and with iPad touch (taps, double taps): timers, draws, notes boxes, drawings, the bar's timer
const LIVE = { title: 'Live', theme: 'ozean', slides: [
  { layout: 'default', elements: [
    { type: 'timer', seconds: 60, fontSize: 56, x: 40, y: 40, w: 300, h: 120 },
    { type: 'timer', seconds: 120, auto: true, fontSize: 56, x: 400, y: 40, w: 300, h: 120 },
    { type: 'picker', names: ['Ana', 'Ben'], repeat: true, look: 'solid', heading: 'Your turn', fontSize: 48, x: 40, y: 220, w: 400, h: 140 },
    { type: 'text', board: true, html: '<p>Kept</p>', x: 500, y: 200, w: 400, h: 120 },
    { type: 'text', board: true, liveTemp: true, html: '<p>Temp</p>', x: 500, y: 360, w: 400, h: 120 }] },
  { layout: 'default', elements: [{ type: 'text', html: '<p>Two</p>', x: 40, y: 40, w: 400, h: 80 }] }] }
async function presenting(page, label, touch) {
  const tap = async sel => { const b = await page.locator(sel).first().boundingBox({ timeout: 10000 }).catch(() => null); if (!b) throw new Error(`${sel} not shown`); const x = b.x + b.width / 2, y = b.y + b.height / 2; touch ? await page.touchscreen.tap(x, y) : await page.mouse.click(x, y) }
  const dbl = async sel => { await tap(sel); await page.waitForTimeout(80); await tap(sel) }
  const text = sel => page.locator(sel).first().innerText()
  const running = sel => page.locator(sel).first().evaluate(n => n.classList.contains('running'))
  const shown = () => page.locator('.pv-bar span').first().innerText()
  const ok = (cond, msg) => { if (!cond) throw new Error(msg) }
  const T1 = '.pv-slide .el.timer:nth-child(1) .timer-face', T2 = '.pv-slide .el.timer:nth-child(2) .timer-face', P = '.pv-slide .picker-face'
  const start = async () => { await tap('button.tb.primary[data-tour=present]'); await page.waitForSelector('.presenter .pv-slide') }
  const leave = async () => { await page.locator('.pv-bar:not(.pv-ink-bar)').evaluate(n => (n.style.opacity = 1)); await tap('.pv-bar button[aria-label="Exit (Esc)"]'); await page.waitForSelector('.presenter', { state: 'detached' }) }
  await step(`${label}: create the live deck`, async () => {
    await page.evaluate(async d => { const S = await import('/src/core/store.js'); await S.createProject({ ...d, slides: d.slides.map(s => ({ ...s, elements: s.elements.map(e => ({ id: S.uid(), ...e })) })) }) }, LIVE)
    await page.waitForSelector('.stage .slide')
    await start()
  })
  await step(`${label}: a timer waits for its tap, an auto one runs`, async () => { ok((await text(T1)) === '1:00' && !(await running(T1)), 'started by itself'); ok(await running(T2), 'auto timer stopped') })
  await step(`${label}: a tap starts a timer and does not turn the slide`, async () => { await tap(T1); await page.waitForTimeout(1200); ok(await running(T1), 'not running'); ok((await shown()) === '1 / 2', 'slide turned') })
  await step(`${label}: a double tap sets a timer back`, async () => { await page.waitForTimeout(400); await dbl(T1); await page.waitForTimeout(150); ok((await text(T1)) === '1:00' && !(await running(T1)), await text(T1)) })
  await step(`${label}: a draw shows its own text, then names without a count`, async () => {
    ok((await text(P)).includes('Your turn') && !(await text(P)).includes('Click to draw'), 'card text')
    await tap(P); await page.waitForTimeout(400); await tap(P)
    ok(/Ana|Ben/.test(await text(P + ' .pick')) && !(await page.locator(P + ' small').count()), 'no name drawn')
    await page.waitForTimeout(400); await tap(P); await page.waitForTimeout(150)
    ok(await page.locator(P + ' .pick').count() === 1, 'two quick taps are two draws')
    await tap(P + ' .pick-reset'); await page.waitForTimeout(150)
    ok(!(await page.locator(P + ' .pick').count()), 'not started over')
  })
  const type = async (n, s) => { await tap(`.pv-slide .el.board >> nth=${n}`); await page.waitForTimeout(150); ok(await page.evaluate(() => !!document.activeElement?.isContentEditable), 'notes box not focused'); await page.keyboard.type(s) }
  await step(`${label}: typing into notes boxes`, async () => { await type(0, ' one'); await type(1, ' two'); ok((await shown()) === '1 / 2', 'slide turned') })
  const draw = async () => {
    await page.locator('.pv-bar:not(.pv-ink-bar)').evaluate(n => (n.style.opacity = 1))
    await tap('.pv-bar button[aria-label=Pen]')
    const b = await page.locator('.pv-ink').boundingBox({ timeout: 10000 }).catch(() => null)
    if (!b) throw new Error('the pen did not switch on')
    const x = b.x + 100, y = b.y + b.height - 60
    if (touch) { // a real finger stroke (Chromium's touch input), so pointer capture works as on an iPad
      const cdp = await page.context().newCDPSession(page)
      for (const [type, dx] of [['touchStart', 0], ['touchMove', 40], ['touchMove', 80], ['touchEnd', 80]]) await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: x + dx, y }] })
    }
    else { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 80, y, { steps: 4 }); await page.mouse.up() }
    ok(await page.locator('.pv-ink polyline').count() > 0, 'no stroke')
    // a tap right after the stroke can be lost on a slow machine: tap again until the pen is off
    for (let k = 0; k < 3 && await page.locator('.pv-ink.on').count(); k++) { await page.waitForTimeout(300); await tap('.pv-bar button[aria-label="Put the tool away (Esc)"]') }
    ok(!(await page.locator('.pv-ink.on').count()), 'the pen stays on')
  }
  await step(`${label}: drawing with the pen`, draw)
  await step(`${label}: the bar's own timer`, async () => {
    await tap('.pv-bar button[aria-label=Timer]'); await tap('.pv-clock button[aria-label="One minute more"]')
    ok((await text('.pv-clock-face')) === '6:00', await text('.pv-clock-face'))
    await tap('.pv-clock-face'); await page.waitForTimeout(1200)
    ok((await text('.pv-clock-face')) === '5:59', await text('.pv-clock-face'))
  })
  await step(`${label}: after editing, notes and drawing are kept as set, timers wait for a tap`, async () => {
    await leave()
    await page.waitForTimeout(300)
    const els = await page.evaluate(async () => (await import('/src/core/store.js')).deck.slides[0].elements.map(e => [e.type, e.html || '']))
    ok(els.some(([, h]) => h.includes('Kept one')), 'kept notes lost')
    ok(els.some(([, h]) => h === '<p>Temp</p>'), 'temporary notes saved')
    ok(els.filter(([t]) => t === 'image').length === 1, 'drawing not kept')
    await page.waitForTimeout(1000)
    await start()
    const t2 = await text(T2)
    await page.waitForTimeout(1200)
    ok(!(await running(T1)) && (await text(T2)) !== t2, 'timers')
    ok(!(await text('.pv-slide .el.board >> nth=1')).includes('two'), 'temporary notes still shown')
    await draw()
    await leave()
    await page.waitForTimeout(500)
    const ink = await page.evaluate(async () => { const S = await import('/src/core/store.js'); const imgs = S.deck.slides[0].elements.filter(e => e.type === 'image'); return [imgs.length, imgs[0] && (await (await fetch(S.deck.assets[imgs[0].asset])).text()).match(/<polyline/g)?.length] })
    ok(ink[0] === 1 && ink[1] >= 2, `the second drawing is not in the first one's picture: ${ink}`)
  })
}
page = await open(DEV, 'mouse')
await presenting(page, 'mouse', false)
await step('mouse: Enter in the YouTube dialog inserts the video', async () => {
  await palette(page, 'Insert YouTube'); await page.fill('dialog[open] input', 'https://www.youtube.com/live/dQw4w9WgXcQ'); await page.keyboard.press('Enter')
  await page.waitForSelector('.stage .el.video', { timeout: 5000 })
})
await page.context().close()
page = await open(DEV, 'ipad', undefined, devices['iPad Pro 11 landscape'])
await presenting(page, 'ipad', true)
await page.context().close()

// 4. phone layout
page = await open(PROD, 'phone', { width: 390, height: 844 })
await step('phone: start page', () => page.screenshot({ path: join(OUT, 'phone-home.png') }))
await browser.close()

for (const e of [...new Set(errors)]) { fails.push(e); console.log('ERROR', e.split('\n')[0]) }
console.log(fails.length ? `\n${fails.length} problem(s), files in .smoke-tmp/` : '\nall passed')
stop()
process.exit(fails.length ? 1 : 0)
