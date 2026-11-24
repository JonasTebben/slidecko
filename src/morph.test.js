import assert from 'node:assert/strict'
import { morphPairs } from './morph.js'

const el = (id, o) => ({ id, type: 'text', x: 0, y: 0, w: 100, h: 40, ...o })

test('elements pair by name, by the duplicate key, then by type and content', () => {
  const a = [el('t', { html: '<h1>Hello</h1>' }), el('img', { type: 'image', asset: 'x' }), el('box', { type: 'shape', shape: 'rect' }), el('n', { morph: 'logo', html: 'A' }), el('d', { mid: 'k', html: 'old' }), el('gone', { html: 'bye' })]
  const b = [el('t2', { html: '<p>Hello </p>', x: 500 }), el('img2', { type: 'image', asset: 'x', w: 300 }), el('box2', { type: 'shape', shape: 'rect', fill: '#f00' }), el('n2', { morph: 'logo', type: 'image', asset: 'y' }), el('d2', { mid: 'k', html: 'new' }), el('new', { html: 'hi' })]
  assert.deepEqual(morphPairs(a, b).sort(), [['box', 'box2'], ['d', 'd2'], ['img', 'img2'], ['n', 'n2'], ['t', 't2']])
})

test('the nearest of equal elements pairs first, a named one only by its name', () => {
  const a = [el('l', { type: 'shape', shape: 'ellipse', x: 0 }), el('r', { type: 'shape', shape: 'ellipse', x: 800 })]
  const b = [el('r2', { type: 'shape', shape: 'ellipse', x: 700 }), el('l2', { type: 'shape', shape: 'ellipse', x: 100 })]
  assert.deepEqual(morphPairs(a, b).sort(), [['l', 'l2'], ['r', 'r2']])
  assert.deepEqual(morphPairs([el('a', { html: 'x', morph: 'one' })], [el('b', { html: 'x' })]), [])
  assert.deepEqual(morphPairs([el('a', { type: 'shape', shape: 'rect' })], [el('b', { type: 'shape', shape: 'ellipse' })]), [])
  assert.deepEqual(morphPairs(undefined, []), [])
})

test('the HTML export can embed the functions as source', () => {
  const copy = new Function(`return ${morphPairs}`)()
  assert.deepEqual(copy([el('a', { html: 'x' })], [el('b', { html: 'x' })]), [['a', 'b']])
})
