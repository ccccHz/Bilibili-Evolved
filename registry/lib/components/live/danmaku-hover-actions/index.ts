import { defineComponentMetadata } from '@/components/define'
import { addStyle, removeStyle } from '@/core/style'
import { Toast } from '@/core/toast'
import { liveUrls } from '@/core/utils/urls'
import componentStyle from './danmaku-hover-actions.scss'

const componentName = 'liveDanmakuHoverActions'
const danmakuSelector = '.web-player-danmaku .bili-danmaku-x-dm'
const chatItemSelector = '#chat-items .chat-item[data-danmaku]'
const inputSelector = [
  '.danmaku-send-bar input',
  '.control-panel-ctnr textarea.chat-input',
  '.control-panel-ctnr input.chat-input',
].join(', ')
const sendButtonSelector = [
  '.control-panel-ctnr .bottom-actions .bl-button--primary',
  '.control-panel-ctnr button.send-btn',
].join(', ')
const defaultMaxLength = 30
const closeDelay = 160

let toolbar: HTMLDivElement | null = null
let activeDanmaku: HTMLElement | null = null
let frozenDanmaku: HTMLElement | null = null
let activeChatItem: HTMLElement | null = null
let activeContent = ''
let closeTimer = 0
let positionFrame = 0
let hoverClientX = 0
let targetTop = 0
let targetBottom = 0
let removeEventListeners: (() => void) | null = null

const isVisible = (element: HTMLElement) => {
  const { width, height } = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  return width > 0 && height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
}

const getDanmakuInput = () =>
  dqa(inputSelector).find(
    element =>
      (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
      !element.disabled &&
      isVisible(element),
  ) as HTMLInputElement | HTMLTextAreaElement | undefined

const getSendButton = () => {
  const button = dqa(sendButtonSelector).find(element => element instanceof HTMLButtonElement)
  return button as HTMLButtonElement | undefined
}

const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  input.value = value
  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

const getMaxLength = (input: HTMLInputElement | HTMLTextAreaElement) => {
  if (input.maxLength > 0) {
    return input.maxLength
  }
  const panelText = input.closest('.control-panel-ctnr')?.textContent || ''
  const match = panelText.match(/\d+\s*\/\s*(\d+)/)
  const limit = Number(match?.[1])
  return Number.isInteger(limit) && limit > 0 && limit <= 100 ? limit : defaultMaxLength
}

const truncate = (text: string, maxLength: number) => Array.from(text).slice(0, maxLength).join('')

const fillDanmakuInput = (content: string, cursorPosition?: number) => {
  const input = getDanmakuInput()
  if (!input) {
    Toast.error('未找到可用的直播弹幕输入框', '弹幕悬停操作', 3000)
    return null
  }
  setInputValue(input, truncate(content, getMaxLength(input)))
  input.focus()
  if (cursorPosition !== undefined) {
    const setCursor = () => {
      input.setSelectionRange(cursorPosition, cursorPosition)
      input.scrollLeft = 0
      input.scrollTop = 0
    }
    setCursor()
    requestAnimationFrame(() => {
      if (document.activeElement === input) {
        setCursor()
      }
    })
  }
  return input
}

const sendDanmaku = (content: string) => {
  const input = fillDanmakuInput(content)
  if (!input) {
    return
  }
  window.setTimeout(() => {
    const sendButton = getSendButton()
    if (!sendButton) {
      Toast.error('未找到直播弹幕发送按钮', '弹幕悬停操作', 3000)
      return
    }
    if (sendButton.disabled) {
      Toast.info('当前弹幕无法发送', '弹幕悬停操作', 3000)
      return
    }
    sendButton.click()
  })
}

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }
  Toast.success('弹幕已复制', '弹幕悬停操作', 1800)
}

const findLatestChatItem = (content: string) =>
  dqa(chatItemSelector)
    .reverse()
    .find(element => element instanceof HTMLElement && element.dataset.danmaku === content) as
    | HTMLElement
    | undefined

const clearCloseTimer = () => {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = 0
  }
}

const stopPositionLoop = () => {
  if (positionFrame) {
    cancelAnimationFrame(positionFrame)
    positionFrame = 0
  }
}

const hideToolbar = () => {
  clearCloseTimer()
  stopPositionLoop()
  activeDanmaku?.classList.remove('be-live-danmaku-action-target', 'be-live-danmaku-action-source')
  frozenDanmaku?.remove()
  activeDanmaku = null
  frozenDanmaku = null
  activeChatItem = null
  activeContent = ''
  hoverClientX = 0
  targetTop = 0
  targetBottom = 0
  toolbar?.classList.remove('be-live-danmaku-actions-visible')
}

const scheduleClose = () => {
  clearCloseTimer()
  closeTimer = window.setTimeout(hideToolbar, closeDelay)
}

const positionToolbar = () => {
  if (!toolbar || !frozenDanmaku?.isConnected) {
    hideToolbar()
    return
  }
  const toolbarRect = toolbar.getBoundingClientRect()
  const gap = 8
  const margin = 8
  const left = Math.min(
    Math.max(hoverClientX - toolbarRect.width / 2, margin),
    window.innerWidth - toolbarRect.width - margin,
  )
  const preferredTop = targetBottom + gap
  const top =
    preferredTop + toolbarRect.height <= window.innerHeight - margin
      ? preferredTop
      : Math.max(margin, targetTop - toolbarRect.height - gap)
  toolbar.style.left = `${Math.round(left)}px`
  toolbar.style.top = `${Math.round(top)}px`
  positionFrame = requestAnimationFrame(positionToolbar)
}

const createActionButton = (label: string, action: () => void | Promise<void>) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    action()
  })
  return button
}

const createFrozenDanmaku = (danmaku: HTMLElement) => {
  const rect = danmaku.getBoundingClientRect()
  const snapshot = danmaku.cloneNode(true) as HTMLElement
  snapshot.classList.remove('be-live-danmaku-action-target', 'be-live-danmaku-action-source')
  snapshot.classList.add('be-live-danmaku-action-snapshot')
  snapshot.removeAttribute('aria-live')
  snapshot.setAttribute('aria-label', `已暂停的弹幕: ${activeContent}`)
  snapshot.style.setProperty('position', 'fixed', 'important')
  snapshot.style.setProperty('left', `${rect.left}px`, 'important')
  snapshot.style.setProperty('top', `${rect.top}px`, 'important')
  snapshot.style.setProperty('width', `${rect.width}px`, 'important')
  snapshot.style.setProperty('height', `${rect.height}px`, 'important')
  snapshot.style.setProperty('margin', '0', 'important')
  snapshot.style.setProperty('animation', 'none', 'important')
  snapshot.style.setProperty('transform', 'none', 'important')
  snapshot.style.setProperty('display', 'block', 'important')
  snapshot.style.setProperty('pointer-events', 'auto', 'important')
  // The player itself creates high-level stacking contexts. Keep the snapshot just below the
  // toolbar so newly rendered danmaku cannot take pointer ownership away from the frozen item.
  snapshot.style.setProperty('z-index', '99999', 'important')
  snapshot.addEventListener('pointerenter', clearCloseTimer)
  snapshot.addEventListener('pointerleave', event => {
    const { relatedTarget } = event
    if (relatedTarget instanceof Node && toolbar?.contains(relatedTarget)) {
      return
    }
    scheduleClose()
  })
  frozenDanmaku = snapshot
  document.body.appendChild(snapshot)
  danmaku.classList.add('be-live-danmaku-action-source')
  return { snapshot, rect }
}

const ensureToolbar = () => {
  if (toolbar) {
    return toolbar
  }
  toolbar = document.createElement('div')
  toolbar.className = 'be-live-danmaku-actions'
  toolbar.setAttribute('role', 'toolbar')
  toolbar.setAttribute('aria-label', '弹幕操作')
  const repeatButton = createActionButton('+1', () => {
    if (activeContent) {
      sendDanmaku(activeContent)
      hideToolbar()
    }
  })
  const replyButton = createActionButton('@回复', () => {
    if (!activeContent || !activeChatItem?.dataset.uname) {
      return
    }
    fillDanmakuInput(`@${activeChatItem.dataset.uname}：${activeContent}`, 0)
    hideToolbar()
  })
  replyButton.dataset.action = 'reply'
  const copyButton = createActionButton('复制', async () => {
    if (activeContent) {
      await copyText(activeContent)
      hideToolbar()
    }
  })
  toolbar.append(repeatButton, replyButton, copyButton)
  toolbar.addEventListener('pointerenter', clearCloseTimer)
  toolbar.addEventListener('pointerleave', scheduleClose)
  document.body.appendChild(toolbar)
  return toolbar
}

const showToolbar = (danmaku: HTMLElement, clientX: number) => {
  clearCloseTimer()
  if (activeDanmaku === danmaku) {
    return
  }
  hoverClientX = clientX
  activeDanmaku?.classList.remove('be-live-danmaku-action-target', 'be-live-danmaku-action-source')
  activeDanmaku = danmaku
  activeDanmaku.classList.add('be-live-danmaku-action-target')
  activeContent = danmaku.textContent?.trim() || ''
  frozenDanmaku?.remove()
  const { snapshot, rect } = createFrozenDanmaku(activeDanmaku)
  frozenDanmaku = snapshot
  targetTop = rect.top
  targetBottom = rect.bottom
  activeChatItem = findLatestChatItem(activeContent) || null
  const currentToolbar = ensureToolbar()
  const replyButton = currentToolbar.querySelector('[data-action="reply"]') as HTMLButtonElement
  const username = activeChatItem?.dataset.uname
  replyButton.hidden = !username
  replyButton.title = username ? `回复 @${username}` : ''
  currentToolbar.classList.add('be-live-danmaku-actions-visible')
  stopPositionLoop()
  positionToolbar()
}

const load = () => {
  if (removeEventListeners) {
    return
  }
  addStyle(componentStyle, componentName)
  const onPointerOver = (event: PointerEvent) => {
    const { target } = event
    if (!(target instanceof Element)) {
      return
    }
    const danmaku = target.closest(danmakuSelector)
    if (danmaku instanceof HTMLElement) {
      showToolbar(danmaku, event.clientX)
    }
  }
  const onPointerOut = (event: PointerEvent) => {
    const { target } = event
    if (!(target instanceof Element)) {
      return
    }
    const danmaku = target.closest(danmakuSelector)
    if (!(danmaku instanceof HTMLElement) || danmaku !== activeDanmaku) {
      return
    }
    const { relatedTarget } = event
    if (
      relatedTarget instanceof Node &&
      (danmaku.contains(relatedTarget) ||
        frozenDanmaku?.contains(relatedTarget) ||
        toolbar?.contains(relatedTarget))
    ) {
      return
    }
    scheduleClose()
  }
  document.addEventListener('pointerover', onPointerOver, true)
  document.addEventListener('pointerout', onPointerOut, true)
  removeEventListeners = () => {
    document.removeEventListener('pointerover', onPointerOver, true)
    document.removeEventListener('pointerout', onPointerOut, true)
  }
}

const unload = () => {
  removeEventListeners?.()
  removeEventListeners = null
  hideToolbar()
  toolbar?.remove()
  toolbar = null
  removeStyle(componentName)
}

export const component = defineComponentMetadata({
  name: componentName,
  displayName: '直播弹幕悬停操作',
  author: {
    name: 'ccccHz',
    link: 'https://github.com/ccccHz',
  },
  tags: [componentsTags.live],
  entry: load,
  reload: load,
  unload,
  urlInclude: liveUrls,
})
