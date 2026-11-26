// A PowerPoint chart part (ppt/charts/chartN.xml, DrawingML) -> the data of an editable chart element, or null for
// kinds the editor lacks (scatter, radar, combined charts …: their fallback picture is used). Read from the XML text.
const KIND = { barChart: 'bar', bar3DChart: 'bar', lineChart: 'line', line3DChart: 'line', areaChart: 'line', pieChart: 'pie', pie3DChart: 'pie', doughnutChart: 'donut' }
const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const val = (x, tag) => x?.match(new RegExp(`<c:${tag} val="([^"]*)"`))?.[1]
// the points of a c:cat or c:val block, by index (cached values: strCache/numCache)
const points = (block, n) => {
  const out = Array(n).fill('')
  for (const [, i, v] of block?.matchAll(/<c:pt idx="(\d+)"[^>]*>\s*<c:v>([^<]*)<\/c:v>/g) || []) if (+i < n) out[+i] = unxml(v)
  return out
}
const colour = x => x?.match(/<c:spPr>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"/)?.[1]
export function officeChart(xml) {
  const plot = xml.match(/<c:plotArea>[\s\S]*<\/c:plotArea>/)?.[0]
  const types = [...(plot?.matchAll(/<c:(\w+Chart)>/g) || [])].map(m => m[1])
  if (types.length !== 1 || !KIND[types[0]]) return null
  let kind = KIND[types[0]]
  if (kind === 'bar' && val(plot, 'barDir') !== 'bar') kind = 'column'
  const sers = [...plot.matchAll(/<c:ser>[\s\S]*?<\/c:ser>/g)].map(m => m[0])
  if (!sers.length) return null
  const n = +sers[0].match(/<c:cat>[\s\S]*?<c:ptCount val="(\d+)"/)?.[1] || +sers[0].match(/<c:val>[\s\S]*?<c:ptCount val="(\d+)"/)?.[1] || 0
  const categories = points(sers[0].match(/<c:cat>[\s\S]*?<\/c:cat>/)?.[0], n).map((c, i) => c || String(i + 1))
  const series = sers.map((s, i) => {
    const own = s.replace(/<c:dPt>[\s\S]*?<\/c:dPt>/g, '')
    const c = colour(own.replace(/<c:(cat|val|tx)>[\s\S]*?<\/c:\1>/g, ''))
    return { name: unxml(s.match(/<c:tx>[\s\S]*?<c:v>([^<]*)<\/c:v>/)?.[1] || `Series ${i + 1}`), values: points(s.match(/<c:val>[\s\S]*?<\/c:val>/)?.[0], n).map(v => +v || 0), ...(c && { color: '#' + c }) }
  })
  const pie = kind === 'pie' || kind === 'donut'
  // a pie's slices take their colours from its data points
  const slices = !pie ? [] : categories.map((_, j) => sers[0].match(new RegExp(`<c:dPt>\\s*<c:idx val="${j}"/>[\\s\\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"[\\s\\S]*?</c:dPt>`))?.[1])
  const grouping = val(plot, 'grouping'), ax = plot.match(/<c:valAx>[\s\S]*?<\/c:valAx>/)?.[0]
  const title = [...(xml.match(/<c:title>[\s\S]*?<\/c:title>/)?.[0].matchAll(/<a:t>([^<]*)<\/a:t>/g) || [])].map(m => unxml(m[1])).join('')
  return {
    kind, categories, series: pie ? series.slice(0, 1) : series, legend: /<c:legend>/.test(xml),
    ...(/<c:showVal val="1"/.test(plot) && { values: true }), ...(/stacked/i.test(grouping || '') && !pie && { stacked: true }),
    ...(slices?.some(Boolean) && { catColors: slices.map(c => (c ? '#' + c : null)) }), ...(title && { title }),
    ...(val(ax, 'min') != null && { min: +val(ax, 'min') }), ...(val(ax, 'max') != null && { max: +val(ax, 'max') }),
  }
}
