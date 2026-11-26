import { iosSafari } from './install.js'

test('the Add to Home Screen steps are for Safari on iPhone and iPad only', () => {
  const touch = { maxTouchPoints: 5 }, mouse = { maxTouchPoints: 0 }
  const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  expect(iosSafari(safari, touch)).toBe(true)
  expect(iosSafari('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', touch)).toBe(true) // iPad (desktop site)
  expect(iosSafari('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', mouse)).toBe(false) // a Mac
  expect(iosSafari(safari.replace('Version/18.0', 'CriOS/131.0'), touch)).toBe(false) // Chrome on iOS
  expect(iosSafari(safari.replace('Version/18.0', 'FxiOS/133.0'), touch)).toBe(false)
  expect(iosSafari('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36', touch)).toBe(false)
})
