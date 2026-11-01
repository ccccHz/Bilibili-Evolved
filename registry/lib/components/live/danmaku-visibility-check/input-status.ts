import { ObserverRecovery } from './observer-recovery'

interface OwnedInput {
  original: string | null
  written: string | null
  badge: HTMLButtonElement
}

const inputSelector = 'textarea.chat-input, .danmaku-send-bar input'
const ordinaryPlaceholder = /^(发个弹幕呗[~～]?|说点什么吧[~～]?|)$/

export class ChatSpeedWindow {
  private buckets = new Map<number, number>()
  private startedAt = Date.now()

  record(now = Date.now()) {
    const second = Math.floor(now / 1000)
    this.buckets.set(second, (this.buckets.get(second) || 0) + 1)
    this.prune(second)
  }

  reset(now = Date.now()) {
    this.startedAt = now
    this.buckets.clear()
  }

  rate(now = Date.now()) {
    this.prune(Math.floor(now / 1000))
    const elapsed = (now - this.startedAt) / 1000
    if (elapsed < 1) {
      return null
    }
    return Math.round(
      (Array.from(this.buckets.values()).reduce((sum, count) => sum + count, 0) * 60) /
        Math.min(5, elapsed),
    )
  }

  private prune(second: number) {
    this.buckets.forEach((_, key) => {
      if (key <= second - 5 || key > second) {
        this.buckets.delete(key)
      }
    })
  }
}

export const mountInputStatus = (observer: ObserverRecovery, speedEnabled: () => boolean) => {
  const speed = new ChatSpeedWindow()
  const owned = new Map<HTMLInputElement | HTMLTextAreaElement, OwnedInput>()
  const restore = (input: HTMLInputElement | HTMLTextAreaElement, item: OwnedInput) => {
    if (item.written !== null && input.getAttribute('placeholder') === item.written) {
      if (item.original === null) {
        input.removeAttribute('placeholder')
      } else {
        input.setAttribute('placeholder', item.original)
      }
    }
    item.written = null
  }
  const refresh = () => {
    owned.forEach((item, input) => {
      if (!input.isConnected || input.getBoundingClientRect().width === 0) {
        restore(input, item)
        item.badge.remove()
        owned.delete(input)
      }
    })
    document
      .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(inputSelector)
      .forEach(input => {
        if (input.getBoundingClientRect().width === 0) {
          return
        }
        let item = owned.get(input)
        if (!item) {
          const badge = document.createElement('button')
          badge.type = 'button'
          badge.className = 'be-live-observer-status'
          badge.addEventListener('click', () => observer.retry())
          const customSendbar = input.closest('.danmaku-send-bar')
          if (customSendbar) {
            customSendbar.appendChild(badge)
          } else {
            const container = input.closest('.chat-input-ctnr') || input
            container.insertAdjacentElement('afterend', badge)
          }
          item = { original: input.getAttribute('placeholder'), written: null, badge }
          owned.set(input, item)
        }
        const { badge } = item
        const label = {
          idle: '未启动',
          connecting: '连接中',
          ready: '已就绪',
          retrying: '重连中',
          error: '异常 · 点击重试',
          closing: '关闭中',
          closed: '已关闭',
        }[observer.status]
        const text = `匿名：${label}`
        if (badge.textContent !== text) {
          badge.textContent = text
        }
        badge.dataset.status = observer.status
        badge.disabled = observer.status === 'connecting' || observer.status === 'ready'
        const age = (at: number | null | undefined) =>
          at === null || at === undefined
            ? '尚未收到'
            : `${Math.max(0, Math.floor((Date.now() - at) / 1000))} 秒前`
        badge.title = `独立匿名观察连接；不代表本条弹幕可见性\n传输：${
          observer.health?.transportOpen ? '已打开' : '未打开'
        }；鉴权：${observer.health?.authenticated ? '成功' : '未完成'}\n心跳：${age(
          observer.health?.lastHeartbeatAt,
        )}；有效弹幕：${age(observer.health?.lastMessageAt)}${
          observer.retryAt
            ? `\n下次重试：${Math.max(0, Math.ceil((observer.retryAt - Date.now()) / 1000))} 秒后`
            : ''
        }`
        if (observer.lastError) {
          badge.title += `\n最近原因：${observer.lastError}`
        }
        const current = input.getAttribute('placeholder')
        if (current !== item.written) {
          item.original = current
        }
        if (
          !speedEnabled() ||
          observer.status !== 'ready' ||
          input.disabled ||
          !ordinaryPlaceholder.test(item.original || '')
        ) {
          restore(input, item)
          return
        }
        const rate = speed.rate()
        item.written = rate === null ? '弹幕时速：采样中' : `弹幕时速：${rate}条/分`
        if (current !== item.written) {
          input.setAttribute('placeholder', item.written)
        }
      })
  }
  const onStatus = () => {
    if (observer.status !== 'ready') {
      speed.reset()
    }
    refresh()
  }
  const onDanmaku = (event: Event) => {
    if ((event as CustomEvent).detail && observer.status === 'ready') {
      speed.record()
    }
  }
  observer.addEventListener('status', onStatus)
  observer.addEventListener('danmaku', onDanmaku)
  const timer = window.setInterval(refresh, 1000)
  refresh()
  return () => {
    clearInterval(timer)
    observer.removeEventListener('status', onStatus)
    observer.removeEventListener('danmaku', onDanmaku)
    owned.forEach((item, input) => {
      restore(input, item)
      item.badge.remove()
    })
    owned.clear()
  }
}
