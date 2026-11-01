import assert from 'node:assert/strict'
import test from 'node:test'
import { ObserverRecovery } from './observer-recovery'

class FakeObserver extends EventTarget {
  status = 'idle'
  closeCalls = 0
  health = { transportOpen: true, authenticated: true, lastHeartbeatAt: null, lastMessageAt: null }
  async connect() {
    this.status = 'ready'
    this.dispatchEvent(new CustomEvent('status', { detail: this.status }))
  }
  fail() {
    this.status = 'error'
    this.dispatchEvent(new CustomEvent('status', { detail: this.status }))
  }
  close() {
    this.closeCalls += 1
  }
}
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
const timing = { base: 100, maximum: 1000, stable: 120000, stream: 90000 }

test('refreshes configuration, closes old transport, and retries without parallel connections', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  let fetches = 0
  const connections = []
  const recovery = new ObserverRecovery(async () => ({ roomId: 7, key: `key-${++fetches}` }), () => {
    const connection = new FakeObserver()
    connections.push(connection)
    return connection
  }, timing, () => 0.5)
  recovery.start()
  await flush()
  assert.equal(recovery.status, 'ready')
  connections[0].fail()
  assert.equal(recovery.status, 'retrying')
  assert.equal(connections[0].closeCalls, 1)
  t.mock.timers.tick(99)
  assert.equal(fetches, 1)
  t.mock.timers.tick(1)
  await flush()
  assert.equal(fetches, 2)
  assert.equal(connections.length, 2)
  recovery.close()
  t.mock.timers.tick(300000)
  await flush()
  assert.equal(fetches, 2)
  assert.equal(connections[1].closeCalls, 1)
})

test('stops repeated failures, permits manual retry, and discards a late configuration after close', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  let fetches = 0
  const recovery = new ObserverRecovery(async () => {
    fetches += 1
    throw Error('token unavailable')
  }, () => new FakeObserver(), timing, () => 0.5)
  recovery.start()
  for (let index = 0; index < 10; index += 1) {
    await flush()
    t.mock.timers.tick(1001)
  }
  assert.equal(recovery.status, 'error')
  assert.equal(fetches, 8)
  recovery.retry()
  await flush()
  assert.equal(fetches, 9)
  recovery.close()
  let finish
  let created = 0
  const late = new ObserverRecovery(() => new Promise(resolve => { finish = resolve }), () => {
    created += 1
    return new FakeObserver()
  })
  late.start()
  late.close()
  finish({ roomId: 7 })
  await flush()
  assert.equal(created, 0)
  assert.equal(late.status, 'closed')
})

test('does not reconnect a quiet room; sustained page activity can expose a stalled independent stream', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] , now: 1000 })
  let fetches = 0
  const recovery = new ObserverRecovery(async () => ({ roomId: ++fetches }), () => new FakeObserver(), timing)
  recovery.start()
  await flush()
  t.mock.timers.tick(100000)
  assert.equal(recovery.status, 'ready')
  assert.equal(fetches, 1)
  for (let id = 0; id < 10; id += 1) { recovery.recordPageActivity(String(id)) }
  assert.equal(recovery.status, 'retrying')
  recovery.close()
})
