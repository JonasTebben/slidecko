# AGENTS.md

Slidecko is a presentation editor that runs entirely in the browser (Vue 3 + Vite, plain JavaScript, no TypeScript). The server (`server.js`) only serves `dist/`. Read [README.md](README.md) for the project layout and [docs/features.md](docs/features.md) for the full behaviour.

## Commands

Bun only (version in `package.json` → `packageManager`); do not use npm/yarn/pnpm.

```bash
bun install
bun run dev      # Vite with hot reload
bun run build    # static files in dist/ (relative paths)
bun test         # all *.test.js next to their source
```

Run `bun test` and `bun run build` before you call a change done.

## Conventions

- Match the surrounding code: no semicolons, single quotes, compact functions, one-line comments that explain the why.
- Tests sit next to the source as `src/<name>.test.js` (Bun test globals, no import). Add one for new parser, import/export or state logic.
- Dependencies are pinned to exact versions. Do not add one for a few lines of code. Heavy import/export code is loaded lazily with `import()`; keep it that way.
- Coordinates are in logical slide units (`W`/`H` in `src/store.js`); views only scale them.
- Sanitize HTML from imports or paste with DOMPurify, through the existing sanitizing in `src/store.js`.

## Required updates

- **Interface text**: English is the key. Wrap every new string in `t()` and add the German entry to `src/locales/de.js`. Tests assert the English text.
- **Storage**: if you change what is kept in IndexedDB, localStorage or sessionStorage, update the "What the app stores" table in the README. The `slides-builder` key prefix stays (existing user data).
- **Themes**: built-in themes must stay WCAG AA; see "Theme readability" in the README.
- **Features**: user-visible changes go into `docs/features.md` (and the README feature list if they are major).

## Things to leave alone

- The "JBT" in `public/icon.png` is intended.
- Slides keep their theme colours in dark mode; only the app chrome follows the light/dark switch (`src/scheme.js`).

## Repository and deployment

This repository is public and contains only the app. Do not commit personal data, legal pages, secrets or hosting details. The hosted site is deployed from a separate private repository, not from here. Commit or push only when asked.
