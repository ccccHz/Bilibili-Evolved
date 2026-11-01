import assert from 'node:assert/strict'
import test from 'node:test'
import { LaplaceDanmakuObserver } from './laplace-adapter'

Object.assign(globalThis, { window: globalThis })

const textEncoder = new TextEncoder()

const packet = (operation, body, protocol = 1) => {
  const result = new Uint8Array(16 + body.byteLength)
  const view = new DataView(result.buffer)
  view.setUint32(0, result.byteLength)
  view.setUint16(4, 16)
  view.setUint16(6, protocol)
  view.setUint32(8, operation)
  view.setUint32(12, 1)
  result.set(body, 16)
  return result.buffer
}

const authReply = (code, message) =>
  packet(8, textEncoder.encode(JSON.stringify({ code, message })))

const heartbeatReply = online => {
  const body = new Uint8Array(4)
  new DataView(body.buffer).setUint32(0, online)
  return packet(3, body)
}

class FakeWebSocket extends EventTarget {
  binaryType = 'blob'
  readyState = WebSocket.CONNECTING
  sentPackets = []
  closeCalls = 0

  open() {
    this.readyState = WebSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  receive(data) {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }

  send(data) {
    this.sentPackets.push(data)
  }

  close() {
    this.closeCalls += 1
    if (this.readyState === WebSocket.CLOSED) {
      return
    }
    this.readyState = WebSocket.CLOSED
    this.dispatchEvent(new Event('close'))
  }
}

const config = {
  roomId: 7777,
  key: 'test-key',
  address: 'wss://example.test/sub',
}

const setup = timeouts => {
  let socket = null
  const observer = new LaplaceDanmakuObserver(() => {
    socket = new FakeWebSocket()
    return socket
  }, timeouts)
  const getSocket = () => {
    assert.ok(socket)
    return socket
  }
  return { observer, getSocket }
}

test('becomes ready only after successful auth and heartbeat', async () => {
  const { observer, getSocket } = setup()
  const connecting = observer.connect(config)
  const socket = getSocket()
  socket.open()
  socket.receive(authReply(0))
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(observer.status, 'connecting')
  socket.receive(heartbeatReply(123))
  await connecting
  assert.equal(observer.status, 'ready')
  assert.ok(socket.sentPackets.length >= 2)

  observer.close()
  assert.equal(observer.status, 'closed')
  assert.equal(socket.closeCalls, 1)
})

test('rejects a non-zero operation 8 result', async () => {
  const { observer, getSocket } = setup()
  const connecting = observer.connect(config)
  const socket = getSocket()
  socket.open()
  socket.receive(authReply(-101, '认证失败'))

  await assert.rejects(connecting, /code -101.*认证失败/)
  assert.equal(observer.status, 'error')
  assert.equal(socket.closeCalls, 1)
})

test('stays closed when stopped before authentication completes', async () => {
  const { observer, getSocket } = setup()
  const connecting = observer.connect(config)
  const socket = getSocket()
  socket.open()
  observer.close()

  await assert.rejects(connecting, /就绪前关闭/)
  assert.equal(observer.status, 'closed')
  assert.equal(socket.closeCalls, 1)
})

test('a silent room remains healthy with heartbeats and a half-open socket expires', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 })
  const { observer, getSocket } = setup()
  t.after(() => observer.close())
  const connecting = observer.connect(config)
  const socket = getSocket()
  socket.open()
  socket.receive(authReply(0))
  await new Promise(resolve => setImmediate(resolve))
  socket.receive(heartbeatReply(1))
  await connecting
  for (let index = 0; index < 5; index += 1) {
    t.mock.timers.tick(30000)
    socket.receive(heartbeatReply(1))
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(observer.status, 'ready')
  }
  assert.equal(observer.health.lastMessageAt, null)
  t.mock.timers.tick(90001)
  assert.equal(observer.status, 'error')
  assert.equal(socket.closeCalls, 1)
})

test('a transport open or malformed authentication cannot produce ready', async () => {
  const { observer, getSocket } = setup()
  const connecting = observer.connect(config)
  const socket = getSocket()
  socket.open()
  assert.equal(observer.health.transportOpen, true)
  assert.equal(observer.health.authenticated, false)
  socket.receive(packet(8, textEncoder.encode('invalid')))
  await assert.rejects(connecting, /鉴权失败/)
  assert.equal(observer.status, 'error')
})
