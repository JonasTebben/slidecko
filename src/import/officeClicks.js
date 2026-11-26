// Click animations of a PowerPoint slide (p:timing) or an Impress page (anim:par) -> { objectId: { click, until } }.
// Every effect that starts on a click opens the next step; effects with or after it share that step. Entrances
// (any kind) are "appear on click", fly in (left, right, bottom) and zoom keep their effect, exits "disappear on click"; effects that run before
// the first click, emphasis and motion paths are left out. Read from the XML text, so it needs no DOM.
const FLAVOURS = {
  pptx: { effect: /<p:cTn\b[^>]*\bpresetClass="(\w+)"[^>]*>/g, node: /nodeType="(\w+)"/, click: 'clickEffect', show: 'entr', hide: 'exit', target: /<p:spTgt spid="([^"]+)"/,
    kind: tag => { const id = tag.match(/presetID="(\d+)"/)?.[1], sub = tag.match(/presetSubtype="(\d+)"/)?.[1]; return id === '2' ? { 8: 'fly-left', 2: 'fly-right', 4: 'fly-up' }[sub] : ['23', '53'].includes(id) ? 'zoom' : undefined } },
  odp: { effect: /<anim:par\b[^>]*\bpresentation:preset-class="([\w-]+)"[^>]*>/g, node: /presentation:node-type="([\w-]+)"/, click: 'on-click', show: 'entrance', hide: 'exit', target: /smil:targetElement="([^"]+)"/,
    kind: tag => { const id = tag.match(/preset-id="ooo-entrance-([\w-]+)"/)?.[1], sub = tag.match(/preset-sub-type="([\w-]+)"/)?.[1]; return id === 'fly-in' ? { 'from-left': 'fly-left', 'from-right': 'fly-right', 'from-bottom': 'fly-up' }[sub] : id === 'zoom' ? 'zoom' : undefined } },
}
export function officeClicks(xml, flavour) {
  const f = FLAVOURS[flavour], out = {}
  let step = 0
  for (const m of xml?.matchAll(f.effect) || []) {
    if (m[0].match(f.node)?.[1] === f.click) step++
    const id = xml.slice(m.index).match(f.target)?.[1]
    if (!step || !id || (m[1] !== f.show && m[1] !== f.hide)) continue
    const o = (out[id] ??= {})
    if (m[1] === f.show && o.click == null) { o.click = step; const fx = f.kind(m[0]); if (fx) o.effect = fx }
    else if (o.until == null && step > (o.click || 0)) o.until = step
  }
  return out
}
// gives elements tagged with the ids of their source objects (ids: [own, group …]) their click steps
export function applyClicks(elements, clicks) {
  for (const e of elements) {
    const c = e.ids?.map(id => clicks[id]).find(Boolean)
    if (c?.click) e.click = c.click
    if (c?.until) e.clickUntil = c.until
    if (c?.click && c.effect) e.effect = c.effect
    delete e.ids
  }
  return elements
}
