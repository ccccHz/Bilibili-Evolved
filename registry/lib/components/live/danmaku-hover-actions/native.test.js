import assert from 'node:assert/strict'
import test from 'node:test'
import { pauseNativeItem, createNativeHover } from './native'

const fixture = () => {
  let time = 0
  let entered = 0
  let left = 0
  const item = {
    textData: { mode: 1 }, isHover: false, endTime: 2,
    mouseEnter() { this.isHover = true; entered++ },
    mouseLeave() { this.isHover = false; this.endTime += time; left++ },
  }
  const prototype = { shouldDestroy() { return time >= this.endTime } }
  Object.setPrototypeOf(item, prototype)
  return { item, prototype, advance: t => { time = t }, counts: () => ({ entered, left }) }
}
test('retains only the selected object past expiry, then resumes with native time compensation', () => {
  const f = fixture()
  const release = pauseNativeItem(f.item, () => true)
  f.advance(12)
  assert.equal(f.item.shouldDestroy(), false)
  assert.equal(f.prototype.shouldDestroy.call(f.item), true)
  release()
  release()
  assert.equal(f.item.endTime, 14)
  assert.equal(Object.hasOwn(f.item, 'shouldDestroy'), false)
  assert.deepEqual(f.counts(), { entered: 1, left: 1 })
  f.advance(15)
  assert.equal(f.item.shouldDestroy(), true)
})
test('never calls resume on a recycled object and restores an existing own descriptor', () => {
  const f = fixture()
  Object.defineProperty(f.item, 'shouldDestroy', { value: () => true, writable: true, configurable: true })
  const descriptor = Object.getOwnPropertyDescriptor(f.item, 'shouldDestroy')
  const release = pauseNativeItem(f.item, () => false)
  release()
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.item, 'shouldDestroy'), descriptor)
  assert.deepEqual(f.counts(), { entered: 1, left: 0 })
})
test('leaves fixed and unsupported modes to the existing snapshot path', () => {
  for (const mode of [4, 5, 7]) {
    const f = fixture()
    f.item.textData.mode = mode
    assert.equal(pauseNativeItem(f.item, () => true), null)
    assert.deepEqual(f.counts(), { entered: 0, left: 0 })
  }
})

test('captures once, forwards the native message, and restores the prototype on capture or unload', () => {
  const savedWindow = globalThis.window
  const timers = new Map()
  let id = 0
  globalThis.window = {
    setTimeout(fn) { timers.set(++id, fn); return id },
    clearTimeout(key) { timers.delete(key) },
  }
  try {
    const original = function (value) { return value }
    const prototype = { handleSocketMessage: original }
    const page = { LiveDanmakuEngine: { default: { prototype } } }
    const adapter = createNativeHover(page)
    const f = fixture()
    f.item.element = { isConnected: true }
    const engine = { layerWrap: { isConnected: true }, danmaku: { core: { manager: { visualArray: [f.item] } } } }
    assert.equal(prototype.handleSocketMessage.call(engine, 'packet'), 'packet')
    assert.equal(prototype.handleSocketMessage, original)
    const release = adapter.pause(f.item.element)
    assert.equal(typeof release, 'function')
    release()
    adapter.dispose()
    assert.equal(timers.size, 0)
    const pending = createNativeHover(page)
    assert.notEqual(prototype.handleSocketMessage, original)
    pending.dispose()
    assert.equal(prototype.handleSocketMessage, original)
    assert.equal(timers.size, 0)
    const timeout = createNativeHover(page)
    Array.from(timers.values())[0]()
    assert.equal(prototype.handleSocketMessage, original)
    timeout.dispose()
  } finally {
    globalThis.window = savedWindow
  }
})
