import {
  DanmakuObserverConfig,
  LaplaceDataEvent,
  LaplaceLiveClient,
  LaplaceLiveClientConstructor,
  ObservedDanmaku,
  ObserverStatus,
} from './types'
import { LiveWS as RuntimeLiveWS } from './laplace-runtime'
import { parseDanmakuMessage } from './danmaku-message'
import { parseDanmakuAuthReply } from './auth-reply'

const LiveWS = RuntimeLiveWS as LaplaceLiveClientConstructor
const connectionTimeout = 10000

export class LaplaceDanmakuObserver extends EventTarget {
  status: ObserverStatus = 'idle'
  private client: LaplaceLiveClient | null = null
  private connectTask: Promise<void> | null = null

  constructor(
    private createWebSocket: (address: string) => WebSocket = address => new WebSocket(address),
  ) {
    super()
  }

  async connect(config: DanmakuObserverConfig) {
    if (this.status === 'ready') {
      return
    }
    if (this.connectTask) {
      await this.connectTask
      return
    }
    this.status = 'connecting'
    this.dispatchStatus()
    this.connectTask = this.open(config)
    try {
      await this.connectTask
    } finally {
      this.connectTask = null
    }
  }

  close() {
    if (this.status === 'closed' || this.status === 'idle') {
      return
    }
    this.setStatus('closing')
    const { client } = this
    this.client = null
    client?.close()
    this.setStatus('closed')
  }

  private open(config: DanmakuObserverConfig) {
    return new Promise<void>((resolve, reject) => {
      let entered = false
      let settled = false
      let timeout = 0
      let finish: (error?: Error) => void
      let socket: WebSocket | null = null
      let client: LaplaceLiveClient

      const onLive = () => {
        entered = true
      }
      const onHeartbeat = () => {
        if (entered) {
          finish()
        }
      }
      const onError = () => {
        if (!settled) {
          finish(new Error('Laplace 观察连接发生错误'))
          return
        }
        if (this.client === client) {
          this.status = 'error'
          this.dispatchStatus()
        }
      }
      const onClose = () => {
        if (!settled) {
          finish(new Error('Laplace 观察连接在就绪前关闭'))
          return
        }
        if (this.client === client) {
          this.client = null
          this.status = 'closed'
          this.dispatchStatus()
        }
      }
      const onSocketMessage = (event: MessageEvent) => {
        if (!(event.data instanceof ArrayBuffer)) {
          return
        }
        const reply = parseDanmakuAuthReply(event.data)
        if (!reply) {
          return
        }
        if (reply.code === 0) {
          return
        }
        const detail = reply.message ? `：${reply.message}` : ''
        const code = reply.code === null ? '无法解析' : String(reply.code)
        finish(new Error(`Laplace 观察连接鉴权失败（code ${code}）${detail}`))
      }

      client = new LiveWS(config.roomId, {
        protover: 3,
        key: config.key,
        address: config.address,
        uid: 0,
        buvid: config.buvid,
        createWebSocket: address => {
          socket = this.createWebSocket(address)
          socket.binaryType = 'arraybuffer'
          socket.addEventListener('message', onSocketMessage)
          return socket
        },
      })
      this.client = client

      finish = (error?: Error) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeout)
        client.removeEventListener('live', onLive)
        client.removeEventListener('heartbeat', onHeartbeat)
        socket?.removeEventListener('message', onSocketMessage)
        if (error) {
          const intentionallyClosed = this.status === 'closing' || this.status === 'closed'
          client.removeEventListener('error', onError)
          client.removeEventListener('close', onClose)
          this.status = intentionallyClosed ? 'closed' : 'error'
          this.dispatchStatus()
          if (!intentionallyClosed) {
            client.close()
          }
          this.client = null
          reject(error)
          return
        }
        this.status = 'ready'
        this.dispatchStatus()
        resolve()
      }

      timeout = window.setTimeout(
        () => finish(new Error('Laplace 观察连接鉴权或心跳超时')),
        connectionTimeout,
      )

      client.addEventListener('live', onLive)
      client.addEventListener('heartbeat', onHeartbeat)
      client.addEventListener('error', onError)
      client.addEventListener('close', onClose)
      client.addEventListener('msg', event => {
        const raw = (event as LaplaceDataEvent).data
        const command =
          raw && typeof raw === 'object'
            ? (raw as { cmd?: unknown; msg?: { cmd?: unknown } }).cmd ??
              (raw as { msg?: { cmd?: unknown } }).msg?.cmd
            : null
        if (typeof command !== 'string' || command.split(':')[0] !== 'DANMU_MSG') {
          return
        }
        this.dispatchEvent(
          new CustomEvent<ObservedDanmaku | null>('danmaku', {
            detail: parseDanmakuMessage(raw),
          }),
        )
      })
    })
  }

  private dispatchStatus() {
    this.dispatchEvent(new CustomEvent('status', { detail: this.status }))
  }

  private setStatus(status: ObserverStatus) {
    if (this.status === status) {
      return
    }
    this.status = status
    this.dispatchStatus()
  }
}
