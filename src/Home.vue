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

const emit = defineEmits(['import'])
const error = ref('')
const confirmId = ref(null)

const go = fn => async (...a) => { error.value = ''; try { await fn(...a) } catch (e) { error.value = e.message } }
const blank = go(theme => createProject({
  title: t('Neue Präsentation'), theme,
  slides: ['title', 'content'].map(id => { const p = SLIDE_PRESETS.find(x => x.id === id); return { layout: p.layout, elements: p.make() } }),
}))
const open = go(openProject)
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
  if (!files.some(f => f.name.endsWith('.md'))) throw new Error(t('Keine .md-Datei gefunden – zieh einen Slidev-Ordner, .md-Dateien, eine .slides.json oder eine Präsentation (PowerPoint, OpenDocument, PDF) hierher.'))
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
</script>

<template>
  <div class="home" :class="{ dragging }" @dragover="over" @dragleave.self="dragging = false" @drop.prevent="onDrop">
    <div v-if="dragging" class="drop-hint" aria-hidden="true"><Icon name="upload" :size="36" /><b>{{ t('Loslassen zum Öffnen') }}</b><small>{{ t('Slidev-Ordner, .md, .slides.json, .pptx, .odp, .pdf, .html oder Bilder') }}</small></div>
    <header class="home-head">
      <span class="brand"><Icon name="slides" :size="24" /> Slidecko</span>
      <button v-if="deck.id" class="tb" @click="ui.home = false"><Icon name="chevronR" />{{ t('Zurück zu „{0}“', deck.title) }}</button>
    </header>

    <section class="home-start">
      <h1>{{ t('Präsentationen im Browser gestalten') }}</h1>
      <p class="lead">{{ t('Fang neu an oder zieh eine Präsentation auf diese Seite: PowerPoint, OpenDocument, PDF, Bilder oder ein Slidev-Projekt.') }}</p>
      <div class="start-grid">
        <button class="start-card primary" @click="blank(DEFAULT_THEME)"><Icon name="plus" :size="28" /><b>{{ t('Neue Präsentation') }}</b><small>{{ t('Leere Präsentation im aktuellen Standard-Theme') }}</small></button>
        <label class="start-card"><Icon name="folder" :size="28" /><b>{{ t('Slidev-Projekt öffnen') }}</b><small>{{ t('Ordner mit slides.md wählen – Foliensätze, Bilder und Theme werden übernommen') }}</small>
          <input type="file" webkitdirectory hidden @change="emit('import', [...$event.target.files]); $event.target.value = ''" /></label>
        <label class="start-card"><Icon name="upload" :size="28" /><b>{{ t('Markdown-Dateien öffnen') }}</b><small>{{ t('Einzelne .md-Foliensätze, z. B. von einer KI erzeugt') }}</small>
          <input type="file" accept=".md,text/markdown" multiple hidden @change="emit('import', [...$event.target.files]); $event.target.value = ''" /></label>
        <label class="start-card"><Icon name="file" :size="28" /><b>{{ t('Projektdatei öffnen') }}</b><small>{{ t('Gesicherte .slides.json oder ZIP mit allen Projekten') }}</small>
          <input type="file" accept=".json,application/json,.zip" multiple hidden @change="importPresentations([...$event.target.files]); $event.target.value = ''" /></label>
        <label class="start-card"><Icon name="upload" :size="28" /><b>{{ t('Präsentation importieren') }}</b><small>{{ t('PowerPoint, Google Slides/Keynote (als .pptx), OpenDocument, PDF, eigene HTML-Exporte oder Bilder') }}</small>
          <input type="file" :accept="IMPORT_ACCEPT" multiple hidden @change="importPresentations([...$event.target.files]); $event.target.value = ''" /></label>
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </section>

    <section class="home-themes">
      <h2>{{ t('Mit Theme beginnen') }}</h2>
      <template v-for="own in [false, true]" :key="own">
        <h3 v-if="themeIds(own).length" class="theme-group">{{ own ? t('Eigene Themes') : t('Vorgegebene Themes') }}</h3>
        <div class="theme-strip">
          <button v-for="id in themeIds(own)" :key="id" class="home-theme" :style="themeStyle(id)" :title="t('Neue Präsentation im Theme {0}', own ? THEMES[id].name : t(THEMES[id].name))" @click="blank(id)">
            <span class="theme-cover"><b>{{ t('Titel') }}</b><i /></span>
            <span class="theme-name">{{ own ? THEMES[id].name : t(THEMES[id].name) }}</span>
          </button>
        </div>
      </template>
    </section>

    <section class="home-projects">
      <h2>{{ t('Meine Projekte') }} <small>{{ t('gespeichert in diesem Browser · sichern als .slides.json, zurückholen über „Projektdatei öffnen“') }}</small>
        <button v-if="library.list.length > 1" class="tb small" @click="exportAllProjects"><Icon name="download" :size="16" />{{ t('Alle sichern') }}</button></h2>
      <p v-if="!library.list.length" class="empty">{{ t('Noch keine Projekte – leg oben los.') }}</p>
      <div class="project-grid">
        <article v-for="p in library.list" :key="p.id" class="project" :class="{ current: p.id === deck.id }" @contextmenu="onContext($event, p)">
          <button class="project-open" :style="themeStyle(p.theme)" @click="open(p.id)">
            <span class="project-cover"><b>{{ p.title }}</b></span>
          </button>
          <div class="project-meta">
            <input v-if="renamingId === p.id" class="project-rename" :value="p.title" :aria-label="t('Projektname')" maxlength="200"
              @keydown.enter.prevent="$event.target.blur()" @keydown.esc.prevent.stop="renamingId = null" @blur="rename" />
            <b v-else :title="p.title + ' – ' + t('Doppelklick zum Umbenennen')" @dblclick="startRename(p)">{{ p.title }}</b>
            <small>{{ t('{0} Folien', p.slides) }}<template v-if="p.decks"> · {{ t('{0} Foliensätze', p.decks) }}</template> · {{ t(themeOf(p.theme).name) }} · {{ when(p.updated) }}</small>
          </div>
          <div class="project-actions">
            <template v-if="confirmId === p.id">
              <span>{{ t('Endgültig löschen?') }}</span>
              <button class="tb small danger" @click="del(p.id)">{{ t('Löschen') }}</button>
              <button class="tb small" @click="confirmId = null">{{ t('Nein') }}</button>
            </template>
            <template v-else>
              <button class="tb icon small" :title="t('Als Datei sichern (.slides.json)')" @click="save(p)"><Icon name="download" :size="16" /></button>
              <button class="tb icon small" :title="t('Duplizieren')" @click="dup(p.id)"><Icon name="copy" :size="16" /></button>
              <button class="tb icon small" :title="t('Löschen')" @click="confirmId = p.id"><Icon name="trash" :size="16" /></button>
            </template>
          </div>
        </article>
      </div>
      <Menu ref="ctx" manual>
        <template v-if="ctxProject">
          <button class="mi" @click="open(ctxProject.id)"><Icon name="folder" />{{ t('Öffnen') }}</button>
          <button class="mi" @click="save(ctxProject)"><Icon name="download" />{{ t('Als Datei sichern (.slides.json)') }}</button>
          <button class="mi" @click="startRename(ctxProject)"><Icon name="text" />{{ t('Umbenennen') }}</button>
          <button class="mi" @click="dup(ctxProject.id)"><Icon name="copy" />{{ t('Duplizieren') }}</button>
          <hr />
          <button class="mi danger" @click="confirmId = ctxProject.id"><Icon name="trash" />{{ t('Löschen …') }}</button>
        </template>
      </Menu>
    </section>

    <AppFooter class="in-home" />
  </div>
</template>
