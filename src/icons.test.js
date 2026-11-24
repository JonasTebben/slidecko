import assert from 'node:assert/strict'
import { iconTags, iconTag, iconSvg, iconStyle, readIconStyle, getIcon, searchIcons, loadSet, iconIn } from './icons.js'

const el = { icon: 'mdi:account-circle', body: '<path fill="currentColor" d="M0 0h24v24z"/>', view: '0 0 24 24' }

test('Slidev icon tags of bundled sets become placeholders, in every spelling Slidev accepts', () => {
  for (const tag of ['<mdi-account-circle />', '<mdi-account-circle/>', '<mdi:account-circle />', '<i-mdi-account-circle />', '<mdi-account-circle></mdi-account-circle>'])
    assert.match(iconTags(tag), /^<div data-icon="mdi:account-circle" style="display:inline-block;[^"]*"><\/div>$/, tag)
  const out = iconTags('<carbon-logo-github class="text-4xl" style="color:red" aria-label="GitHub" />')
  assert.match(out, /data-icon="carbon:logo-github" class="text-4xl" data-label="GitHub" style="[^"]*color:red"/)
})
test('other components, inline icons and fenced code stay as written', () => {
  for (const md of ['<v-click />', '<Youtube id="x" />', '<foo-bar />', 'Star us <mdi-github /> today', '```html\n<mdi-home />\n```'])
    assert.equal(iconTags(md), md)
})
test('the Slidev tag carries colour (accent when unset), turns, flips and the label', () => {
  assert.equal(iconTag(el), '<mdi-account-circle style="width:100%;height:100%;color:var(--accent, var(--slidev-theme-primary))" aria-hidden="true" />')
  assert.match(iconTag({ ...el, color: '#dc2626', rotate: 1, flip: 'h', label: 'A "user"' }), /style="width:100%;height:100%;color:#dc2626;transform:rotate\(90deg\) scaleX\(-1\)" role="img" aria-label="A &quot;user&quot;"/)
})
test('the style written for Slidev reads back the same', () => {
  const css = s => Object.fromEntries(s.split(';').map(d => d.split(':')).map(([k, ...v]) => [k, v.join(':')]))
  const back = e => readIconStyle({ color: '', transform: '', ...css(iconStyle(e)) })
  assert.deepEqual(back(el), { color: undefined })
  assert.deepEqual(back({ ...el, color: '#16a34a', rotate: 3, flip: 'hv' }), { color: '#16a34a', rotate: 3, flip: 'hv' })
  assert.deepEqual(readIconStyle({ color: '', transform: '' }), { color: 'currentColor' }) // a plain Slidev icon has the text colour
})
test('the SVG bakes in turns and flips, swaps the sides of a quarter turn and is hidden unless labelled', () => {
  assert.match(iconSvg(el), /viewBox="0 0 24 24" aria-hidden="true"><g>/)
  const s = iconSvg({ ...el, view: '0 0 20 10', rotate: 1, flip: 'v', label: 'x<y' }, { color: '#ff0000', width: 40, height: 20 })
  assert.match(s, /width="40" height="20" viewBox="5 -5 10 20" role="img" aria-label="x&lt;y"><title>x&lt;y<\/title><g transform="rotate\(90 10 5\) translate\(10 5\) scale\(1 -1\) translate\(-10 -5\)">/)
  assert.ok(s.includes('fill="#ff0000"') && !s.includes('currentColor'))
})
test('icons are found by name and alias, unknown names and sets give null', async () => {
  const home = await getIcon('mdi:home')
  assert.equal(home.view, '0 0 24 24')
  assert.match(home.body, /^<path/)
  assert.equal((await getIcon('tabler:123')).body, iconIn(await loadSet('tabler'), 'number-123').body) // an alias
  assert.equal(await getIcon('mdi:no-such-icon'), null)
  assert.equal(await getIcon('logos:vue'), null)
  const hits = searchIcons(await loadSet('lucide'), 'arrow right')
  assert.equal(hits[0], 'arrow-right')
  assert.ok(hits.every(n => n.includes('arrow') && n.includes('right')))
})
