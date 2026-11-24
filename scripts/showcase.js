// Screenshots and the demo video (with poster) for the start page (public/showcase/), in English and German.
// Needs the dev server and a temporary Playwright (not a dependency):
//   bun run dev --port 5199 &  bun add --no-save playwright && bun scripts/showcase.js
// Then needs cwebp and ffmpeg on the PATH.
import { chromium } from 'playwright'
import { mkdirSync, rmSync, readdirSync, readFileSync } from 'node:fs'
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
    title: 'Solar for our school', sub: 'Project update 2026', chart: 'Solar yield per month', chartNote: ['Spring brings the most sun', 'Summer holidays: the roof still delivers', 'Goal for next year: +20 %'],
    cats: ['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov'], s1: 'kWh 2025', s2: 'kWh 2026', flow: 'How a panel gets on the roof',
    mer: 'flowchart LR\n  A[Idea] --> B{Budget?}\n  B -->|Yes| C[Order panels]\n  B -->|No| D[Find sponsors]\n  D --> B\n  C --> E[Install]',
    formula: 'Output per panel', q: 'Which direction should the panels face?', a: ['North', 'South', 'East', 'Straight up'],
    groups: 'Who presents next?', g: ['Group 1', 'Group 2', 'Group 3', 'Group 4'], timer: 'Group work', notes: 'Start with the spring peak, then look ahead to next year’s goal.',
  },
  de: {
    title: 'Solarstrom für unsere Schule', sub: 'Projekt-Update 2026', chart: 'Solarertrag pro Monat', chartNote: ['Im Frühling scheint am meisten Sonne', 'Sommerferien: das Dach liefert weiter', 'Ziel fürs nächste Jahr: +20 %'],
    cats: ['Jan', 'Mär', 'Mai', 'Jul', 'Sep', 'Nov'], s1: 'kWh 2025', s2: 'kWh 2026', flow: 'Wie ein Modul aufs Dach kommt',
    mer: 'flowchart LR\n  A[Idee] --> B{Budget?}\n  B -->|Ja| C[Module bestellen]\n  B -->|Nein| D[Sponsoren suchen]\n  D --> B\n  C --> E[Montage]',
    formula: 'Leistung pro Modul', q: 'Wohin sollen die Module zeigen?', a: ['Norden', 'Süden', 'Osten', 'Senkrecht nach oben'],
    groups: 'Wer präsentiert als Nächstes?', g: ['Gruppe 1', 'Gruppe 2', 'Gruppe 3', 'Gruppe 4'], timer: 'Gruppenarbeit', notes: 'Mit dem Höchstwert im Frühling beginnen, dann das Ziel fürs nächste Jahr zeigen.',
  },
}

const CAPTIONS = {
  en: {
    tagline: 'Presentations, right in your browser.', sub: 'Free · no account · open source', end: 'Everything stays in your browser.', open: 'Open Slidecko',
    editor: { title: 'Design on the slide', text: 'Text, tables, charts, shapes and images' },
    charts: { title: 'Charts from your data', text: 'Paste from Excel, Sheets or Numbers' },
    themes: { title: '13 themes, one click', text: 'Or design your own' },
    diagram: { title: 'Diagrams and formulas', text: 'Mermaid and LaTeX, right on the slide' },
    markdown: { title: 'Prefer Markdown?', text: 'Edit the whole talk as Slidev Markdown' },
    presenter: { title: 'Present with confidence', text: 'Notes, next slide and timer' },
    quiz: { title: 'Made for the classroom', text: 'Quizzes, timers and random draws' },
    export: { title: 'Opens and saves it all', text: 'PowerPoint, OpenDocument, PDF, HTML and Slidev' },
  },
  de: {
    tagline: 'Präsentationen, direkt im Browser.', sub: 'Kostenlos · ohne Konto · Open Source', end: 'Alles bleibt in deinem Browser.', open: 'Slidecko öffnen',
    editor: { title: 'Direkt auf der Folie gestalten', text: 'Text, Tabellen, Diagramme, Formen und Bilder' },
    charts: { title: 'Diagramme aus deinen Daten', text: 'Einfügen aus Excel, Sheets oder Numbers' },
    themes: { title: '13 Themes, ein Klick', text: 'Oder ein eigenes gestalten' },
    diagram: { title: 'Diagramme und Formeln', text: 'Mermaid und LaTeX, direkt auf der Folie' },
    markdown: { title: 'Lieber Markdown?', text: 'Den ganzen Vortrag als Slidev-Markdown bearbeiten' },
    presenter: { title: 'Sicher präsentieren', text: 'Notizen, nächste Folie und Timer' },
    quiz: { title: 'Gemacht für den Unterricht', text: 'Quiz, Timer und Zufallsauswahl' },
    export: { title: 'Öffnet und speichert alles', text: 'PowerPoint, OpenDocument, PDF, HTML und Slidev' },
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
  await page.locator('dialog.a11y').screenshot({ path: `${TMP}panel-a11y-${lang}.png` })
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

  // stills only the video uses: chart types, themes, the export dialog
  const still = async (name, wait = 700) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${TMP}v/${name}-${lang}.png` }) }
  mkdirSync(TMP + 'v', { recursive: true })
  await go(1)
  await page.locator('.stage .el.chart').first().click()
  for (const kind of ['column', 'line', 'bar']) { await page.locator('.inspector select:has(option[value="line"])').selectOption(kind); await still('chart-' + kind) }
  await page.locator('.inspector select:has(option[value="line"])').selectOption('column')
  await page.keyboard.press('Escape')
  await go(0)
  for (const id of ['ozean', 'sonne', 'dunkel', 'serif']) { await page.evaluate(async id => { (await import('/src/store.js')).deck.theme = id }, id); await still('theme-' + id) }
  await page.evaluate(async () => { (await import('/src/store.js')).deck.theme = 'ozean' })
  await palette(lang === 'de' ? 'Exportieren' : 'Export …')
  await shot('export', 1200)
  await page.locator('dialog[open]').screenshot({ path: `${TMP}panel-export-${lang}.png` })
  await page.keyboard.press('Escape')
  // the title slide alone in several themes (theme gallery on the landing page)
  await page.waitForTimeout(400)
  for (const id of ['ozean', 'sonne', 'dunkel', 'serif', 'wald', 'neon']) {
    await page.evaluate(async id => { (await import('/src/store.js')).deck.theme = id }, id)
    await page.waitForTimeout(500)
    await page.locator('.stage .slide').first().screenshot({ path: `${TMP}slide-${id}-${lang}.png` })
  }
  await ctx.close()
  // the phone layout
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: lang, colorScheme: 'light' })
  await mctx.addInitScript(() => localStorage.setItem('slides-builder:tour', 'done'))
  const m = await mctx.newPage()
  await m.goto(`${URL_}?lang=${lang}`)
  await m.waitForSelector('.home')
  await addDeck(m, lang)
  await m.evaluate(async () => { (await import('/src/store.js')).ui.slide = 1 })
  await m.waitForTimeout(1500)
  await m.screenshot({ path: `${TMP}mobile-${lang}.png` })
  await mctx.close()
  await video(lang)
}
await browser.close()

// The demo video: an animated page (captions, window frame, cross-fades, slow zoom) built from the stills,
// rendered frame by frame (animations paused at each time) and encoded with ffmpeg; smooth at any speed of the machine
async function video(lang) {
  const C = CAPTIONS[lang], img = f => 'data:image/png;base64,' + readFileSync(f).toString('base64')
  const p = name => (name.includes('-') ? `${TMP}v/${name}-${lang}.png` : `${TMP}${name}-${lang}.png`)
  const scenes = [
    { intro: true, dur: 3 },
    { shots: ['editor'], dur: 3.4, at: '55% 45%', ...C.editor },
    { shots: ['chart-column', 'chart-line', 'chart-bar'], dur: 4, at: '45% 45%', ...C.charts },
    { shots: ['theme-ozean', 'theme-sonne', 'theme-dunkel', 'theme-serif'], dur: 4.4, at: '45% 40%', ...C.themes },
    { shots: ['diagram'], dur: 3.2, at: '40% 50%', ...C.diagram },
    { shots: ['markdown'], dur: 3.2, at: '25% 55%', ...C.markdown },
    { shots: ['presenter'], dur: 3.2, at: '30% 30%', ...C.presenter },
    { shots: ['quiz'], dur: 3.2, at: '30% 30%', ...C.quiz },
    { shots: ['export'], dur: 3.4, at: '50% 45%', ...C.export },
    { outro: true, dur: 3.6 },
  ]
  // scenes follow each other through the background (no overlap: two half-transparent windows look muddy)
  const FADE = 0.4
  let t = 0
  for (const s of scenes) { s.start = t; t += s.dur }
  const total = t, icon = img(new URL('../public/icon.png', import.meta.url).pathname)
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; font-family: -apple-system, 'Inter', system-ui, sans-serif; color: #fff;
      background: radial-gradient(circle at 80% 10%, #3b2a8f 0, transparent 45%), radial-gradient(circle at 10% 90%, #1d4ed8 0, transparent 40%), #0b1020; }
    .scene { position: absolute; inset: 0; opacity: 0; }
    .cap { position: absolute; left: 110px; top: 50%; width: 430px; transform: translateY(-50%); }
    .cap h2 { font-size: 54px; line-height: 1.08; margin: 0 0 20px; letter-spacing: -0.02em; font-weight: 750; }
    .cap p { font-size: 26px; line-height: 1.4; margin: 0; color: #c7d2fe; }
    .win { position: absolute; left: 590px; top: 132px; width: 1240px; border-radius: 16px; overflow: hidden; background: #fff; box-shadow: 0 40px 90px rgb(0 0 0 / .55), 0 0 0 1px rgb(255 255 255 / .08); }
    .bar { height: 36px; background: #e5e7eb; display: flex; align-items: center; gap: 8px; padding-left: 16px; }
    .bar i { width: 12px; height: 12px; border-radius: 50%; background: #f87171; } .bar i + i { background: #fbbf24; } .bar i + i + i { background: #34d399; }
    .view { position: relative; aspect-ratio: 16 / 10; overflow: hidden; }
    .view img { position: absolute; inset: 0; width: 100%; height: 100%; }
    .center { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; text-align: center; }
    .center img { width: 150px; height: 150px; border-radius: 34px; box-shadow: 0 20px 60px rgb(0 0 0 / .5); }
    .center h1 { font-size: 120px; margin: 28px 0 8px; letter-spacing: -0.03em; font-weight: 800; }
    .center p { font-size: 40px; margin: 0; color: #c7d2fe; }
    .center small { font-size: 28px; margin-top: 22px; color: #a5b4fc; }
    .btn { margin-top: 40px; padding: 20px 44px; border-radius: 16px; font-size: 32px; font-weight: 700; background: linear-gradient(135deg, #2f6fed, #7b4dff); }
  </style>${scenes.map((s, i) => `<div class="scene" id="s${i}">${
    s.intro ? `<div class="center"><img src="${icon}"><h1>Slidecko</h1><p>${C.tagline}</p><small>${C.sub}</small></div>`
    : s.outro ? `<div class="center"><img src="${icon}"><h1>Slidecko</h1><p>${C.end}</p><div class="btn">${C.open}</div></div>`
    : `<div class="cap"><h2>${s.title}</h2><p>${s.text}</p></div><div class="win"><div class="bar"><i></i><i></i><i></i></div><div class="view">${s.shots.map(n => `<img src="${img(p(n))}">`).join('')}</div></div>`
  }</div>`).join('')}`
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  await page.setContent(html)
  await page.evaluate(async ({ scenes, FADE, total }) => {
    await Promise.all([...document.images].map(i => i.decode()))
    const ms = x => x * 1000, ease = 'cubic-bezier(.2,.7,.2,1)'
    scenes.forEach((s, i) => {
      const el = document.getElementById('s' + i), f = FADE / s.dur, last = i === scenes.length - 1
      el.animate([{ opacity: 0 }, { opacity: 1, offset: f }, { opacity: 1, offset: last ? 1 : 1 - f }, { opacity: last ? 1 : 0 }], { duration: ms(s.dur), delay: ms(s.start), fill: 'both' })
      const rise = [{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'none' }]
      for (const [k, c] of [...el.querySelectorAll('.cap > *, .center > *')].entries()) c.animate(rise, { duration: 700, delay: ms(s.start) + 150 + k * 120, fill: 'both', easing: ease })
      const view = el.querySelector('.view')
      if (!view) return
      view.style.transformOrigin = s.at
      view.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }], { duration: ms(s.dur), delay: ms(s.start), fill: 'both', easing: 'ease-in-out' })
      el.querySelector('.win').animate([{ transform: 'translateY(40px)' }, { transform: 'none' }], { duration: 900, delay: ms(s.start), fill: 'both', easing: ease })
      const imgs = [...view.querySelectorAll('img')]
      imgs.slice(1).forEach((im, j) => im.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, delay: ms(s.start + 0.4 + (j + 1) * (s.dur - 0.8) / imgs.length), fill: 'both', easing: 'ease-in-out' }))
    })
    for (const a of document.getAnimations()) a.pause()
  }, { scenes, FADE, total })
  const frames = `${TMP}frames-${lang}/`
  mkdirSync(frames, { recursive: true })
  const FPS = 30, n = Math.round(total * FPS)
  for (let i = 0; i < n; i++) {
    await page.evaluate(ms => { for (const a of document.getAnimations()) a.currentTime = ms }, (i * 1000) / FPS)
    await page.screenshot({ path: `${frames}${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 })
  }
  await page.close()
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${frames}%05d.jpg`, '-vf', 'scale=1600:-2', '-c:v', 'libx264', '-crf', '25', '-preset', 'slow', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${OUT}demo-${lang}.mp4`])
  // poster: a frame from the editor scene
  execFileSync('cwebp', ['-quiet', '-q', '80', `${frames}${String(Math.round((scenes[1].start + 1.5) * FPS)).padStart(5, '0')}.jpg`, '-o', `${OUT}demo-${lang}.webp`])
}

// full screenshots down to 1600 px wide; slides, panels and the phone keep their size
for (const f of readdirSync(TMP).filter(f => f.endsWith('.png'))) execFileSync('cwebp', ['-quiet', '-q', '80', ...(/^(slide|panel|mobile)-/.test(f) ? [] : ['-resize', '1600', '0']), TMP + f, '-o', OUT + f.replace('.png', '.webp')])
console.log('written:', readdirSync(OUT).join(' '))
