// pptxgenjs writes an <a:pPr> before every run; the schema allows one, first in <a:p> (PowerPoint may offer "repair")
// numbers in the text's own font and size (pptxgenjs: theme heading font; Google Slides draws those smaller)
export const numberFont = xml => xml.replace(/<a:buSzPct val="100000"\/><a:buFont typeface="\+mj-lt"\/>(?=<a:buAutoNum)/g, '<a:buSzTx/><a:buFontTx/>')

export const onePPr = xml => xml.replace(/<a:p>(.*?)<\/a:p>/gs, (m, body) => {
  const i = body.search(/<a:(r|br|fld)[ >/]/)
  return i < 0 ? m : `<a:p>${body.slice(0, i)}${body.slice(i).replace(/<a:pPr\b[^>]*\/>|<a:pPr\b[^>]*>.*?<\/a:pPr>/gs, '')}</a:p>`
})
