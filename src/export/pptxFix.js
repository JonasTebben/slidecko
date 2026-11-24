// pptxgenjs writes an <a:pPr> before every run; the schema allows one, first in <a:p> (PowerPoint may offer "repair")
// numbers in the text's own font and size (pptxgenjs: theme heading font; Google Slides draws those smaller)
export const numberFont = xml => xml.replace(/<a:buSzPct val="100000"\/><a:buFont typeface="\+mj-lt"\/>(?=<a:buAutoNum)/g, '<a:buSzTx/><a:buFontTx/>')

export const onePPr = xml => xml.replace(/<a:p>(.*?)<\/a:p>/gs, (m, body) => {
  const i = body.search(/<a:(r|br|fld)[ >/]/)
  return i < 0 ? m : `<a:p>${body.slice(0, i)}${body.slice(i).replace(/<a:pPr\b[^>]*\/>|<a:pPr\b[^>]*>.*?<\/a:pPr>/gs, '')}</a:p>`
})

// pictures: pptxgenjs writes the media path (or "preencoded.png" for data URLs) as the description when there is no
// alt text; decorative ones (by their name, see altOf in exportPptx.js) get PowerPoint's "Mark as decorative" (Office 2019+)
export const DECORATIVE = 'Decorative picture'
const DECOR_EXT = '<a:extLst><a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><adec:decorative xmlns:adec="http://schemas.microsoft.com/office/drawing/2017/decorative" val="1"/></a:ext></a:extLst>'
export const decorative = xml => xml.replace(/(<p:cNvPr [^>]*?)descr="(?:\.\.\/media\/[^"]*|preencoded\.\w+)"/g, '$1descr=""')
  .replace(new RegExp(`(<p:cNvPr [^>]*name="${DECORATIVE}"[^>]*>)([\\s\\S]*?)</p:cNvPr>`, 'g'), `$1$2${DECOR_EXT}</p:cNvPr>`)

// appear / disappear on click as PowerPoint animations (p:timing, after the transition): one click per step, the
// objects of an element appear (entrance "Appear") or vanish (exit "Disappear") together.
// clicks: [{ objs: object indexes, click, until }] (steps); the n-th <p:cNvPr> after the slide's group is the n-th
// object pptxgenjs added. Steps where nothing appears or goes (further list items, code stages) are no click here
export function clickTiming(xml, clicks = []) {
  if (!clicks.length) return ''
  const ids = [...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].slice(1).map(m => m[1])
  const steps = [...new Set(clicks.flatMap(c => [c.click, c.until]).filter(Boolean))].sort((a, b) => a - b)
  let n = 3
  const cond = d => `<p:stCondLst><p:cond delay="${d}"/></p:stCondLst>`
  const set = (id, show, first) => {
    const a = n++, b = n++
    return `<p:par><p:cTn id="${a}" presetID="1" presetClass="${show ? 'entr' : 'exit'}" presetSubtype="0" fill="hold" nodeType="${first ? 'clickEffect' : 'withEffect'}">${cond(0)}<p:childTnLst><p:set><p:cBhvr><p:cTn id="${b}" dur="1" fill="hold">${cond(0)}</p:cTn><p:tgtEl><p:spTgt spid="${id}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${show ? 'visible' : 'hidden'}"/></p:to></p:set></p:childTnLst></p:cTn></p:par>`
  }
  const step = k => {
    const fx = clicks.flatMap(c => [c.click === k && [c, true], c.until === k && [c, false]].filter(Boolean))
      .flatMap(([c, show]) => c.objs.map(o => [ids[o], show])).filter(([id]) => id)
    const a = n++, b = n++
    return `<p:par><p:cTn id="${a}" fill="hold">${cond('indefinite')}<p:childTnLst><p:par><p:cTn id="${b}" fill="hold">${cond(0)}<p:childTnLst>${fx.map(([id, show], i) => set(id, show, !i)).join('')}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`
  }
  const body = steps.map(step).join('')
  const slideCond = (k, e) => `<p:${k}CondLst><p:cond evt="${e}" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:${k}CondLst>`
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${body}</p:childTnLst></p:cTn>${slideCond('prev', 'onPrev')}${slideCond('next', 'onNext')}</p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`
}
