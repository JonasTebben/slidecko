// Screenshots and the short video for the start page (public/showcase/), in English and German.
// Needs the dev server and a temporary Playwright (not a dependency):
//   bun run dev --port 5199 &  bun add --no-save playwright && bun scripts/showcase.js
// Then needs cwebp and ffmpeg on the PATH.
import { chromium } from 'playwright'
import { mkdirSync, rmSync, readdirSync, renameSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const URL_ = process.env.URL || 'http://localhost:5199/'
const OUT = new URL('../public/showcase/', import.meta.url).pathname
const TMP = new URL('../.showcase-tmp/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })

// the sample talk, in both languages
const TEXT = {
  en: {
    title: 'Solar for our school', sub: 'Project update · Class 10b', chart: 'Power from the roof', chartNote: ['Spring brings the most sun', 'Summer holidays: the roof still delivers', 'Goal for next year: +20 %'],
    cats: ['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov'], s1: 'kWh 2025', s2: 'kWh 2026', flow: 'How a panel gets on the roof',
    mer: 'flowchart LR\n  A[Idea] --> B{Budget?}\n  B -->|Yes| C[Order panels]\n  B -->|No| D[Find sponsors]\n  D --> B\n  C --> E[Install]',
    formula: 'Output per panel', q: 'Which direction should the panels face?', a: ['North', 'South', 'East', 'Straight up'],
    groups: 'Who presents next?', g: ['Group 1', 'Group 2', 'Group 3', 'Group 4'], timer: 'Group work', notes: 'Thank the caretaker for access to the roof. Show the chart, then ask the class.',
  },
  de: {
    title: 'Solarstrom für unsere Schule', sub: 'Projekt-Update · Klasse 10b', chart: 'Strom vom Dach', chartNote: ['Im Frühling scheint am meisten Sonne', 'Sommerferien: das Dach liefert weiter', 'Ziel fürs nächste Jahr: +20 %'],
    cats: ['Jan', 'Mär', 'Mai', 'Jul', 'Sep', 'Nov'], s1: 'kWh 2025', s2: 'kWh 2026', flow: 'Wie ein Modul aufs Dach kommt',
    mer: 'flowchart LR\n  A[Idee] --> B{Budget?}\n  B -->|Ja| C[Module bestellen]\n  B -->|Nein| D[Sponsoren suchen]\n  D --> B\n  C --> E[Montage]',
    formula: 'Leistung pro Modul', q: 'Wohin sollen die Module zeigen?', a: ['Norden', 'Süden', 'Osten', 'Senkrecht nach oben'],
    groups: 'Wer präsentiert als Nächstes?', g: ['Gruppe 1', 'Gruppe 2', 'Gruppe 3', 'Gruppe 4'], timer: 'Gruppenarbeit', notes: 'Dem Hausmeister für den Zugang zum Dach danken. Diagramm zeigen, dann die Klasse fragen.',
  },
}

const deckFor = x => ({
  title: x.title, theme: 'ozean',
  slides: [
    { layout: 'cover', notes: x.notes, elements: [
      { type: 'text', title: true, x: 60, y: 186, w: 860, h: 80, html: `<h1>${x.title}</h1>` },
      { type: 'text', x: 60, y: 280, w: 860, h: 36, html: `<h2>${x.sub}</h2>` }] },
    { layout: 'default', notes: x.notes, elements: [
      { type: 'text', title: true, x: 56, y: 40, w: 868, h: 40, html: `<h1>${x.chart}</h1>` },
      { type: 'chart', kind: 'column', legend: true, categories: x.cats, series: [{ name: x.s1, values: [210, 540, 820, 760, 510, 190] }, { name: x.s2, values: [260, 610, 905, 840, 600, 240] }], x: 56, y: 110, w: 560, h: 380 },
      { type: 'text', x: 650, y: 130, w: 274, h: 220, html: `<ul>${x.chartNote.map(n => `<li>${n}</li>`).join('')}</ul>` }] },
    { layout: 'default', elements: [
      { type: 'text', title: true, x: 56, y: 40, w: 868, h: 40, html: `<h1>${x.flow}</h1>` },
      { type: 'diagram', code: x.mer, x: 56, y: 120, w: 868, h: 220 },
      { type: 'text', x: 56, y: 380, w: 400, h: 36, html: `<h3>${x.formula}</h3>` },
      { type: 'math', tex: 'P = A \\cdot G \\cdot \\eta', fontSize: 36, x: 460, y: 360, w: 464, h: 90 }] },
    { layout: 'quiz', elements: [
      { type: 'quiz', question: x.q, answers: x.a.map((text, i) => ({ text, correct: i === 1 })), x: 80, y: 60, w: 800, h: 420 }] },
    { layout: 'default', elements: [
      { type: 'text', title: true, x: 56, y: 40, w: 868, h: 40, html: `<h1>${x.groups}</h1>` },
      { type: 'picker', names: x.g, fontSize: 56, x: 56, y: 170, w: 440, h: 180 },
      { type: 'text', x: 560, y: 120, w: 364, h: 36, html: `<h3>${x.timer}</h3>` },
      { type: 'timer', seconds: 600, fontSize: 56, x: 560, y: 170, w: 364, h: 180 }] },
  ],
})

// the store the app itself uses (same module URL in the dev server)
const addDeck = async (page, lang) => {
  await page.evaluate(async d => {
    const S = await import('/src/store.js')
    await S.createProject({ ...d, slides: d.slides.map(s => ({ ...s, elements: s.elements.map(e => ({ id: S.uid(), ...e })) })) })
  }, deckFor(TEXT[lang]))
  await page.waitForSelector('.stage')
}

const browser = await chromium.launch()
for (const lang of ['en', 'de']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: lang, colorScheme: 'light', reducedMotion: 'reduce' })
  await ctx.addInitScript(() => localStorage.setItem('slides-builder:tour', 'done'))
  const page = await ctx.newPage()
  await page.goto(`${URL_}?lang=${lang}`)
  await page.waitForSelector('.home')
  await addDeck(page, lang)
  await page.waitForTimeout(1500)
  const shot = async (name, wait = 600) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${TMP}${name}-${lang}.png` }) }
  const palette = async cmd => { await page.keyboard.press('Escape'); await page.keyboard.press('ControlOrMeta+k'); await page.keyboard.type(cmd); await page.keyboard.press('Enter') }
  const go = async i => { await page.evaluate(async i => { (await import('/src/store.js')).ui.slide = i }, i); await page.waitForTimeout(500) }

  // editor with the chart selected (chart panel in the inspector)
  await go(1)
  await page.locator('.stage .el.chart').first().click()
  await shot('editor')
  // diagram and formula
  await go(2)
  await page.keyboard.press('Escape')
  await shot('diagram', 1500)
  // Markdown source editor
  await page.evaluate(async () => { (await import('/src/source.js')).source.open = true })
  await page.waitForTimeout(2500)
  // the diagram slide's Markdown at the top, not the long chart SVG before it
  await page.evaluate(() => [...document.querySelectorAll('.cm-line')].find(l => l.textContent.includes('flowchart'))?.scrollIntoView({ block: 'center' }))
  await shot('markdown')
  await page.evaluate(async () => { (await import('/src/source.js')).source.open = false })
  // accessibility check
  await palette(lang === 'de' ? 'Barrierefreiheit' : 'accessibility')
  await shot('a11y', 1500)
  await page.keyboard.press('Escape')
  // presenter view on the chart slide
  await go(1)
  await page.keyboard.press('Escape')
  await palette(lang === 'de' ? 'Referentenansicht' : 'Presenter view')
  await shot('presenter', 1500)
  // the quiz while presenting
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight')
  await page.locator('.presenter .quiz-reveal').click()
  await shot('quiz', 1200)
  await page.keyboard.press('Escape')
  await ctx.close()

  // the video: switch the chart type and the theme, then present
  const vctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: lang, colorScheme: 'light', recordVideo: { dir: TMP + 'video/', size: { width: 1280, height: 800 } } })
  await vctx.addInitScript(() => localStorage.setItem('slides-builder:tour', 'done'))
  const v = await vctx.newPage()
  await v.goto(`${URL_}?lang=${lang}`)
  await v.waitForSelector('.home')
  await addDeck(v, lang)
  await v.evaluate(async () => { (await import('/src/store.js')).ui.slide = 1 })
  await v.waitForTimeout(1200)
  await v.locator('.stage .el.chart').first().click()
  await v.waitForTimeout(800)
  for (const kind of ['line', 'bar', 'column']) { await v.locator('.inspector select:has(option[value="line"])').selectOption(kind); await v.waitForTimeout(900) }
  for (const n of [2, 5, 3]) {
    await v.locator('[data-tour="theme"] button').first().click()
    await v.waitForTimeout(700)
    await v.locator('.theme-card').nth(n).click()
    await v.waitForTimeout(1100)
  }
  await v.locator('[data-tour="present"]').click()
  await v.waitForTimeout(1500)
  for (let i = 0; i < 3; i++) { await v.keyboard.press('ArrowRight'); await v.waitForTimeout(1300) }
  await v.keyboard.press('Escape')
  await v.waitForTimeout(600)
  const raw = await v.video().path()
  await vctx.close()
  renameSync(raw, `${TMP}demo-${lang}.webm`)
}
await browser.close()

for (const f of readdirSync(TMP).filter(f => f.endsWith('.webm'))) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1.2', '-i', TMP + f, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '26', '-preset', 'slow', '-movflags', '+faststart', '-an', OUT + f.replace('.webm', '.mp4')])
for (const f of readdirSync(TMP).filter(f => f.endsWith('.png'))) execFileSync('cwebp', ['-quiet', '-q', '78', '-resize', '1600', '0', TMP + f, '-o', OUT + f.replace('.png', '.webp')])
console.log('written:', readdirSync(OUT).join(' '))
