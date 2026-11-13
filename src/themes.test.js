import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { THEMES, cleanTheme, importTheme, saveTheme, deleteTheme, newThemeId, themeFile, themeIds, editorCss, slidevThemeCss, themeLayouts, isBuiltin } from './themes.js'

test('JBT is no built-in theme, its file imports with id, layouts and Slidev package', () => {
  assert.equal(isBuiltin('jbt'), false)
  const id = importTheme(JSON.parse(readFileSync(new URL('../themes/jbt.theme.json', import.meta.url), 'utf8')))
  assert.equal(id, 'jbt')
  assert.deepEqual(themeIds(true), ['jbt'])
  assert.ok(!themeIds(false).includes('jbt'))
  assert.equal(THEMES.jbt.pkg, 'github:JonasTebben/jbt-theme#v1.1.1')
  assert.ok(themeLayouts('jbt').some(l => l[0] === 'quiz'))
  // own CSS nests under the theme class; base: false keeps the generic theme rules off its slides
  const css = editorCss()
  assert.match(css, /\.theme-jbt \{\n[\s\S]*&\.layout-quiz/)
  assert.match(css, /\.slide:not\(\.theme-jbt\)/)
  deleteTheme('jbt')
  assert.equal(THEMES.jbt, undefined)
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
