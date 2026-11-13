import JSZip from 'jszip'

// OpenDocument presentation (.odp, LibreOffice/OpenOffice Impress) with the subset of the
// pptxgenjs API that exportPptx.js uses, so both formats come from the same layout pass:
// defineLayout, defineSlideMaster, addSlide → addText / addImage / addShape / addTable / addNotes.
// Units as in pptxgenjs: positions in inches, font sizes, spacing and line widths in points.

const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.3"'
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const inch = v => `${(+v || 0).toFixed(4)}in`
// pptxgenjs' shadow option ({ offset in pt, opacity 0..1 }) as graphic properties; Impress' blur needs the loext namespace
// shortcut: hard-edged shadow, add loext:shadow-blur if a soft one matters
const shadow = o => (o.shadow ? `draw:shadow="visible" draw:shadow-offset-x="0in" draw:shadow-offset-y="${inch(o.shadow.offset / 72)}" draw:shadow-color="#000000" draw:shadow-opacity="${Math.round(o.shadow.opacity * 100)}%"` : 'draw:shadow="hidden"')
const pt = v => `${(+v || 0).toFixed(2)}pt`
const color = c => '#' + (c || '000000').replace('#', '')
// ODF collapses whitespace: runs of spaces and tabs must be written as elements
const textXml = s => esc(s).replace(/\t/g, '<text:tab/>').replace(/ {2,}/g, m => ` <text:s text:c="${m.length - 1}"/>`).replace(/^ /, '<text:s/>')

export class OdpDoc {
  constructor() {
    this.size = { width: 10, height: 5.625 }
    this.masters = {}
    this.slides = []
    this.styles = new Map() // "family|props" -> name
    this.images = new Map() // data URL -> package path
  }
  defineLayout({ width, height }) { this.size = { width, height } }
  defineSlideMaster(m) { this.masters[m.title] = m }
  addSlide(o) {
    const s = new OdpSlide(this, o?.masterName)
    this.slides.push(s)
    return s
  }
  style(family, props, prefix) {
    const key = family + '|' + props
    if (!this.styles.has(key)) this.styles.set(key, { name: `${prefix}${this.styles.size + 1}`, family, props })
    return this.styles.get(key).name
  }
  image(data) {
    if (!this.images.has(data)) {
      const ext = data.match(/^data:image\/(\w+)/)?.[1].replace('jpeg', 'jpg') || 'png'
      this.images.set(data, `Pictures/img${this.images.size + 1}.${ext}`)
    }
    return this.images.get(data)
  }
  fill(f) {
    if (!f || f.type === 'none') return 'draw:fill="none"'
    const c = typeof f === 'string' ? { color: f } : f
    return `draw:fill="solid" draw:fill-color="${color(c.color)}"${c.transparency ? ` draw:opacity="${100 - c.transparency}%"` : ''}`
  }

  async write() {
    const { width, height } = this.size
    const masterNames = Object.keys(this.masters)
    // master pages: background colour or picture, plus their objects (title bar image)
    const masterXml = masterNames.map(n => {
      const m = this.masters[n], bg = m.background || {}
      const dp = bg.data
        ? this.style('drawing-page', `<style:drawing-page-properties draw:fill="bitmap" draw:fill-image-name="${this.fillImage(bg.data)}" style:repeat="stretch" draw:background-size="full"/>`, 'Mdp')
        : this.style('drawing-page', `<style:drawing-page-properties draw:fill="solid" draw:fill-color="${color(bg.color || 'FFFFFF')}" draw:background-size="full"/>`, 'Mdp')
      const objs = (m.objects || []).map(o => o.image && frameImage(this, o.image)).filter(Boolean).join('')
      return `<style:master-page style:name="${esc(n)}" style:page-layout-name="PM1" draw:style-name="${dp}">${objs}</style:master-page>`
    }).join('')
    const pages = this.slides.map((s, i) => s.xml(i)).join('')
    const standard = this.style('drawing-page', '<style:drawing-page-properties draw:fill="none" draw:background-size="full"/>', 'Mdp')

    const auto = keep => [...this.styles.values()].filter(keep).map(s => `<style:style style:name="${s.name}" style:family="${s.family}">${s.props}</style:style>`).join('')
    const lists = [...this.styles.values()].filter(s => s.family === 'list').map(s => `<text:list-style style:name="${s.name}">${s.props}</text:list-style>`).join('')
    const fillImages = [...(this.fillImages || new Map())].map(([data, name]) => `<draw:fill-image draw:name="${name}" xlink:href="${this.image(data)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>`).join('')

    const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS}><office:automatic-styles>${auto(s => s.family !== 'list' && !s.name.startsWith('M'))}${lists}</office:automatic-styles><office:body><office:presentation>${pages}</office:presentation></office:body></office:document-content>`
    const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS}><office:styles>${fillImages}<style:default-style style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none"/></style:default-style></office:styles><office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0in" fo:margin-bottom="0in" fo:margin-left="0in" fo:margin-right="0in" fo:page-width="${inch(width)}" fo:page-height="${inch(height)}" style:print-orientation="${width < height ? 'portrait' : 'landscape'}"/></style:page-layout>${auto(s => s.name.startsWith('M'))}</office:automatic-styles><office:master-styles>${masterXml}<style:master-page style:name="Standard" style:page-layout-name="PM1" draw:style-name="${standard}"/></office:master-styles></office:document-styles>`
    const meta = `<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${NS}><office:meta><dc:title>${esc(this.title || '')}</dc:title><meta:generator>Slidecko</meta:generator></office:meta></office:document-meta>`

    const zip = new JSZip()
    zip.file('mimetype', 'application/vnd.oasis.opendocument.presentation', { compression: 'STORE' }) // must be first and uncompressed
    zip.file('content.xml', content)
    zip.file('styles.xml', styles)
    zip.file('meta.xml', meta)
    for (const [data, path] of this.images) zip.file(path, data.split(',')[1], { base64: true })
    zip.file('META-INF/manifest.xml', `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.presentation"/>${['content.xml', 'styles.xml', 'meta.xml'].map(p => `<manifest:file-entry manifest:full-path="${p}" manifest:media-type="text/xml"/>`).join('')}${[...this.images.entries()].map(([d, p]) => `<manifest:file-entry manifest:full-path="${p}" manifest:media-type="${d.match(/^data:([^;,]+)/)[1]}"/>`).join('')}</manifest:manifest>`)
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.presentation' })
  }
  // master page styles (names starting with "M") live in styles.xml, all others in content.xml
  fillImage(data) {
    this.fillImages ||= new Map()
    if (!this.fillImages.has(data)) this.fillImages.set(data, `bg${this.fillImages.size + 1}`)
    return this.fillImages.get(data)
  }
}

function frameImage(doc, { data, x, y, w, h }) {
  return `<draw:frame draw:style-name="${doc.style('graphic', '<style:graphic-properties draw:stroke="none" draw:fill="none"/>', 'Mgr')}" svg:x="${inch(x)}" svg:y="${inch(y)}" svg:width="${inch(w)}" svg:height="${inch(h)}"><draw:image xlink:href="${doc.image(data)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`
}

class OdpSlide {
  constructor(doc, master) {
    this.doc = doc
    this.master = master
    this.items = []
    this.notes = ''
  }
  addNotes(t) { this.notes = t }
  addImage(o) { this.items.push(`<draw:frame draw:style-name="${this.doc.style('graphic', `<style:graphic-properties draw:stroke="none" draw:fill="none" ${shadow(o)}/>`, 'gr')}" svg:x="${inch(o.x)}" svg:y="${inch(o.y)}" svg:width="${inch(o.w)}" svg:height="${inch(o.h)}"><draw:image xlink:href="${this.doc.image(o.data)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`) }

  addShape(kind, o) {
    const d = this.doc
    const stroke = o.line && o.line.type !== 'none' && o.line.color ? `draw:stroke="solid" svg:stroke-color="${color(o.line.color)}" svg:stroke-width="${pt(o.line.width || 1)}"` : 'draw:stroke="none"'
    const st = d.style('graphic', `<style:graphic-properties ${stroke} ${kind === 'line' ? 'draw:fill="none"' : d.fill(o.fill)} ${shadow(o)}/>`, 'gr')
    const pos = `svg:x="${inch(o.x)}" svg:y="${inch(o.y)}" svg:width="${inch(o.w)}" svg:height="${inch(o.h)}"`
    const poly = pts => `<draw:polygon draw:style-name="${st}" ${pos} svg:viewBox="0 0 1000 1000" draw:points="${pts}"/>`
    if (kind === 'line') this.items.push(`<draw:line draw:style-name="${st}" svg:x1="${inch(o.x)}" svg:y1="${inch(o.y)}" svg:x2="${inch(o.x + o.w)}" svg:y2="${inch(o.y + o.h)}"/>`)
    else if (kind === 'ellipse') this.items.push(`<draw:ellipse draw:style-name="${st}" ${pos}/>`)
    else if (kind === 'triangle') this.items.push(poly('500,0 1000,1000 0,1000'))
    else if (kind === 'rightArrow') this.items.push(poly('0,250 620,250 620,0 1000,500 620,1000 620,750 0,750'))
    else this.items.push(`<draw:rect draw:style-name="${st}" ${pos}${o.rectRadius ? ` draw:corner-radius="${inch(o.rectRadius)}"` : ''}/>`)
  }

  // runs as in pptxgenjs: a run with breakLine ends its paragraph; paragraph options come from its first run
  paragraphs(runs, box = {}) {
    const paras = [[]]
    // plain string: the box options carry the font (as in pptxgenjs)
    for (const r of typeof runs === 'string' ? [{ text: runs, options: box }] : runs) {
      paras.at(-1).push(r)
      if (r.options?.breakLine) paras.push([])
    }
    if (!paras.at(-1).length) paras.pop()
    return paras
  }
  paraXml(runs, align, box) {
    const d = this.doc
    let out = '', list = null // consecutive list items share one <text:list>
    // numbering per list (key -> {level, n}) like PowerPoint: survives a nested list, ends at a plain paragraph
    const counts = new Map()
    const close = () => { if (list) { out += '</text:list>'; list = null } }
    for (const p of this.paragraphs(runs, box)) {
      const o = p[0]?.options || {}
      const b = o.bullet
      const inset = b && b.characterCode === '200B' ? b.indent : 0
      const pStyle = d.style('paragraph', `<style:paragraph-properties fo:text-align="${align === 'center' ? 'center' : align === 'right' ? 'end' : align === 'justify' ? 'justify' : 'start'}" fo:margin-top="${pt(o.paraSpaceBefore)}" fo:margin-bottom="${pt(o.paraSpaceAfter)}"${o.lineSpacing ? ` fo:line-height="${pt(o.lineSpacing)}"` : ''} ${b && !inset ? '' : ` fo:margin-left="${pt(inset)}" fo:text-indent="0pt"`}/>`, 'P')
      const spans = p.map((r, i) => {
        const ro = r.options || {}
        if (i && ro.softBreakBefore) return '<text:line-break/>' + span(r, ro)
        return span(r, ro)
      }).join('')
      function span(r, ro) {
        const ts = d.style('text', `<style:text-properties fo:color="${color(ro.color)}" fo:font-size="${pt(ro.fontSize || 18)}" fo:font-family="'${esc(ro.fontFace || 'Arial')}'" style:font-family-generic="swiss" fo:font-weight="${ro.bold ? 'bold' : 'normal'}" fo:font-style="${ro.italic ? 'italic' : 'normal'}"${ro.underline ? ` style:text-underline-style="${{ dash: 'dash', dotted: 'dotted' }[ro.underline.style] || 'solid'}" style:text-underline-width="auto" style:text-underline-color="${ro.underline.color ? color(ro.underline.color) : 'font-color'}"` : ''}${ro.strike ? ' style:text-line-through-style="solid"' : ''}${ro.highlight ? ` fo:background-color="${color(ro.highlight)}"` : ''}${ro.charSpacing ? ` fo:letter-spacing="${pt(ro.charSpacing)}"` : ''}/>`, 'T')
        // the link goes inside the span: Impress drops the text of a <text:a> wrapped around a span
        const text = ro.hyperlink?.url ? `<text:a xlink:type="simple" xlink:href="${esc(ro.hyperlink.url)}">${textXml(r.text)}</text:a>` : textXml(r.text)
        return `<text:span text:style-name="${ts}">${text}</text:span>`
      }
      const para = `<text:p text:style-name="${pStyle}">${spans}</text:p>`
      if (b && !inset) {
        const kind = b.type === 'number' ? 'number' : 'bullet'
        // Impress's own list form: label width = indent, bullet in the paragraph's font
        const props = `<style:list-level-properties text:space-before="${pt(b.indent * (o.indentLevel || 0))}" text:min-label-width="${pt(b.indent)}"/>`
        // own marker (◦ ▪ of nested lists) at text size; the disc is OpenSymbol's ● scaled down
        const char = b.characterCode ? String.fromCodePoint(parseInt(b.characterCode, 16)) : null
        const sym = kind === 'number' || char ? '<style:text-properties fo:font-size="100%" style:use-window-font-color="true"/>' : '<style:text-properties fo:font-family="OpenSymbol" style:use-window-font-color="true" fo:font-size="45%"/>'
        const ls = d.style('list', kind === 'number'
          ? `<text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix=".">${props}${sym}</text:list-level-style-number>`
          : `<text:list-level-style-bullet text:level="1" text:bullet-char="${char || '●'}">${props}${sym}</text:list-level-style-bullet>`, 'L')
        const level = o.indentLevel || 0, key = ls + '#' + (b.numberStartAt || 1) // another start = another list
        for (const [k, c] of counts) if (c.level > level) counts.delete(k) // a deeper list ends with its parent's next item
        const c = counts.get(key) || { level, n: 0 }
        counts.set(key, c)
        const first = list !== key
        if (first) { close(); out += `<text:list text:style-name="${ls}">`; list = key }
        // Impress would continue a nested list's numbers from its parent: every number list states its start
        out += `<text:list-item${first && kind === 'number' ? ` text:start-value="${(b.numberStartAt || 1) + c.n}"` : ''}>${para}</text:list-item>`
        c.n++
      } else {
        close()
        counts.clear()
        out += para
      }
    }
    close()
    return out
  }

  addText(runs, o) {
    const d = this.doc
    const m = (o.margin || 0) + 'pt'
    // Impress text frames always wrap: unwrapped text (code) gets its fill as a rectangle behind
    // and a frame wide enough for its longest line
    const nowrap = o.wrap === false && o.align !== 'center' && o.align !== 'right'
    if (nowrap && o.fill) this.addShape('rect', { x: o.x, y: o.y, w: o.w, h: o.h, fill: o.fill, shadow: o.shadow })
    const st = d.style('graphic', `<style:graphic-properties draw:stroke="none" ${nowrap ? 'draw:fill="none"' : d.fill(o.fill)} ${nowrap && o.fill ? '' : shadow(o)} draw:textarea-vertical-align="${['middle', 'bottom'].includes(o.valign) ? o.valign : 'top'}" draw:auto-grow-height="false" draw:auto-grow-width="false" fo:padding-top="${m}" fo:padding-bottom="${m}" fo:padding-left="${m}" fo:padding-right="${m}"/>`, 'gr')
    this.items.push(`<draw:frame draw:style-name="${st}" svg:x="${inch(o.x)}" svg:y="${inch(o.y)}" svg:width="${inch(nowrap ? o.w + 10 : o.w)}" svg:height="${inch(o.h)}"><draw:text-box>${this.paraXml(runs, o.align, o)}</draw:text-box></draw:frame>`)
  }

  addTable(rows, o) {
    const d = this.doc
    const cols = o.colW.map(w => `<table:table-column table:style-name="${d.style('table-column', `<style:table-column-properties style:column-width="${inch(w)}"/>`, 'co')}"/>`).join('')
    const body = rows.map((r, i) => `<table:table-row table:style-name="${d.style('table-row', `<style:table-row-properties style:row-height="${inch(o.rowH[i])}"/>`, 'ro')}">${r.map(c => {
      const co = c.options || {}, [t, rr, b, l] = co.margin || [0, 0, 0, 0]
      const side = s => (s && s.type !== 'none' ? `${pt(s.pt)} ${/^(dashed|dotted|double)$/.test(s.css) ? s.css : 'solid'} ${color(s.color)}` : 'none')
      const [bt, br, bb, bl] = co.border || []
      const cs = d.style('table-cell', `<style:graphic-properties ${d.fill(co.fill)} draw:textarea-vertical-align="${co.valign === 'middle' ? 'middle' : 'top'}" fo:padding-top="${pt(t)}" fo:padding-right="${pt(rr)}" fo:padding-bottom="${pt(b)}" fo:padding-left="${pt(l)}"/><style:paragraph-properties fo:border-top="${side(bt)}" fo:border-right="${side(br)}" fo:border-bottom="${side(bb)}" fo:border-left="${side(bl)}"/>`, 'ce')
      return `<table:table-cell table:style-name="${cs}">${c.text ? this.paraXml(c.text, co.align) : '<text:p/>'}</table:table-cell>`
    }).join('')}</table:table-row>`).join('')
    const h = o.rowH.reduce((a, b) => a + b, 0)
    this.items.push(`<draw:frame svg:x="${inch(o.x)}" svg:y="${inch(o.y)}" svg:width="${inch(o.w)}" svg:height="${inch(h)}"><table:table>${cols}${body}</table:table></draw:frame>`)
  }

  xml(i) {
    const d = this.doc
    const bg = this.background?.color
    const dp = bg ? ` draw:style-name="${d.style('drawing-page', `<style:drawing-page-properties draw:fill="solid" draw:fill-color="${color(bg)}" draw:background-size="full" presentation:background-visible="true" presentation:background-objects-visible="true"/>`, 'dp')}"` : ''
    const r = d.size.height / d.size.width, th = Math.min(3.9, 6.5 * r) // thumbnail in the slide's ratio, above the notes at 4.8in
    const notes = this.notes ? `<presentation:notes><draw:page-thumbnail svg:x="1in" svg:y="0.8in" svg:width="${inch(th / r)}" svg:height="${inch(th)}" draw:page-number="${i + 1}" presentation:class="page"/><draw:frame presentation:class="notes" svg:x="0.8in" svg:y="4.8in" svg:width="6.9in" svg:height="4.4in"><draw:text-box>${this.notes.split('\n').map(l => `<text:p>${textXml(l)}</text:p>`).join('')}</draw:text-box></draw:frame></presentation:notes>` : ''
    return `<draw:page draw:name="Folie ${i + 1}" draw:master-page-name="${esc(this.master || 'Standard')}"${dp}>${this.items.join('')}${notes}</draw:page>`
  }
}
