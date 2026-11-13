import { createApp } from 'vue'
import 'highlight.js/styles/github.css'
import './slide.css'
import './app.css'
import './longpress.js'
import './scheme.js' // sets light/dark before the first paint
import App from './App.vue'

createApp(App).mount('#app')
