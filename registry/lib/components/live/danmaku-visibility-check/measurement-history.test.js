import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMeasurementHistory, summarizeMeasurements } from './measurement-history'

const measurement = (id, outcome, latencyMs) => ({
  id,
  schemaVersion: 1,
  sessionId: 'session-1',
  roomId: 22747736,
  content: `测试-${id}`,
  capturedAt: Number(id),
  completedAt: Number(id) + (latencyMs ?? 2200),
  outcome,
  latencyMs,
  windowMs: 2200,
  lateObservationLimitMs: 5000,
})

test('parses persisted successful, late and not-observed measurements', () => {
  const records = [
    measurement('1', 'observed', 900),
    measurement('2', 'observed-late', 2400),
    measurement('3', 'not-observed', null),
  ]
  assert.deepEqual(parseMeasurementHistory(JSON.stringify(records)), records)
  assert.deepEqual(parseMeasurementHistory('invalid'), [])
})

test('summarizes successful latency without treating misses as latency samples', () => {
  const records = Array.from({ length: 30 }, (_, index) =>
    measurement(String(index), index === 29 ? 'observed-late' : 'observed', 1000 + index * 10),
  )
  records.push(measurement('missing', 'not-observed', null))
  const summary = summarizeMeasurements(records)
  assert.equal(summary.total, 31)
  assert.equal(summary.observed, 29)
  assert.equal(summary.observedLate, 1)
  assert.equal(summary.notObserved, 1)
  assert.equal(summary.p99Ms, 1290)
  assert.equal(summary.suggestedWindowMs, 1600)
})
