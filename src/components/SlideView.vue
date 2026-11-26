<script setup>
import { online } from '../core/offline.js'
import { gapSnaps, nearestGap } from '../editor/spacing.js'
import { computed, nextTick, reactive, ref, watch, onBeforeUnmount, onMounted, onUpdated } from 'vue'
import { W, H, deck, ui, clean, withGroups, clickSteps, revealed, stepOf, untilOf, markItems, codeStage, codeStages, underlay } from '../core/store.js'
import { themeStyle, fontStack, codeDark, shadowCss, themeOf } from '../slide/themes.js'
import { chartSvg } from '../slide/chart.js'
import { hlLines, codeOpts } from '../slide/hl.js'
import { pasteLook, startCrop, endCrop, cropFull, cropRatioValue, applyCrop } from '../core/actions.js'
import { shapeSvg, fillFields } from '../export/toSlidev.js'
import { slideHref, tocEntries, tocHtml } from '../slide/links.js'
import TableEl from './TableEl.vue'
import { pasteHtml } from '../editor/paste.js'
import { toggleList, undoList, typed, indent, autoList } from '../editor/lists.js'
import { t } from '../core/i18n.js'
import { longPressFired } from '../core/longpress.js'
import { face, progress, warning, done, running, toggle, reset, autostart, second } from '../present/timer.js'
import * as picker from '../present/picker.js'
import { liveText, keepTyped } from '../present/board.js'
import { diagramSrc } from '../slide/diagram.js'
import { withMath, formulaHtml } from '../slide/math.js'
import { LETTERS, quiz, picked, pick, toggleSolution } from '../present/quiz.js'
import { measureMark } from '../slide/marks.js'
import { iconSvg, picker as iconPicker } from '../slide/icons.js'
import { isRun, isTs, autorun, live as runs, runLive, outLine } from '../present/run.js'

// One component for every rendering of a slide (editor, thumbnails, presenter, print, PPTX).
// scale converts pointer movement back into slide units.
const props = defineProps({ slide: Object, index: Number, editable: Boolean, scale: { type: Number, default: 1 }, live: Boolean, theme: String, step: Number }) // theme: preview in another theme than the deck's; step: click steps revealed (unset: all)
const steps = computed(() => clickSteps(props.slide))
// list items one by one: marked with their steps outside the editor (an edit would save the marks)
const items = (el, html) => {
  const from = el.clickItems && !props.editable && !el.board && stepOf(props.slide, el, steps.value)
  return from ? markItems(html, from, props.step == null ? Infinity : props.step - from + 1) : html
}
// code line steps: the stage shown (editor: the first, which line selection edits; static exports: the last);
// outside the editor each line lists its stages and the block the steps they start at, for the HTML presentation
const stageOf = el => (props.editable ? 0 : codeStage(props.slide, el, props.step ?? Infinity, steps.value))
const stageStarts = el => {
  const n = codeStages(el), f = stepOf(props.slide, el, steps.value)
  return !props.editable && n > 1 ? Array.from({ length: n - 1 }, (_, s) => f + s + (el.click ? 1 : 0)).join(' ') : null
}
const lineStages = (el, i) => (props.editable || codeStages(el) < 2 ? null : Array.from({ length: codeStages(el) }, (_, s) => s).filter(s => { const m = codeOpts(el.meta, s).marked; return !m || m.has(i + 1) }).join(' '))
const badge = el => (el.click && el.clickUntil ? `${el.click}–${el.clickUntil}` : el.click || `–${el.clickUntil}`)
const badgeTitle = el => (el.click && el.clickUntil ? t('Visible from click {0} to {1}', el.click, el.clickUntil) : el.click ? t('Appears on click {0}', el.click) : t('Disappears on click {0}', el.clickUntil))
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
// a short or narrow box drops its middle handles, which would cover the corners (big touch handles on a phone)
const HSIZE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 18 : 10
const handlesOf = el => HANDLES.filter(h => !((h === 'e' || h === 'w') && el.h * props.scale < HSIZE * 3.5) && !((h === 'n' || h === 's') && el.w * props.scale < HSIZE * 3.5))
const root = ref()
const selected = el => props.editable && ui.sel.includes(el.id)
const members = el => withGroups(props.slide.elements, [el.id]) // el and its group, el last
// master and layout elements behind the slide's own: drawn like them, but not selectable here
const under = computed(() => underlay(props.slide))
const all = computed(() => [...under.value, ...props.slide.elements])
const decor = el => under.value.includes(el)
// slide number, count and project title in field spans (shortcut: the count includes hidden slides)
const fields = html => fillFields(html, { page: (props.index ?? 0) + 1, total: deck.slides.length, title: deck.title })

// images inside text are stored with their Slidev path (data-src) and shown from the assets
// (a quote in a crafted asset would end the attribute: escaped)
const resolveImgs = html => (html?.includes('data-asset') ? html.replace(/<img\b[^>]*>/g, t => {
  const id = t.match(/data-asset="([^"]+)"/)?.[1]
  return id && deck.assets[id] ? t.replace(/\ssrc="[^"]*"/, ` src="${deck.assets[id].replace(/"/g, '%22')}"`) : t
}) : html)
const unresolveImgs = html => html.replace(/<img\b[^>]*>/g, t => {
  const path = t.match(/data-src="([^"]+)"/)?.[1]
  return path ? t.replace(/\ssrc="data:[^"]*"/, ` src="${path}"`) : t
})

// --- moving, resizing, snapping ---
// Edges and centres stick to the slide's edges, margins and centre and to the other elements;
// magenta guides show what they stick to. Alt switches snapping off.
const SNAP = 6
const guides = ref({ x: null, y: null, gaps: [] })
const measure = ref(null) // the box being moved or resized: its position or size shown next to it
const marquee = ref(null)
function nearest(edges, lines) {
  let best = { d: 0, line: null, dist: SNAP / props.scale }
  for (const e of edges) for (const l of lines) if (Math.abs(l - e) < best.dist) best = { d: l - e, line: l, dist: Math.abs(l - e) }
  return best
}
function track(e, move, done, cancel) {
  // a touch the browser takes over (scrolling, a system gesture) ends with pointercancel instead of pointerup
  // only the pointer that started it moves the box; a second finger (a pinch zoom) stops the gesture and calls cancel
  const mv = ev => ev.pointerId === e.pointerId && move(ev)
  const stop = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); removeEventListener('pointerdown', second, true); guides.value = { x: null, y: null, gaps: [] }; measure.value = null }
  const up = ev => { if (ev.pointerId !== e.pointerId) return; stop(); done?.(ev) }
  const second = ev => { if (ev.pointerId === e.pointerId) return; stop(); cancel ? cancel() : done?.({ type: 'pointercancel' }) }
  addEventListener('pointermove', mv)
  addEventListener('pointerup', up)
  addEventListener('pointercancel', up)
  addEventListener('pointerdown', second, true)
}

function down(e, el) {
  if (!props.editable || e.button || !e.isPrimary || ui.editing === el.id) return
  if (ui.crop === el.id) return panCrop(e, el)
  if (ui.crop) endCrop()
  if (ui.editing) document.activeElement?.blur()
  if (ui.painting) { pasteLook([el]); ui.painting = false; ui.sel = [el.id]; return }
  if (e.shiftKey || e.metaKey || e.ctrlKey) {
    const m = members(el)
    ui.sel = selected(el) ? ui.sel.filter(id => !m.includes(id)) : [...new Set([...ui.sel, ...m])]
    return
  }
  // touch: tapping the selected box again starts typing (a double tap is easy to miss on a small slide)
  if (e.pointerType === 'touch' && ui.sel.length === 1 && selected(el) && el.type !== 'image') {
    const at = { currentTarget: e.currentTarget, target: e.target, clientX: e.clientX, clientY: e.clientY }
    const tap = ev => {
      if (ev.pointerId !== e.pointerId) return
      removeEventListener('pointerup', tap); removeEventListener('pointercancel', tap)
      if (ev.type === 'pointercancel' || longPressFired() || Math.hypot(ev.clientX - at.clientX, ev.clientY - at.clientY) >= 8) return
      // focus right in the gesture, or iOS keeps the keyboard closed; edit() then places the caret
      const c = el.type === 'table' ? at.target.closest?.('[data-r]') : at.currentTarget.querySelector('.content')
      if (c) { c.contentEditable = 'true'; c.focus() }
      edit(at, el)
    }
    addEventListener('pointerup', tap)
    addEventListener('pointercancel', tap)
  }
  const m = members(el)
  if (!selected(el)) ui.sel = m
  else ui.sel = [...ui.sel.filter(id => !m.includes(id)), ...m] // primary = the one being dragged
  drag(e, el)
}

function drag(e, el, dir = '') {
  if (el.locked) return e.preventDefault() // locked: selectable, but stays where it is (and no text selection while dragging)
  const group = dir ? [el] : props.slide.elements.filter(o => ui.sel.includes(o.id) && !o.locked)
  const start = new Map(group.map(o => [o, { x: o.x, y: o.y, w: o.w, h: o.h }]))
  const o = start.get(el)
  const xs = [0, 56, W / 2, W - 56, W], ys = [0, 40, H / 2, H - 40, H]
  for (const other of props.slide.elements) {
    if (start.has(other)) continue
    xs.push(other.x, other.x + other.w / 2, other.x + other.w)
    ys.push(other.y, other.y + other.h / 2, other.y + other.h)
  }
  const others = props.slide.elements.filter(x => !start.has(x))
  const gx = dir ? [] : gapSnaps(others, o.w, 'x'), gy = dir ? [] : gapSnaps(others, o.h, 'y')
  const ratio = o.w / o.h
  let held = e.pointerType === 'touch' // a finger wobbles: a tap must not move the box (nor add an undo step)
  track(e, ev => {
    if (held && (longPressFired() || Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) <= 6)) return
    held = false
    const dx = (ev.clientX - e.clientX) / props.scale, dy = (ev.clientY - e.clientY) / props.scale
    let l = o.x, r = o.x + o.w, t = o.y, b = o.y + o.h
    const Wd = !dir || dir.includes('w'), Ed = !dir || dir.includes('e'), Nd = !dir || dir.includes('n'), Sd = !dir || dir.includes('s')
    if (Wd) l += dx
    if (Ed) r += dx
    if (Nd) t += dy
    if (Sd) b += dy
    const sx = ev.altKey ? {} : nearest(!dir ? [l, (l + r) / 2, r] : Wd ? [l] : Ed ? [r] : [], xs)
    const sy = ev.altKey ? {} : nearest(!dir ? [t, (t + b) / 2, b] : Nd ? [t] : Sd ? [b] : [], ys)
    // equal spacing wins over an edge only when it is closer
    const ex = ev.altKey ? null : nearestGap(gx, l, [t, b], sx.dist), ey = ev.altKey ? null : nearestGap(gy, t, [l, r], sy.dist)
    if (ex) Object.assign(sx, { d: ex.d, line: null })
    if (ey) Object.assign(sy, { d: ey.d, line: null })
    if (Wd) l += sx.d || 0
    if (Ed) r += sx.d || 0
    if (Nd) t += sy.d || 0
    if (Sd) b += sy.d || 0
    // corners keep the aspect ratio of images (or of anything with Shift)
    if (dir.length === 2 && ['image', 'video', 'icon'].includes(el.type) !== ev.shiftKey) {
      const w = r - l
      const h = w / ratio
      if (dir.includes('n')) t = b - h
      else b = t + h
    }
    // a cropped picture is drawn stretched to its box: its sides scale it too (centred), Shift stretches
    else if (dir.length === 1 && el.type === 'image' && el.crop && !ev.shiftKey) {
      if (Ed || Wd) { const h = (r - l) / ratio, cy = o.y + o.h / 2; t = cy - h / 2; b = cy + h / 2 }
      else { const w = (b - t) * ratio, cx = o.x + o.w / 2; l = cx - w / 2; r = cx + w / 2 }
    }
    if (r - l < 8) Wd ? (l = r - 8) : (r = l + 8)
    if (b - t < 8) Nd ? (t = b - 8) : (b = t + 8)
    if (dir) Object.assign(el, { x: Math.round(l), y: Math.round(t), w: Math.round(r - l), h: Math.round(b - t) })
    else for (const [g, s] of start) Object.assign(g, { x: Math.round(s.x + l - o.x), y: Math.round(s.y + t - o.y) })
    const mid = (c, a, z) => (Math.max(c[0], a) + Math.min(c[1], z)) / 2 // the gap marks run through the shared part of the row
    guides.value = { x: sx.line ?? null, y: sy.line ?? null, gaps: [
      ...(ex ? ex.gaps.map(([a, z]) => ({ x: a, y: mid(ex.cross, t + (sy.d || 0), b + (sy.d || 0)), w: z - a, h: 0, n: Math.round(z - a) })) : []),
      ...(ey ? ey.gaps.map(([a, z]) => ({ x: mid(ey.cross, l + (sx.d || 0), r + (sx.d || 0)), y: a, w: 0, h: z - a, n: Math.round(z - a) })) : [])] }
    measure.value = { x: Math.round(l), y: Math.round(t), w: Math.round(r - l), h: Math.round(b - t), size: !!dir }
  }, null, () => { for (const [g, p] of start) Object.assign(g, p) }) // back where it started: the same state, so no undo step
}

// --- image crop mode: the handles move the visible box inside the picture, dragging moves the picture ---
const clamp = (v, a, b) => Math.min(Math.max(v, a), b)
function cropDrag(e, el, dir) {
  const F = cropFull(el), o = { l: el.x, t: el.y, r: el.x + el.w, b: el.y + el.h }
  const fixed = cropRatioValue(el)
  track(e, ev => {
    const dx = (ev.clientX - e.clientX) / props.scale, dy = (ev.clientY - e.clientY) / props.scale
    let { l, t, r, b } = o
    if (dir.includes('w')) l = clamp(l + dx, F.x, r - 16)
    if (dir.includes('e')) r = clamp(r + dx, l + 16, F.x + F.w)
    if (dir.includes('n')) t = clamp(t + dy, F.y, b - 16)
    if (dir.includes('s')) b = clamp(b + dy, t + 16, F.y + F.h)
    // a fixed ratio (or Shift on a corner): the dragged side leads, the other one follows
    const k = fixed || (ev.shiftKey && dir.length === 2 ? (o.r - o.l) / (o.b - o.t) : 0)
    if (k) {
      if (dir === 'n' || dir === 's') { const w = (b - t) * k, cx = (o.l + o.r) / 2; l = cx - w / 2; r = cx + w / 2 }
      else {
        const h = (r - l) / k
        if (dir.includes('n')) t = b - h
        else if (dir.includes('s')) b = t + h
        else { const cy = (o.t + o.b) / 2; t = cy - h / 2; b = cy + h / 2 }
      }
      if (l < F.x - 0.5 || r > F.x + F.w + 0.5 || t < F.y - 0.5 || b > F.y + F.h + 0.5) return // would leave the picture: the frame stops
    }
    applyCrop(el, F, { x: l, y: t, w: r - l, h: b - t })
  })
}
function panCrop(e, el) {
  const F = cropFull(el)
  track(e, ev => {
    const x = clamp(F.x + (ev.clientX - e.clientX) / props.scale, el.x + el.w - F.w, el.x)
    const y = clamp(F.y + (ev.clientY - e.clientY) / props.scale, el.y + el.h - F.h, el.y)
    el.crop = { x: (el.x - x) / F.w, y: (el.y - y) / F.h, w: el.w / F.w, h: el.h / F.h }
  })
}
// text in a shape shrinks until it fits (PowerPoint's "shrink text on overflow"); only the rendering
// changes, so every view and export that draws the slide gets the same size, and a bigger shape grows it back
const MIN_SHAPE_TEXT = 6
function shrinkShapeText(wrap) {
  const c = wrap?.firstElementChild
  if (!c || !wrap.isConnected) return
  c.style.fontSize = ''
  if (!c.textContent.trim()) return
  const ws = getComputedStyle(wrap), avail = wrap.clientHeight - parseFloat(ws.paddingTop) - parseFloat(ws.paddingBottom)
  let size = parseFloat(getComputedStyle(c).fontSize)
  for (let i = 0; i < 12 && c.offsetHeight > avail + 0.5 && size > MIN_SHAPE_TEXT; i++) {
    size = Math.max(MIN_SHAPE_TEXT, size * Math.min(0.95, Math.max(0.5, Math.sqrt(avail / c.offsetHeight)))) // area shrinks with the square
    c.style.fontSize = size + 'px'
  }
}
const shapeText = n => n && nextTick(() => shrinkShapeText(n))

// the picture inside a cropped box: scaled up and shifted, clip-path cuts it to the box (handles stay visible)
const cropVars = el => {
  const c = el.crop
  const p = v => Math.round(v * 1e4) / 100 + '%'
  return c ? {
    '--crop-l': p(-c.x / c.w), '--crop-t': p(-c.y / c.h), '--crop-w': p(1 / c.w), '--crop-h': p(1 / c.h),
    '--crop-clip': `inset(${p(c.y)} ${p(1 - c.x - c.w)} ${p(1 - c.y - c.h)} ${p(c.x)}${el.radius ? ` round ${el.radius}px` : ''})`,
  } : null
}
const cropEl = () => props.editable && ui.crop && props.slide.elements.find(o => o.id === ui.crop)

// rubber-band selection on the empty slide
// touch: nothing changes until the finger moves (marquee) or lifts (tap), so scrolling the page keeps the selection
function backgroundDown(e) {
  if (!props.editable || e.button || !e.isPrimary) return
  const touch = e.pointerType === 'touch'
  const leave = () => { if (ui.crop) endCrop(); if (ui.editing) document.activeElement?.blur() }
  const box = root.value.getBoundingClientRect()
  const p = ev => ({ x: (ev.clientX - box.left) / props.scale, y: (ev.clientY - box.top) / props.scale })
  const a = p(e)
  const additive = e.shiftKey || e.metaKey
  const prev = [...ui.sel]
  const before = additive ? prev : []
  let still = touch
  if (!touch) { leave(); ui.sel = before }
  track(e, ev => {
    if (still) {
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 8) return
      still = false
      leave()
    }
    const b = p(ev)
    const m = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
    marquee.value = m
    const hit = props.slide.elements.filter(o => o.x < m.x + m.w && o.x + o.w > m.x && o.y < m.y + m.h && o.y + o.h > m.y).map(o => o.id)
    ui.sel = [...new Set([...before, ...withGroups(props.slide.elements, hit)])]
  }, ev => {
    marquee.value = null
    if (!touch) return
    if (ev.type === 'pointercancel') ui.sel = prev // the page scrolled after all
    else if (still) { leave(); ui.sel = before }
  })
}

// --- editing in place ---
async function edit(e, el) {
  if (props.editable && el.type === 'image') return startCrop(el)
  if (props.editable && el.type === 'icon' && !decor(el)) return Object.assign(iconPicker, { open: true, target: el.id }) // another icon
  if (!props.editable || ['image', 'video', 'timer', 'quiz', 'picker', 'chart', 'diagram', 'math'].includes(el.type) || (el.type === 'shape' && el.shape === 'line') || ui.editing === el.id) return
  const box = e.currentTarget, cell = e.target.closest?.('[data-r]')
  ui.sel = [el.id]
  ui.editing = el.id
  await nextTick()
  const target = cell ? box.querySelector(`[data-r="${cell.dataset.r}"][data-c="${cell.dataset.c}"]`) : box.querySelector('[contenteditable=true], textarea')
  target?.focus()
  if (el.type === 'text' || cell) caretAt(e, target)
}
// caret where the user clicked, not at the start
function caretAt(e, target) {
  let range = document.caretRangeFromPoint?.(e.clientX, e.clientY)
  const pos = !range && document.caretPositionFromPoint?.(e.clientX, e.clientY)
  if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset) }
  if (range && target?.contains(range.startContainer)) { getSelection().removeAllRanges(); getSelection().addRange(range) }
}
defineExpose({ edit })
// notes box while presenting: a click types into it; saved like an edit in the editor (commit)
const liveEdit = ref(null)
// $…$ rendered, except in the box being typed into: there the TeX source is edited
const mathed = (el, html) => ((props.editable && ui.editing === el.id) || liveEdit.value === el.id ? html : withMath(html))
function editLive(e, el) {
  const target = e.currentTarget
  // editable and focused right in the tap, or iOS keeps the keyboard closed
  target.contentEditable = 'true'
  target.focus()
  liveEdit.value = el.id
  caretAt(e, target)
}
// el.html is only written when editing ends: re-rendering v-html while typing would reset the caret
function commit(e, el) {
  const html = clean(unresolveImgs(e.target.innerHTML))
  if (liveEdit.value === el.id) keepTyped(el, html)
  else if (html !== el.html) el.html = html
  if (ui.editing === el.id) ui.editing = null
  if (liveEdit.value === el.id) { liveEdit.value = null; root.value?.closest('[tabindex]')?.focus() } // back to the slide keys
}
// a slide change or the end of the presentation removes the box without a blur (iPad: a tap on a button does not take the focus)
onBeforeUnmount(() => {
  const el = liveEdit.value && props.slide.elements.find(e => e.id === liveEdit.value), n = el && root.value?.querySelector('.el.board > .content[contenteditable=true]')
  if (n) keepTyped(el, clean(unresolveImgs(n.innerHTML)))
})
function textKey(e) {
  // ⌘⇧7 numbering, ⌘⇧8 bullets, as in Google Slides and Docs (by key position: ⇧7 is "/" on German keyboards)
  const mod = e.metaKey || e.ctrlKey
  if (mod && e.shiftKey && (e.code === 'Digit7' || e.code === 'Digit8')) { e.preventDefault(); return toggleList(e.currentTarget, e.code === 'Digit7' ? 'ol' : 'ul') }
  if (e.key === 'Tab' && !mod && !e.altKey && indent(e.currentTarget, e.shiftKey)) return e.preventDefault()
  // a list change is undone by us, typing by the browser
  if (mod && (e.code === 'KeyZ' || (e.code === 'KeyY' && !e.shiftKey)) && undoList(e.currentTarget, e.shiftKey || e.code === 'KeyY')) e.preventDefault()
  if (e.key === 'Escape') { e.preventDefault(); e.target.blur() }
}
const insert = text => document.execCommand('insertText', false, text)
// pasting into a text box keeps the formatting (bold, colours, links, paragraphs, lists); plain text stays plain
function pasteText(e) {
  const html = e.clipboardData.getData('text/html')
  let rich = html && pasteHtml(html)
  if (!rich) return insert(e.clipboardData.getData('text/plain'))
  const box = e.currentTarget
  // text pasted into a run with its own font (imported decks) takes that font, size and colour, like PowerPoint's
  // "use destination theme"; bold, italics and colours of the pasted text stay. Pasted paragraphs and list items
  // also take the style (spacing, line height, alignment) of the paragraph or item at the caret.
  // the text before the caret (a caret between elements, e.g. after End, points at the element: use its last text)
  const sel = getSelection()
  let at = sel.anchorNode
  if (at?.nodeType === 1 && sel.anchorOffset > 0) { at = at.childNodes[sel.anchorOffset - 1]; while (at?.lastChild) at = at.lastChild }
  const el = at?.nodeType === 1 ? at : at?.parentElement
  const run = el?.closest('span[style*="font-family"]'), block = el?.closest('p, li')
  if (run && box.contains(run)) {
    // as shown: the size often comes from the paragraph, not the run
    const cs = getComputedStyle(run), keep = ['font-family', 'font-size', 'letter-spacing', 'color'].map(k => `${k}:${cs.getPropertyValue(k)}`).join(';')
    const t = document.createElement('template')
    t.innerHTML = rich
    const wrap = n => { const s = document.createElement('span'); s.setAttribute('style', keep); s.append(...[...n.childNodes].filter(c => !/^(UL|OL)$/.test(c.nodeName))); n.prepend(s) } // a nested list stays outside
    const blocks = t.content.querySelectorAll('p, li')
    if (!blocks.length) wrap(t.content)
    // list items: the format (indent, bullet, size) of an item of the same level and kind (ul/ol) in the box – the
    // item at the caret first –, else of any item (without its bullet type); without one, the marker takes the text's
    // font. Imported lists are flat, their levels are indents: pasted nested lists are flattened the same way.
    const indent = li => parseFloat(li.style.marginLeft) || 0
    const items = kind => [...box.querySelectorAll(kind ? `${kind} > li[style]` : 'li[style]')]
    const item = (kind, depth) => {
      const all = items(kind).length ? items(kind) : items()
      const lv = [...new Set(all.map(indent))].sort((x, y) => x - y), want = lv[Math.min(depth, lv.length - 1)]
      return (depth === 0 && block?.tagName === 'LI' && block.parentElement?.tagName === kind ? block : null) || all.find(li => indent(li) === want)
    }
    const depthOf = li => { let d = 0; for (let n = li.parentElement; n; n = n.parentElement) if (n.tagName === 'LI') d++; return d }
    const flat = items().some(li => li.style.marginLeft)
    const depth = new Map([...t.content.querySelectorAll('li')].map(li => [li, depthOf(li)]))
    if (flat) for (const list of [...t.content.children].filter(c => /^(UL|OL)$/.test(c.tagName))) {
      const all = [...list.querySelectorAll('li')]
      for (const li of all) for (const sub of [...li.children].filter(c => /^(UL|OL)$/.test(c.tagName))) sub.remove()
      list.append(...all)
    }
    for (const b of blocks) {
      wrap(b)
      const kind = b.parentElement?.tagName, ref = b.tagName === 'LI' ? item(kind, depth.get(b) || 0) : block?.tagName === 'P' ? block : null
      if (ref && box.contains(ref) && ref.getAttribute('style')) {
        b.setAttribute('style', ref.parentElement?.tagName === kind || b.tagName === 'P' ? ref.getAttribute('style') : ref.getAttribute('style').replace(/list-style-type:[^;]*;?/g, ''))
        if (b.tagName === 'LI' && ref.parentElement?.getAttribute('style')) b.parentElement.setAttribute('style', ref.parentElement.getAttribute('style'))
      } else if (b.tagName === 'LI') b.setAttribute('style', keep)
    }
    rich = t.innerHTML
  }
  // Chrome pins styles it computed onto the inline elements it inserts; runs copied from the box (they carry a font) keep their size
  const before = new Set(box.querySelectorAll('[style]'))
  document.execCommand('insertHTML', false, rich)
  for (const n of box.querySelectorAll('[style]')) {
    if (before.has(n) || !/^(SPAN|STRONG|B|EM|I|U|S|A)$/.test(n.tagName)) continue
    n.style.whiteSpace = n.style.textAlign = ''
    if (!n.style.fontFamily) n.style.fontSize = ''
    if (!n.getAttribute('style')) n.removeAttribute('style')
  }
}
function codeKey(e, el) {
  if (e.key === 'Tab') { e.preventDefault(); insert('  ') }
  if (e.key === 'Escape') { e.preventDefault(); e.target.blur() }
  void el
}
// text boxes grow with their content (bigger style or font, typing), so the frame and handles
// always enclose the text; only in the editor (and in a notes box typed into while presenting), and never shrink what the user sized larger
const boxes = new Map()
const ro = new ResizeObserver(entries => {
  for (const { target } of entries) {
    const el = boxes.get(target)
    // only while the user types in it: a theme/typo change must never resize boxes for good
    if (el && (ui.editing === el.id || liveEdit.value === el.id) && target.offsetHeight > el.h + 1) el.h = Math.ceil(target.offsetHeight)
  }
})
function fit(node, el) {
  if (!(props.editable || (props.live && el.board)) || !node || boxes.get(node) === el) return
  boxes.set(node, el)
  ro.observe(node)
}
onBeforeUnmount(() => ro.disconnect())
// code block background: own colour with opacity and corners; text and syntax colours follow its brightness
// a fill with its opacity (fillAlpha in %, undefined = opaque)
const fillCss = el => (el.fill && el.fillAlpha != null ? `color-mix(in srgb, ${el.fill} ${el.fillAlpha}%, transparent)` : el.fill || null)
// a line number padded to the widest one, as text (so exports keep it)
const lineNo = (el, i, s) => String(s + i).padStart(String(s + el.code.split('\n').length - 1).length) + '  '
const codeDarkOf = el => codeDark(el, props.theme || deck.theme)
const codeVars = el => ({
  '--code-bg': el.fill || null, '--code-alpha': el.fillAlpha != null ? el.fillAlpha + '%' : null, '--code-radius': el.radius != null ? el.radius + 'px' : null,
  // an own background brings its own readable text colour
  '--code-fg': el.fill ? (codeDarkOf(el) ? '#e6edf3' : '#1f2328') : null,
})
// code blocks: a theme or code size with bigger type would cut lines off — grow the box instead
async function fitCode() {
  if (!props.editable) return
  await nextTick()
  for (const el of props.slide.elements) {
    if (el.type !== 'code') continue
    const pre = root.value?.querySelector(`[data-el="${el.id}"] pre.code`)
    if (pre && pre.scrollHeight > pre.clientHeight + 1) el.h += pre.scrollHeight - pre.clientHeight
  }
}
// only on the user's own code edits (text, size, width, the runnable output panel), never on theme/typo changes
watch(() => props.slide.elements.map(e => e.type === 'code' && [e.code, e.fontSize, e.w, e.meta, e.outPos, e.outH]), fitCode, { deep: true })
// text boxes: a fill adds padding around the text — grow the box so the coloured area stays inside the frame
// (the user's own change only: compares with the previous state, so loading or switching slides never resizes)
watch(() => props.slide.elements.map(e => e.type === 'text' && (e.fill || e.stroke) ? 'box' + (e.stroke ? e.strokeWidth : 0) : ''), async (now, before) => {
  if (!props.editable || now.length !== before?.length) return
  await nextTick()
  props.slide.elements.forEach((el, i) => {
    if (!now[i] || now[i] === before[i]) return // a new fill/border or a thicker border
    const c = root.value?.querySelector(`[data-el="${el.id}"] > .content`)
    if (c && c.offsetHeight > el.h + 1) el.h = Math.ceil(c.offsetHeight)
  })
})
// background picture of the slide (over the theme's colour), darkened by dim % so text on it stays readable
const bgStyle = computed(() => {
  const b = props.slide.bg, d = b && deck.assets[b.asset], k = (b?.dim || 0) / 100
  return d ? { backgroundImage: `${k ? `linear-gradient(rgba(0,0,0,${k}), rgba(0,0,0,${k})), ` : ''}url("${d.replace(/"/g, '%22')}")`, backgroundSize: b.fit || 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundBlendMode: 'normal' } : null
})
// a click target outside the editor: only while the slide it names exists
const linked = el => !props.editable && el.to && deck.slides.some(s => s.id === el.to)
// v-mark: hand-drawn marks over spans of text, measured where the browser laid the text out (so they follow
// reflow); recomputed after every render, while typing, after a mark change ("marks" event) and when fonts load
const marks = ref({})
function layoutMarks() {
  const r = root.value, out = {}
  if (!r?.isConnected) return
  const k = r.getBoundingClientRect().width / W || 1
  for (const n of r.querySelectorAll('[data-el]')) {
    const spans = n.querySelectorAll('[data-mark]')
    if (!spans.length) continue
    const b = n.getBoundingClientRect(), list = [...spans].map((s, i) => measureMark(s, i, b, k)).filter(Boolean)
    if (list.length) out[n.dataset.el] = list
  }
  if (JSON.stringify(out) !== JSON.stringify(marks.value)) marks.value = out
}
// presenting: timers set to start by themselves do so once they are visible (their click step reached)
watch(() => props.live && props.step, () => {
  if (props.live) autostart(props.slide.elements.filter(e => e.type === 'timer' && (e.click ? stepOf(props.slide, e, steps.value) : 0) <= (props.step ?? Infinity)))
}, { immediate: true })
onMounted(() => { layoutMarks(); document.fonts?.addEventListener('loadingdone', layoutMarks); document.fonts?.ready.then(layoutMarks) })
onUpdated(layoutMarks)
onBeforeUnmount(() => document.fonts?.removeEventListener('loadingdone', layoutMarks))
const markShown = m => props.step == null || !m.at || revealed({ click: m.at }, steps.value, props.step)
const ytThumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
// runnable code while presenting: a click on the code edits it (the deck keeps its code until "Keep changes"), ⌘/Ctrl+Enter runs
const runEdit = ref(null)
const webOn = reactive({}) // web pages loaded while presenting (by a tap)
const hostOf = u => { try { return new URL(u).host } catch { return u } }
const shownTab = reactive({}) // the tab each code group shows while presenting
const tabOf = el => (props.live && shownTab[el.id] <= (el.tabs?.length || 0) && shownTab[el.id]) || 0
const runOf = el => (runs[el.id] ??= { code: el.code, out: el.output || [] })
const runShown = el => (props.live && runs[el.id]) || { code: el.code, out: el.output || [] }
const run = el => { runOf(el); runLive(el, t('Stopped after 3 seconds (endless loop?)')) }
async function editRun(el) {
  runOf(el)
  runEdit.value = el.id
  await nextTick()
  root.value?.querySelector(`[data-el="${el.id}"] textarea`)?.focus()
}
function runKey(e, el) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(el) }
  if (e.key === 'Tab') { e.preventDefault(); insert('  ') }
  if (e.key === 'Escape') { e.preventDefault(); e.target.blur() }
}
const endRunEdit = () => { runEdit.value = null; root.value?.closest('[tabindex]')?.focus() } // back to the slide keys
const keepRun = el => { const s = runs[el.id]; el.code = s.code; el.output = s.out.length ? s.out.map(l => ({ ...l })) : undefined; s.out = el.output || [] }
const resetRun = el => { runs[el.id] = { code: el.code, out: el.output || [] } }
// Slidev's autorun (on unless {autorun:false}): runs when the slide is shown while presenting
if (props.live) for (const el of props.slide.elements) if (el.type === 'code' && isRun(el.meta) && autorun(el.meta) && !runs[el.id]) run(el)
</script>

<template>
  <div ref="root" class="slide" :data-steps="steps.length || null" :class="[`theme-${theme || deck.theme}`, `layout-${slide.layout}`, { painting: editable && ui.painting }]" :style="[themeStyle(theme || deck.theme), bgStyle]" @pointerdown.self="backgroundDown" @marks="layoutMarks">
    <div
      v-for="el in all" :key="(decor(el) ? 'u' : '') + el.id" :data-el="el.id"
      :data-click="(el.click && stepOf(slide, el, steps)) || null" :data-until="untilOf(el, steps) || null" :data-unshown="(step != null && !revealed(el, steps, step)) || null"
      class="el" :class="[el.type, { run: el.type === 'code' && isRun(el.meta), tabbed: el.type === 'code' && el.tabs?.length, 'out-right': el.outPos === 'right', cropped: el.type === 'image' && el.crop, cropping: editable && ui.crop === el.id, title: el.title, colored: el.color, filled: el.fill || el.stroke, locked: editable && el.locked, selected: selected(el), decor: editable && decor(el), placeholder: editable && el.placeholder, editing: editable && ui.editing === el.id, board: el.board }]"
      :style="{ left: el.x + 'px', top: el.y + 'px', width: el.w + 'px', height: el.h + 'px', fontSize: el.fontSize ? el.fontSize + 'px' : null,
        color: el.color || null, textAlign: el.align || null, fontFamily: fontStack(el.font) || null, '--heading-font': fontStack(el.font) || null, '--code-size': el.type === 'code' && el.fontSize ? el.fontSize + 'px' : null,
        '--code-line': el.type === 'code' && el.fontSize ? Math.round(el.fontSize * 1.4) + 'px' : null, ...(el.type === 'code' && codeVars(el)), '--shadow': shadowCss(el.shadow) || null, '--out-h': el.outH ? el.outH + 'px' : null, ...(el.type === 'image' && cropVars(el)) }"
      :tabindex="editable && !decor(el) ? 0 : null"
      :role="!editable && el.title && !/<h[1-6][\s>]/i.test(el.html || '') ? 'heading' : null" :aria-level="!editable && el.title ? 1 : null"
      :aria-label="editable && !decor(el) ? t({ text: 'Text box', code: 'Code block', image: 'Image', table: 'Table', shape: 'Shape', video: 'Video', timer: 'Timer', quiz: 'Quiz', picker: 'Random draw', chart: 'Chart', diagram: 'Diagram', toc: 'Table of contents', icon: 'Icon', math: 'Formula' }[el.type]) : null"
      @pointerdown="down($event, el)" @dblclick="edit($event, el)" @focus="editable && !ui.sel.includes(el.id) && (ui.sel = members(el))"
    >
      <div
        v-if="el.type === 'text'" :ref="n => fit(n, el)" class="content" :class="el.valign && 'v-' + el.valign" v-html="mathed(el, items(el, fields(resolveImgs((live ? liveText[el.id] : undefined) ?? el.html))))" :style="{ backgroundColor: fillCss(el), border: el.stroke ? `${el.strokeWidth}px ${el.strokeStyle || 'solid'} ${el.stroke}` : null, '--lh': el.line, '--ps': el.para != null ? el.para + 'px' : null }"
        :contenteditable="editable && ui.editing === el.id || live && liveEdit === el.id"
        @blur="commit($event, el)" @keydown="textKey" @input="typed($event.currentTarget, $event); autoList($event.currentTarget, $event); layoutMarks()" @paste.prevent="pasteText"
        @click="live && el.board && liveEdit !== el.id && editLive($event, el)"
      />
      <div v-else-if="el.type === 'toc'" class="content toc" :class="el.look && 'look-' + el.look" :style="{ columns: el.columns || null }" v-html="tocHtml(tocEntries(deck.slides, el), el, slide.id)" />
      <template v-else-if="el.type === 'code'">
        <!-- a code group: one tab per code; presenting (and the HTML file) switches, everything else shows the first -->
        <div v-if="el.tabs?.length && !(editable && ui.editing === el.id)" class="code-tabs" role="tablist">
          <button v-for="(l, k) in [el.label || el.lang, ...el.tabs.map(tb => tb.label || tb.lang)]" :key="k" role="tab" :class="{ on: tabOf(el) === k }" :aria-selected="tabOf(el) === k" :data-tab="k" @click="live && ((shownTab[el.id] = k), $event.stopPropagation())">{{ l }}</button>
        </div>
        <textarea v-if="editable && ui.editing === el.id" v-model="el.code" class="code" spellcheck="false" aria-label="Code" @blur="ui.editing = null" @keydown="codeKey($event, el)" />
        <textarea v-else-if="live && runEdit === el.id" v-model="runOf(el).code" class="code" spellcheck="false" :aria-label="t('Code')" @blur="endRunEdit" @keydown.stop="runKey($event, el)" @click.stop />
        <pre v-else class="code" :hidden="tabOf(el) > 0" :class="{ dark: codeDarkOf(el) }" :data-run="isRun(el.meta) && !editable ? el.code : null" :data-ts="isRun(el.meta) && !editable && isTs(el.lang) || null" :data-stages="stageStarts(el)" @click="live && isRun(el.meta) && (editRun(el), $event.stopPropagation())"><code v-for="o in [codeOpts(el.meta, stageOf(el))]" :key="0"><span v-for="(l, i) in hlLines(runShown(el).code, el.lang)" :key="i" class="line" :class="{ dim: o.marked && !o.marked.has(i + 1) }" :data-on="lineStages(el, i)"><span v-if="o.lines" class="ln">{{ lineNo(el, i, o.start) }}</span><span v-html="l" />{{ '\n' }}</span></code></pre>
        <template v-if="el.tabs?.length && !(editable && ui.editing === el.id)">
          <pre v-for="(tb, k) in el.tabs" :key="k" class="code" :class="{ dark: codeDarkOf(el) }" :hidden="tabOf(el) !== k + 1"><code><span v-for="(l, n) in hlLines(tb.code, tb.lang)" :key="n" class="line"><span v-html="l" />{{ '\n' }}</span></code></pre>
        </template>
        <!-- runnable: the output panel (the last kept run in the editor and exports, the live one while presenting) -->
        <template v-if="isRun(el.meta)">
          <pre class="code run-out" :class="{ dark: codeDarkOf(el) }" :aria-live="live ? 'polite' : null" :aria-label="t('Output')"><span v-for="(l, i) in runShown(el).out" :key="i" :class="'out-' + l.k">{{ outLine(l) }}{{ '\n' }}</span></pre>
          <div v-if="live" class="run-bar" @click.stop @pointerdown.stop>
            <button :disabled="runs[el.id]?.busy" :title="t('Run (⌘/Ctrl+Enter)')" @click="run(el)">▶ {{ t('Run') }}</button>
            <template v-if="runs[el.id] && (runs[el.id].code !== el.code || runs[el.id].ran)">
              <button :title="t('Back to the code of the slide')" @click="resetRun(el)">{{ t('Reset') }}</button>
              <button :title="t('Save this code and output in the presentation')" @click="keepRun(el)">{{ t('Keep changes') }}</button>
            </template>
          </div>
        </template>
      </template>
      <img v-else-if="el.type === 'image'" :src="deck.assets[el.asset]" :class="el.cls" :alt="el.decorative ? '' : el.alt || ''" draggable="false" :style="{ borderRadius: el.radius && !el.crop ? el.radius + 'px' : null }" />
      <div v-else-if="el.type === 'math'" class="formula" v-html="formulaHtml(el.tex)" />
      <template v-else-if="el.type === 'diagram'">
        <img v-if="diagramSrc(el, theme || deck.theme)" :src="diagramSrc(el, theme || deck.theme)" :alt="t('Diagram')" draggable="false" />
        <p v-else class="diagram-empty">{{ t('Diagram') }}</p>
      </template>
      <TableEl v-else-if="el.type === 'table'" :el="el" :editing="editable && ui.editing === el.id" :selected="editable && ui.sel.length === 1 && ui.sel[0] === el.id" :scale="scale" />
      <template v-else-if="el.type === 'shape'">
        <div class="shape-box" v-html="shapeSvg(el)" />
        <!-- text in the shape: centred over it, edited like a text box (double-click); always there, so ending
             the edit can still save it on blur -->
        <div v-if="el.shape !== 'line'" :ref="shapeText" class="shape-text">
          <div
            class="content" v-html="mathed(el, fields(resolveImgs(el.html || '')))"
            :contenteditable="editable && ui.editing === el.id"
            @blur="commit($event, el)" @keydown="textKey" @input="typed($event.currentTarget, $event); autoList($event.currentTarget, $event); shrinkShapeText($event.currentTarget.parentElement); layoutMarks()" @paste.prevent="pasteText"
          />
        </div>
      </template>
      <div v-else-if="el.type === 'icon'" class="icon-box" v-html="iconSvg(el)" />
      <!-- a web page: nothing is loaded until a tap while presenting (or in the HTML file), as the page's site sees the viewer -->
      <div v-else-if="el.type === 'video' && el.url" class="video web" :data-offline="t('Offline: the web page appears with an internet connection.')">
        <iframe v-if="live && webOn[el.id]" :src="el.url" :title="hostOf(el.url)" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerpolicy="no-referrer" allow="fullscreen" />
        <button v-else class="web-load" :data-url="el.url" :data-host="hostOf(el.url)" @pointerdown="live && $event.stopPropagation()" @click="live && (online && (webOn[el.id] = true), $event.stopPropagation())">{{ hostOf(el.url) }}<small>{{ t('Web page: tap to load it (this sends data to its site)') }}</small></button>
      </div>
      <div v-else-if="el.type === 'video'" class="video" :data-offline="t('Offline: the video appears with an internet connection.')" :style="{ backgroundImage: ui.yt && !live && online ? `url(${ytThumb(el.youtube)})` : null }">
        <iframe v-if="live && ui.yt && online" :src="`https://www.youtube-nocookie.com/embed/${el.youtube}`" :title="t('YouTube video')" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen />
        <i v-else class="play" />
        <button v-if="!ui.yt && online" class="yt-consent" @pointerdown.stop @click.stop="ui.yt = true">{{ t('Load YouTube content') }}<small>{{ t('This sends data to Google.') }}</small></button>
      </div>
      <!-- while presenting a click starts or pauses it, a double click sets it back -->
      <div v-else-if="el.type === 'timer'" class="content timer-face" :class="[el.face, { running: live && running(el.id), done: live && done(el), warn: warning(el, live), filled: el.fill }]"
        :data-timer="el.seconds" :data-warn="el.warn ? 1 : null" :data-auto="el.auto ? 1 : null" :data-silent="el.silent ? 1 : null" :style="{ '--p': progress(el, live), '--chars': face(el, live).length, '--timer-accent': (!warning(el, live) && el.accent) || null, background: el.fill || null }"
        :role="live ? 'button' : null" :aria-label="live ? t(el.seconds ? 'Start or pause the timer' : 'Start or pause the stopwatch') : null" @click="live && (second(el.id) ? reset(el.id) : toggle(el))"><p>{{ face(el, live) }}</p></div>
      <!-- while presenting a click draws a name (nobody twice until everyone was drawn), a double click starts over; data-left is for the HTML export -->
      <div v-else-if="el.type === 'picker'" class="content picker-face" :class="el.look && 'look-' + el.look" :data-picks="JSON.stringify(el.names)" :data-repeat="el.repeat ? 1 : null" :data-left="t('{0} of {1} left', '{0}', '{1}')" :data-all="t('Everyone drawn · click to start over')" :data-reset="t('Start over')" :role="live ? 'button' : null"
        :aria-label="live ? t('Draw a name') : null" :aria-live="live ? 'polite' : null" @click="live && picker.next(el)">
        <!-- a small start-over button at the edge, not a double tap: two quick taps are two draws -->
        <button v-if="live && picker.picks[el.id]" class="pick-reset" :title="t('Start over')" :aria-label="t('Start over')" @click.stop="picker.reset(el.id)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /></svg></button>
        <template v-if="live && picker.picks[el.id]"><p :key="picker.picks[el.id].n" class="pick">{{ picker.picks[el.id].pick }}</p><small v-if="!el.repeat">{{ picker.picks[el.id].left.length ? t('{0} of {1} left', picker.picks[el.id].left.length, el.names.length) : t('Everyone drawn · click to start over') }}</small></template>
        <span v-else class="label"><template v-if="!el.noIcon"><span v-if="el.body" class="pick-icon" v-html="iconSvg(el)" /><svg v-else class="die" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8.5" cy="8.5" r="1.4" /><circle cx="15.5" cy="15.5" r="1.4" /><circle cx="15.5" cy="8.5" r="1.4" /><circle cx="8.5" cy="15.5" r="1.4" /><circle cx="12" cy="12" r="1.4" /></svg></template>
          <strong v-if="el.heading !== ''">{{ el.heading ?? t('Who’s next?') }}</strong><small v-if="editable">{{ t('Click to draw · {0}', t(el.names.length === 1 ? '{0} name' : '{0} names', el.names.length)) }}</small></span>
      </div>
      <!-- while presenting a click on a tile marks it (the class's vote), the button shows the solution; the labels are for the HTML export -->
      <div v-else-if="el.type === 'quiz'" class="content quiz" :class="[el.look && 'look-' + el.look, { revealed: el.solved || (live && quiz.shown[el.id]) }]" :data-reveal="t('Reveal')" :data-hide="t('Hide')">
        <p class="quiz-q">{{ el.question }}</p>
        <div class="quiz-a">
          <div v-for="(a, i) in el.answers" :key="i" class="quiz-tile" :class="{ picked: live && picked(el.id, i) }" :data-correct="a.correct || null" :role="live ? 'button' : null" :aria-pressed="live ? picked(el.id, i) : null" @click="live && pick(el.id, i)"><b>{{ LETTERS[i] }}</b><span>{{ a.text }}</span></div>
        </div>
        <button v-if="live" class="quiz-reveal" @pointerdown.prevent @click="toggleSolution(el.id)">{{ quiz.shown[el.id] ? t('Hide') : t('Reveal') }}</button>
      </div>
      <!-- the series' first colour is the theme's accent -->
      <div v-else-if="el.type === 'chart'" class="chart-box" role="img" :aria-label="el.title || t('Chart')" v-html="chartSvg(el, themeOf(theme || deck.theme).vars?.accent)" />
      <a v-if="linked(el)" class="el-link" :href="slideHref(el.to)" :aria-label="t('Go to slide {0}', deck.slides.findIndex(s => s.id === el.to) + 1)" />
      <span v-if="editable && el.to && !decor(el)" class="click-badge link-badge" :title="t('Goes to slide {0} on click', deck.slides.findIndex(s => s.id === el.to) + 1 || '?')">→ {{ deck.slides.findIndex(s => s.id === el.to) + 1 || '?' }}</span>
      <svg v-if="marks[el.id]" class="marks" :width="el.w" :height="el.h" aria-hidden="true">
        <g v-for="(m, i) in marks[el.id]" :key="i" :data-type="m.mark" :data-click="(m.at && steps.indexOf(m.at) + 1) || null" :data-unshown="!markShown(m) || null" :style="{ stroke: m.color }">
          <path v-for="(p, j) in m.paths" :key="j" :d="p.d" pathLength="1" :stroke-width="p.w" :stroke-opacity="p.o" :style="{ transitionDelay: j * 80 + 'ms' }" />
        </g>
      </svg>
      <template v-if="editable && marks[el.id] && !decor(el)"><span v-for="(m, i) in marks[el.id].filter(m => m.at)" :key="'m' + i" class="click-badge mark-badge" :style="{ left: m.x + 'px', top: m.y + 'px' }" :title="t('Drawn on click {0}', m.at)">{{ m.at }}</span></template>
      <span v-if="editable && (el.click || el.clickUntil) && !decor(el)" class="click-badge" :title="badgeTitle(el)">{{ badge(el) }}</span>
      <template v-if="editable && ui.sel.length === 1 && ui.sel[0] === el.id && ui.editing !== el.id && !el.locked">
        <template v-if="ui.crop === el.id"><i v-for="h in handlesOf(el)" :key="h" class="handle crop-handle" :class="h" @pointerdown.stop="cropDrag($event, el, h)" /></template>
        <template v-else><i v-for="h in handlesOf(el)" :key="h" class="handle" :class="h" @pointerdown.stop="drag($event, el, h)" /></template>
      </template>
    </div>
    <!-- crop mode: the whole picture, dimmed, behind the visible box; dragging it moves the picture -->
    <div v-if="cropEl()" class="crop-ghost" :style="{ left: cropFull(cropEl()).x + 'px', top: cropFull(cropEl()).y + 'px', width: cropFull(cropEl()).w + 'px', height: cropFull(cropEl()).h + 'px' }" @pointerdown.stop="!$event.button && panCrop($event, cropEl())">
      <img :src="deck.assets[cropEl().asset]" alt="" draggable="false" />
    </div>
    <i v-if="guides.x != null" class="guide x" :style="{ left: guides.x + 'px' }" />
    <i v-if="guides.y != null" class="guide y" :style="{ top: guides.y + 'px' }" />
    <i v-for="(g, i) in guides.gaps" :key="'g' + i" class="gap-mark" :class="g.w ? 'x' : 'y'" :style="{ left: g.x + 'px', top: g.y + 'px', width: g.w + 'px', height: g.h + 'px' }"><b>{{ g.n }}</b></i>
    <span v-if="measure" class="measure" :style="{ left: measure.x + measure.w / 2 + 'px', top: measure.y + measure.h + 'px' }">{{ measure.size ? `${measure.w} × ${measure.h}` : `X ${measure.x}  Y ${measure.y}` }}</span>
    <i v-if="marquee" class="marquee" :style="{ left: marquee.x + 'px', top: marquee.y + 'px', width: marquee.w + 'px', height: marquee.h + 'px' }" />
    <div class="pageno">{{ index + 1 }}</div>
  </div>
</template>
