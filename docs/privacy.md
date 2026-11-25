# What the app stores

The app sets no cookies, has no tracking and uploads nothing. Imports are read and exports created in the browser.

| Where | What | How long |
|---|---|---|
| IndexedDB `slides-builder` | projects (slides, master and layouts, images, uploaded fonts, project files, planned times and the last 5 rehearsals), project list, snapshots (version history: up to 20 per project with the images they use) | until the project or the site data is deleted |
| localStorage `slides-builder:*` | last project (`last`), language (`lang`), light/dark (`scheme`), export format (`export`), keep font sizes (`keep-sizes`), own text styles (`text-presets`), imported themes (`themes`), search options (`find`), folded sidebars (`panels`), last icon set in the icon picker (`icon-set`), tour offered on the start page (`tour`), saved name lists for random draws (`name-lists`), keep drawings while presenting on/off (`keep-ink`), your changed keyboard shortcuts (`keys`), recording choices: source, microphone and camera on/off and device, camera bubble size and place (`recording`) | permanent |
| sessionStorage `slides-builder:session` | the tab's view (selection, folded decks, scroll position), search term, YouTube consent | until the tab is closed |
| sessionStorage `slides-builder:reloaded` | when the tab last reloaded itself because a release replaced the app's files (at most once a minute) | until the tab is closed |

YouTube loads only after a click on "Load YouTube content" (thumbnails from `i.ytimg.com`, the player from `www.youtube-nocookie.com`).

When this changes (`src/core/session.js`, `src/core/store.js`, `src/slide/themes.js`, `src/core/i18n.js`, `src/core/scheme.js`, `src/App.vue`), update this page (and the privacy policy of any public copy).
