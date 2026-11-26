// Find & replace, like VS Code's find widget: non-modal, the replace row folded away (App.vue's find dialog)
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { deck, ui, decks } from '../core/store.js'
import * as A from '../core/actions.js'
import { t } from '../core/i18n.js'
import { find, replace, ranges, pattern } from './search.js'

// mdText: the Markdown editor's text; presenting, presenterView, collapsed: what decides which marks are on screen
export function useFind({ mdText, presenting, presenterView, collapsed }) {
  // while the markdown editor is open, find works on its text (the editor is modal, the slides are out of reach)
  const mdOpen = ref(false)
  const findDialog = ref(), findInput = ref(), findQ = ref(''), findR = ref(''), findAt = ref(-1), findOpen = ref(false), replacing = ref(false)
  // cs = match case, word = whole word, regex, keep = preserve case (on replace)
  const findOpt = reactive({ cs: false, word: false, regex: false, keep: false })
  const rx = computed(() => { try { return findQ.value ? pattern(findQ.value, findOpt) : null } catch { return false } }) // false: invalid regex
  // where to search: all slides, this deck or this slide; and which contents
  const findScope = ref('all'), findKinds = reactive({ text: true, table: true, code: true, notes: true }), filtering = ref(false)
  const KINDS = [['text', 'Text'], ['table', 'Tables'], ['code', 'Code'], ['notes', 'Notes']]
  // the toggles are remembered per browser, like VS Code keeps them; the search text only for this tab (session.js),
  // it may contain slide content. Read defensively, it is untrusted input
  const FIND_PREFS = 'slides-builder:find'
  try {
    const p = JSON.parse(localStorage.getItem(FIND_PREFS)) || {}
    if (['all', 'deck', 'slide'].includes(p.scope)) findScope.value = p.scope
    for (const [obj, saved] of [[findKinds, p.kinds], [findOpt, p.opt]]) for (const k in obj) if (typeof saved?.[k] === 'boolean') obj[k] = saved[k]
  } catch {}
  watch([findScope, findKinds, findOpt], () => {
    try { localStorage.setItem(FIND_PREFS, JSON.stringify({ scope: findScope.value, kinds: findKinds, opt: findOpt })) } catch {}
  }, { deep: true })
  const filtered_ = computed(() => findScope.value !== 'all' || KINDS.some(([k]) => !findKinds[k]))
  function inScope(i) {
    if (findScope.value === 'slide') return i === ui.slide
    if (findScope.value === 'deck') { const d = decks.value.find(d => ui.slide >= d.start && ui.slide < d.start + d.count); return i >= d.start && i < d.start + d.count }
    return true
  }
  const hits = computed(() => {
    if (!findOpen.value && !mdOpen.value) return [] // closed: no search on every edit
    if (!mdOpen.value) return find(deck.slides, rx.value, findKinds).filter(h => inScope(h.slide))
    const [h] = find([{ notes: mdText.value, elements: [] }], rx.value)
    return h ? [{ ...h, obj: mdText, key: 'value', md: true, notes: false, slide: -1 }] : []
  })
  const hitsOn = computed(() => hits.value.reduce((m, h) => (m[h.slide] = (m[h.slide] || 0) + h.count, m), {}))
  const deckHits = g => (findOpen.value ? Object.entries(hitsOn.value).reduce((n, [i, c]) => (i >= g.start && i < g.start + g.count ? n + c : n), 0) : 0)
  const FIND_KEYS = { c: 'cs', w: 'word', r: 'regex', p: 'keep' } // ⌥⌘C/W/R/P, as in VS Code
  function findKey(e) {
    const k = FIND_KEYS[e.code.slice(3).toLowerCase()]
    if (!k || !e.altKey || !(e.metaKey || e.ctrlKey) || !e.code.startsWith('Key')) return
    e.preventDefault()
    findOpt[k] = !findOpt[k]
  }
  // one entry per occurrence; n = index within its field, k = index within its element (for the slide highlight)
  const occ = computed(() => {
    const out = [], seen = {}
    for (const h of hits.value) for (let n = 0; n < h.count; n++) out.push({ h, n, k: h.el ? (seen[h.el] = (seen[h.el] ?? -1) + 1) : -1 })
    return out
  })
  function openFind(withReplace = false) {
    const a = document.activeElement // textareas keep their selection to themselves
    const t = (a?.setSelectionRange && a.type !== 'checkbox' ? a.value.slice(a.selectionStart, a.selectionEnd) : getSelection().toString()).trim()
    if (t && !t.includes('\n')) findQ.value = t
    if (withReplace) replacing.value = true
    findFrom = ui.slide
    findOpen.value = true
    findDialog.value.show()
    first() // the remembered term: start at its first hit from here
    nextTick(() => findInput.value.select())
  }
  function closeFind() { findDialog.value.close(); findOpen.value = false }
  // first occurrence on or after the current slide, as VS Code starts at the cursor
  // while typing, show the first occurrence from the slide the search started on, as VS Code does:
  // the counter then names the hit on screen, and Enter goes on from there
  let findFrom = 0
  function first() {
    findAt.value = occ.value.length ? Math.max(0, occ.value.findIndex(o => o.h.slide >= findFrom)) : -1
    if (findOpen.value) reveal()
  }
  watch([rx, mdOpen, findScope, () => ({ ...findKinds })], first)
  function reveal() {
    const h = occ.value[findAt.value]?.h
    if (!h || h.md) return
    A.go(h.slide)
    nextTick(() => { ui.sel = h.el ? [h.el] : [] })
  }
  function step(d) {
    const len = occ.value.length
    if (!len) return
    findAt.value = (Math.max(findAt.value, d > 0 ? -1 : 0) + d + len) % len
    reveal()
  }
  function replaceOne() {
    const o = occ.value[findAt.value]
    if (!o) return step(1)
    ui.editing = null // a text box being typed in would write its old content back
    replace([o.h], rx.value, findR.value, findOpt, o.n)
    // the next occurrence moves into this index, like in VS Code; unless the replacement matches again (a → aa)
    const again = find([{ notes: findR.value, elements: [] }], rx.value).length
    nextTick(() => { if (!again) findAt.value--; step(1) })
  }
  function replaceAll() {
    ui.editing = null
    const n = replace(hits.value, rx.value, findR.value, findOpt)
    // the whole project also means the master and the layouts (a name in the footer, say)
    const m = findScope.value === 'all' && !mdOpen.value ? replace(find([{ elements: deck.master }, ...deck.layouts], rx.value, { ...findKinds, notes: false }), rx.value, findR.value, findOpt) : 0
    A.toast(m ? t('{0} matches replaced, {1} of them in the master and layouts', n + m, m) : t('{0} matches replaced', n))
  }
  // marks in the text copy behind a textarea; scrolls the textarea to the current hit (the copy follows its scroll)
  function mirror(node, isCurrent, all, cur) {
    if (node) ranges(node, rx.value).forEach((r, k) => {
      if (!isCurrent(k)) return all.add(r)
      cur.add(r)
      const ta = node.nextElementSibling, y = r.getBoundingClientRect().top - node.getBoundingClientRect().top + node.scrollTop
      if (y < ta.scrollTop || y > ta.scrollTop + ta.clientHeight - 20) ta.scrollTop = y - ta.clientHeight / 2
    })
  }
  // subtle marks on the slide via the CSS Custom Highlight API: no DOM changes, so editing is unaffected
  const hl = typeof CSS !== 'undefined' && CSS.highlights
  watch([findOpen, occ, findAt, () => ui.slide, () => ui.editing, collapsed, mdOpen, presenting, presenterView], async () => {
    if (!hl) return
    await nextTick()
    const all = new Highlight(), cur = new Highlight(), thumbs = new Highlight()
    const o = occ.value[findAt.value]
    if (findOpen.value && rx.value) {
      // only what the search covers (scope and kinds), so the marks agree with the counter
      const els = new Set(hits.value.map(h => h.el)), notesHit = hits.value.some(h => h.notes && h.slide === ui.slide)
      const marked = sel => [...document.querySelectorAll(sel)].filter(n => els.has(n.dataset.el))
      for (const node of marked('.stage [data-el]')) {
        ranges(node, rx.value).forEach((r, k) => (o?.h.el === node.dataset.el && o.h.slide === ui.slide && o.k === k ? cur : all).add(r))
      }
      for (const node of marked('.thumb [data-el]')) for (const r of ranges(node, rx.value)) thumbs.add(r)
      // deck names are not searched (renaming changes file names), only marked
      if (!mdOpen.value) for (const node of document.querySelectorAll('.deck-name')) for (const r of ranges(node, rx.value)) all.add(r)
      // presenting: the search stays marked on the slide, the next-slide preview and the speaker notes
      for (const node of [...marked('.presenter [data-el]'), notesHit && document.querySelector('.pv-notes')].filter(Boolean)) for (const r of ranges(node, rx.value)) all.add(r)
      if (notesHit) mirror(document.querySelector('.notes-mirror'), k => o?.h.notes && o.h.slide === ui.slide && o.n === k, all, cur)
      mirror(document.querySelector('.md-mirror'), k => o?.h.md && o.n === k, all, cur)
    }
    hl.set('find', all); hl.set('find-current', cur); hl.set('find-thumb', thumbs)
  }, { flush: 'post' })
  return { mdOpen, findDialog, findOpt, rx, findScope, KINDS, filtered_, hitsOn, deckHits, findKey, occ, openFind, closeFind, step, replaceOne, replaceAll, findInput, findQ, findR, findAt, findOpen, replacing, filtering }
}
