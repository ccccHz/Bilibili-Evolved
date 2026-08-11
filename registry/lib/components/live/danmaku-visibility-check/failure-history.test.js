import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFailureHistory, parseFailureHistoryExport } from './failure-history'

test('parses valid persisted visibility failures', () => {
  const record = {
    id: '1-test',
    schemaVersion: 1,
    roomId: 22747736,
    content: '巴拿马',
    normalizedContent: '巴拿马',
    contentHash: 'djb2-test',
    windowMs: 2200,
    lateObservationLimitMs: 5000,
    outcome: 'suspected',
    waitedMs: 2201,
    observedLatencyMs: null,
    recordedAt: 1,
    updatedAt: 1,
    tags: ['needs-review'],
    note: '',
  }
  assert.deepEqual(parseFailureHistory(JSON.stringify([record])), [record])
  assert.deepEqual(
    parseFailureHistoryExport(JSON.stringify({ version: 1, records: [record] })),
    [record],
  )
})

test('ignores malformed or unrelated persisted data', () => {
  assert.deepEqual(parseFailureHistory('invalid json'), [])
  assert.deepEqual(parseFailureHistory('{}'), [])
  assert.deepEqual(parseFailureHistory(JSON.stringify([{ content: 'missing fields' }])), [])
})
