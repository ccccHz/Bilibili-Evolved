import { defineComponentMetadata, defineOptionsMetadata } from '@/components/define'
import { liveUrls } from '@/core/utils/urls'

const componentName = 'liveDanmakuSendHistory'
const storageKeyPrefix = 'be-live-danmaku-send-history'
const inputSelector = [
  '.control-panel-ctnr textarea.chat-input',
  '.control-panel-ctnr input.chat-input',
  '.danmaku-send-bar input',
].join(', ')
const sendButtonSelector = [
  '.control-panel-ctnr .bottom-actions .bl-button--primary',
  '.control-panel-ctnr button.send-btn',
].join(', ')

const options = defineOptionsMetadata({
  maxHistory: {
    displayName: '最多保存条数',
    defaultValue: 100,
    slider: {
      min: 10,
      max: 200,
      step: 10,
    },
    validator: (value: number) => {
      const integer = Math.round(value)
      return integer >= 10 && integer <= 200 ? integer : 100
    },
  },
})

type DanmakuInput = HTMLInputElement | HTMLTextAreaElement
type NavigationState = {
  cursor: number
  draft: string
}

let history: string[] = []
let maxHistory = 100
let currentRoomId = ''
let removeEventListeners: (() => void) | null = null
let navigationStates = new WeakMap<DanmakuInput, NavigationState>()
const applyingHistory = new WeakSet<DanmakuInput>()

const isDanmakuInput = (target: EventTarget | null): target is DanmakuInput =>
  (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
  target.matches(inputSelector)

const getRoomId = () => location.pathname.match(/^\/(?:blanc\/)?(\d+)/)?.[1] || ''

const getStorageKey = (roomId: string) => {
  return roomId ? `${storageKeyPrefix}:${roomId}` : storageKeyPrefix
}

const loadHistory = (roomId = getRoomId()) => {
  currentRoomId = roomId
  try {
    const stored = JSON.parse(localStorage.getItem(getStorageKey(roomId)) || '[]')
    history = Array.isArray(stored)
      ? stored.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : []
  } catch {
    history = []
  }
  history = history.slice(-maxHistory)
}

const syncRoom = () => {
  const roomId = getRoomId()
  if (roomId !== currentRoomId) {
    loadHistory(roomId)
    navigationStates = new WeakMap()
  }
}

const saveHistory = () => {
  try {
    localStorage.setItem(getStorageKey(currentRoomId), JSON.stringify(history))
  } catch {
    // History still works for the current page when storage is unavailable.
  }
}

const addHistory = (value: string) => {
  syncRoom()
  const content = value.trim()
  if (!content || history[history.length - 1] === content) {
    return
  }
  history.push(content)
  history = history.slice(-maxHistory)
  saveHistory()
  navigationStates = new WeakMap()
}

const setInputValue = (input: DanmakuInput, value: string) => {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  applyingHistory.add(input)
  if (setter) {
    setter.call(input, value)
  } else {
    input.value = value
  }
  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }))
  applyingHistory.delete(input)
  input.setSelectionRange(value.length, value.length)
}

const navigateHistory = (input: DanmakuInput, direction: -1 | 1) => {
  syncRoom()
  if (history.length === 0) {
    return false
  }
  let state = navigationStates.get(input)
  if (!state) {
    state = {
      cursor: history.length,
      draft: input.value,
    }
    navigationStates.set(input, state)
  }

  if (direction === -1) {
    state.cursor = Math.max(0, state.cursor - 1)
  } else if (state.cursor < history.length) {
    state.cursor += 1
  } else {
    return false
  }

  setInputValue(input, state.cursor === history.length ? state.draft : history[state.cursor])
  return true
}

const getPanelInput = (button: Element) => {
  const panel = button.closest('.control-panel-ctnr')
  return panel?.querySelector<DanmakuInput>('textarea.chat-input, input.chat-input') || null
}

const handleKeydown = (event: KeyboardEvent) => {
  if (!isDanmakuInput(event.target) || event.isComposing || event.keyCode === 229) {
    return
  }
  const { target: input } = event
  if (
    (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  ) {
    if (navigateHistory(input, event.key === 'ArrowUp' ? -1 : 1)) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    return
  }
  if (
    event.key === 'Enter' &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  ) {
    addHistory(input.value)
  }
}

const handleClick = (event: MouseEvent) => {
  const { target } = event
  if (!(target instanceof Element)) {
    return
  }
  const button = target.closest<HTMLButtonElement>(sendButtonSelector)
  if (!button || button.disabled) {
    return
  }
  const input = getPanelInput(button)
  if (input) {
    addHistory(input.value)
  }
}

const handleInput = (event: Event) => {
  if (isDanmakuInput(event.target) && !applyingHistory.has(event.target)) {
    navigationStates.delete(event.target)
  }
}

const load = () => {
  if (removeEventListeners) {
    return
  }
  loadHistory()
  document.addEventListener('keydown', handleKeydown, true)
  document.addEventListener('click', handleClick, true)
  document.addEventListener('input', handleInput, true)
  removeEventListeners = () => {
    document.removeEventListener('keydown', handleKeydown, true)
    document.removeEventListener('click', handleClick, true)
    document.removeEventListener('input', handleInput, true)
  }
}

const unload = () => {
  removeEventListeners?.()
  removeEventListeners = null
  navigationStates = new WeakMap()
}

export const component = defineComponentMetadata({
  name: componentName,
  displayName: '直播弹幕发送历史',
  author: {
    name: 'chz',
    link: 'https://github.com/ccccHz',
  },
  tags: [componentsTags.live],
  options,
  entry: ({ settings }) => {
    maxHistory = settings.options.maxHistory
    load()
  },
  reload: load,
  unload,
  urlInclude: liveUrls,
})
