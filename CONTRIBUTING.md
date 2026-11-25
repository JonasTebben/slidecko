# Contributing to Slidecko

Thanks for helping. This guide covers setting up, the rules a change has to follow and how to send it. For how the app is built, read [docs/architecture.md](docs/architecture.md) first; [docs/features.md](docs/features.md) describes what it does.

## Setting up

You need [Bun](https://bun.sh) (the version in `package.json` → `packageManager`). Bun only: do not use npm, yarn or pnpm, and do not commit their lock files.

```bash
git clone https://github.com/JonasTebben/slidecko.git
cd slidecko
bun install
bun run dev       # editor with hot reload at http://localhost:5173
```

## Before you start

- **Bugs**: open an issue with the steps, what you expected and what happened, the browser and device (touch or mouse), and a small sample file if an import or export is involved. Leave out anything private from the sample.
- **Features**: open an issue first for anything bigger than a small fix, so we can agree on the behaviour before you write it. A feature has to fit an app that runs entirely in the browser: no server, no account, no upload of user content.
- Small fixes (typos, translations, an obvious bug) can go straight to a pull request.

## Making a change

Follow the code around you: plain JavaScript (no TypeScript), no semicolons, single quotes, short functions, one-line comments that say *why*.

Every change has to keep these working, and the review checks them:

- **Every format.** Whatever you add (an element, an option, a style) must work in the project file, the HTML presentation, PDF and images, PowerPoint, OpenDocument and Slidev, and come back on import where the format allows. Describe what each format gets in `docs/features.md`.
- **Mouse and touch.** Presenting is used on iPads and phones. Taps, double taps (no `dblclick`), typing and drawing must work with touch as well as with a mouse.
- **Untrusted input.** Anything from files, the clipboard or browser storage passes through `cleanEl` in `src/core/store.js` (limits, allowed values) and HTML through DOMPurify. Never put imported HTML or SVG into the page unchecked.
- **Interface text.** English is the key: wrap every new string in `t()` and add it to every file in `src/locales/` (German, French, Dutch, Spanish). `bun test` fails when a translation is missing.
- **Accessibility.** Buttons get a label (`aria-label` or text), new controls work with the keyboard, and built-in themes and colours stay at WCAG AA contrast.
- **Storage.** If you change what is kept in IndexedDB, localStorage or sessionStorage, update the table "What the app stores" in the README. Keys keep the `slides-builder` prefix.
- **Dependencies.** Avoid new ones; a few lines of code do not justify a package. If one is needed, pin the exact version, load heavy import/export code lazily with `import()`, and add it to `NOTICE` with its licence in the same commit.
- **Documentation.** User-visible changes go into `docs/features.md` (and the README feature list if they are major).

## Testing

```bash
bun test          # unit tests, next to the source as *.test.js
bun run build     # the production build (also compiles the .vue files; bun test does not)
bun run smoke     # the whole app in Chromium: modules, dialogs, every export and its import, presenting with mouse and touch
```

- Add a unit test for new logic: parsing, cleaning, import/export writers, presenting state (`src/<folder>/<name>.test.js`, Bun test globals, no import needed).
- Add a step to `scripts/smoke.js` for a new interaction or dialog, so a later change cannot break it unnoticed.
- Run all three before you open a pull request. `bun run smoke` takes a few minutes; run it whenever you touch imports, exports, files that move or dependencies.
- Exports are checked by opening them in LibreOffice and Google Slides.

## Pull requests

- One topic per pull request, with a description of what changed and why, and how you tested it (browsers, touch device).
- Screenshots or a short recording for visible changes.
- Keep commits focused; the message says what the change does for the user.
- Do not commit personal data, secrets, hosting details or legal pages: this repository contains only the app.
- By contributing you agree that your contribution is licensed under the project's [Apache 2.0 licence](LICENSE).

## Project rules for coding agents

[AGENTS.md](AGENTS.md) holds the same rules in short form for AI coding agents. Keep it in step when a rule here changes.
