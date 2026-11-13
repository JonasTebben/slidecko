import test from 'node:test'
import assert from 'node:assert/strict'
import { onePPr, numberFont } from './pptxFix.js'

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
