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

export interface ObserverHealth {
  transportOpen: boolean
  authenticated: boolean
  lastHeartbeatAt: number | null
  lastMessageAt: number | null
}

/** One transport only. Recovery belongs to ObserverRecovery, never to the library. */
export class LaplaceDanmakuObserver extends EventTarget {
  status: ObserverStatus = 'idle'
  lastError: string | null = null
  health: ObserverHealth = {
    transportOpen: false,
    authenticated: false,
    lastHeartbeatAt: null,
    lastMessageAt: null,
  }

  private disposeConnection: (() => void) | null = null
  private connectTask: Promise<void> | null = null

  constructor(
    private createWebSocket: (address: string) => WebSocket = address => new WebSocket(address),
    private timeouts = { connection: 10000, heartbeat: 90000 },
    private Client = LiveWS,
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
    this.setStatus('connecting')
    this.connectTask = this.open(config)
    try {
      await this.connectTask
    } finally {
      this.connectTask = null
    }
  }

  close() {
    this.setStatus('closing')
    this.disposeConnection?.()
    this.disposeConnection = null
    this.setStatus('closed')
  }

  private open(config: DanmakuObserverConfig) {
    this.lastError = null
    return new Promise<void>((resolve, reject) => {
      let settled = false
      let disposed = false
      let timeout: ReturnType<typeof setTimeout>
      let socket: WebSocket
      let client: LaplaceLiveClient
      let invalidMessages = 0
      this.health = {
        transportOpen: false,
        authenticated: false,
        lastHeartbeatAt: null,
        lastMessageAt: null,
      }

      const removeListeners: (() => void)[] = []
      const dispose = () => {
        if (disposed) {
          return
        }
        disposed = true
        clearTimeout(timeout)
        removeListeners.forEach(remove => remove())
        this.health.transportOpen = false
        this.health.authenticated = false
        client?.close()
        if (!settled) {
          settled = true
          reject(new Error('Laplace 观察连接在就绪前关闭'))
        }
      }
      const fail = (message: string) => {
        if (disposed) {
          return
        }
        this.lastError = message
        if (!settled) {
          settled = true
          reject(new Error(message))
        }
        dispose()
        this.setStatus('error')
      }
      const armHeartbeatDeadline = () => {
        clearTimeout(timeout)
        timeout = setTimeout(() => fail('匿名观察连接心跳超时'), this.timeouts.heartbeat)
      }
      const onOpen = () => {
        this.health.transportOpen = true
        this.dispatchHealth()
      }
      const onHeartbeat = () => {
        if (disposed || !this.health.authenticated) {
          return
        }
        this.health.lastHeartbeatAt = Date.now()
        armHeartbeatDeadline()
        if (!settled) {
          settled = true
          this.setStatus('ready')
          resolve()
        }
        this.dispatchHealth()
      }
      const onError = () => {
        fail('Laplace 观察连接发生错误')
      }
      const onClose = () => {
        fail('Laplace 观察连接已断开')
      }
      const onSocketMessage = (event: MessageEvent) => {
        if (disposed || !(event.data instanceof ArrayBuffer)) {
          return
        }
        const reply = parseDanmakuAuthReply(event.data)
        if (!reply) {
          return
        }
        if (reply.code !== 0) {
          const code = reply.code === null ? '无法解析' : String(reply.code)
          fail(`Laplace 观察连接鉴权失败（code ${code}）${reply.message || ''}`)
          return
        }
        this.health.authenticated = true
        this.dispatchHealth()
      }
      const onMessage = (event: Event) => {
        if (disposed || !this.health.authenticated) {
          return
        }
        const raw = (event as LaplaceDataEvent).data
        const command =
          raw && typeof raw === 'object'
            ? (raw as { cmd?: unknown; msg?: { cmd?: unknown } }).cmd ??
              (raw as { msg?: { cmd?: unknown } }).msg?.cmd
            : null
        if (typeof command !== 'string' || command.split(':')[0] !== 'DANMU_MSG') {
          return
        }
        const payload = raw as { info?: unknown; msg?: unknown }
        const parsed = parseDanmakuMessage(payload?.info ? payload : payload?.msg)
        if (parsed) {
          invalidMessages = 0
          this.health.lastMessageAt = Date.now()
        } else {
          invalidMessages += 1
        }
        this.dispatchEvent(new CustomEvent<ObservedDanmaku | null>('danmaku', { detail: parsed }))
        if (invalidMessages >= 5) {
          fail('连续弹幕无法解析，观察链路已降级')
        }
      }

      const listen = (target: EventTarget, type: string, callback: EventListener) => {
        target.addEventListener(type, callback)
        removeListeners.push(() => target.removeEventListener(type, callback))
      }
      this.disposeConnection = dispose
      timeout = setTimeout(() => fail('Laplace 观察连接鉴权或心跳超时'), this.timeouts.connection)
      try {
        client = new this.Client(config.roomId, {
          protover: 3,
          key: config.key,
          address: config.address,
          uid: 0,
          buvid: config.buvid,
          createWebSocket: address => {
            socket = this.createWebSocket(address)
            socket.binaryType = 'arraybuffer'
            listen(socket, 'message', onSocketMessage)
            listen(socket, 'open', onOpen)
            return socket
          },
        })
        listen(client, 'heartbeat', onHeartbeat)
        listen(client, 'msg', onMessage)
        listen(client, 'error', onError)
        listen(client, 'close', onClose)
      } catch (error) {
        fail(String(error))
      }
    })
  }

  private dispatchHealth() {
    this.dispatchEvent(new CustomEvent('health', { detail: { ...this.health } }))
  }

  private setStatus(status: ObserverStatus) {
    if (this.status === status) {
      return
    }
    this.status = status
    this.dispatchEvent(new CustomEvent('status', { detail: status }))
  }
}
