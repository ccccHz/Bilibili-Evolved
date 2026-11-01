import { ObserverRecovery } from './observer-recovery'

interface OwnedInput {
  badge: HTMLButtonElement
}

const inputSelector = 'textarea.chat-input, .danmaku-send-bar input'

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
  const removeBadge = (item: OwnedInput) => {
    item.badge.remove()
  }
  const refresh = () => {
    owned.forEach((item, input) => {
      if (!input.isConnected || input.getBoundingClientRect().width === 0) {
        removeBadge(item)
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
          item = { badge }
          owned.set(input, item)
        }
        const { badge } = item
        const customSendbar = input.closest('.danmaku-send-bar')
        const row = input.closest('.control-panel-ctnr')?.querySelector('.control-panel-icon-row')
        const host = customSendbar || row
        if (host && badge.parentElement !== host) {
          badge.remove()
          if (customSendbar) {
            customSendbar.appendChild(badge)
          } else {
            row.insertBefore(badge, row.querySelector('.icon-right-part'))
          }
        } else if (!host && !badge.isConnected) {
          const container = input.closest('.chat-input-ctnr') || input
          container.insertAdjacentElement('beforebegin', badge)
        }
        const label = {
          idle: '未启动',
          connecting: '连接中',
          ready: '观察正常',
          retrying: '重连中',
          error: '点击重试',
          closing: '关闭中',
          closed: '已关闭',
        }[observer.status]
        const rate = speed.rate()
        const rateText = rate === null ? '采样中' : `${rate}条/分`
        const text = observer.status === 'ready' && speedEnabled() ? rateText : label
        if (badge.textContent !== text) {
          badge.textContent = text
        }
        badge.dataset.status = observer.status
        badge.setAttribute(
          'aria-label',
          `独立观察连接：${label}${
            observer.status === 'ready' && speedEnabled() ? `；弹幕速度：${rateText}` : ''
          }`,
        )
        badge.disabled = observer.status === 'connecting' || observer.status === 'ready'
        const age = (at: number | null | undefined) =>
          at === null || at === undefined
            ? '尚未收到'
            : `${Math.max(0, Math.floor((Date.now() - at) / 1000))} 秒前`
        badge.title = `独立匿名观察连接：${label}；不代表本条弹幕可见性\n弹幕速度按最近 5 秒折算为条/分\n传输：${
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
    owned.forEach(removeBadge)
    owned.clear()
  }
}
