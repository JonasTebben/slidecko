# Contributing to Slidecko

Welcome, and thank you for thinking about helping! Slidecko is a presentation editor that runs entirely in the browser, and it gets better with every bug report, idea, translation and fix. You don't need to know the whole code base to start.

## Ways to help

- **Report a bug**: open an issue (the form asks for what is needed) and tell us what you did, what you expected and what happened, plus your browser and device. A small sample file helps a lot for import and export problems (leave out anything private).
- **Suggest an idea**: open an issue and describe what you want to do with it. We'll talk about how it could work before anyone writes code.
- **Translate**: the interface is in English, German, French, Dutch and Spanish. Better wording or a new language is very welcome (see "Translations" in [docs/architecture.md](docs/architecture.md)).
- **Fix or build something**: small fixes can go straight to a pull request; for bigger changes, open an issue first so your work fits in.

## Get it running

You need [Bun](https://bun.sh).

```bash
git clone https://github.com/JonasTebben/slidecko.git
cd slidecko
bun install
bun run dev        # opens the editor with hot reload
```

Then have a look at [docs/architecture.md](docs/architecture.md): it explains how the app fits together on one page, and has a checklist for adding something.

## Good to know

A few things matter in this project, so you won't be surprised in the review:

- **It works in every format.** Something new should also come out right in PowerPoint, OpenDocument, PDF, the HTML presentation and Slidev. Not sure how? Ask in the issue; we'll figure it out together.
- **Touch counts as much as a mouse.** Many people present from an iPad.
- **Everything stays in the browser.** No server, no account, no upload of anyone's slides.
- **Every text is translatable.** Wrap interface text in `t('…')` and add it to the files in `src/locales/`; the tests tell you if one is missing.
- **Match the code around you.** Plain JavaScript, no semicolons, single quotes, short comments that say *why*.

## Check your change

```bash
bun test          # quick unit tests
bun run build     # the production build
bun run smoke     # the whole app in a browser, takes a few minutes
```

All three also run automatically on every pull request, the unit tests also in three shuffled orders (`bun test --randomize --seed=1`, `2`, `3`): a test must not rely on one that ran before it, so set up stubs such as `globalThis.document` at the top of the file, not inside one test. If a new piece of logic has no test yet, add one next to its file (`name.test.js`).

## Send a pull request

Describe what you changed and why, and how you tried it. A screenshot helps for anything visible. Keep one topic per pull request; it makes reviewing quick.

By contributing you agree that your work is licensed under the project's [Apache 2.0 licence](LICENSE).

Everyone taking part follows our [Code of Conduct](CODE_OF_CONDUCT.md): be kind, be patient, assume good intent.

Questions? Just open an issue. There are no silly questions.
