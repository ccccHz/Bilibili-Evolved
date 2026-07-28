import assert from 'node:assert/strict'
import test from 'node:test'
import { parseDanmakuAuthReply } from './auth-reply'

const encoder = new TextEncoder()

const packet = (operation, body) => {
  const encodedBody = encoder.encode(body)
  const result = new Uint8Array(16 + encodedBody.byteLength)
  const view = new DataView(result.buffer)
  view.setUint32(0, result.byteLength)
  view.setUint16(4, 16)
  view.setUint16(6, 1)
  view.setUint32(8, operation)
  view.setUint32(12, 1)
  result.set(encodedBody, 16)
  return result
}

const concatenate = (...packets) => {
  const result = new Uint8Array(packets.reduce((size, item) => size + item.byteLength, 0))
  let offset = 0
  packets.forEach(item => {
    result.set(item, offset)
    offset += item.byteLength
  })
  return result.buffer
}

test('parses a successful operation 8 reply', () => {
  assert.deepEqual(parseDanmakuAuthReply(concatenate(packet(8, JSON.stringify({ code: 0 })))), {
    code: 0,
    message: null,
  })
})

test('parses an operation 8 error after another packet', () => {
  assert.deepEqual(
    parseDanmakuAuthReply(
      concatenate(
        packet(5, JSON.stringify({ cmd: 'NOTICE_MSG' })),
        packet(8, JSON.stringify({ code: -101, message: '认证失败' })),
      ),
    ),
    {
      code: -101,
      message: '认证失败',
    },
  )
})

test('rejects malformed operation 8 data without throwing', () => {
  assert.deepEqual(parseDanmakuAuthReply(concatenate(packet(8, '{'))), {
    code: null,
    message: null,
  })
})

test('ignores packets unrelated to authentication', () => {
  assert.equal(
    parseDanmakuAuthReply(concatenate(packet(5, JSON.stringify({ cmd: 'DANMU_MSG' })))),
    null,
  )
})
