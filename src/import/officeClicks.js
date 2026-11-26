// Click animations of a PowerPoint slide (p:timing) or an Impress page (anim:par) -> { objectId: { click, until } }.
// Every effect that starts on a click opens the next step; effects with or after it share that step. Entrances
// (any kind: appear, fade, fly in …) are "appear on click", exits "disappear on click"; effects that run before
// the first click, emphasis and motion paths are left out. Read from the XML text, so it needs no DOM.
const FLAVOURS = {
  pptx: { effect: /<p:cTn\b[^>]*\bpresetClass="(\w+)"[^>]*>/g, node: /nodeType="(\w+)"/, click: 'clickEffect', show: 'entr', hide: 'exit', target: /<p:spTgt spid="([^"]+)"/ },
  odp: { effect: /<anim:par\b[^>]*\bpresentation:preset-class="([\w-]+)"[^>]*>/g, node: /presentation:node-type="([\w-]+)"/, click: 'on-click', show: 'entrance', hide: 'exit', target: /smil:targetElement="([^"]+)"/ },
}
export function officeClicks(xml, flavour) {
  const f = FLAVOURS[flavour], out = {}
  let step = 0
  for (const m of xml?.matchAll(f.effect) || []) {
    if (m[0].match(f.node)?.[1] === f.click) step++
    const id = xml.slice(m.index).match(f.target)?.[1]
    if (!step || !id || (m[1] !== f.show && m[1] !== f.hide)) continue
    const o = (out[id] ??= {})
    if (m[1] === f.show) o.click ??= step
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
    delete e.ids
  }
  return elements
}
