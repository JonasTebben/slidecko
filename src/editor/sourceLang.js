// Slidev Markdown for the source editor: `---` always separates slides (also right under text, where
// Markdown would make the line above a heading) and a `key: value` block after it is the slide's frontmatter.
import { tags } from '@lezer/highlight'

const SEP = /^---\s*$/, KEY = /^([\w-]+)(:)(.*)$/

export const slidev = {
  defineNodes: [
    { name: 'SlideSeparator', block: true, style: tags.contentSeparator },
    { name: 'SlideFrontmatter', block: true },
    { name: 'FmMark', style: tags.contentSeparator },
    { name: 'FmKey', style: tags.propertyName },
    { name: 'FmValue', style: tags.string },
    { name: 'FmText', style: tags.meta },
  ],
  parseBlock: [{
    name: 'SlideFrontmatter',
    before: 'HorizontalRule',
    parse(cx, line) {
      if (!SEP.test(line.text) || line.indent) return false
      const start = cx.lineStart, kids = [cx.elt('FmMark', start, start + 3)]
      if (!KEY.test(cx.peekLine())) { // a plain separator
        cx.nextLine()
        cx.addElement(cx.elt('SlideSeparator', start, start + 3, kids))
        return true
      }
      // shortcut: an unclosed block runs to the end of the file, like Slidev's own parser would not; good enough for colours
      while (cx.nextLine()) {
        const from = cx.lineStart, text = line.text
        if (SEP.test(text)) {
          kids.push(cx.elt('FmMark', from, from + 3))
          cx.nextLine()
          break
        }
        const m = text.match(KEY)
        if (m) kids.push(cx.elt('FmKey', from, from + m[1].length), cx.elt('FmValue', from + m[1].length + 1, from + text.length))
        else if (text.trim()) kids.push(cx.elt('FmText', from, from + text.length))
      }
      cx.addElement(cx.elt('SlideFrontmatter', start, kids.at(-1).to, kids))
      return true
    },
    // `---` ends a paragraph instead of turning it into a heading
    endLeaf: (cx, line) => SEP.test(line.text) && !line.indent,
  }],
}
