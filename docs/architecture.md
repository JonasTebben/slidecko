# Architecture

How Slidecko is put together, for contributors and coding agents. [features.md](features.md) describes the behaviour; this page explains how the parts fit, where a change belongs and which file holds what ("Project layout" at the end).

## The big picture

Slidecko is a static single-page app (Vue 3, plain JavaScript, Vite). Everything happens in the browser: editing, saving, importing and exporting. `server.js` only serves `dist/`. There is no backend, no account and no network call for the user's content.

```
 files, paste ──► import/ ──► cleanEl (store.js) ──► deck (reactive) ──► SlideView.vue ──► editor, presenting, thumbnails
                                     ▲                    │                    │
          inspector, menus, keys ──► actions.js ──────────┘                    └──► export/ (measures the rendered DOM)
                                                          │
                                          IndexedDB autosave, undo history, snapshots
```

## One project model

- `deck` in `src/core/store.js` is the whole open project: slides, master, layouts, theme, assets (images and fonts as data URLs), Slidev source files. Everything that is saved lives there; nothing else is.
- A slide has `elements`. An element is a plain object with a `type` (text, image, table, shape, code, chart, diagram, math, icon, video, timer, picker, quiz, toc) and a box (`x`, `y`, `w`, `h`) in **logical slide units** (`W`×`H` in `store.js`, 980×552 for 16:9; the slide format sets them). Views scale; they never store screen pixels.
- **`cleanEl` is the trust boundary.** Every element passes through it when it is loaded, pasted, imported or restored: it keeps the known fields within their limits and drops the rest. A new field that is not in `cleanEl` is lost on the next load. HTML goes through DOMPurify (`clean`), SVG through `cleanSvg`/`cleanIconBody`.
- Optional fields are left out instead of set to a default (`...(e.repeat === true && { repeat: true })`), so old projects stay valid and files stay small.

## Changing the project

- `src/core/actions.js` holds every command (insert, align, export, import …). Menus, the command palette, keyboard shortcuts and the inspector call the same functions, so behaviour is the same wherever it is triggered. Inspector controls may also write simple fields of the selected element directly (`el.look = 'solid'`).
- Any change to `deck` is picked up by a deep watcher: 300 ms after the last edit it goes into the undo history and IndexedDB (`flush()`); every few minutes a snapshot is kept. There is no "save" step to remember.
- `ui` (same file) is view state: current slide, selection, editing element. `src/core/session.js` keeps it per tab.

## One renderer

`src/components/SlideView.vue` draws a slide everywhere: the editing canvas (`editable`), presenting (`live`), thumbnails, the next-slide preview and the hidden export pages. Theme and layout CSS is in `src/slide/slide.css` and `src/slide/themes.js` (shared with the Slidev export).

Because of this, a new element or style is usually: a field in `cleanEl`, markup in SlideView, CSS in `slide.css`, controls in `src/components/Inspector.vue`.

## Presenting

Presenting state that is not part of the project (timers running, names drawn, quiz picks, text typed into a temporary notes box) lives in small reactive modules in `src/present/` (`timer.js`, `picker.js`, `quiz.js`, `board.js`, `run.js`). They hold plain logic and are unit tested; `App.vue` (presenter, bar, keys) and SlideView use them.

Touch counts as much as a mouse: a click handler must also work for a tap, and a double click must not rely on `dblclick` (iPad does not send it; see `second()` in `timer.js`). Audio is unlocked inside a tap (`unlock()`), focus for typing is set inside the tap (iOS keyboard).

## Import and export

- **Exports measure the rendered slides.** PowerPoint, OpenDocument, PDF, images and the HTML presentation render the slides with SlideView into a hidden `.output` area and read positions, sizes, colours and text from the DOM (`src/export/exportPptx.js`, `exportOdp.js`, `exportFormats.js`). A style made of normal CSS (backgrounds, borders, list numbering, line height) reaches PowerPoint and ODP without extra code; pseudo-elements, gradients on text and the like do not, and need a picture or a native shape. Elements that have no native equivalent (timer with a ring, random draw, formulas) go in as pictures.
- **The HTML presentation** ships its own small script (string in `exportFormats.js`) that copies the presenting behaviour of timers, draws and quizzes; keep it in step with `src/present/`.
- **Slidev** (`src/export/toSlidev.js`, `src/import/importSlidev.js`, `parseSlidev.js`) is a round trip: what Slidev cannot show is kept in `data-*` attributes or CSS custom properties (`--board`, `--lh`) on the element's box, and the import reads it back. Unchanged slides must stay byte for byte.
- **Office import** (`src/import/importOffice.js`) maps PowerPoint/ODP shapes to elements as far as the format allows.
- Import/export libraries are loaded with `import()` on first use, so they stay out of the startup bundle.

**Rule:** anything new must work in every format (see AGENTS.md, "Formats"). Decide for each format what it gets, write it into `docs/features.md`, and run `bun run smoke`.

## Adding something: checklist

For a new element type, field or style:

1. `src/core/store.js` – `cleanEl`: accept and limit it (a test in `store.test.js`).
2. `src/slide/presets.js` – the defaults of a new element.
3. `src/components/SlideView.vue` and `src/slide/slide.css` – how it looks; themes must stay WCAG AA ("Themes" below).
4. `src/components/Inspector.vue` – the controls; every string in `t()` and in all `src/locales/*.js` ("Translations" below).
5. Presenting behaviour in `src/present/` with a test, the same behaviour in the HTML presentation script.
6. Exports and imports: check each format, add `data-*` for the Slidev round trip (test in `toSlidev.test.js`).
7. `docs/features.md`; [privacy.md](privacy.md) if browser storage changes.
8. `bun test`, `bun run build`, `bun run smoke`.

## Project rules

- **Dependencies**: avoid new ones; a few lines of code do not justify a package. If one is needed, pin the exact version, load heavy import/export code lazily with `import()`, and add it to `NOTICE` with its licence (and "loaded only for …" if it is lazy) in the same commit.
- **Storage**: a change to what is kept in IndexedDB, localStorage or sessionStorage updates [privacy.md](privacy.md); keys keep the `slides-builder` prefix (existing user data).
- **Accessibility**: every control has a name (text or `aria-label`), works with the keyboard and keeps 4.5:1 contrast; motion respects reduced motion.
- **Untrusted input**: files, the clipboard and browser storage go through `cleanEl`, HTML through DOMPurify; imported HTML or SVG never reaches the page unchecked.
- **The repository holds only the app**: no personal data, secrets, hosting details or legal pages.
- Exports are checked by opening them in LibreOffice and Google Slides.

## Translations

English text is the key: code calls `t('Slide {0} of {1}', a, b)` and `src/locales/de.js` (German), `fr.js`, `nl.js` and `es.js` map it to the other languages. A missing entry shows the English text.

- Put every new interface string in `t()` and add it to `src/locales/de.js`. Labels in constants (`presets.js`, `themes.js`) are English and are translated when shown, with `t(x.name)`.
- Another language: add `src/locales/<code>.js` (English → translation) and register it in `LOCALES` in `src/core/i18n.js`.
- Tests always run in English, because they check English text.

## Themes

Each built-in theme is a file in `themes/built-in/` (`id`, `name`, `dark`, `vars`); a new one is a new file plus its import in `src/slide/themes.js`. `src/slide/themes.test.js` checks that every file is loaded.

All built-in themes meet WCAG AA (text 4.5:1, large text 3:1) on every layout, callout, code block and table preset. For new or changed themes:

- Set `accent-fg` when the accent is light (text on table headers). The accent itself must reach 4.5:1 on `bg`, because links use it.
- Set `cover-fg` when the cover has a coloured background (`cover-bg`). Quotes, numbers and links on centred layouts take this colour.
- `bar` may be a colour or a gradient.
- Presets in `src/slide/presets.js` use translucent fills (`fillAlpha`) rather than fixed light ones, so dark themes stay readable.
- Syntax colours for light code backgrounds are in `src/slide/slide.css`. On dark backgrounds `codeDark()` switches to GitHub Dark.

## Tests

- **Unit tests** (`bun test`) sit next to their source as `*.test.js` and cover logic without a browser: parsing, cleaning, state, export writers. They do not compile `.vue` files.
- **Smoke test** (`bun run smoke`, `scripts/smoke.js`) builds the app and drives it in Chromium: every module loads, dialogs open, every export downloads and imports again (dev server and production build), and presenting is driven with a mouse and with iPad touch (taps, double taps, typing into notes boxes, drawing, timers). Add a step there for any new interaction.

## Things that look odd but are on purpose

- Coordinates are logical; never store `getBoundingClientRect` values without dividing by the scale.
- `slides-builder` is the storage prefix (existing user data), not a leftover name.
- Slides keep their theme colours in dark mode; only the app chrome follows `src/core/scheme.js`.

## Agent skill

`skills/slidecko/SKILL.md` tells AI agents which Slidev Markdown Slidecko reads; `.claude-plugin/` makes the repository installable as a Claude Code plugin. When the Markdown import learns or drops something, update the skill: `src/import/skill.test.js` reads its example deck and checks layouts, notes, columns and diagrams.

## Project layout

`src/main.js` and `src/App.vue` are the entry and the app shell; the rest of `src/` is grouped by area:

| Folder | Holds |
| --- | --- |
| `src/core/` | project state, persistence, commands, view session, translations, light/dark, shortcuts |
| `src/slide/` | what a slide is made of: themes, fonts, format, presets, charts, diagrams, formulas, icons, marks, links |
| `src/editor/` | editing helpers: lists, tables, paste, spacing, search, accessibility check, source editor, tutorial, tour |
| `src/present/` | presenting: clicks, magic move, drawing, rehearsal, recording, quiz, picker, timer, runnable code |
| `src/import/`, `src/export/` | reading other formats into slides, writing slides out (Slidev, PPTX, ODP, images, HTML, Git) |
| `src/components/` | Vue components |
| `src/locales/` | interface translations |

| Path | Purpose |
| --- | --- |
| `src/import/parseSlidev.js` | Markdown → slides (frontmatter, `src:` includes, blocks) |
| `src/editor/source.js`, `src/editor/sourceLang.js`, `src/components/SourceEditor.vue` | Markdown source editor: deck files to slide texts and back, lint and format, Slidev frontmatter highlighting, and its window (lazy-loaded) |
| `src/editor/tutorial.js`, `src/components/MarkdownTutorial.vue` | Markdown tutorial: lessons with their checks, and its dialog (lazy-loaded) |
| `src/import/importSlidev.js` | renders each slide like Slidev does and measures its elements |
| `src/import/importOffice.js` | PowerPoint and OpenDocument import |
| `src/export/toSlidev.js` | slides → Slidev project files |
| `src/slide/marks.js` | hand-drawn marks (`v-mark`): directive parsing and writing, seeded strokes |
| `src/export/exportPptx.js` | PPTX and ODP from the rendered slides (one layout pass) |
| `src/export/pptxFix.js` | schema fixes for the slide XML pptxgenjs writes |
| `src/export/exportOdp.js` | OpenDocument writer with the pptxgenjs interface |
| `src/export/exportFormats.js` | images, exact PPTX, HTML presentation, print preparation |
| `src/slide/fonts.js`, `src/components/FontOptions.vue`, `public/fonts/` | included fonts (each with its `OFL.txt`) and uploaded ones: `@font-face` rules, file checks, the font menu |
| `src/slide/themes.js`, `src/slide/slide.css` | theme loading and own themes, table and callout styles (shared by the editor and the Slidev export) |
| `src/components/ThemeEditor.vue`, `src/components/CodeEditor.vue` | theme editor with preview, CSS editor (CodeMirror, loaded on first use) |
| `src/core/store.js`, `src/core/actions.js` | project state, persistence, commands |
| `src/slide/icons.js`, `src/components/IconPicker.vue` | icons: bundled Iconify sets (one lazy chunk each), search, SVG, Slidev tags; the picker dialog |
| `src/slide/diagram.js` | Mermaid diagrams: rendering (Mermaid loaded on first use), sanitizing, cache per code and theme |
| `src/slide/math.js`, `src/slide/katexCss.js` | formulas: `$…$`/`$$…$$` in text and Markdown, KaTeX rendering (loaded on first use, fonts served by the app) |
| `src/core/session.js` | view state in the URL hash and per-tab state for reloads |
| `src/core/i18n.js`, `src/locales/` | interface translations |
| `src/core/scheme.js` | light/dark mode |
| `src/components/AppFooter.vue`, `src/core/support.js` | footer and its build-time links |
| `index.html` | app entry |
| `src/present/run.js`, `public/runner.html`, `public/runner.js` | runnable code: Slidev `{monaco-run}` options and the sandbox (iframe with an opaque origin, one worker per run) |
| `server.js` | Bun server: serves `dist/`, `/health` |
| `themes/built-in/*.theme.json` | the 13 built-in themes, one file each (bundled at build time; the format of an exported theme, so a copy can be imported and adapted in the theme editor) |
| `themes/jbt.theme.json` | an importable theme that maps to the Slidev theme package [`jbt-theme`](https://github.com/JonasTebben/jbt-theme) |
