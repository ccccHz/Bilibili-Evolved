import { defineComponentMetadata } from '@/components/define'
import { select } from '@/core/spin-query'
import { addStyle } from '@/core/style'
import { Toast } from '@/core/toast'
import { getUserInfo } from '@/core/user-info'
import { getUID } from '@/core/utils'
import { liveUrls } from '@/core/utils/urls'
import { DanmakuDiagnostics } from './diagnostics'
import { LaplaceDanmakuObserver } from './laplace-adapter'
import { resolveObserverConfig } from './room-config'
import noticeStyle from './notice.scss'
import { ObservedDanmaku } from './types'

const componentName = 'liveDanmakuVisibilityCheck'
const originalTextAreaSelector = 'textarea.chat-input'
const sendButtonSelector = 'button.send-btn'
const customSendbarInputSelector = '.danmaku-send-bar input'
const chatHistorySelector = '.chat-history-list'
const danmakuItemSelector = '.danmaku-item[data-id_str]'
const diagnosticLoggingEnabled = false
const startupLoggingEnabled = true
let observer: LaplaceDanmakuObserver | null = null
let diagnostics: DanmakuDiagnostics | null = null
let removeObserverListeners: (() => void) | null = null
let lifecycleVersion = 0
let activeNotice: ReturnType<typeof Toast.mini> | null = null
let noticeTimer = 0

const logDiagnostic = (...args: unknown[]) => {
  if (diagnosticLoggingEnabled) {
    console.log(...args)
  }
}

const logStartup = (...args: unknown[]) => {
  if (startupLoggingEnabled) {
    console.info(componentName, ...args)
  }
}

const showMiniNotice = (message: string) => {
  if (noticeTimer) {
    clearTimeout(noticeTimer)
    noticeTimer = 0
  }
  activeNotice?.tippy.destroy()
  addStyle(noticeStyle, `${componentName}-notice-style`)
  const content = document.createElement('span')
  content.textContent = message
  const { activeElement } = document
  const isActiveInput =
    activeElement instanceof Element &&
    activeElement.matches(`${originalTextAreaSelector}, ${customSendbarInputSelector}`)
  const trigger =
    (isActiveInput && activeElement) ||
    document.querySelector(originalTextAreaSelector) ||
    document.querySelector(customSendbarInputSelector) ||
    document.querySelector(sendButtonSelector) ||
    document.body
  const notice = Toast.mini(content, trigger, {
    appendTo: () => document.body,
    maxWidth: 360,
    offset: [0, 8],
    placement: 'top-start',
    showOnCreate: true,
    theme: 'danmaku-visibility',
    trigger: 'manual',
  })
  activeNotice = notice
  noticeTimer = window.setTimeout(() => {
    notice.tippy.destroy()
    if (activeNotice === notice) {
      activeNotice = null
    }
    noticeTimer = 0
  }, 3000)
}

const cleanup = () => {
  lifecycleVersion += 1
  removeObserverListeners?.()
  removeObserverListeners = null
  diagnostics?.stop()
  diagnostics = null
  observer?.close()
  observer = null
  if (noticeTimer) {
    clearTimeout(noticeTimer)
    noticeTimer = 0
  }
  activeNotice?.tippy.destroy()
  activeNotice = null
}

const entry = async () => {
  cleanup()
  const entryVersion = lifecycleVersion
  logStartup('starting', {
    context: window === window.top ? 'top' : 'iframe',
    href: window.location.href,
  })
  const sendContext = await select(
    () => {
      const chatHistory = document.querySelector(chatHistorySelector)
      const originalInput = document.querySelector(originalTextAreaSelector)
      const customInput = document.querySelector(customSendbarInputSelector)
      const sendButton = document.querySelector(sendButtonSelector)
      if (
        !(chatHistory instanceof HTMLElement) ||
        !(sendButton instanceof HTMLButtonElement) ||
        (!originalInput && !customInput)
      ) {
        return null
      }
      return { chatHistory }
    },
    { maxRetry: 20, queryInterval: 500 },
  )
  if (!sendContext || entryVersion !== lifecycleVersion) {
    logStartup('not started: send context was not found or was replaced')
    return
  }
  logStartup('send context ready', {
    context: window === window.top ? 'top' : 'iframe',
  })
  logDiagnostic(componentName, 'send context ready', {
    context: window === window.top ? 'top' : 'iframe',
    href: window.location.href,
  })
  const currentUid = Number(getUID())
  if (!Number.isFinite(currentUid) || currentUid <= 0) {
    logStartup('not started: no logged-in UID')
    return
  }
  let currentUsername: string | null = null
  try {
    const userInfo = (await getUserInfo()) as { uname?: unknown }
    currentUsername = typeof userInfo.uname === 'string' ? userInfo.uname : null
  } catch (error) {
    logDiagnostic(componentName, 'failed to load nickname evidence', error)
  }
  if (entryVersion !== lifecycleVersion) {
    return
  }
  const nextObserver = new LaplaceDanmakuObserver()
  const nextDiagnostics = new DanmakuDiagnostics(componentName, currentUid, currentUsername, {
    onNotObserved: ({ content, waitedMs }) => {
      if (nextObserver.status !== 'ready') {
        showMiniNotice('无法判断弹幕可见性')
        return
      }
      logDiagnostic(componentName, 'showing possible block notice', { waitedMs })
      showMiniNotice(`「${content}」可能被屏蔽`)
    },
  })
  const onDanmaku = (event: Event) => {
    nextDiagnostics.record(true, (event as CustomEvent<ObservedDanmaku | null>).detail)
  }
  const onStatus = (event: Event) => {
    logDiagnostic(componentName, 'observer status', (event as CustomEvent).detail)
  }
  nextObserver.addEventListener('danmaku', onDanmaku)
  nextObserver.addEventListener('status', onStatus)
  removeObserverListeners = () => {
    nextObserver.removeEventListener('danmaku', onDanmaku)
    nextObserver.removeEventListener('status', onStatus)
  }
  observer = nextObserver
  diagnostics = nextDiagnostics
  nextDiagnostics.start()

  try {
    const config = await resolveObserverConfig()
    if (entryVersion !== lifecycleVersion) {
      nextObserver.close()
      return
    }
    await nextObserver.connect(config)
    if (entryVersion !== lifecycleVersion) {
      nextObserver.close()
      return
    }
    const observerReadyDetails = {
      roomId: config.roomId,
      address: config.address,
      hasBuvid: Boolean(config.buvid),
    }
    logStartup('observer ready', observerReadyDetails)
    logDiagnostic(componentName, 'Laplace observer ready', observerReadyDetails)
    const { chatHistory } = sendContext
    const getOriginalContent = () =>
      (document.querySelector(originalTextAreaSelector) as HTMLTextAreaElement | null)?.value || ''
    const captureContent = (
      source: 'button-click' | 'original-enter' | 'custom-enter',
      content: string,
    ) => {
      logDiagnostic(componentName, 'send interaction detected', {
        source,
        hasContent: Boolean(content.trim()),
      })
      nextDiagnostics.captureSend(content)
    }
    const onDocumentClick = (event: MouseEvent) => {
      const { target } = event
      if (target instanceof Element && target.closest(sendButtonSelector)) {
        captureContent('button-click', getOriginalContent())
      }
    }
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
        return
      }
      const { target } = event
      if (target instanceof HTMLTextAreaElement && target.matches(originalTextAreaSelector)) {
        captureContent('original-enter', target.value)
      } else if (target instanceof HTMLInputElement && target.matches(customSendbarInputSelector)) {
        captureContent('custom-enter', target.value || getOriginalContent())
      }
    }
    document.addEventListener('click', onDocumentClick, true)
    document.addEventListener('keydown', onDocumentKeyDown, true)
    const recordDanmakuItem = (element: Element) => {
      const item = element.matches(danmakuItemSelector)
        ? element
        : element.querySelector(danmakuItemSelector)
      if (!(item instanceof HTMLElement)) {
        return
      }
      nextDiagnostics.recordPageDanmaku({
        messageId: item.dataset.id_str || '',
        content: item.dataset.danmaku || '',
        username: item.dataset.uname || null,
      })
    }
    const pageDanmakuObserver = new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(node => {
          if (node instanceof Element) {
            recordDanmakuItem(node)
          }
        })
      })
    })
    pageDanmakuObserver.observe(chatHistory, { childList: true, subtree: true })
    const removeObserverEventListeners = removeObserverListeners
    removeObserverListeners = () => {
      removeObserverEventListeners?.()
      document.removeEventListener('click', onDocumentClick, true)
      document.removeEventListener('keydown', onDocumentKeyDown, true)
      pageDanmakuObserver.disconnect()
    }
    logStartup('send capture ready')
    logDiagnostic(componentName, 'send capture and page latency calibration ready')
  } catch (error) {
    if (entryVersion !== lifecycleVersion) {
      return
    }
    console.error(componentName, error)
    cleanup()
    Toast.error(String(error), '直播弹幕可见性检测启动失败', 6000)
  }
}

export const component = defineComponentMetadata({
  name: componentName,
  displayName: '直播弹幕公开可见性检测',
  author: {
    name: 'ccccHz',
    link: 'https://github.com/ccccHz',
  },
  tags: [componentsTags.live, componentsTags.experimental],
  enabledByDefault: false,
  entry,
  reload: entry,
  unload: cleanup,
  urlInclude: liveUrls,
})
