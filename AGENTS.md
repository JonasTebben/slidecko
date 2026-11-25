# AGENTS.md

Slidecko is a presentation editor that runs entirely in the browser (Vue 3 + Vite, plain JavaScript, no TypeScript). The server (`server.js`) only serves `dist/`. Read [docs/architecture.md](docs/architecture.md) for how the parts fit (and the checklist for adding something), [README.md](README.md) for the project layout and [docs/features.md](docs/features.md) for the full behaviour. [CONTRIBUTING.md](CONTRIBUTING.md) has the same rules for people.

## Commands

Bun only (version in `package.json` → `packageManager`); do not use npm/yarn/pnpm.

```bash
bun install
bun run dev      # Vite with hot reload
bun run build    # static files in dist/ (relative paths)
bun test         # all *.test.js next to their source
bun run smoke    # browser check of dev server and build: modules, dialogs, every export and its import (several minutes)
```

Run `bun test` and `bun run build` before you call a change done. Also run `bun run smoke` when you move files, change imports, upgrade dependencies or touch import/export code.

## Conventions

- Match the surrounding code: no semicolons, single quotes, compact functions, one-line comments that explain the why.
- Tests sit next to the source as `src/<folder>/<name>.test.js` (Bun test globals, no import). Add one for new parser, import/export or state logic.
- Dependencies are pinned to exact versions. Do not add one for a few lines of code. Heavy import/export code is loaded lazily with `import()`; keep it that way.
- Coordinates are in logical slide units (`W`/`H` in `src/core/store.js`); views only scale them.
- Sanitize HTML from imports or paste with DOMPurify, through the existing sanitizing in `src/core/store.js`.
- Touch and mouse alike: presenting runs on iPads. A click handler must work for a tap, a double click must not rely on `dblclick` (`second()` in `src/present/timer.js`), focus for typing and audio unlocks happen inside the tap.
- `bun test` does not compile `.vue` files: run `bun run build` too. New interactions get a step in `scripts/smoke.js`.

## Required updates

- **Interface text**: English is the key. Wrap every new string in `t()` and add its entry to every file in `src/locales/` (German, French, Dutch, Spanish); `src/i18n.test.js` fails when one is missing. Tests assert the English text.
- **Storage**: if you change what is kept in IndexedDB, localStorage or sessionStorage, update the "What the app stores" table in the README. The `slides-builder` key prefix stays (existing user data).
- **Themes**: built-in themes must stay WCAG AA; see "Theme readability" in the README.
- **Formats**: anything new (an element, an option, a style) must work in every way a project leaves the app: project file and Save-all ZIP (`cleanEl` in `src/core/store.js` keeps it), HTML presentation, PDF and images, PowerPoint (also "for Google"), OpenDocument and Slidev, with the import reading it back where the format allows (Slidev `data-*`, PowerPoint/ODP as close as the format gets: a picture or text when there is no native equivalent). Say in `docs/features.md` what each format gets, and run `bun run smoke`.
- **Features**: user-visible changes go into `docs/features.md` (and the README feature list if they are major).
- **Licences**: a new dependency goes into `NOTICE` in the same commit, with its licence and "loaded only for …" if it is lazy, plus the packages it bundles into `dist/` under a licence other than MIT.

## Things to leave alone

- The logo is drawn in `public/icon.svg` (`public/icon.png` is its 256 px render). Keep it free of play triangles and red rounded rectangles, so it cannot be mistaken for the YouTube logo.
- Slides keep their theme colours in dark mode; only the app chrome follows the light/dark switch (`src/core/scheme.js`).

## Repository and deployment

This repository is public and contains only the app. Do not commit personal data, legal pages, secrets or hosting details. The hosted site is deployed from a separate private repository, not from here. Commit or push only when asked.
