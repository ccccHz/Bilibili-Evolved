import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateSendWindow,
  calculateSendWindowCandidate,
  DanmakuDiagnostics,
} from './diagnostics'

test('keeps the historical experience window while collecting measurements', () => {
  const result = calculateSendWindow([423, 572, 737, 813, 908, 1015, 1324, 1441, 1680, 1891])
  assert.deepEqual(result, {
    effectiveWindowMs: 2200,
    state: 'fixed-experience',
    p95: 1891,
  })
})

test('uses the fixed experience value regardless of session warm-up', () => {
  assert.equal(calculateSendWindow([]).effectiveWindowMs, 2200)
  assert.equal(calculateSendWindow(Array(10).fill(2000)).effectiveWindowMs, 2200)
  assert.equal(calculateSendWindow([700]).effectiveWindowMs, 2200)
  assert.equal(calculateSendWindow([]).state, 'fixed-experience')
})

test('calculates a non-binding P99 recommendation after enough samples', () => {
  assert.deepEqual(calculateSendWindowCandidate(Array(30).fill(2600)), {
    candidateWindowMs: 2900,
    p95: 2600,
    p99: 2600,
  })
  assert.equal(calculateSendWindow(Array(30).fill(2600), 0, 2900).effectiveWindowMs, 2200)
  assert.equal(calculateSendWindow([2600], 0, 2900).state, 'fixed-experience')
})

test('a manual window overrides the fixed experience value', () => {
  assert.deepEqual(calculateSendWindow([500, 700], 3500), {
    effectiveWindowMs: 3500,
    state: 'manual',
    p95: 700,
  })
})

test('keeps timed out sends in the background and retracts a late match', async () => {
  const originalWindow = globalThis.window
  globalThis.window = {
    setInterval,
    setTimeout,
  }
  let suspected = null
  let late = null
  let latestState = null
  const diagnostics = new DanmakuDiagnostics('test', 1, 'tester', {
    getConfiguredSendMatchTimeout: () => 20,
    onNotObserved: result => {
      suspected = result
    },
    onLateObserved: result => {
      late = result
    },
    onUpdate: state => {
      latestState = state
    },
  })
  diagnostics.start()
  diagnostics.captureSend('late-message')
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(suspected.content, 'late-message')
  assert.equal(latestState.latePendingSends, 1)

  diagnostics.record(true, {
    content: 'late-message',
    uid: null,
    username: null,
    messageId: 'late-id',
    sentAt: null,
    sendFromMe: false,
    identitySource: 'none',
  })
  assert.equal(late.content, 'late-message')
  assert.equal(latestState.lastSendResult.status, 'observed-late')
  assert.equal(latestState.latePendingSends, 0)
  assert.equal(latestState.lateMatchedSends, 1)

  diagnostics.stop()
  globalThis.window = originalWindow
})
