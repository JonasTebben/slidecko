import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { THEMES, cleanTheme, importTheme, saveTheme, deleteTheme, newThemeId, themeFile, themeIds, editorCss, slidevThemeCss, themeLayouts, isBuiltin, themeStyle } from './themes.js'

test('a theme file for a Slidev package imports with id, layouts and package', () => {
  const id = importTheme(JSON.parse(readFileSync(new URL('../import/fixtures/package.theme.json', import.meta.url), 'utf8')))
  assert.equal(id, 'pkg')
  assert.ok(themeIds(true).includes('pkg')) // other tests may have added own themes before
  assert.ok(!themeIds(false).includes('pkg'))
  assert.equal(THEMES.pkg.pkg, 'github:example/demo-theme#v1.0.0')
  assert.ok(themeLayouts('pkg').some(l => l[0] === 'quiz'))
  // own CSS nests under the theme class; base: false keeps the generic theme rules off its slides
  const css = editorCss()
  assert.match(css, /\.theme-pkg \{\n[\s\S]*& h1/)
  assert.match(css, /\.slide:not\([^)]*\.theme-pkg/)
  deleteTheme('pkg')
  assert.equal(THEMES.pkg, undefined)
})

test('a copy of a built-in theme gets its own id; untrusted values are dropped', () => {
  const id = saveTheme(newThemeId('Klar'), { ...THEMES.hell, name: 'Klar', vars: { ...THEMES.hell.vars, bg: 'red; } body { x', evil: '1' }, css: '& h1 { color: red } </style><script>' })
  assert.equal(id, 'klar')
  assert.equal(THEMES.klar.vars.bg, undefined)
  assert.equal(THEMES.klar.vars.evil, undefined)
  assert.ok(!THEMES.klar.css.includes('<'))
  assert.equal(THEMES.hell.custom, undefined) // the original stays untouched
  assert.throws(() => saveTheme('hell', THEMES.hell)) // built-in ids cannot be overwritten
  // an import never takes a built-in id
  assert.notEqual(importTheme({ id: 'hell', name: 'X' }), 'hell')
  // Slidev export: variables, generic rules and the own CSS with Slidev's layout classes
  saveTheme('klar', { name: 'Klar', vars: { accent: '#ff0000', 'accent-fg': '#000000' }, css: '&.layout-cover h1 { color: red }' })
  const out = slidevThemeCss('klar')
  assert.match(out, /--accent-fg: #fff;.*--accent-fg: #000000;/) // the theme's own value comes last and wins
  assert.match(out, /\.slidev-layout \{\n&\.cover h1/)
  assert.equal(themeFile('klar').format, 'slidecko-theme')
  assert.equal(cleanTheme({ name: '' }), null)
})

test('a plain-colour title bar becomes a gradient layer (a colour in a non-final background layer drops the whole background)', () => {
  assert.equal(themeStyle('business')['--bar'], 'linear-gradient(#0b2545, #0b2545)')
  assert.equal(themeStyle('ozean')['--bar'], 'linear-gradient(90deg, #0b2545, #0e7490)')
})

test('imported theme CSS that leaves its .theme-x block is dropped, a normal one is kept', () => {
  for (const css of ['} body{display:none} .x{', '/* { */ } body{display:none} ', '& h1 { color: red']) {
    const id = importTheme({ name: 'Evil', css })
    assert.equal(THEMES[id].css, undefined, css)
    deleteTheme(id)
  }
  const id = importTheme({ name: 'Fine', css: '& h1 { content: "}"; color: red } /* } */ &.layout-cover { & p { margin: 0 } }' })
  assert.match(THEMES[id].css, /color: red/)
  deleteTheme(id)
})

test('own CSS that would leave its theme block is kept out of the editor, the preview and storage', () => {
  const css = '& h1 { color: red } } body { display: none }'
  assert.equal(cleanTheme({ name: 'X', css }).css, undefined)
  assert.throws(() => saveTheme('leak', { name: 'Leak', css })) // the typed CSS is not dropped silently
  assert.equal(THEMES.leak, undefined)
  const id = importTheme({ name: 'Leak', css })
  assert.equal(THEMES[id].css, undefined)
  deleteTheme(id)
})

test('every file in themes/built-in is a built-in theme, and imports as an own theme too', () => {
  const { readdirSync } = require('node:fs')
  const files = readdirSync(new URL('../../themes/built-in', import.meta.url)).filter(f => f.endsWith('.theme.json'))
  assert.equal(files.length, themeIds(false).length)
  for (const f of files) {
    const th = JSON.parse(readFileSync(new URL('../../themes/built-in/' + f, import.meta.url), 'utf8'))
    assert.ok(isBuiltin(th.id) && f === `${th.id}.theme.json`, f)
    assert.deepEqual(cleanTheme(th).vars, th.vars, f) // nothing a theme file may not hold
  }
})
