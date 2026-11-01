import assert from 'node:assert/strict'
import test from 'node:test'
import { findWebFullscreenControl, mountPlayerPosition, needsPlayerPosition } from './behavior'

test('leaves platform positioning alone when most of the player is already visible', () => {
  assert.equal(needsPlayerPosition({ top: 60, bottom: 660, height: 600 }, 800), false)
  assert.equal(needsPlayerPosition({ top: 750, bottom: 1350, height: 600 }, 800), true)
  assert.equal(needsPlayerPosition({ top: -700, bottom: -100, height: 600 }, 800), true)
  assert.equal(needsPlayerPosition({ top: 0, bottom: 1000, height: 1000 }, 800), false)
})

test('targets the webpage icon child that bubbles through the real click handler', () => {
  const icon = {}
  const wrapper = {
    querySelectorAll: () => [{ getAttribute: () => 'M12 5C9.48178 rest of webpage icon' }],
    querySelector: () => icon,
  }
  const player = { querySelector: () => null, querySelectorAll: () => [wrapper] }
  assert.equal(findWebFullscreenControl(player), icon)
})

for (const delay of [6000, Infinity]) {
  test(`waits for lazy controls with a bounded deadline (${delay}ms)`, t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 })
    const startedAt = Date.now()
    let web = false
    let clicks = 0
    let reveals = 0
    class FakeElement extends EventTarget {
      isConnected = true
      getBoundingClientRect() { return { top: 60, bottom: 660, left: 0, width: 800, height: 600 } }
      querySelector(selector) {
        if (selector.startsWith('[title=')) {
          return Date.now() - startedAt >= delay ? control : null
        }
        return this
      }
      querySelectorAll() { return [] }
    }
    const player = new FakeElement()
    player.addEventListener('mousemove', () => { reveals += 1 })
    const control = { click() { clicks += 1; web = true } }
    const globals = {
      Element: FakeElement,
      HTMLIFrameElement: class extends FakeElement {},
      MouseEvent: class extends Event {},
      MutationObserver: class { observe() {} disconnect() {} },
    }
    const original = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
    Object.assign(globalThis, globals)
    t.after(() => original.forEach((descriptor, key) => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }))
    const window = Object.assign(new EventTarget(), {
      location: { pathname: '/7777' }, innerHeight: 800,
      requestAnimationFrame: callback => setTimeout(callback, 1),
      cancelAnimationFrame: clearTimeout, setTimeout,
    })
    const document = {
      defaultView: window,
      body: { classList: { contains: () => web } },
      querySelector: () => player,
    }
    const dispose = mountPlayerPosition(document, {
      autoPosition: true, rememberWebFullscreen: true,
      readMode: () => true, saveMode: () => {},
    })
    t.after(dispose)
    t.mock.method(console, 'warn', () => {})
    for (let index = 0; index < 40; index += 1) t.mock.timers.tick(500)
    assert.equal(clicks, delay === Infinity ? 0 : 1)
    assert.equal(web, delay !== Infinity)
    const completedReveals = reveals
    t.mock.timers.tick(60000)
    assert.equal(reveals, completedReveals)
  })
}
