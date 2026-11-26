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
- **Edit** text, headings, lists, quotes, callouts, code with syntax highlighting, images, tables, charts (column, bar, line, pie, donut; data pasted from a spreadsheet), shapes, Mermaid diagrams, formulas (KaTeX, `$…$` in text), icons (Slidev's Iconify sets Lucide, Tabler, Material Design, Carbon, Phosphor; bundled, searchable), YouTube videos, web pages, runnable JavaScript code (Slidev's `{monaco-run}`, in a sandbox), and timers, random pickers ("who's next?") and quizzes you use while presenting, with snapping guides, multi-selection, format painter, alignment, undo/redo, a version history (automatic snapshots) a command palette (⌘K) and keyboard shortcuts you can change.
- **Links and table of contents**: link text, shapes or images to a slide (they follow it when slides move), a live table of contents, and slide background images, in every export (Slidev `<Link>`, `<Toc>`, `background:`; PDF and HTML links; PowerPoint and ODP slide jumps).
- **Master and layouts**: elements on every slide (logo, footer, slide number), editable slide layouts with placeholders and decorations, also in every export.
- **Fonts**: seven included open-source fonts and your own font files (`.woff2`, `.woff`, `.ttf`, `.otf`), stored with the project and embedded in HTML, image and Slidev exports; served from the app itself, never from a font CDN.
- **Themes**: 13 built-in themes and a theme editor (colours, fonts, own CSS) whose themes can be exported and imported as `.theme.json`.
- **Markdown**: edit the whole project as Slidev Markdown in a VS Code-like source editor (highlighting, markdownlint, Prettier, live preview), insert slides from Markdown (e.g. written by an AI) or edit one slide as Markdown; a hands-on Markdown tutorial teaches the syntax in a few minutes.
- **Present** in full screen or with a presenter view (notes, next slide, timer, slide overview with O), and **rehearse** the talk against planned times per slide; elements can appear and disappear step by step on click (Slidev's `v-click`, `v-click.hide`, ranges), code highlights step through lines, notes follow `[click]` markers, and words get hand-drawn marks (`v-mark`: circle, underline, highlight …) drawn on a click; Magic move slides elements that two slides share from one place, size and colour to the next; pen and laser pointer, an audience window for a second screen, and record the talk as a video with microphone and a camera bubble (stays on the device).
- **Accessibility check** for the presentation: alt text, contrast (WCAG AA), font size, slide titles, reading order, table headers, link texts, with one-click fixes.
- **Offline and installable**: after the first visit everything works without a connection (a service worker keeps the app's files); install it as an app on the home screen or desktop.
- **Phone and tablet** layout, long press for context menus, light/dark mode, interface in German, English, French, Dutch and Spanish, accessible controls (4.5:1 contrast, named controls, reduced motion).

The full behaviour is described in [docs/features.md](docs/features.md).

## Agent skill

Let Claude Code (or another agent that reads skills) write decks for Slidecko: the skill in [skills/slidecko](skills/slidecko/SKILL.md) teaches it the Slidev Markdown that Slidecko reads.

```
/plugin marketplace add JonasTebben/slidecko
/plugin install slidecko@slidecko
```

Other agents: copy `skills/slidecko` into their skills folder.

## Documentation

| Topic | Where |
| --- | --- |
| Every feature in detail, and what each export format gets | [docs/features.md](docs/features.md) |
| Known limitations | [docs/limitations.md](docs/limitations.md) |
| What the app stores in the browser (no cookies, no tracking) | [docs/privacy.md](docs/privacy.md) |
| Hosting your own copy, footer links | [docs/hosting.md](docs/hosting.md) |
| How the app is built, project layout, translation and theme rules | [docs/architecture.md](docs/architecture.md) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Code of conduct | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |
| Rules for AI coding agents | [AGENTS.md](AGENTS.md) |

## License

[Apache License 2.0](LICENSE). Third-party notices are in [NOTICE](NOTICE).
