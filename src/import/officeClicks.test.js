import { clickTiming } from '../export/pptxFix.js'
import { clickAnimations } from '../export/exportOdp.js'
import { officeClicks, applyClicks } from './officeClicks.js'

// what Slidecko's own exports write is read back; elements of a slide: object 2 on click 1, objects 3 and 4 on click 2, 3 gone on 3
const clicks = [{ objs: [0], click: 1 }, { objs: [1], click: 2, until: 3 }, { objs: [2], click: 2 }]
test('PowerPoint click animations are read back per object', () => {
  const xml = '<p:cNvPr id="1"/>' + ['2', '3', '4'].map(id => `<p:cNvPr id="${id}"/>`).join('') + clickTiming('<p:cNvPr id="1"/><p:cNvPr id="2"/><p:cNvPr id="3"/><p:cNvPr id="4"/>', clicks)
  expect(officeClicks(xml, 'pptx')).toEqual({ 2: { click: 1 }, 3: { click: 2, until: 3 }, 4: { click: 2 } })
})
test('Impress click animations are read back per object', () => {
  expect(officeClicks(clickAnimations(clicks, k => `o${k}`), 'odp')).toEqual({ o0: { click: 1 }, o1: { click: 2, until: 3 }, o2: { click: 2 } })
})
test('effects before the first click and emphasis are left out; group ids reach their parts', () => {
  const xml = '<p:cTn presetClass="entr" nodeType="withEffect"><p:spTgt spid="5"/></p:cTn><p:cTn presetClass="emph" nodeType="clickEffect"><p:spTgt spid="6"/></p:cTn><p:cTn presetClass="entr" nodeType="afterEffect"><p:spTgt spid="7"/></p:cTn>'
  expect(officeClicks(xml, 'pptx')).toEqual({ 7: { click: 1 } })
  expect(applyClicks([{ type: 'text', ids: ['9', '7'] }, { type: 'shape', ids: ['8'] }], { 7: { click: 1 } })).toEqual([{ type: 'text', click: 1 }, { type: 'shape' }])
})
test('entrance effects (fly in from left, right, bottom, zoom) go out as PowerPoint and Impress presets and come back', () => {
  const fx = ['fly-left', 'fly-right', 'fly-up', 'zoom']
  const withFx = fx.map((effect, k) => ({ objs: [k], click: k + 1, effect }))
  const xml = clickTiming('<p:cNvPr id="1"/>' + fx.map((_, k) => `<p:cNvPr id="${k + 2}"/>`).join(''), withFx)
  expect(Object.values(officeClicks(xml, 'pptx')).map(o => o.effect)).toEqual(fx)
  expect(Object.values(officeClicks(clickAnimations(withFx, k => `o${k}`), 'odp')).map(o => o.effect)).toEqual(fx)
  const ids = [...xml.matchAll(/cTn id="(\d+)"/g)].map(m => m[1])
  expect(new Set(ids).size).toBe(ids.length)
})
