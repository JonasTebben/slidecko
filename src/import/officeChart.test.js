import { officeChart } from './officeChart.js'

const ser = (i, name, vals, color) => `<c:ser><c:idx val="${i}"/><c:tx><c:strRef><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${name}</c:v></c:pt></c:strCache></c:strRef></c:tx><c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr>`
  + `<c:cat><c:strRef><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v>A &amp; B</c:v></c:pt><c:pt idx="1"><c:v>C</c:v></c:pt></c:strCache></c:strRef></c:cat>`
  + `<c:val><c:numRef><c:numCache><c:ptCount val="2"/><c:pt idx="0"><c:v>${vals[0]}</c:v></c:pt><c:pt idx="1"><c:v>${vals[1]}</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser>`

test('a PowerPoint column chart becomes an editable chart', () => {
  const xml = `<c:chartSpace><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Sales</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:barDir val="col"/><c:grouping val="stacked"/>${ser(0, 'S1', [1, 3], '112233')}${ser(1, 'S2', [2, 4.5], 'AABBCC')}<c:dLbls><c:showVal val="1"/></c:dLbls></c:barChart><c:valAx><c:scaling><c:min val="0"/></c:scaling></c:valAx></c:plotArea><c:legend><c:legendPos val="b"/></c:legend></c:chart></c:chartSpace>`
  expect(officeChart(xml)).toEqual({ kind: 'column', categories: ['A & B', 'C'], series: [{ name: 'S1', values: [1, 3], color: '#112233' }, { name: 'S2', values: [2, 4.5], color: '#AABBCC' }], legend: true, values: true, stacked: true, title: 'Sales', min: 0 })
})
test('pie slices keep their colours; unknown and combined kinds are left to the picture', () => {
  const pie = ser(0, 'P', [5, 6], '000000').replace('<c:cat>', '<c:dPt><c:idx val="1"/><c:spPr><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></c:spPr></c:dPt><c:cat>')
  expect(officeChart(`<c:plotArea><c:pieChart>${pie}</c:pieChart></c:plotArea>`)).toMatchObject({ kind: 'pie', legend: false, catColors: [null, '#FF0000'] })
  expect(officeChart('<c:plotArea><c:scatterChart></c:scatterChart></c:plotArea>')).toBe(null)
  expect(officeChart('<c:plotArea><c:barChart></c:barChart><c:lineChart></c:lineChart></c:plotArea>')).toBe(null)
})
