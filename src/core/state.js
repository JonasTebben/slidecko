// the open project and the editor's state (a leaf module: clean.js and store.js both read it)
import { reactive } from 'vue'
import { DEFAULT_THEME } from '../slide/themes.js'

// The open project. A project is a Slidev project: an entry file (slides.md) plus the decks
// (Foliensätze) it embeds via `src:`. Slides are one flat list; slide.file says which deck file a
// slide belongs to, so "Gesamt" is the list and a deck is a run of slides with the same file.
// assets: { id: dataURL } – kept out of the slides so undo snapshots and duplicates stay small.
// files: other files of the Slidev project (theme/, package.json, global components …) as text or
// data URL, written back unchanged on export so the project keeps working.
export const deck = reactive({ id: '', title: '', source: '', typo: {}, theme: DEFAULT_THEME, aspectRatio: '16/9', canvasWidth: 980, transition: 'none', duration: 0, rehearsals: [], entry: 'slides.md', slides: [], master: [], layouts: [], assets: {}, files: {}, fonts: {} })
// master: elements on every slide; layouts (slide types): { id, name, layout: its Slidev layout, elements } where
// placeholder elements are copied into a new slide and the others are drawn behind every slide using it
// sel: selected element ids (last = primary); editing: id of the element being typed in
export const ui = reactive({ master: null, slide: 0, sel: [], editing: null, status: '', cell: null, cellEnd: null, cellFill: false, crop: null, cropRatio: null, look: null, painting: false, home: false, save: 'saved', yt: false }) // save: saving | saved | failed; yt: YouTube content allowed in this tab (privacy: nothing loads from Google before a click; kept in sessionStorage)
export const library = reactive({ list: [] }) // [{ id, title, theme, slides, decks, updated }]

// display styles of random draws, quizzes and tables of contents (unset: the first, built-in one)
export const LOOKS = { picker: ['solid', 'outline', 'plain'], quiz: ['list', 'colors', 'plain'], toc: ['numbered', 'cards', 'lines'] }
