# What the app stores

The app sets no cookies, has no tracking and uploads nothing. Imports are read and exports created in the browser.

| Where | What | How long |
|---|---|---|
| IndexedDB `slides-builder` | projects (slides, master and layouts, images, video and audio files, uploaded fonts, project files, planned times and the last 5 rehearsals), project list, snapshots (version history: up to 30 per project with the images and media files they use) | until the project or the site data is deleted |
| localStorage `slides-builder:*` | last project (`last`), language (`lang`), light/dark (`scheme`), export format (`export`), keep font sizes (`keep-sizes`), own text styles (`text-presets`), imported themes (`themes`), search options (`find`), folded sidebars (`panels`), last icon set in the icon picker (`icon-set`), tour offered on the start page (`tour`), saved name lists for random draws (`name-lists`), keep drawings while presenting on/off (`keep-ink`), your changed keyboard shortcuts (`keys`), recording choices: source, microphone and camera on/off and device, camera bubble size and place (`recording`) | permanent |
| localStorage `slides-builder:install-hint` | `done` once the start page's "Slidecko as an app" hint was closed or the app was installed | until site data is cleared |
| Cache Storage `slidecko-<version>` | the app's own files (scripts, styles, fonts, about 13 MB; icon sets once used), kept by the service worker so the app starts and works offline; replaced by the next version. Not with the browser's data saver on | until site data is cleared |
| sessionStorage `slides-builder:session` | the tab's view (selection, folded decks, scroll position), search term, YouTube consent | until the tab is closed |
| sessionStorage `slides-builder:reloaded` | when the tab last reloaded itself because a release replaced the app's files (at most once a minute) | until the tab is closed |

YouTube loads only after a click on "Load YouTube content" (thumbnails from `i.ytimg.com`, the player from `www.youtube-nocookie.com`). A web page placed on a slide loads only while presenting (or in the HTML presentation) after a tap on it, directly from its site, without a referrer and in a sandboxed frame; until then nothing is requested.

The service worker (`sw.template.js`) caches only the app's own files and never touches requests to other sites.

When this changes (`src/core/session.js`, `src/core/install.js`, `src/core/offline.js`, `sw.template.js`, `src/core/keys.js`, `src/present/picker.js`, `src/editor/tour.js`, `src/components/Recorder.vue`, `src/components/IconPicker.vue`, `src/components/Home.vue`, `src/core/store.js`, `src/slide/themes.js`, `src/core/i18n.js`, `src/core/scheme.js`, `src/App.vue`), update this page (and the privacy policy of any public copy).
