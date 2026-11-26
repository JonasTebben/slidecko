import { parseRange } from './range.js'

test('an export range reads single slides, ranges and open ends, and refuses what does not exist', () => {
  expect(parseRange('', 10)).toEqual([])
  expect(parseRange('1, 6-8,10', 10)).toEqual([0, 5, 6, 7, 9])
  expect(parseRange('3–4 2', 10)).toEqual([1, 2, 3])
  expect(parseRange('8-', 10)).toEqual([7, 8, 9])
  for (const bad of ['0', '11', '5-3', 'a', '2-x']) expect(parseRange(bad, 10)).toBeNull()
})
