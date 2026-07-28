export type ObserverStatus = 'idle' | 'connecting' | 'ready' | 'closing' | 'closed' | 'error'

export interface DanmakuObserverConfig {
  roomId: number
  key: string
  address: string
  buvid?: string
}

export interface ObservedDanmaku {
  content: string
  uid: number | null
  username: string | null
  sentAt: number | null
  identitySource: 'legacy' | 'nested-user' | 'none'
  sendFromMe: boolean | null
  messageId: string | null
}

export interface DanmakuDiagnosticSnapshot {
  received: number
  parsed: number
  withUid: number
  withLegacyUid: number
  withNestedUid: number
  withMessageId: number
  markedFromMe: number
  own: number
  capturedSends: number
  matchedSends: number
  timedOutSends: number
  startedAt: number
  lastMessageAt: number | null
}

export interface LaplaceDataEvent<T = unknown> extends Event {
  data: T
}

export interface LaplaceLiveClient extends EventTarget {
  live: boolean
  closed: boolean
  close(): void
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void
}

export interface LaplaceLiveClientConstructor {
  new (
    roomId: number,
    options: {
      protover: 1 | 2 | 3
      key: string
      address: string
      uid: number
      buvid?: string
      createWebSocket?: (address: string) => WebSocket
    },
  ): LaplaceLiveClient
}
