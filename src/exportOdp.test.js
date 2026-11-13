import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { OdpDoc } from './exportOdp.js'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

test('writes a valid OpenDocument package', async () => {
  const d = new OdpDoc()
  d.defineLayout({ width: 10, height: 5.633 })
  d.defineSlideMaster({ title: 'bg-1', background: { data: PNG } })
  const s = d.addSlide({ masterName: 'bg-1' })
  s.addText([
    { text: 'Titel & <mehr>', options: { fontSize: 24, bold: true, color: '112233', charSpacing: -0.35, breakLine: true } },
    { text: 'eins', options: { bullet: { indent: 14 }, lineSpacing: 18, breakLine: true } },
    { text: 'zwei', options: { bullet: { indent: 14 }, hyperlink: { url: 'https://example.org/?a=1&b=2' }, underline: { style: 'dash', color: '334455' }, breakLine: true } },
    { text: 'tief', options: { bullet: { indent: 14, characterCode: '25E6' }, indentLevel: 1 } },
    { text: 'umbrochen', options: { bullet: { indent: 14, characterCode: '25E6' }, indentLevel: 1, softBreakBefore: true, breakLine: true } },
    { text: 'sechs', options: { bullet: { type: 'number', indent: 14, numberStartAt: 6 }, breakLine: true } },
    { text: 'sieben', options: { bullet: { type: 'number', indent: 14, numberStartAt: 6 }, breakLine: true } },
    { text: '  code  mit\tTab', options: { fontFace: 'Menlo', bullet: { characterCode: '200B', indent: 12 } } },
  ], { x: 1, y: 1, w: 5, h: 2, fill: { color: 'EEEEEE', transparency: 30 } })
  s.addText('34', { x: 9, y: 5, w: 0.5, h: 0.2, fontSize: 9 })
  s.addShape('roundRect', { x: 1, y: 3, w: 2, h: 1, fill: { color: 'FF0000' }, line: { type: 'none' }, rectRadius: 0.1 })
  s.addImage({ data: PNG, x: 0, y: 0, w: 1, h: 1 })
  s.addTable([[{ text: [{ text: 'A', options: {} }], options: { fill: { color: '0000FF' }, margin: [4, 4, 4, 4], border: [{ type: 'solid', pt: 1, color: '000000' }, { type: 'dash', css: 'dotted', pt: 2, color: 'FF0000' }, { type: 'none' }, { type: 'none' }] } }, { text: '', options: {} }]], { x: 5, y: 3, w: 4, colW: [2, 2], rowH: [0.5] })
  s.addNotes('Notiz')
  d.addSlide().background = { color: 'FFFFFF' }

  const zip = await JSZip.loadAsync(await (await d.write()).arrayBuffer())
  assert.equal(Object.keys(zip.files)[0], 'mimetype') // ODF: first entry, uncompressed
  assert.equal(await zip.file('mimetype').async('string'), 'application/vnd.oasis.opendocument.presentation')
  const content = await zip.file('content.xml').async('string')
  const styles = await zip.file('styles.xml').async('string')
  const manifest = await zip.file('META-INF/manifest.xml').async('string')

  assert.equal(content.match(/<draw:page /g).length, 2)
  assert.match(content, /Titel &amp; &lt;mehr&gt;/)
  assert.match(content, /fo:letter-spacing="-0.35pt"/) // width matched to the browser's font
  assert.match(content, /<text:span [^>]*><text:a xlink:type="simple" xlink:href="https:\/\/example.org\/\?a=1&amp;b=2">zwei<\/text:a><\/text:span>/) // link inside the span, or Impress drops its text
  assert.match(content, /<text:s\/><text:s text:c="1"\/>code <text:s text:c="1"\/>mit<text:tab\/>Tab/) // whitespace kept
  assert.match(content, /<text:list text:style-name="L\d+"><text:list-item>.*eins.*<text:list-item>.*zwei/) // one list for both items
  assert.match(content, /tief<\/text:span><text:line-break\/><text:span[^>]*>umbrochen/) // soft break inside the paragraph
  assert.match(content, /text:bullet-char="◦"><style:list-level-properties text:space-before="14.00pt"/) // nested level
  assert.match(content, /<text:list-item text:start-value="6">.*sechs.*<text:list-item>.*sieben/) // one list from 6 on
  assert.match(content, /fo:line-height="18.00pt"/) // exact line height
  assert.match(content, /fo:border-top="1.00pt solid #000000" fo:border-right="2.00pt dotted #FF0000"/) // cell line styles
  assert.match(content, /fo:margin-left="12.00pt"/) // inset paragraph
  assert.match(content, /style:text-underline-style="dash" style:text-underline-width="auto" style:text-underline-color="#334455"/)
  assert.match(content, /draw:opacity="70%"/)
  assert.match(content, /fo:font-size="9.00pt"/) // box options apply to plain strings
  assert.match(content, /<presentation:notes>.*Notiz/)
  assert.match(content, /<table:table-cell [^>]*>.*>A</)
  assert.match(styles, /<style:master-page style:name="bg-1"/)
  assert.match(styles, /draw:fill-image draw:name="bg1" xlink:href="Pictures\/img1.png"/)
  assert.equal(Object.keys(zip.files).filter(p => p.startsWith('Pictures/') && !p.endsWith('/')).length, 1) // same picture stored once
  assert.match(manifest, /Pictures\/img1.png" manifest:media-type="image\/png"/)
  // every style used in content.xml is defined in content.xml or styles.xml
  for (const [, n] of content.matchAll(/style-name="([^"]+)"/g)) assert.ok(content.includes(`style:name="${n}"`) || styles.includes(`style:name="${n}"`), n)
})

test('a nested numbered list starts at 1 and its parent list continues after it', async () => {
  const d = new OdpDoc()
  d.defineLayout({ width: 10, height: 5.633 })
  const n = (text, level, at) => ({ text, options: { bullet: { type: 'number', indent: 14, ...(at && { numberStartAt: at }) }, ...(level && { indentLevel: level }), breakLine: true } })
  d.addSlide().addText([n('drei', 0, 3), n('vier', 0, 3), n('eins', 1), n('fünf', 0, 3), { text: 'Absatz', options: { breakLine: true } }, n('neu', 0, 3)], { x: 1, y: 1, w: 5, h: 2 })
  const content = await (await JSZip.loadAsync(await (await d.write()).arrayBuffer())).file('content.xml').async('string')
  assert.deepEqual([...content.matchAll(/<text:list-item(?: text:start-value="(\d+)")?>.*?<text:span[^>]*>([^<]+)/g)].map(m => [m[2], m[1]]),
    [['drei', '3'], ['vier', undefined], ['eins', '1'], ['fünf', '5'], ['neu', '3']])
})

test('the page and notes thumbnail follow the layout (4:3, portrait)', async () => {
  const page = async (width, height) => {
    const d = new OdpDoc()
    d.defineLayout({ width, height })
    d.addSlide().addNotes('n')
    const zip = await JSZip.loadAsync(await (await d.write()).arrayBuffer())
    return [await zip.file('styles.xml').async('string'), await zip.file('content.xml').async('string')]
  }
  const [styles, content] = await page(10, 7.5)
  assert.match(styles, /fo:page-width="10.0000in" fo:page-height="7.5000in" style:print-orientation="landscape"/)
  assert.match(content, /<draw:page-thumbnail [^>]*svg:width="5.2000in" svg:height="3.9000in"/)
  assert.match((await page(5.625, 10))[0], /fo:page-width="5.6250in" fo:page-height="10.0000in" style:print-orientation="portrait"/)
})
