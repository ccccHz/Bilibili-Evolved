import { defineComponentMetadata } from '@/components/define'
import {
  addComponentListener,
  getComponentSettings,
  removeComponentListener,
} from '@/core/settings'
import { select } from '@/core/spin-query'
import { addStyle } from '@/core/style'
import { Toast } from '@/core/toast'
import { getUserInfo } from '@/core/user-info'
import { getUID, mountVueComponent } from '@/core/utils'
import { liveUrls } from '@/core/utils/urls'
import { DanmakuDiagnostics } from './diagnostics'
import {
  resetDiagnosticViewState,
  setObserverRetryHandler,
  updateDiagnosticViewState,
} from './diagnostic-store'
import { markFailureObservedLate, recordSuspectedFailure } from './failure-history'
import { closeVisibilityHistoryManager } from './history-manager-store'
import { ObserverRecovery, RecoveryStatus } from './observer-recovery'
import { mountInputStatus } from './input-status'
import { recordVisibilityMeasurement } from './measurement-history'
import { DanmakuVisibilityCheckOptions, danmakuVisibilityCheckOptions } from './options'
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
let observer: ObserverRecovery | null = null
let disposeInputStatus: (() => void) | null = null
let diagnostics: DanmakuDiagnostics | null = null
let removeObserverListeners: (() => void) | null = null
let lifecycleVersion = 0
let activeNotice: ReturnType<typeof Toast.mini> | null = null
let noticeTimer = 0
let historyManagerVm: Vue | null = null
let waitingForContext: MutationObserver | null = null

const ensureHistoryManager = async () => {
  if (historyManagerVm) {
    return
  }
  const HistoryManager = (await import('./VisibilityHistoryManager.vue')).default
  historyManagerVm = mountVueComponent(HistoryManager)
  document.body.appendChild(historyManagerVm.$el)
}

const destroyHistoryManager = () => {
  closeVisibilityHistoryManager()
  historyManagerVm?.$destroy()
  historyManagerVm?.$el.remove()
  historyManagerVm = null
}

const refreshDiagnosticsWindow = () => diagnostics?.refresh()

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
  waitingForContext?.disconnect()
  waitingForContext = null
  removeComponentListener(`${componentName}.sendMatchTimeoutMs`, refreshDiagnosticsWindow)
  removeObserverListeners?.()
  removeObserverListeners = null
  disposeInputStatus?.()
  disposeInputStatus = null
  setObserverRetryHandler(null)
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
  resetDiagnosticViewState()
}

const load = async (settings: { options: DanmakuVisibilityCheckOptions }) => {
  cleanup()
  const entryVersion = lifecycleVersion
  logStartup('starting', {
    context: window === window.top ? 'top' : 'iframe',
    href: window.location.href,
  })
  if (window === window.top) {
    await ensureHistoryManager()
    if (entryVersion !== lifecycleVersion) {
      return
    }
  }
  updateDiagnosticViewState({ observerStatus: 'starting' })
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
  if (entryVersion !== lifecycleVersion) {
    return
  }
  if (!sendContext) {
    updateDiagnosticViewState({ observerStatus: 'inactive' })
    // A collapsed/rebuilt chat may return after startup's bounded wait.
    // Stay event-driven without a polling loop or a live socket.
    waitingForContext = new MutationObserver(() => {
      if (
        document.querySelector(chatHistorySelector) &&
        document.querySelector(sendButtonSelector) &&
        document.querySelector(`${originalTextAreaSelector}, ${customSendbarInputSelector}`)
      ) {
        waitingForContext?.disconnect()
        waitingForContext = null
        load(settings).catch(error => console.error(componentName, error))
      }
    })
    waitingForContext.observe(document.body, { childList: true, subtree: true })
    logStartup('waiting for send context')
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
  const nextObserver = new ObserverRecovery(resolveObserverConfig)
  const measurementSessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const saveMeasurement = (result: {
    id: number
    content: string
    capturedAt: number
    outcome: 'observed' | 'observed-late' | 'not-observed'
    latencyMs: number | null
    windowMs: number
    lateObservationLimitMs: number
  }) =>
    recordVisibilityMeasurement({
      id: `${result.capturedAt}-${result.id}`,
      schemaVersion: 1,
      sessionId: measurementSessionId,
      roomId: nextObserver.roomId,
      content: result.content,
      capturedAt: result.capturedAt,
      completedAt: Date.now(),
      outcome: result.outcome,
      latencyMs: result.latencyMs,
      windowMs: result.windowMs,
      lateObservationLimitMs: result.lateObservationLimitMs,
    }).catch(error => console.error(componentName, '保存可见性测量样本失败', error))
  const nextDiagnostics = new DanmakuDiagnostics(componentName, currentUid, currentUsername, {
    onObserved: ({ id, content, latencyMs, capturedAt, windowMs, lateObservationLimitMs }) => {
      saveMeasurement({
        id,
        content,
        capturedAt,
        outcome: 'observed',
        latencyMs,
        windowMs,
        lateObservationLimitMs,
      })
    },
    onNotObserved: ({ id, content, waitedMs, capturedAt, windowMs, lateObservationLimitMs }) => {
      if (nextObserver.status !== 'ready') {
        showMiniNotice('无法判断弹幕可见性')
        return
      }
      recordSuspectedFailure({
        id: `${capturedAt}-${id}`,
        roomId: nextObserver.roomId,
        content,
        waitedMs,
        windowMs,
        lateObservationLimitMs,
        recordedAt: capturedAt,
      }).catch(error => console.error(componentName, '保存疑似屏蔽记录失败', error))
      saveMeasurement({
        id,
        content,
        capturedAt,
        outcome: 'not-observed',
        latencyMs: null,
        windowMs,
        lateObservationLimitMs,
      })
      logDiagnostic(componentName, 'showing possible block notice', { waitedMs })
      showMiniNotice(`「${content}」可能被屏蔽`)
    },
    onLateObserved: ({ id, content, latencyMs, capturedAt, windowMs, lateObservationLimitMs }) => {
      markFailureObservedLate(`${capturedAt}-${id}`, latencyMs).catch(error =>
        console.error(componentName, '回撤疑似屏蔽记录失败', error),
      )
      saveMeasurement({
        id,
        content,
        capturedAt,
        outcome: 'observed-late',
        latencyMs,
        windowMs,
        lateObservationLimitMs,
      })
      showMiniNotice(`「${content}」已迟到出现，已撤回疑似屏蔽判断`)
    },
    onUpdate: updateDiagnosticViewState,
    getConfiguredSendMatchTimeout: () => settings.options.sendMatchTimeoutMs,
  })
  const onDanmaku = (event: Event) => {
    nextDiagnostics.record(true, (event as CustomEvent<ObservedDanmaku | null>).detail)
  }
  const onStatus = (event: Event) => {
    const status = (event as CustomEvent<RecoveryStatus>).detail
    if (status !== 'idle') {
      updateDiagnosticViewState({ observerStatus: status })
    }
    if (status !== 'ready' && nextDiagnostics.cancelPendingObservation()) {
      showMiniNotice('匿名观察连接中断，无法判断本次弹幕可见性')
    }
    logDiagnostic(componentName, 'observer status', (event as CustomEvent).detail)
  }
  nextObserver.addEventListener('danmaku', onDanmaku)
  nextObserver.addEventListener('status', onStatus)
  removeObserverListeners = () => {
    nextObserver.removeEventListener('danmaku', onDanmaku)
    nextObserver.removeEventListener('status', onStatus)
  }
  observer = nextObserver
  setObserverRetryHandler(() => nextObserver.retry())
  diagnostics = nextDiagnostics
  addComponentListener(`${componentName}.sendMatchTimeoutMs`, refreshDiagnosticsWindow)
  nextDiagnostics.start()

  try {
    disposeInputStatus = mountInputStatus(nextObserver, () => settings.options.showChatSpeed)
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
      if (nextObserver.status !== 'ready') {
        if (content.trim()) {
          showMiniNotice('匿名观察连接暂不可用，无法判断弹幕可见性')
        }
        return
      }
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
      nextObserver.recordPageActivity(item.dataset.id_str || '')
      nextDiagnostics.recordPageDanmaku({
        messageId: item.dataset.id_str || '',
        content: item.dataset.danmaku || '',
        username: item.dataset.uname || null,
      })
    }
    const initialPath = location.pathname
    let reloading = false
    const checkContext = () => {
      if (!reloading && (location.pathname !== initialPath || !chatHistory.isConnected)) {
        reloading = true
        load(settings).catch(error => console.error(componentName, error))
      }
    }
    const onOnline = () => {
      if (nextObserver.status !== 'ready') {
        nextObserver.retry()
      }
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('popstate', checkContext)
    const onPageHide = () => nextObserver.close()
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        nextObserver.start()
      }
    }
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    const contextObserver = new MutationObserver(checkContext)
    contextObserver.observe(document.body, { childList: true, subtree: true })
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
      contextObserver.disconnect()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('popstate', checkContext)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
    }
    nextObserver.start()
    logStartup('send capture ready')
    logDiagnostic(componentName, 'send capture and page latency calibration ready')
  } catch (error) {
    if (entryVersion !== lifecycleVersion) {
      return
    }
    console.error(componentName, error)
    cleanup()
    updateDiagnosticViewState({ observerStatus: 'error' })
    Toast.error(String(error), '直播弹幕可见性检测启动失败', 6000)
  }
}

const reload = () => load(getComponentSettings<DanmakuVisibilityCheckOptions>(componentName))

const unload = () => {
  cleanup()
  destroyHistoryManager()
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
  options: danmakuVisibilityCheckOptions,
  extraOptions: () => import('./DiagnosticsPanel.vue').then(m => m.default),
  entry: ({ settings }) => load(settings),
  reload,
  unload,
  urlInclude: liveUrls,
})
