import { defineComponentMetadata } from '@/components/define'
import { getUID } from '@/core/utils'
import { getComponentSettings } from '@/core/settings'
import { liveUrls } from '@/core/utils/urls'
import { Toast } from '@/core/toast'
import { select } from '@/core/spin-query'
import { readCurrentMedal, readLikeCount } from './api'
import { runLightingTrial } from './runner'
import { lightingState as state, lightingActions as actions } from './state'

const name = 'liveAutoLightMedal'
let dispose: (() => void) | null = null
let generation = 0
const unload = () => {
  generation++
  dispose?.()
  dispose = null
  state.busy = false
  state.message = '组件已关闭'
  actions.check = () => undefined
  actions.cancel = () => undefined
}
const load = async () => {
  unload()
  const currentGeneration = generation
  await select('body')
  if (generation !== currentGeneration) {
    return
  }
  let stopped = false
  let running: AbortController | null = null
  let handledRoot: Element | null = null
  let path = location.pathname
  let deadline = Date.now() + 15000
  state.message = '等待当前直播间'
  const cancel = () => running?.abort()
  const run = async (root: HTMLElement, button: HTMLElement) => {
    const controller = new AbortController()
    running = controller
    const { signal } = controller
    const uid = String(getUID() || '')
    state.busy = true
    state.clicks = 0
    state.total = 0
    state.message = '正在检查当前房间粉丝牌'
    const current = () =>
      !stopped &&
      !signal.aborted &&
      !document.hidden &&
      root.isConnected &&
      location.pathname === path
    const update = (message: string) => {
      if (!stopped && running === controller) {
        state.message = message
      }
    }
    try {
      const requestedRoom = Number(path.match(/^\/(?:blanc\/)?(\d+)/)?.[1])
      if (!/^\d+$/.test(uid) || uid === '0') {
        update('登录后才能检查粉丝牌')
        return
      }
      const medal = await readCurrentMedal(requestedRoom, uid, signal)
      if (!current()) {
        return
      }
      if (!medal.hasMedal) {
        update('没有当前房间的粉丝牌，已跳过')
        return
      }
      if (medal.lighted === true) {
        update('当前房间粉丝牌已点亮')
        return
      }
      if (medal.lighted !== false) {
        update('粉丝牌状态暂不明确，未执行点赞')
        return
      }
      if (!medal.live) {
        update('当前房间未开播，暂不执行点赞；开播后可重新检查')
        return
      }
      const count = await readLikeCount(medal, signal)
      if (!count) {
        update('未找到可执行的免费点赞任务，已跳过')
        return
      }
      if (!navigator.locks) {
        update('当前浏览器无法防止多个页面重复点赞，已跳过')
        return
      }
      await navigator.locks.request(
        `${name}:${uid}:${medal.roomId}`,
        { ifAvailable: true },
        async lock => {
          if (!lock || !current()) {
            update('其他页面正在处理该房间，已跳过')
            return
          }
          const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(
            new Date(),
          )
          const key = `${name}:${uid}:${medal.roomId}`
          const record = localStorage.getItem(key)
          if (record && JSON.parse(record).day === day) {
            update('今天已在该房间尝试过，不重复点赞')
            return
          }
          // Read the native cooldown; the component never calls the account-write API directly.
          let element: HTMLElement | null = button
          while (element && !Reflect.get(element, '__vue__')?.handleLikeBtnClick) {
            element = element.parentElement
          }
          const native = element ? Reflect.get(element, '__vue__') : null
          if (!native) {
            update('当前点赞按钮暂不支持，未执行')
            return
          }
          state.total = count
          const notify = getComponentSettings<{ showNotifications: boolean }>(name).options
            .showNotifications
          update('粉丝牌未点亮，正在完成免费点赞任务')
          if (notify) {
            Toast.info(state.message, '当前房间自动点亮粉丝牌', 2500)
          }
          const result = await runLightingTrial({
            currentRoomId: () => (current() ? medal.roomId : 0),
            readState: () => readCurrentMedal(requestedRoom, uid, signal),
            clickNativeLike: async () => {
              if (
                !current() ||
                !button.isConnected ||
                native.likeBtnClickIsCoolingDown ||
                button.getBoundingClientRect().width === 0
              ) {
                throw new Error('点赞按钮暂不可用')
              }
              localStorage.setItem(key, JSON.stringify({ day }))
              button.click()
            },
            wait: ms =>
              new Promise((resolve, reject) => {
                let timer = 0
                const abort = () => {
                  clearTimeout(timer)
                  reject(new Error('cancelled'))
                }
                timer = window.setTimeout(() => {
                  signal.removeEventListener('abort', abort)
                  resolve()
                }, ms)
                signal.addEventListener('abort', abort, { once: true })
                if (signal.aborted) {
                  abort()
                }
              }),
            cooldownMs: Number(native.likeBtnClickFrequencyLimit) * 1000,
            reportMaxMs: Number(native.likeBtnClickMaxTimeInterval) * 1000,
            maxClicks: count,
            onClick: clicks => {
              state.clicks = clicks
            },
            signal,
          })
          if (signal.aborted) {
            update('本次已停止；已点击的点赞可能稍后上报')
          } else if (['lit', 'already-lit'].includes(result.status)) {
            update('当前房间粉丝牌已点亮')
            if (notify) {
              Toast.success(state.message, '当前房间自动点亮粉丝牌', 4000)
            }
          } else {
            update('本次未确认点亮，已停止，不会继续补赞')
          }
        },
      )
    } catch (error) {
      update(
        signal.aborted
          ? '本次已停止'
          : `检查已停止：${error instanceof Error ? error.message : '暂时无法读取状态'}`,
      )
    } finally {
      if (running === controller) {
        running = null
        state.busy = false
      }
    }
  }
  const check = () => {
    if (stopped) {
      return
    }
    if (location.pathname !== path) {
      cancel()
      path = location.pathname
      handledRoot = null
      deadline = Date.now() + 15000
    }
    if (document.hidden || running || handledRoot?.isConnected || Date.now() > deadline) {
      return
    }
    const button = document.querySelector<HTMLElement>('.control-panel-ctnr .like-btn')
    const root = button?.closest<HTMLElement>('.control-panel-ctnr')
    if (!button || !root) {
      return
    }
    handledRoot = root
    run(root, button).catch(error => console.error(name, error))
  }
  const visibility = () => {
    if (document.hidden) {
      cancel()
    } else {
      if (!handledRoot) {
        deadline = Date.now() + 15000
      }
      check()
    }
  }
  const observer = new MutationObserver(check)
  observer.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('popstate', check)
  window.addEventListener('pagehide', cancel)
  document.addEventListener('visibilitychange', visibility)
  actions.check = () => {
    if (!running) {
      handledRoot = null
      deadline = Date.now() + 15000
      check()
    }
  }
  actions.cancel = cancel
  dispose = () => {
    stopped = true
    cancel()
    observer.disconnect()
    window.removeEventListener('popstate', check)
    window.removeEventListener('pagehide', cancel)
    document.removeEventListener('visibilitychange', visibility)
  }
  check()
}

export const component = defineComponentMetadata({
  name,
  displayName: '当前房间自动点亮粉丝牌',
  author: { name: 'ccccHz', link: 'https://github.com/ccccHz' },
  tags: [componentsTags.live],
  enabledByDefault: false,
  options: { showNotifications: { displayName: '显示点亮进度通知', defaultValue: true } },
  extraOptions: () => import('./StatusPanel.vue').then(m => m.default),
  entry: load,
  reload: load,
  unload,
  urlInclude: liveUrls,
})
