// The export dialog: one place for every format, for the whole project or one deck (App.vue's dialog)
import { ref, computed } from 'vue'
import * as A from '../core/actions.js'
import { parseRange } from '../export/range.js'

// openDlg: App.vue's way of opening a modal dialog (resets its returnValue)
export function useExport({ openDlg }) {
  // sorted by purpose: editable office formats, web, picture-exact copies, developer project
  const EXPORTS = [
    { id: 'pdf', icon: 'fileText', name: 'PDF', ext: '.pdf', apps: 'For sharing, printing and archiving', note: 'Vector PDF, selectable text', exact: true },
    { id: 'pptx', icon: 'presentation', name: 'PowerPoint', ext: '.pptx', apps: 'PowerPoint · Keynote · LibreOffice', note: 'Text, tables and shapes stay editable. Not for Google Slides – text shifts there; use its own variant instead.', editable: true },
    { id: 'pptx-google', icon: 'cloud', name: 'Google Slides', ext: '.pptx', apps: 'Google Slides (File → Import)', note: 'Editable; line spacing written the way Google reads it', editable: true },
    { id: 'odp', icon: 'slides', name: 'OpenDocument', ext: '.odp', apps: 'LibreOffice Impress · OpenOffice · Collabora', note: 'Open format, editable', editable: true },
    { id: 'html', icon: 'globe', name: 'HTML presentation', ext: '.html', apps: 'Any browser, also offline', note: 'A single file. Present with the arrow keys, F for fullscreen.', exact: true },
    { id: 'html-zip', icon: 'archive', name: 'HTML presentation (ZIP)', ext: '.zip', apps: 'Web servers, learning platforms, any browser', note: 'index.html with images as separate files – smaller than the single file', exact: true },
    { id: 'png', icon: 'image', name: 'Images', ext: '.png (ZIP)', apps: 'Web, learning platforms, social media', note: 'One PNG file per slide, 1960 × 1104 px', exact: true },
    { id: 'pptx-image', icon: 'images', name: 'PowerPoint as images', ext: '.pptx', apps: 'PowerPoint · Keynote · Google Slides · LibreOffice', note: 'Each slide as a high-resolution image – looks exactly like here everywhere. Notes are kept.', exact: true },
    { id: 'slidev', icon: 'markdown', name: 'Slidev project', ext: '.zip', apps: 'Slidev (npx slidev)', note: 'Markdown with all decks, images and theme', editable: true, project: true },
    { id: 'git', icon: 'git', name: 'Git project', ext: '.zip', apps: 'Git · GitHub · GitLab', note: 'The Slidev project, with every saved version as a commit', editable: true, project: true },
  ]
  const MAIN_EXPORTS = ['pdf', 'pptx', 'pptx-google', 'html']
  const exportDialog = ref(), exportScope = ref(''), exportFormat = ref((() => { try { return localStorage.getItem('slides-builder:export') } catch {} })() || 'pptx') // storage can throw (blocked site data)
  const exportClicks = ref(false) // PDF and images: one page per click step
  const exportWithNotes = ref(false) // PDF: a handout with the speaker notes
  const exportRange = ref('') // "1, 6-8": only these slides (empty: all)
  const exportPicked = computed(() => parseRange(exportRange.value, A.scopeList(exportScope.value || undefined).length))
  function openExport(scope = '', format) {
    exportScope.value = scope
    if (format) exportFormat.value = format
    openDlg(exportDialog.value)
  }
  function doExport() {
    if (exportDialog.value.returnValue !== 'ok') return
    try { localStorage.setItem('slides-builder:export', exportFormat.value) } catch { /* private mode */ }
    A.exportAs(exportFormat.value, exportScope.value || undefined, exportClicks.value, exportWithNotes.value, !EXPORTS.find(f => f.id === exportFormat.value)?.project && exportPicked.value || [])
  }
  return { EXPORTS, MAIN_EXPORTS, exportDialog, exportClicks, exportWithNotes, exportRange, exportPicked, openExport, doExport, exportScope, exportFormat }
}
