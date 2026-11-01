import assert from 'node:assert/strict'
import test from 'node:test'
import { ChatSpeedWindow, mountInputStatus } from './input-status'

test('uses a thirty-second rate, marks startup sampling, and does not drop a burst after five seconds', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 })
  const speed = new ChatSpeedWindow()
  assert.equal(speed.rate(), null)
  speed.record()
  t.mock.timers.tick(1000)
  assert.equal(speed.rate(), null)
  t.mock.timers.tick(4000)
  assert.equal(speed.rate(), 12)
  assert.equal(speed.isWarmingUp(), true)
  t.mock.timers.tick(25000)
  assert.equal(speed.rate(), 0)
  assert.equal(speed.isWarmingUp(), false)
  speed.record()
  assert.equal(speed.rate(), 2)
  t.mock.timers.tick(5000)
  assert.equal(speed.rate(), 2)
  t.mock.timers.tick(25000)
  assert.equal(speed.rate(), 0)
  speed.reset()
  assert.equal(speed.rate(), null)
  assert.equal(speed.isWarmingUp(), true)
  t.mock.timers.tick(5000)
  assert.equal(speed.rate(), 0)
})

test('replaces promotional hints without changing drafts, preserves restrictions, and restores current native attributes', t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1000 })
  const attributes = new Map([['placeholder', '发送粉丝留言，TA在等你开口'], ['title', '原有提示']])
  const input = {
    value: '保留我的草稿', disabled: false, readOnly: false, isConnected: true,
    getBoundingClientRect: () => ({ width: 140 }),
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
  }
  const original = new Map(['window', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.assign(globalThis, { window: { setInterval }, document: { querySelectorAll: () => [input] } })
  t.after(() => original.forEach((descriptor, key) => {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete globalThis[key]
  }))
  const observer = Object.assign(new EventTarget(), {
    status: 'ready', health: { transportOpen: true, authenticated: true },
  })
  const dispose = mountInputStatus(observer, () => true)
  t.after(dispose)
  assert.equal(input.getAttribute('placeholder'), '已连接 · 采样中')
  observer.dispatchEvent(new CustomEvent('danmaku', { detail: {} }))
  t.mock.timers.tick(5000)
  assert.equal(input.getAttribute('placeholder'), '12条/分 · 采样中')
  assert.equal(input.value, '保留我的草稿')
  assert.equal(input.getAttribute('title').match(/原有提示/g).length, 1)
  attributes.set('placeholder', '当前已禁言')
  attributes.set('title', '平台更新的提示')
  input.disabled = true
  t.mock.timers.tick(1000)
  assert.equal(input.getAttribute('placeholder'), '当前已禁言')
  input.disabled = false
  t.mock.timers.tick(1000)
  assert.equal(input.getAttribute('placeholder'), '当前已禁言')
  attributes.set('placeholder', '发送粉丝留言')
  t.mock.timers.tick(1000)
  assert.match(input.getAttribute('placeholder'), /条\/分/)
  observer.status = 'error'
  observer.dispatchEvent(new CustomEvent('status'))
  assert.equal(input.getAttribute('placeholder'), '观察异常 · 设置中重试')
  assert.equal(input.value, '保留我的草稿')
  dispose()
  assert.equal(input.getAttribute('placeholder'), '发送粉丝留言')
  assert.equal(input.getAttribute('title'), '平台更新的提示')
  t.mock.timers.tick(60000)
  assert.equal(input.getAttribute('placeholder'), '发送粉丝留言')
})
