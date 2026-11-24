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
