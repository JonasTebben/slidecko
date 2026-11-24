import { reactive } from 'vue'

// Random picker elements: a click while presenting draws one name, nobody twice until everyone was drawn.
// The draw state is not part of the project: every presentation starts fresh.

// one draw from the names still left (all of them again once the bag is empty); rnd() in [0, 1)
export function draw(names, left, rnd = Math.random) {
  const bag = left?.length ? [...left] : [...names]
  const pick = bag.splice(Math.floor(rnd() * bag.length), 1)[0]
  return { pick, left: bag }
}

// id -> { pick, left, n: number of draws (restarts the pop-in animation) }
export const picks = reactive({})
export function next(el) {
  if (!el.names?.length) return
  const r = draw(el.names, picks[el.id]?.left)
  picks[el.id] = { ...r, n: (picks[el.id]?.n || 0) + 1 }
}
export function reset(id) { delete picks[id] }
