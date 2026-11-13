<script setup>
import { nextTick, ref, watch, onBeforeUnmount } from 'vue'
import { W, H, deck, ui, clean } from './store.js'
import { themeStyle, fontStack, codeDark, shadowCss } from './themes.js'
import { hlLines, codeOpts } from './hl.js'
import { pasteLook, startCrop, endCrop, cropFull, cropRatioValue, applyCrop } from './actions.js'
import { shapeSvg } from './toSlidev.js'
import TableEl from './TableEl.vue'
import { pasteHtml } from './paste.js'
import { toggleList, undoList, typed, indent, autoList } from './lists.js'
import { t } from './i18n.js'

// One component for every rendering of a slide (editor, thumbnails, presenter, print, PPTX).
// scale converts pointer movement back into slide units.
const props = defineProps({ slide: Object, index: Number, editable: Boolean, scale: { type: Number, default: 1 }, live: Boolean, theme: String }) // theme: preview in another theme than the deck's
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const root = ref()
const selected = el => props.editable && ui.sel.includes(el.id)

// images inside text are stored with their Slidev path (data-src) and shown from the assets
const resolveImgs = html => (html?.includes('data-asset') ? html.replace(/<img\b[^>]*>/g, t => {
  const id = t.match(/data-asset="([^"]+)"/)?.[1]
  return id && deck.assets[id] ? t.replace(/\ssrc="[^"]*"/, ` src="${deck.assets[id]}"`) : t
}) : html)
const unresolveImgs = html => html.replace(/<img\b[^>]*>/g, t => {
  const path = t.match(/data-src="([^"]+)"/)?.[1]
  return path ? t.replace(/\ssrc="data:[^"]*"/, ` src="${path}"`) : t
})

// --- moving, resizing, snapping ---
// Edges and centres stick to the slide's edges, margins and centre and to the other elements;
// magenta guides show what they stick to. Alt switches snapping off.
const SNAP = 6
const guides = ref({ x: null, y: null })
const marquee = ref(null)
function nearest(edges, lines) {
  let best = { d: 0, line: null, dist: SNAP / props.scale }
  for (const e of edges) for (const l of lines) if (Math.abs(l - e) < best.dist) best = { d: l - e, line: l, dist: Math.abs(l - e) }
  return best
}
function track(e, move, done) {
  const up = ev => { removeEventListener('pointermove', move); guides.value = { x: null, y: null }; done?.(ev) }
  addEventListener('pointermove', move)
  addEventListener('pointerup', up, { once: true })
}

function down(e, el) {
  if (!props.editable || e.button || ui.editing === el.id) return
  if (ui.crop === el.id) return panCrop(e, el)
  if (ui.crop) endCrop()
  if (ui.editing) document.activeElement?.blur()
  if (ui.painting) { pasteLook([el]); ui.painting = false; ui.sel = [el.id]; return }
  if (e.shiftKey || e.metaKey || e.ctrlKey) {
    ui.sel = selected(el) ? ui.sel.filter(id => id !== el.id) : [...ui.sel, el.id]
    return
  }
  if (!selected(el)) ui.sel = [el.id]
  else ui.sel = [...ui.sel.filter(id => id !== el.id), el.id] // primary = the one being dragged
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
  const ratio = o.w / o.h
  track(e, ev => {
    const dx = (ev.clientX - e.clientX) / props.scale, dy = (ev.clientY - e.clientY) / props.scale
    let l = o.x, r = o.x + o.w, t = o.y, b = o.y + o.h
    const Wd = !dir || dir.includes('w'), Ed = !dir || dir.includes('e'), Nd = !dir || dir.includes('n'), Sd = !dir || dir.includes('s')
    if (Wd) l += dx
    if (Ed) r += dx
    if (Nd) t += dy
    if (Sd) b += dy
    const sx = ev.altKey ? {} : nearest(!dir ? [l, (l + r) / 2, r] : Wd ? [l] : Ed ? [r] : [], xs)
    const sy = ev.altKey ? {} : nearest(!dir ? [t, (t + b) / 2, b] : Nd ? [t] : Sd ? [b] : [], ys)
    if (Wd) l += sx.d || 0
    if (Ed) r += sx.d || 0
    if (Nd) t += sy.d || 0
    if (Sd) b += sy.d || 0
    // corners keep the aspect ratio of images (or of anything with Shift)
    if (dir.length === 2 && ['image', 'video'].includes(el.type) !== ev.shiftKey) {
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
    guides.value = { x: sx.line ?? null, y: sy.line ?? null }
  })
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
function backgroundDown(e) {
  if (!props.editable || e.button) return
  if (ui.crop) endCrop()
  if (ui.editing) document.activeElement?.blur()
  const box = root.value.getBoundingClientRect()
  const p = ev => ({ x: (ev.clientX - box.left) / props.scale, y: (ev.clientY - box.top) / props.scale })
  const a = p(e)
  const additive = e.shiftKey || e.metaKey
  const before = additive ? [...ui.sel] : []
  ui.sel = before
  track(e, ev => {
    const b = p(ev)
    const m = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
    marquee.value = m
    const hit = props.slide.elements.filter(o => o.x < m.x + m.w && o.x + o.w > m.x && o.y < m.y + m.h && o.y + o.h > m.y).map(o => o.id)
    ui.sel = [...new Set([...before, ...hit])]
  }, () => { marquee.value = null })
}

// --- editing in place ---
async function edit(e, el) {
  if (props.editable && el.type === 'image') return startCrop(el)
  if (!props.editable || ['image', 'video'].includes(el.type) || (el.type === 'shape' && el.shape === 'line') || ui.editing === el.id) return
  const box = e.currentTarget, cell = e.target.closest?.('[data-r]')
  ui.sel = [el.id]
  ui.editing = el.id
  await nextTick()
  const target = cell ? box.querySelector(`[data-r="${cell.dataset.r}"][data-c="${cell.dataset.c}"]`) : box.querySelector('[contenteditable=true], textarea')
  target?.focus()
  if (el.type === 'text' || cell) {
    // caret where the user double-clicked, not at the start
    let range = document.caretRangeFromPoint?.(e.clientX, e.clientY)
    const pos = !range && document.caretPositionFromPoint?.(e.clientX, e.clientY)
    if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset) }
    if (range && target?.contains(range.startContainer)) { getSelection().removeAllRanges(); getSelection().addRange(range) }
  }
}
defineExpose({ edit })
// el.html is only written when editing ends: re-rendering v-html while typing would reset the caret
function commit(e, el) {
  const html = clean(unresolveImgs(e.target.innerHTML))
  if (html !== el.html) el.html = html
  if (ui.editing === el.id) ui.editing = null
}
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
// always enclose the text; only in the editor, and never shrink what the user sized larger
const boxes = new Map()
const ro = new ResizeObserver(entries => {
  for (const { target } of entries) {
    const el = boxes.get(target)
    // only while the user types in it: a theme/typo change must never resize boxes for good
    if (el && ui.editing === el.id && target.offsetHeight > el.h + 1) el.h = Math.ceil(target.offsetHeight)
  }
})
function fit(node, el) {
  if (!props.editable || !node || boxes.get(node) === el) return
  boxes.set(node, el)
  ro.observe(node)
}
onBeforeUnmount(() => ro.disconnect())
// code block background: own colour with opacity and corners; text and syntax colours follow its brightness
// a fill with its opacity (fillAlpha in %, undefined = opaque)
const fillCss = el => (el.fill && el.fillAlpha != null ? `color-mix(in srgb, ${el.fill} ${el.fillAlpha}%, transparent)` : el.fill || null)
// a line number padded to the widest one, as text (so exports keep it)
const lineNo = (el, i) => { const s = codeOpts(el.meta).start; return String(s + i).padStart(String(s + el.code.split('\n').length - 1).length) + '  ' }
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
// only on the user's own code edits (text, size, width), never on theme/typo changes
watch(() => props.slide.elements.map(e => e.type === 'code' && [e.code, e.fontSize, e.w]), fitCode, { deep: true })
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
const ytThumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
</script>

<template>
  <div ref="root" class="slide" :class="[`theme-${theme || deck.theme}`, `layout-${slide.layout}`, { painting: editable && ui.painting }]" :style="themeStyle(theme || deck.theme)" @pointerdown.self="backgroundDown">
    <div
      v-for="el in slide.elements" :key="el.id" :data-el="el.id"
      class="el" :class="[el.type, { cropped: el.type === 'image' && el.crop, cropping: editable && ui.crop === el.id, title: el.title, colored: el.color, filled: el.fill || el.stroke, locked: editable && el.locked, selected: selected(el), editing: editable && ui.editing === el.id }]"
      :style="{ left: el.x + 'px', top: el.y + 'px', width: el.w + 'px', height: el.h + 'px', fontSize: el.fontSize ? el.fontSize + 'px' : null,
        color: el.color || null, textAlign: el.align || null, fontFamily: fontStack(el.font) || null, '--heading-font': fontStack(el.font) || null, '--code-size': el.type === 'code' && el.fontSize ? el.fontSize + 'px' : null,
        '--code-line': el.type === 'code' && el.fontSize ? Math.round(el.fontSize * 1.4) + 'px' : null, ...(el.type === 'code' && codeVars(el)), '--shadow': shadowCss(el.shadow) || null, ...(el.type === 'image' && cropVars(el)) }"
      :tabindex="editable ? 0 : null"
      :aria-label="editable ? t({ text: 'Textfeld', code: 'Codeblock', image: 'Bild', table: 'Tabelle', shape: 'Form', video: 'Video' }[el.type]) : null"
      @pointerdown="down($event, el)" @dblclick="edit($event, el)" @focus="editable && !ui.sel.includes(el.id) && (ui.sel = [el.id])"
    >
      <div
        v-if="el.type === 'text'" :ref="n => fit(n, el)" class="content" :class="el.valign && 'v-' + el.valign" v-html="resolveImgs(el.html)" :style="{ backgroundColor: fillCss(el), border: el.stroke ? `${el.strokeWidth}px ${el.strokeStyle || 'solid'} ${el.stroke}` : null }"
        :contenteditable="editable && ui.editing === el.id"
        @blur="commit($event, el)" @keydown="textKey" @input="typed($event.currentTarget, $event); autoList($event.currentTarget, $event)" @paste.prevent="pasteText"
      />
      <template v-else-if="el.type === 'code'">
        <textarea v-if="editable && ui.editing === el.id" v-model="el.code" class="code" spellcheck="false" aria-label="Code" @blur="ui.editing = null" @keydown="codeKey($event, el)" />
        <pre v-else class="code" :class="{ dark: codeDarkOf(el) }"><code><span v-for="(l, i) in hlLines(el.code, el.lang)" :key="i" class="line" :class="{ dim: codeOpts(el.meta).marked && !codeOpts(el.meta).marked.has(i + 1) }"><span v-if="codeOpts(el.meta).lines" class="ln">{{ lineNo(el, i) }}</span><span v-html="l" />{{ '\n' }}</span></code></pre>
      </template>
      <img v-else-if="el.type === 'image'" :src="deck.assets[el.asset]" :class="el.cls" alt="" draggable="false" :style="{ borderRadius: el.radius && !el.crop ? el.radius + 'px' : null }" />
      <TableEl v-else-if="el.type === 'table'" :el="el" :editing="editable && ui.editing === el.id" :selected="editable && ui.sel.length === 1 && ui.sel[0] === el.id" :scale="scale" />
      <template v-else-if="el.type === 'shape'">
        <div class="shape-box" v-html="shapeSvg(el)" />
        <!-- text in the shape: centred over it, edited like a text box (double-click); always there, so ending
             the edit can still save it on blur -->
        <div v-if="el.shape !== 'line'" :ref="shapeText" class="shape-text">
          <div
            class="content" v-html="resolveImgs(el.html || '')"
            :contenteditable="editable && ui.editing === el.id"
            @blur="commit($event, el)" @keydown="textKey" @input="typed($event.currentTarget, $event); autoList($event.currentTarget, $event); shrinkShapeText($event.currentTarget.parentElement)" @paste.prevent="pasteText"
          />
        </div>
      </template>
      <div v-else-if="el.type === 'video'" class="video" :style="{ backgroundImage: ui.yt && !live ? `url(${ytThumb(el.youtube)})` : null }">
        <iframe v-if="live && ui.yt" :src="`https://www.youtube-nocookie.com/embed/${el.youtube}`" :title="t('YouTube-Video')" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen />
        <i v-else class="play" />
        <button v-if="!ui.yt" class="yt-consent" @pointerdown.stop @click.stop="ui.yt = true">{{ t('YouTube-Inhalte laden') }}<small>{{ t('Dabei werden Daten an Google übertragen.') }}</small></button>
      </div>
      <template v-if="editable && ui.sel.length === 1 && ui.sel[0] === el.id && ui.editing !== el.id && !el.locked">
        <template v-if="ui.crop === el.id"><i v-for="h in HANDLES" :key="h" class="handle crop-handle" :class="h" @pointerdown.stop="cropDrag($event, el, h)" /></template>
        <template v-else><i v-for="h in HANDLES" :key="h" class="handle" :class="h" @pointerdown.stop="drag($event, el, h)" /></template>
      </template>
    </div>
    <!-- crop mode: the whole picture, dimmed, behind the visible box; dragging it moves the picture -->
    <div v-if="cropEl()" class="crop-ghost" :style="{ left: cropFull(cropEl()).x + 'px', top: cropFull(cropEl()).y + 'px', width: cropFull(cropEl()).w + 'px', height: cropFull(cropEl()).h + 'px' }" @pointerdown.stop="!$event.button && panCrop($event, cropEl())">
      <img :src="deck.assets[cropEl().asset]" alt="" draggable="false" />
    </div>
    <i v-if="guides.x != null" class="guide x" :style="{ left: guides.x + 'px' }" />
    <i v-if="guides.y != null" class="guide y" :style="{ top: guides.y + 'px' }" />
    <i v-if="marquee" class="marquee" :style="{ left: marquee.x + 'px', top: marquee.y + 'px', width: marquee.w + 'px', height: marquee.h + 'px' }" />
    <div class="pageno">{{ index + 1 }}</div>
  </div>
</template>
