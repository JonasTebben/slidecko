import { reactive } from 'vue'

// Random picker elements: a click while presenting draws one name, nobody twice until everyone was drawn
// (with repeat: any name every time). The draw state is not part of the project: every presentation starts fresh.

// one draw from the names still left (all of them again once the bag is empty, or always with repeat); rnd() in [0, 1)
export function draw(names, left, rnd = Math.random, repeat = false) {
  const bag = left?.length && !repeat ? [...left] : [...names]
  const pick = bag.splice(Math.floor(rnd() * bag.length), 1)[0]
  return { pick, left: repeat ? [...names] : bag }
}

// id -> { pick, left, n: number of draws (restarts the pop-in animation) }
export const picks = reactive({})
export function next(el) {
  if (!el.names?.length) return
  const r = draw(el.names, picks[el.id]?.left, Math.random, el.repeat)
  picks[el.id] = { ...r, n: (picks[el.id]?.n || 0) + 1 }
}
export function reset(id) { delete picks[id] }

// Name lists kept in this browser (localStorage), for the random draws of every project: choosing one copies its
// names into the element, so a project stays complete without the list (other browsers, exports)
const LISTS = 'slides-builder:name-lists'
// untrusted (storage): list name -> names, plain strings within the picker's limits, at most 100 lists
export function cleanLists(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
  const out = {}
  for (const [k, v] of Object.entries(o).slice(0, 100)) {
    const name = String(k).trim().slice(0, 100), names = Array.isArray(v) ? v.filter(n => typeof n === 'string' && n.trim()).map(n => n.trim().slice(0, 100)).slice(0, 200) : []
    if (name && names.length) out[name] = names
  }
  return out
}
export const lists = reactive((() => { try { return cleanLists(JSON.parse(localStorage.getItem(LISTS))) } catch { return {} } })())
const keep = () => { try { localStorage.setItem(LISTS, JSON.stringify(lists)) } catch { /* private mode: kept until the tab closes */ } }
export function saveList(name, names) {
  name = name.trim().slice(0, 100)
  if (!name || !names.length) return false
  lists[name] = [...names]
  keep()
  return true
}
export function removeList(name) { delete lists[name]; keep() }
