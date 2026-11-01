import assert from 'node:assert/strict'
import test from 'node:test'
import { ChatSpeedWindow } from './input-status'

test('uses a bounded five-second rate, drops old samples, and restarts after reconnect', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 })
  const speed = new ChatSpeedWindow()
  assert.equal(speed.rate(), null)
  speed.record()
  t.mock.timers.tick(1000)
  assert.equal(speed.rate(), 60)
  t.mock.timers.tick(4000)
  assert.equal(speed.rate(), 0)
  speed.record()
  assert.equal(speed.rate(), 12)
  speed.reset()
  assert.equal(speed.rate(), null)
  t.mock.timers.tick(1000)
  assert.equal(speed.rate(), 0)
})
