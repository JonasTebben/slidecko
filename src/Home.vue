<script setup>
import { ref, nextTick } from 'vue'
import Icon from './Icon.vue'
import AppFooter from './AppFooter.vue'
import Menu from './Menu.vue'
import { deck, library, ui, createProject, openProject, removeProject, duplicateProject, projectFile, renameProject } from './store.js'
import { THEMES, themeOf, themeStyle, themeIds, DEFAULT_THEME } from './themes.js'
import { SLIDE_PRESETS } from './presets.js'
import { importPresentations, IMPORT_ACCEPT, download, exportAllProjects } from './actions.js'
import { t, lang } from './i18n.js'
import { TOUR_KEY, begin } from './tour.js'
import { openTutorial } from './tutorial.js'

const emit = defineEmits(['import'])
const error = ref('')
const confirmId = ref(null)

const go = fn => async (...a) => { error.value = ''; try { await fn(...a) } catch (e) { error.value = e.message } }
const blank = go(theme => createProject({
  title: t('New presentation'), theme,
  slides: ['title', 'content'].map(id => { const p = SLIDE_PRESETS.find(x => x.id === id); return { layout: p.layout, elements: p.make() } }),
}))
const open = go(openProject)
// first visit (no flag, no projects): offer the tour once; starting or dismissing it stores the flag
const offerTour = ref((() => { try { return !localStorage.getItem(TOUR_KEY) } catch { return false } })())
const noTour = () => { offerTour.value = false; try { localStorage.setItem(TOUR_KEY, 'done') } catch {} }
// a sample project named "Tour", so the editor steps have something to point at (removed again on an immediate skip)
const takeTour = go(async full => {
  await createProject({ title: t('Tour'), slides: ['title', 'content'].map(id => { const p = SLIDE_PRESETS.find(x => x.id === id); return { layout: p.layout, elements: p.make() } }) })
  begin(full, deck.id)
})
const dup = go(duplicateProject)
const save = go(async p => download(new Blob([await projectFile(p.id)], { type: 'application/json' }), p.title.replace(/[\\/:*?"<>|]/g, '_') + '.slides.json'))
const del = go(async id => { await removeProject(id); confirmId.value = null })
// drag & drop: a Slidev folder, .md files, a .slides.json or other presentations, anywhere on the page
const dragging = ref(false)
const SKIP = /^(node_modules|\.git|dist|\.slidev)$/
async function entryFiles(entry, out = []) {
  if (entry.isFile) {
    const f = await new Promise((ok, no) => entry.file(ok, no))
    // the same relative path a folder picker gives ("project/slides.md")
    Object.defineProperty(f, 'webkitRelativePath', { value: entry.fullPath.replace(/^\//, '') })
    out.push(f)
  } else if (entry.isDirectory && !SKIP.test(entry.name)) {
    const reader = entry.createReader()
    for (let batch; (batch = await new Promise((ok, no) => reader.readEntries(ok, no))).length;) for (const e of batch) await entryFiles(e, out)
  }
  return out
}
const onDrop = go(async e => {
  dragging.value = false
  const entries = [...e.dataTransfer.items].map(i => i.webkitGetAsEntry?.()).filter(Boolean)
  const folder = entries.some(x => x.isDirectory)
  const files = folder ? (await Promise.all(entries.map(x => entryFiles(x)))).flat() : [...e.dataTransfer.files]
  if (!folder && !files.some(f => f.name.endsWith('.md'))) return importPresentations(files)
  // single files carry no folder path: they are opened as loose .md decks
  if (!folder) for (const f of files) Object.defineProperty(f, 'webkitRelativePath', { value: '' })
  if (!files.some(f => f.name.endsWith('.md'))) throw new Error(t('No .md file found – drop a Slidev folder, .md files, a .slides.json or a presentation (PowerPoint, OpenDocument, PDF) here.'))
  emit('import', files)
})
const over = e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); dragging.value = true } }

// right-click on a project card: the card's actions in a menu
const ctx = ref(), ctxProject = ref(null)
function onContext(e, p) {
  e.preventDefault()
  ctxProject.value = p
  ctx.value.openAt(e.clientX, e.clientY)
}
// renaming in place on the card: Enter or leaving the field saves, Esc cancels
const renamingId = ref(null)
const startRename = async p => { renamingId.value = p.id; await nextTick(); const i = document.querySelector('.project-rename'); i?.focus(); i?.select() }
const rename = go(async e => {
  if (renamingId.value === null) return
  const id = renamingId.value
  renamingId.value = null
  await renameProject(id, e.target.value)
})
const when = d => new Intl.DateTimeFormat(lang.value, { dateStyle: 'medium', timeStyle: 'short' }).format(d)
// claims checked against the code: no external scripts (CSP), system fonts, YouTube only after consent
const WHY = [
  ['Everything stays in your browser', 'Slides are created, stored and exported on your device. Nothing is uploaded: the server only delivers the app.'],
  ['No tracking, no account', 'No cookies, no analytics, no ads, no sign-up. Nobody sees what you present or how you work.'],
  ['Independent of US cloud services', 'No Google or Microsoft account, no fonts or scripts from other servers. YouTube videos load only when you allow it.'],
  ['Open formats, no lock-in', 'Export to PowerPoint, OpenDocument, PDF, HTML or Slidev Markdown, or save the project as a file. Your work goes with you.'],
  ['Open source', 'Apache 2.0 licensed: read the code, adapt it or host it on your own server.'],
]
// screenshots and the demo video in public/showcase/, made by scripts/showcase.js in English and German
const SHOWCASE = [
  ['editor', 'Design on the slide', 'Text, tables, charts, shapes, icons and images: drag, snap, align. Chart data comes straight from a spreadsheet.'],
  ['diagram', 'Diagrams and formulas', 'Mermaid flowcharts and Gantt charts, KaTeX formulas and code with syntax highlighting, all editable on the slide.'],
  ['markdown', 'Write in Markdown', 'Edit the whole talk as Slidev Markdown with a live preview, or paste slides an AI wrote for you.'],
  ['presenter', 'Present with notes', 'Presenter view with notes, next slide and timer; pen, laser pointer and slide overview while you talk.'],
  ['quiz', 'Quizzes for the class', 'Quizzes, timers and a random draw for “who’s next?”, right on the slide while presenting.'],
  ['a11y', 'Accessible slides', 'The check finds missing alt text, weak contrast, small fonts and missing titles, and fixes most with one click.'],
]
const shot = name => `showcase/${name}-${lang.value === 'de' ? 'de' : 'en'}`
const still = matchMedia('(prefers-reduced-motion: reduce)').matches // no autoplay; the video still plays on request
</script>

<template>
  <main class="home" :class="{ dragging }" @dragover="over" @dragleave.self="dragging = false" @drop.prevent="onDrop">
    <div v-if="dragging" class="drop-hint" aria-hidden="true"><Icon name="upload" :size="36" /><b>{{ t('Drop to open') }}</b><small>{{ t('Slidev folder, .md, .slides.json, .pptx, .odp, .pdf, .html or images') }}</small></div>
    <header class="home-head">
      <span class="brand"><Icon name="slides" :size="24" /> Slidecko</span>
      <button v-if="deck.id" class="tb" @click="ui.home = false"><Icon name="chevronR" />{{ t('Back to “{0}”', deck.title) }}</button>
    </header>

    <section class="home-start">
      <h1>{{ t('Design presentations in your browser') }}</h1>
      <p class="lead">{{ t('Start from scratch or drop a presentation onto this page: PowerPoint, OpenDocument, PDF, images or a Slidev project.') }}</p>
      <div v-if="offerTour && !library.list.length" class="tour-prompt" role="region" :aria-label="t('Tour')">
        <b>{{ t('New here? Take the 1-minute tour') }}</b>
        <button class="tb small primary" @click="takeTour(false)">{{ t('1-minute tour') }}</button>
        <button class="tb small" @click="takeTour(true)">{{ t('Full tour incl. Markdown (~5 min)') }}</button>
        <button class="tb icon small" :aria-label="t('No thanks')" :title="t('No thanks')" @click="noTour"><Icon name="x" :size="14" /></button>
      </div>
      <div class="start-grid">
        <button class="start-card primary" @click="blank(DEFAULT_THEME)"><Icon name="plus" :size="28" /><b>{{ t('New presentation') }}</b><small>{{ t('Blank presentation in the current default theme') }}</small></button>
        <label class="start-card"><Icon name="folder" :size="28" /><b>{{ t('Open Slidev project') }}</b><small>{{ t('Choose a folder with slides.md – decks, images and theme are imported') }}</small>
          <input type="file" webkitdirectory hidden @change="emit('import', [...$event.target.files]); $event.target.value = ''" /></label>
        <label class="start-card"><Icon name="upload" :size="28" /><b>{{ t('Open Markdown files') }}</b><small>{{ t('Individual .md decks, e.g. generated by an AI') }}</small>
          <input type="file" accept=".md,text/markdown" multiple hidden @change="emit('import', [...$event.target.files]); $event.target.value = ''" /></label>
        <button class="start-card" @click="openTutorial()"><Icon name="markdown" :size="28" /><b>{{ t('Markdown tutorial') }}</b><small>{{ t('Learn Slidev Markdown by doing it, in 5 minutes: type a little, get finished slides') }}</small></button>
        <label class="start-card"><Icon name="file" :size="28" /><b>{{ t('Open project file') }}</b><small>{{ t('Saved .slides.json or ZIP with all projects') }}</small>
          <input type="file" accept=".json,application/json,.zip" multiple hidden @change="importPresentations([...$event.target.files]); $event.target.value = ''" /></label>
        <label class="start-card"><Icon name="upload" :size="28" /><b>{{ t('Import presentation') }}</b><small>{{ t('PowerPoint, Google Slides/Keynote (as .pptx), OpenDocument, PDF, own HTML exports or images') }}</small>
          <input type="file" :accept="IMPORT_ACCEPT" multiple hidden @change="importPresentations([...$event.target.files]); $event.target.value = ''" /></label>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </section>

    <section v-if="library.list.length" class="home-projects">
      <h2>{{ t('My projects') }} <small>{{ t('stored in this browser · save as .slides.json, restore via “Open project file”') }}</small>
        <button v-if="library.list.length > 1" class="tb small" @click="exportAllProjects"><Icon name="download" :size="16" />{{ t('Save all') }}</button></h2>
      <div class="project-grid">
        <article v-for="p in library.list" :key="p.id" class="project" :class="{ current: p.id === deck.id }" @contextmenu="onContext($event, p)">
          <button class="project-open" :style="themeStyle(p.theme)" @click="open(p.id)">
            <span class="project-cover"><b>{{ p.title }}</b></span>
          </button>
          <div class="project-meta">
            <input v-if="renamingId === p.id" class="project-rename" :value="p.title" :aria-label="t('Project name')" maxlength="200"
              @keydown.enter.prevent="$event.target.blur()" @keydown.esc.prevent.stop="renamingId = null" @blur="rename" />
            <b v-else :title="p.title + ' – ' + t('Double-click to rename')" @dblclick="startRename(p)">{{ p.title }}</b>
            <small>{{ t('{0} slides', p.slides) }}<template v-if="p.decks"> · {{ t('{0} decks', p.decks) }}</template> · {{ t(themeOf(p.theme).name) }} · {{ when(p.updated) }}</small>
          </div>
          <div class="project-actions">
            <template v-if="confirmId === p.id">
              <span>{{ t('Delete permanently?') }}</span>
              <button class="tb small confirm-yes" @click="del(p.id)">{{ t('Delete') }}</button>
              <button class="tb small confirm-no" @click="confirmId = null">{{ t('No') }}</button>
            </template>
            <template v-else>
              <button class="tb icon small" :title="t('Save as file (.slides.json)')" @click="save(p)"><Icon name="download" :size="16" /></button>
              <button class="tb icon small" :title="t('Duplicate')" @click="dup(p.id)"><Icon name="copy" :size="16" /></button>
              <button class="tb icon small" :title="t('Delete')" @click="confirmId = p.id"><Icon name="trash" :size="16" /></button>
            </template>
          </div>
        </article>
      </div>
      <Menu ref="ctx" manual>
        <template v-if="ctxProject">
          <button class="mi" @click="open(ctxProject.id)"><Icon name="folder" />{{ t('Open') }}</button>
          <button class="mi" @click="save(ctxProject)"><Icon name="download" />{{ t('Save as file (.slides.json)') }}</button>
          <button class="mi" @click="startRename(ctxProject)"><Icon name="text" />{{ t('Rename') }}</button>
          <button class="mi" @click="dup(ctxProject.id)"><Icon name="copy" />{{ t('Duplicate') }}</button>
          <hr />
          <button class="mi danger" @click="confirmId = ctxProject.id"><Icon name="trash" />{{ t('Delete …') }}</button>
        </template>
      </Menu>
    </section>

    <section class="home-show">
      <h2>{{ t('See what Slidecko can do') }}</h2>
      <video class="show-video" :src="shot('demo') + '.mp4'" :poster="shot('editor') + '.webp'" :autoplay="!still" muted loop playsinline controls preload="metadata"
        :aria-label="t('Demo: change a chart, switch themes and present')" />
      <div class="show-grid">
        <figure v-for="[name, title, text] in SHOWCASE" :key="name" class="show-card">
          <a :href="shot(name) + '.webp'" target="_blank" rel="noopener"><img :src="shot(name) + '.webp'" :alt="t(title)" width="1600" height="1000" loading="lazy" /></a>
          <figcaption><b>{{ t(title) }}</b><p>{{ t(text) }}</p></figcaption>
        </figure>
      </div>
    </section>

    <section class="home-why">
      <h2>{{ t('Why Slidecko') }}</h2>
      <div class="why-grid">
        <div v-for="[title, text] in WHY" :key="title" class="why-card"><b>{{ t(title) }}</b><p>{{ t(text) }}</p></div>
      </div>
    </section>

    <section class="home-themes">
      <h2>{{ t('Start with a theme') }}</h2>
      <template v-for="own in [false, true]" :key="own">
        <h3 v-if="themeIds(own).length" class="theme-group">{{ own ? t('Own themes') : t('Built-in themes') }}</h3>
        <div class="theme-strip">
          <button v-for="id in themeIds(own)" :key="id" class="home-theme" :style="themeStyle(id)" :title="t('New presentation with theme {0}', own ? THEMES[id].name : t(THEMES[id].name))" @click="blank(id)">
            <span class="theme-cover"><b>{{ t('Title') }}</b><i /></span>
            <span class="theme-name">{{ own ? THEMES[id].name : t(THEMES[id].name) }}</span>
          </button>
        </div>
      </template>
    </section>


    <AppFooter class="in-home" />
  </main>
</template>
