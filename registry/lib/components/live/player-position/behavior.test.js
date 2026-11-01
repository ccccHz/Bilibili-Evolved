import assert from 'node:assert/strict'
import test from 'node:test'
import { needsPlayerPosition } from './behavior'

test('leaves platform positioning alone when most of the player is already visible', () => {
  assert.equal(needsPlayerPosition({ top: 60, bottom: 660, height: 600 }, 800), false)
  assert.equal(needsPlayerPosition({ top: 750, bottom: 1350, height: 600 }, 800), true)
  assert.equal(needsPlayerPosition({ top: -700, bottom: -100, height: 600 }, 800), true)
  assert.equal(needsPlayerPosition({ top: 0, bottom: 1000, height: 1000 }, 800), false)
})
