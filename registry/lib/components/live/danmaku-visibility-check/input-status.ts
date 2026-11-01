import { ObserverRecovery } from './observer-recovery'

interface OwnedInput {
  placeholder: { original: string | null; written: string | null }
  title: { original: string | null; written: string | null }
}

const inputSelector = 'textarea.chat-input, .danmaku-send-bar input'
const speedWindowSeconds = 30
const minimumSamplingSeconds = 5
const restrictedPlaceholder =
  /禁言|登录|等级|冷却|不足|发送过快|发言限制|无法发送|禁止|绑定|实名|验证/

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
    if (elapsed < minimumSamplingSeconds) {
      return null
    }
    return Math.round(
      (Array.from(this.buckets.values()).reduce((sum, count) => sum + count, 0) * 60) /
        Math.min(speedWindowSeconds, elapsed),
    )
  }

  isWarmingUp(now = Date.now()) {
    return now - this.startedAt < speedWindowSeconds * 1000
  }

  private prune(second: number) {
    this.buckets.forEach((_, key) => {
      if (key <= second - speedWindowSeconds || key > second) {
        this.buckets.delete(key)
      }
    })
  }
}

export const mountInputStatus = (observer: ObserverRecovery, speedEnabled: () => boolean) => {
  const speed = new ChatSpeedWindow()
  const owned = new Map<HTMLInputElement | HTMLTextAreaElement, OwnedInput>()
  const restore = (input: HTMLElement, name: 'placeholder' | 'title', item: OwnedInput) => {
    const attribute = item[name]
    if (attribute.written !== null && input.getAttribute(name) === attribute.written) {
      if (attribute.original === null) {
        input.removeAttribute(name)
      } else {
        input.setAttribute(name, attribute.original)
      }
    }
    attribute.written = null
  }
  const write = (
    input: HTMLElement,
    name: 'placeholder' | 'title',
    text: string,
    item: OwnedInput,
  ) => {
    const current = input.getAttribute(name)
    if (current !== item[name].written) {
      item[name].original = current
    }
    item[name].written = text
    if (current !== text) {
      input.setAttribute(name, text)
    }
  }
  const restoreInput = (input: HTMLElement, item: OwnedInput) => {
    restore(input, 'placeholder', item)
    restore(input, 'title', item)
  }
  const refresh = () => {
    owned.forEach((item, input) => {
      if (!input.isConnected || input.getBoundingClientRect().width === 0) {
        restoreInput(input, item)
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
          item = {
            placeholder: { original: input.getAttribute('placeholder'), written: null },
            title: { original: input.getAttribute('title'), written: null },
          }
          owned.set(input, item)
        }
        const label = {
          idle: '观察未启动',
          connecting: '观察连接中…',
          ready: '观察正常',
          retrying: '观察重连中…',
          error: '观察异常 · 设置中重试',
          closing: '观察关闭中',
          closed: '观察已关闭',
        }[observer.status]
        const rate = speed.rate()
        const rateText = rate === null ? '采样中' : `${rate}条/分`
        let text = label
        if (observer.status === 'ready' && speedEnabled()) {
          text =
            rate === null
              ? '已连接 · 采样中'
              : `${rateText} · ${speed.isWarmingUp() ? '采样中' : '已连接'}`
        }
        const age = (at: number | null | undefined) =>
          at === null || at === undefined
            ? '尚未收到'
            : `${Math.max(0, Math.floor((Date.now() - at) / 1000))} 秒前`
        let title = `独立匿名观察连接：${label}；不代表本条弹幕可见性\n弹幕速度：${rateText}，最近 30 秒折算为条/分，未满窗口时使用实际采样时长\n传输：${
          observer.health?.transportOpen ? '已打开' : '未打开'
        }；鉴权：${observer.health?.authenticated ? '成功' : '未完成'}\n心跳：${age(
          observer.health?.lastHeartbeatAt,
        )}；有效弹幕：${age(observer.health?.lastMessageAt)}${
          observer.retryAt
            ? `\n下次重试：${Math.max(0, Math.ceil((observer.retryAt - Date.now()) / 1000))} 秒后`
            : ''
        }`
        if (observer.lastError) {
          title += `\n最近原因：${observer.lastError}`
        }
        const originalTitle =
          input.getAttribute('title') !== item.title.written
            ? input.getAttribute('title')
            : item.title.original
        write(input, 'title', originalTitle ? `${originalTitle}\n${title}` : title, item)
        const currentPlaceholder = input.getAttribute('placeholder')
        if (currentPlaceholder !== item.placeholder.written) {
          item.placeholder.original = currentPlaceholder
        }
        if (
          input.disabled ||
          input.readOnly ||
          restrictedPlaceholder.test(item.placeholder.original || '')
        ) {
          restore(input, 'placeholder', item)
        } else {
          write(input, 'placeholder', text, item)
        }
      })
  }
  const onStatus = () => {
    speed.reset()
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
    owned.forEach((item, input) => restoreInput(input, item))
    owned.clear()
  }
}
