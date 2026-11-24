import { createApp } from 'vue'
import 'highlight.js/styles/github.css'
import './slide/slide.css'
import './app.css'
import './core/longpress.js'
import './core/scheme.js' // sets light/dark before the first paint
import App from './App.vue'
import { reloadForUpdate, staleChunk } from './core/store.js'

const app = createApp(App)
// a part of the app loaded later (an editor, an export) is gone after a release: reload to the new version
addEventListener('vite:preloadError', e => { if (reloadForUpdate()) e.preventDefault() })
addEventListener('unhandledrejection', e => { if (staleChunk(e.reason) && reloadForUpdate()) e.preventDefault() })
app.config.errorHandler = (e, _, info) => { if (!(staleChunk(e) && reloadForUpdate())) console.error(e, info) }
app.mount('#app')
