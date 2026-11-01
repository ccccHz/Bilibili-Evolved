import assert from 'node:assert/strict'
import test from 'node:test'
import { clipFrozenDanmaku, placeToolbar } from './geometry'

test('clips a long or partially offscreen danmaku to the player without changing its origin', () => {
  const player = { left: 100, top: 100, right: 900, bottom: 600 }
  assert.equal(clipFrozenDanmaku({ left: 700, top: 550, right: 1200, bottom: 580 }, player), 'inset(0px 300px 0px 0px)')
  assert.equal(clipFrozenDanmaku({ left: 50, top: 90, right: 350, bottom: 120 }, player), 'inset(10px 0px 0px 50px)')
})

test('places the toolbar above bottom danmaku and keeps it out of the right chat panel', () => {
  const result = placeToolbar(890, { left: 700, top: 570, right: 1100, bottom: 595 },
    { left: 100, top: 100, right: 900, bottom: 600 }, 180, 40)
  assert.deepEqual(result, { left: 712, top: 522 })
})
