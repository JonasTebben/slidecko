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
```

## Features

- **Import** Slidev projects (a folder with `slides.md`, `src:` includes, images, theme), PowerPoint (`.pptx`/`.potx`, also from Google Slides and Keynote), OpenDocument (`.odp`/`.otp`), PDF (one image slide per page, text in the notes), Slidecko's own HTML exports and images.
- **Export** to Slidev (`.zip`), PDF (vector, selectable text), PowerPoint (editable, plus a Google Slides variant and an image-only "exact" variant), OpenDocument, a single-file or zipped HTML presentation, and PNG images.
- **Edit** text, headings, lists, quotes, callouts, code with syntax highlighting, images, tables, shapes, YouTube videos, and timers, random pickers ("who's next?") and quizzes you use while presenting, with snapping guides, multi-selection, format painter, alignment, undo/redo, a version history (automatic snapshots) and a command palette (⌘K).
- **Master and layouts**: elements on every slide (logo, footer, slide number), editable slide layouts with placeholders and decorations, also in every export.
- **Themes**: 13 built-in themes and a theme editor (colours, fonts, own CSS) whose themes can be exported and imported as `.theme.json`.
- **Markdown**: insert slides from Slidev Markdown (e.g. written by an AI) or edit one slide as Markdown; a hands-on Markdown tutorial teaches the syntax in a few minutes.
- **Present** in full screen or with a presenter view (notes, next slide, timer); elements can appear step by step on click (Slidev's `v-click`).
- **Phone and tablet** layout, long press for context menus, light/dark mode, English and German interface, accessible controls (4.5:1 contrast, named controls, reduced motion).

The full behaviour is described in [docs/features.md](docs/features.md).

## Project layout

| Path | Purpose |
| --- | --- |
| `src/parseSlidev.js` | Markdown → slides (frontmatter, `src:` includes, blocks) |
| `src/tutorial.js`, `src/MarkdownTutorial.vue` | Markdown tutorial: lessons with their checks, and its dialog (lazy-loaded) |
| `src/importSlidev.js` | renders each slide like Slidev does and measures its elements |
| `src/importOffice.js` | PowerPoint and OpenDocument import |
| `src/toSlidev.js` | slides → Slidev project files |
| `src/exportPptx.js` | PPTX and ODP from the rendered slides (one layout pass) |
| `src/pptxFix.js` | schema fixes for the slide XML pptxgenjs writes |
| `src/exportOdp.js` | OpenDocument writer with the pptxgenjs interface |
| `src/exportFormats.js` | images, exact PPTX, HTML presentation, print preparation |
| `src/themes.js`, `src/slide.css` | themes, table and callout styles (shared by the editor and the Slidev export) |
| `src/ThemeEditor.vue`, `src/CodeEditor.vue` | theme editor with preview, CSS editor (CodeMirror, loaded on first use) |
| `src/store.js`, `src/actions.js` | project state, persistence, commands |
| `src/session.js` | view state in the URL hash and per-tab state for reloads |
| `src/i18n.js`, `src/locales/` | interface translations |
| `src/scheme.js` | light/dark mode |
| `src/AppFooter.vue`, `src/support.js` | footer and its build-time links |
| `index.html` | app entry |
| `server.js` | Bun server: serves `dist/`, `/health` |
| `themes/jbt.theme.json` | an importable theme that maps to the Slidev theme package [`jbt-theme`](https://github.com/JonasTebben/jbt-theme) |

## Translations

English text is the key: code calls `t('Slide {0} of {1}', a, b)` and `src/locales/de.js` maps it to German. A missing entry shows the English text.

- Put every new interface string in `t()` and add it to `src/locales/de.js`. Labels in constants (`presets.js`, `themes.js`) are English and are translated when shown, with `t(x.name)`.
- Another language: add `src/locales/<code>.js` (English → translation) and register it in `LOCALES` in `src/i18n.js`.
- Tests always run in English, because they check English text.

## Theme readability

All built-in themes meet WCAG AA (text 4.5:1, large text 3:1) on every layout, callout, code block and table preset. For new or changed themes:

- Set `accent-fg` when the accent is light (text on table headers). The accent itself must reach 4.5:1 on `bg`, because links use it.
- Set `cover-fg` when the cover has a coloured background (`cover-bg`). Quotes, numbers and links on centred layouts take this colour.
- `bar` may be a colour or a gradient.
- Presets in `src/presets.js` use translucent fills (`fillAlpha`) rather than fixed light ones, so dark themes stay readable.
- Syntax colours for light code backgrounds are in `src/slide.css`. On dark backgrounds `codeDark()` switches to GitHub Dark.

## What the app stores

The app sets no cookies, has no tracking and uploads nothing. Imports are read and exports created in the browser.

| Where | What | How long |
|---|---|---|
| IndexedDB `slides-builder` | projects (slides, master and layouts, images, project files), project list, snapshots (version history: up to 20 per project with the images they use) | until the project or the site data is deleted |
| localStorage `slides-builder:*` | last project (`last`), language (`lang`), light/dark (`scheme`), export format (`export`), keep font sizes (`keep-sizes`), own text styles (`text-presets`), imported themes (`themes`), search options (`find`), folded sidebars (`panels`), tour offered on the start page (`tour`) | permanent |
| sessionStorage `slides-builder:session` | the tab's view (selection, folded decks, scroll position), search term, YouTube consent | until the tab is closed |

YouTube loads only after a click on "Load YouTube content" (thumbnails from `i.ytimg.com`, the player from `www.youtube-nocookie.com`).

When this changes (`src/session.js`, `src/store.js`, `src/themes.js`, `src/i18n.js`, `src/scheme.js`, `src/App.vue`), update this table.

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

- `v-click` steps show as the fully revealed slide (like Slidev's PDF export).
- Vue components other than `<Youtube>`, and Mermaid diagrams, stay in the Markdown but are not rendered in the editor.
- Editable PPTX/ODP: line breaks match the editor, so they stay as soft breaks if the text is reworded later. Text shadows are missing. `system-ui` is written as Helvetica Neue (Mac) or Segoe UI (Windows). Use the "exact" export for identical looks.
- Keynote has no open file format and opens the PPTX. Google Slides imports the PPTX; use the "Google Slides" variant. Code fonts are written as Courier New there.

## License

[Apache License 2.0](LICENSE). Third-party notices are in [NOTICE](NOTICE).
