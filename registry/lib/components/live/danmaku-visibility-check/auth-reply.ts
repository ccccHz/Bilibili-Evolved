export interface DanmakuAuthReply {
  code: number | null
  message: string | null
}

const packetHeaderLength = 16
const authReplyOperation = 8

const getMessage = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as { message?: unknown; msg?: unknown }
  const message = record.message ?? record.msg
  return typeof message === 'string' && message ? message : null
}

export const parseDanmakuAuthReply = (data: ArrayBuffer): DanmakuAuthReply | null => {
  const bytes = new Uint8Array(data)
  const decoder = new TextDecoder()
  let offset = 0
  while (offset + packetHeaderLength <= bytes.byteLength) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset)
    const packetLength = view.getUint32(0)
    const headerLength = view.getUint16(4)
    const operation = view.getUint32(8)
    if (
      packetLength < packetHeaderLength ||
      headerLength < packetHeaderLength ||
      headerLength > packetLength ||
      offset + packetLength > bytes.byteLength
    ) {
      return operation === authReplyOperation ? { code: null, message: null } : null
    }
    if (operation === authReplyOperation) {
      try {
        const body = bytes.slice(offset + headerLength, offset + packetLength)
        const parsed = JSON.parse(decoder.decode(body)) as unknown
        const code =
          parsed &&
          typeof parsed === 'object' &&
          typeof (parsed as { code?: unknown }).code === 'number'
            ? (parsed as { code: number }).code
            : null
        return { code, message: getMessage(parsed) }
      } catch {
        return { code: null, message: null }
      }
    }
    offset += packetLength
  }
  return null
}
