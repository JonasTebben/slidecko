# Slidecko

A presentation editor that runs entirely in the browser. Design slides, import PowerPoint, OpenDocument, PDF and [Slidev](https://sli.dev) presentations, and export to PowerPoint, OpenDocument, PDF, HTML or a Slidev project. Projects stay in the browser (IndexedDB). The server only delivers static files.

Live: [slidecko.de](https://slidecko.de)

## Getting started

Requires [Bun](https://bun.sh) (version in `package.json` → `packageManager`).

```bash
bun install
bun run dev      # editor with hot reload (Vite)
bun run build    # static files in dist/
bun run start    # serve dist/ with the Bun server: http://localhost:3000
bun test         # parser, export and server tests
bun run smoke    # the whole app in a browser (Playwright): dialogs, every export and its import, dev and built
```

## Features

- **Import** Slidev projects (a folder with `slides.md`, `src:` includes, images, theme), PowerPoint (`.pptx`/`.potx`, also from Google Slides and Keynote), OpenDocument (`.odp`/`.otp`), PDF (one image slide per page, text in the notes), Slidecko's own HTML exports and images.
- **Export** to Slidev (`.zip`), a Git project whose commits are the saved versions, PDF (vector, selectable text), PowerPoint (editable, plus a Google Slides variant and an image-only "exact" variant), OpenDocument, a single-file or zipped HTML presentation, and PNG images.
- **Edit** text, headings, lists, quotes, callouts, code with syntax highlighting, images, tables, charts (column, bar, line, pie; data pasted from a spreadsheet), shapes, Mermaid diagrams, formulas (KaTeX, `$…$` in text), icons (Slidev's Iconify sets Lucide, Tabler, Material Design, Carbon, Phosphor; bundled, searchable), YouTube videos, runnable JavaScript code (Slidev's `{monaco-run}`, in a sandbox), and timers, random pickers ("who's next?") and quizzes you use while presenting, with snapping guides, multi-selection, format painter, alignment, undo/redo, a version history (automatic snapshots) a command palette (⌘K) and keyboard shortcuts you can change.
- **Links and table of contents**: link text, shapes or images to a slide (they follow it when slides move), a live table of contents, and slide background images, in every export (Slidev `<Link>`, `<Toc>`, `background:`; PDF and HTML links; PowerPoint and ODP slide jumps).
- **Master and layouts**: elements on every slide (logo, footer, slide number), editable slide layouts with placeholders and decorations, also in every export.
- **Fonts**: seven included open-source fonts and your own font files (`.woff2`, `.woff`, `.ttf`, `.otf`), stored with the project and embedded in HTML, image and Slidev exports; served from the app itself, never from a font CDN.
- **Themes**: 13 built-in themes and a theme editor (colours, fonts, own CSS) whose themes can be exported and imported as `.theme.json`.
- **Markdown**: edit the whole project as Slidev Markdown in a VS Code-like source editor (highlighting, markdownlint, Prettier, live preview), insert slides from Markdown (e.g. written by an AI) or edit one slide as Markdown; a hands-on Markdown tutorial teaches the syntax in a few minutes.
- **Present** in full screen or with a presenter view (notes, next slide, timer, slide overview with O), and **rehearse** the talk against planned times per slide; elements can appear and disappear step by step on click (Slidev's `v-click`, `v-click.hide`, ranges), code highlights step through lines, notes follow `[click]` markers, and words get hand-drawn marks (`v-mark`: circle, underline, highlight …) drawn on a click; Magic move slides elements that two slides share from one place, size and colour to the next; record the talk as a video with microphone and a camera bubble (stays on the device).
- **Accessibility check** for the presentation: alt text, contrast (WCAG AA), font size, slide titles, reading order, table headers, link texts, with one-click fixes.
- **Phone and tablet** layout, long press for context menus, light/dark mode, interface in German, English, French, Dutch and Spanish, accessible controls (4.5:1 contrast, named controls, reduced motion).

The full behaviour is described in [docs/features.md](docs/features.md).

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
| `src/slide/themes.js`, `src/slide/slide.css` | themes, table and callout styles (shared by the editor and the Slidev export) |
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
| `themes/jbt.theme.json` | an importable theme that maps to the Slidev theme package [`jbt-theme`](https://github.com/JonasTebben/jbt-theme) |

## Translations

English text is the key: code calls `t('Slide {0} of {1}', a, b)` and `src/locales/de.js` (German), `fr.js`, `nl.js` and `es.js` map it to the other languages. A missing entry shows the English text.

- Put every new interface string in `t()` and add it to `src/locales/de.js`. Labels in constants (`presets.js`, `themes.js`) are English and are translated when shown, with `t(x.name)`.
- Another language: add `src/locales/<code>.js` (English → translation) and register it in `LOCALES` in `src/core/i18n.js`.
- Tests always run in English, because they check English text.

## Theme readability

All built-in themes meet WCAG AA (text 4.5:1, large text 3:1) on every layout, callout, code block and table preset. For new or changed themes:

- Set `accent-fg` when the accent is light (text on table headers). The accent itself must reach 4.5:1 on `bg`, because links use it.
- Set `cover-fg` when the cover has a coloured background (`cover-bg`). Quotes, numbers and links on centred layouts take this colour.
- `bar` may be a colour or a gradient.
- Presets in `src/slide/presets.js` use translucent fills (`fillAlpha`) rather than fixed light ones, so dark themes stay readable.
- Syntax colours for light code backgrounds are in `src/slide/slide.css`. On dark backgrounds `codeDark()` switches to GitHub Dark.

## What the app stores

The app sets no cookies, has no tracking and uploads nothing. Imports are read and exports created in the browser.

| Where | What | How long |
|---|---|---|
| IndexedDB `slides-builder` | projects (slides, master and layouts, images, uploaded fonts, project files, planned times and the last 5 rehearsals), project list, snapshots (version history: up to 20 per project with the images they use) | until the project or the site data is deleted |
| localStorage `slides-builder:*` | last project (`last`), language (`lang`), light/dark (`scheme`), export format (`export`), keep font sizes (`keep-sizes`), own text styles (`text-presets`), imported themes (`themes`), search options (`find`), folded sidebars (`panels`), last icon set in the icon picker (`icon-set`), tour offered on the start page (`tour`), your changed keyboard shortcuts (`keys`), recording choices: source, microphone and camera on/off and device, camera bubble size and place (`recording`) | permanent |
| sessionStorage `slides-builder:session` | the tab's view (selection, folded decks, scroll position), search term, YouTube consent | until the tab is closed |
| sessionStorage `slides-builder:reloaded` | when the tab last reloaded itself because a release replaced the app's files (at most once a minute) | until the tab is closed |

YouTube loads only after a click on "Load YouTube content" (thumbnails from `i.ytimg.com`, the player from `www.youtube-nocookie.com`).

When this changes (`src/core/session.js`, `src/core/store.js`, `src/slide/themes.js`, `src/core/i18n.js`, `src/core/scheme.js`, `src/App.vue`), update this table.

## Hosting your own copy

`bun run build` produces static files with relative paths, so `dist/` works under any path on any static host. `server.js` serves it with Bun (port from `PORT`, folder from `DIST`, health check at `/health`); `railway.json` is a ready configuration for [Railway](https://railway.com).

The footer links are set at build time through environment variables. An empty one hides its link:

| Variable | Link | Default |
|---|---|---|
| `VITE_HOME_URL` | "Slidecko" | this repository |
| `VITE_LEGAL_URL` | legal notice | none |
| `VITE_PRIVACY_URL` | privacy policy | none |
| `VITE_SUPPORT_URL` | donation link, e.g. a Stripe Payment Link | none |

```bash
VITE_LEGAL_URL=https://example.com/imprint VITE_PRIVACY_URL=https://example.com/privacy bun run build
```

If you run Slidecko publicly, you are responsible for your own legal notice and privacy policy; the table above lists what the app stores.

## Known limitations

- Click steps show as the fully revealed slide in PDF and images, unless "One page per click step" is ticked. PPTX/ODP animate whole elements only: list items shown one by one appear together, code highlight steps show the last step.
- Runnable code: TypeScript types are removed, not checked; no Monaco editor, a plain text field while presenting; the HTML presentation runs the code as on the slide, without editing.
- Vue components other than `<Youtube>` stay in the Markdown but are not rendered in the editor.
- Editable PPTX/ODP: line breaks match the editor, so they stay as soft breaks if the text is reworded later. Text shadows are missing. `system-ui` is written as Helvetica Neue (Mac) or Segoe UI (Windows). Use the "exact" export for identical looks.
- PPTX/ODP cannot embed fonts: included and uploaded fonts are written by name and must be installed where the file is opened.
- Formulas in editable PPTX/ODP: a formula, and a text box with `$…$` in it, become a picture (TeX source as alt text); KaTeX cannot be written as Office math. Slidev's `$$ {1|3}` line marks are dropped on import.
- Keynote has no open file format and opens the PPTX. Google Slides imports the PPTX; use the "Google Slides" variant. Code fonts are written as Courier New there.

## License

[Apache License 2.0](LICENSE). Third-party notices are in [NOTICE](NOTICE).
