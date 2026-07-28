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

const LiveWS = RuntimeLiveWS as LaplaceLiveClientConstructor
const connectionTimeout = 10000

export class LaplaceDanmakuObserver extends EventTarget {
  status: ObserverStatus = 'idle'
  private client: LaplaceLiveClient | null = null
  private connectTask: Promise<void> | null = null

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
    this.status = 'closing'
    this.dispatchStatus()
    const { client } = this
    this.client = null
    client?.close()
    this.status = 'closed'
    this.dispatchStatus()
  }

  private open(config: DanmakuObserverConfig) {
    return new Promise<void>((resolve, reject) => {
      const client = new LiveWS(config.roomId, {
        protover: 3,
        key: config.key,
        address: config.address,
        uid: 0,
        buvid: config.buvid,
      })
      this.client = client
      let entered = false
      let settled = false
      let timeout = 0
      let finish: (error?: Error) => void

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

      finish = (error?: Error) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeout)
        client.removeEventListener('live', onLive)
        client.removeEventListener('heartbeat', onHeartbeat)
        if (error) {
          client.removeEventListener('error', onError)
          client.removeEventListener('close', onClose)
          this.status = 'error'
          this.dispatchStatus()
          client.close()
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
}
