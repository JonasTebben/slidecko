import { reactive } from 'vue'

// Notes boxes set not to keep what is typed while presenting: the typed text lives here, for this presentation only
export const liveText = reactive({})
export const resetLiveText = () => { for (const k of Object.keys(liveText)) delete liveText[k] }
// where a box's typing goes when it ends: into the project (undo works), or only into this presentation
export function keepTyped(el, html) {
  if (el.liveTemp) liveText[el.id] = html
  else if (html !== el.html) el.html = html
}
