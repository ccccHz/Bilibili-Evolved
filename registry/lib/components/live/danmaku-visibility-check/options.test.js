import assert from 'node:assert/strict'
import test from 'node:test'
import { validateManualSendMatchTimeout } from './options'

test('accepts the experience default and valid manual timeout text input', () => {
  assert.equal(validateManualSendMatchTimeout('0', 2200), 0)
  assert.equal(validateManualSendMatchTimeout('3500', 0), 3500)
})

test('rejects manual timeouts outside the supported range', () => {
  assert.equal(validateManualSendMatchTimeout('499', 2200), 2200)
  assert.equal(validateManualSendMatchTimeout('10001', 2200), 2200)
  assert.equal(validateManualSendMatchTimeout('invalid', 2200), 2200)
})
