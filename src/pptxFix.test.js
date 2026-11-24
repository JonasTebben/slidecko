import test from 'node:test'
import assert from 'node:assert/strict'
import { onePPr, numberFont, decorative, DECORATIVE } from './pptxFix.js'

test('numbers follow the text font, bullets keep theirs', () => {
  assert.equal(numberFont('<a:buSzPct val="100000"/><a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod" startAt="6"/><a:buSzPct val="100000"/><a:buChar char="•"/>'),
    '<a:buSzTx/><a:buFontTx/><a:buAutoNum type="arabicPeriod" startAt="6"/><a:buSzPct val="100000"/><a:buChar char="•"/>')
})

test('keeps only the leading pPr of a paragraph', () => {
  const pPr = '<a:pPr algn="l"><a:lnSpc><a:spcPts val="940"/></a:lnSpc><a:buNone/></a:pPr>'
  const r = t => `<a:r><a:rPr lang="en-US"/><a:t>${t}</a:t></a:r>`
  assert.equal(onePPr(`<a:p>${pPr}${r('a')}${pPr}${r('b')}<a:pPr/>${r('c')}<a:endParaRPr/></a:p><a:p>${pPr}<a:endParaRPr/></a:p>`),
    `<a:p>${pPr}${r('a')}${r('b')}${r('c')}<a:endParaRPr/></a:p><a:p>${pPr}<a:endParaRPr/></a:p>`)
})

test('pictures: no media path as description, decorative ones marked as decorative', () => {
  const pic = (name, descr) => `<p:pic><p:nvPicPr><p:cNvPr id="2" name="${name}" descr="${descr}"></p:cNvPr><p:cNvPicPr/></p:nvPicPr></p:pic>`
  assert.equal(decorative(pic('Image 1', '../media/image-1-1.png')), pic('Image 1', ''))
  assert.equal(decorative(pic('Image 1', 'preencoded.png')), pic('Image 1', ''))
  assert.equal(decorative(pic('Image 1', 'A red bus')), pic('Image 1', 'A red bus'))
  assert.match(decorative(pic(DECORATIVE, '../media/image-1-2.png')), /descr=""><a:extLst><a:ext uri="\{C183D7F6-B498-43B3-948B-1728B52AA6E4\}"><adec:decorative [^>]*val="1"\/><\/a:ext><\/a:extLst><\/p:cNvPr>/)
})
