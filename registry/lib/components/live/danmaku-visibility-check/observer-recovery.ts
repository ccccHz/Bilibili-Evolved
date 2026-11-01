import { LaplaceDanmakuObserver, ObserverHealth } from './laplace-adapter'
import { DanmakuObserverConfig, ObserverStatus } from './types'

export type RecoveryStatus = ObserverStatus | 'retrying'

export class ObserverRecovery extends EventTarget {
  status: RecoveryStatus = 'idle'
  generation = 0
  roomId: number | null = null
  attempts = 0
  retryAt: number | null = null
  lastError: string | null = null
  private stopped = true
  private observer: LaplaceDanmakuObserver | null = null
  private timer: ReturnType<typeof setTimeout>
  private stableTimer: ReturnType<typeof setTimeout>
  private abort: AbortController | null = null
  private detach: (() => void) | null = null
  private pageMessageIds = new Set<string>()
  private readyAt = 0
  private streamActivityAt = 0
  private serial = 0

  constructor(
    private resolveConfig: (signal: AbortSignal) => Promise<DanmakuObserverConfig>,
    private createObserver = () => new LaplaceDanmakuObserver(),
    private timing = { base: 1500, maximum: 60000, stable: 120000, stream: 90000 },
    private random = Math.random,
  ) {
    super()
  }

  get health(): ObserverHealth | null {
    return this.observer?.health || null
  }

  start() {
    this.stopped = false
    this.attempts = 0
    this.reconnect()
  }

  retry() {
    if (this.status === 'connecting') {
      return
    }
    this.start()
  }

  close() {
    this.stopped = true
    this.serial += 1
    this.clearConnection()
    this.setStatus('closed')
  }

  /** Page activity is only a recovery hint, never evidence of public visibility. */
  recordPageActivity(messageId: string) {
    if (!messageId || this.status !== 'ready') {
      return
    }
    const now = Date.now()
    const lastActivity = this.health?.lastMessageAt || this.readyAt
    if (lastActivity !== this.streamActivityAt) {
      this.pageMessageIds.clear()
      this.streamActivityAt = lastActivity
    }
    if (this.pageMessageIds.size < 10) {
      this.pageMessageIds.add(messageId)
    }
    if (this.pageMessageIds.size >= 10 && now - lastActivity > this.timing.stream) {
      this.fail('页面持续有消息，但匿名流长时间没有有效弹幕')
    }
  }

  private clearConnection() {
    clearTimeout(this.timer)
    clearTimeout(this.stableTimer)
    this.retryAt = null
    this.abort?.abort()
    this.abort = null
    this.detach?.()
    this.detach = null
    this.observer?.close()
    this.observer = null
    this.pageMessageIds.clear()
  }

  private reconnect() {
    const serial = ++this.serial
    this.clearConnection()
    this.generation += 1
    this.setStatus('connecting')
    const abort = new AbortController()
    this.abort = abort
    this.timer = setTimeout(() => abort.abort(), 15000)
    ;(async () => {
      try {
        const config = await this.resolveConfig(abort.signal)
        if (this.stopped || serial !== this.serial) {
          return
        }
        clearTimeout(this.timer)
        this.roomId = config.roomId
        const observer = this.createObserver()
        this.observer = observer
        const onStatus = (event: Event) => {
          const status = (event as CustomEvent<ObserverStatus>).detail
          if (status === 'error') {
            this.fail(observer.lastError || '匿名观察连接断开')
          } else if (status === 'ready') {
            this.readyAt = Date.now()
            this.lastError = null
            this.streamActivityAt = this.readyAt
            this.setStatus('ready')
            this.stableTimer = setTimeout(() => {
              this.attempts = 0
            }, this.timing.stable)
          }
        }
        const forward = (event: Event) => {
          this.dispatchEvent(new CustomEvent(event.type, { detail: (event as CustomEvent).detail }))
        }
        observer.addEventListener('status', onStatus)
        observer.addEventListener('health', forward)
        observer.addEventListener('danmaku', forward)
        this.detach = () => {
          observer.removeEventListener('status', onStatus)
          observer.removeEventListener('health', forward)
          observer.removeEventListener('danmaku', forward)
        }
        await observer.connect(config)
      } catch (error) {
        if (!this.stopped && serial === this.serial) {
          this.fail(error instanceof Error ? error.message : '获取匿名观察连接配置失败')
        }
      }
    })()
  }

  private fail(reason: string) {
    if (this.stopped || this.status === 'retrying' || this.status === 'error') {
      return
    }
    this.lastError = reason
    // Invalidate pending sends before closing the old transport.
    this.serial += 1
    this.generation += 1
    this.clearConnection()
    this.attempts += 1
    if (this.attempts >= 8) {
      this.setStatus('error')
      return
    }
    const delay = Math.round(
      Math.min(this.timing.maximum, this.timing.base * 2 ** (this.attempts - 1)) *
        (0.8 + this.random() * 0.4),
    )
    this.retryAt = Date.now() + delay
    this.setStatus('retrying')
    this.timer = setTimeout(() => this.reconnect(), delay)
  }

  private setStatus(status: RecoveryStatus) {
    this.status = status
    this.dispatchEvent(new CustomEvent('status', { detail: status }))
  }
}
