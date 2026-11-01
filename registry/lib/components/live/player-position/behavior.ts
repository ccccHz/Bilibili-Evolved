export const isWebFullscreen = (document: Document) =>
  document.body.classList.contains('player-full-win')

export const needsPlayerPosition = (
  rect: { top: number; bottom: number; height: number },
  viewportHeight: number,
) =>
  Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0)) <
  Math.min(rect.height, viewportHeight) * 0.8

export const findWebFullscreenControl = (player: Element): HTMLElement | null => {
  const named = player.querySelector<HTMLElement>(
    '[title="网页模式"], [title="网页全屏"], [aria-label="网页模式"], [aria-label="网页全屏"]',
  )
  if (named) {
    return named
  }
  // Verified on Room Player 3.11.9. The adjacent native-fullscreen icon has
  // a different path. Never fall back to an arbitrary control by index.
  const control = Array.from(player.querySelectorAll<HTMLElement>('.right-area > .tip-wrap')).find(
    wrapper =>
      Array.from(wrapper.querySelectorAll('svg path')).some(path =>
        (path.getAttribute('d') || '').startsWith('M12 5C9.48178'),
      ),
  )
  // The wrapper only owns the tooltip. The click handler is on its child;
  // clicking the wrapper programmatically does not reach that handler.
  return control?.querySelector<HTMLElement>('.icon') || control || null
}

export const mountPlayerPosition = (
  document: Document,
  options: {
    autoPosition: boolean
    rememberWebFullscreen: boolean
    readMode(): boolean | null
    saveMode(mode: boolean): void
  },
) => {
  const window = document.defaultView
  let disposed = false
  let player: HTMLElement | null = null
  let identity = `${window.location.pathname}|`
  let positionDone = false
  let restoreDone = false
  let userTookOver = false
  let desiredMode: boolean | null = null
  let attempts = 0
  let modeAttempts = 0
  let modeDeadline = 0
  let nextAttemptAt = 0
  let frame = 0
  let timer = 0
  let modeTimer = 0
  let stableMode: boolean | null = null

  let scan: () => void
  const queueScan = () => {
    if (!disposed && !frame) {
      frame = window.requestAnimationFrame(scan)
    }
  }
  scan = () => {
    frame = 0
    if (disposed) {
      return
    }
    const next =
      document.querySelector<HTMLElement>('.live-player-ctnr') ||
      document.querySelector<HTMLIFrameElement>('iframe[src*="live.bilibili.com/blanc/"]')
    const nextIdentity = `${window.location.pathname}|${
      next instanceof HTMLIFrameElement ? next.src : ''
    }`
    if (next !== player || identity !== nextIdentity) {
      const newRoom = identity !== nextIdentity
      player = next
      identity = nextIdentity
      // Player replacement must not revoke manual scrolling in the same room.
      if (newRoom) {
        userTookOver = false
      }
      positionDone = userTookOver
      restoreDone = userTookOver
      desiredMode = options.readMode()
      stableMode = null
      attempts = 0
      modeAttempts = 0
      modeDeadline = Date.now() + 15000
      nextAttemptAt = 0
      clearTimeout(timer)
      clearTimeout(modeTimer)
    }
    if (
      !player ||
      !player.isConnected ||
      userTookOver ||
      document.fullscreenElement ||
      (positionDone && restoreDone)
    ) {
      return
    }
    if (
      !(player instanceof HTMLIFrameElement) &&
      !player.querySelector('.live-player-mounter, .web-player-danmaku, video')
    ) {
      return
    }
    const rect = player.getBoundingClientRect()
    if (!rect.width || !rect.height || Date.now() < nextAttemptAt) {
      return
    }
    if (!positionDone) {
      if (
        !options.autoPosition ||
        isWebFullscreen(document) ||
        !needsPlayerPosition(rect, window.innerHeight)
      ) {
        positionDone = true
      } else if (attempts < 4) {
        player.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
        attempts += 1
      } else {
        positionDone = true
      }
    }
    if (!restoreDone) {
      if (
        !options.rememberWebFullscreen ||
        desiredMode === null ||
        player instanceof HTMLIFrameElement ||
        isWebFullscreen(document) === desiredMode
      ) {
        restoreDone = true
        stableMode = isWebFullscreen(document)
        if (
          desiredMode === null &&
          options.rememberWebFullscreen &&
          !(player instanceof HTMLIFrameElement)
        ) {
          options.saveMode(stableMode)
        }
      } else if (modeAttempts < 4 && Date.now() < modeDeadline) {
        const mounter = player.querySelector('.live-player-mounter') || player
        // The platform mounts its controls lazily, after a throttled mousemove.
        // Missing controls must not consume the click budget before they exist.
        const bounds = mounter.getBoundingClientRect()
        mounter.dispatchEvent(
          new MouseEvent('mousemove', {
            bubbles: true,
            clientX: bounds.left + bounds.width / 2,
            clientY: bounds.top + bounds.height / 2,
          }),
        )
        const control = findWebFullscreenControl(player)
        if (control) {
          modeAttempts += 1
          control.click()
        }
      } else {
        restoreDone = true
        // Preserve the saved preference when this player cannot restore it.
        stableMode = isWebFullscreen(document)
        console.warn('livePlayerPosition: 网页全屏恢复未完成，已停止尝试')
      }
    }
    if (!positionDone || !restoreDone) {
      nextAttemptAt =
        Date.now() +
        [500, 500, 1000, 1800][Math.max(0, Math.min(3, Math.max(attempts, modeAttempts) - 1))]
      clearTimeout(timer)
      timer = window.setTimeout(queueScan, nextAttemptAt - Date.now())
    }
  }
  const onModeChange = () => {
    queueScan()
    clearTimeout(modeTimer)
    modeTimer = window.setTimeout(() => {
      if (
        disposed ||
        !restoreDone ||
        !player?.isConnected ||
        document.fullscreenElement ||
        !options.rememberWebFullscreen
      ) {
        return
      }
      const mode = isWebFullscreen(document)
      if (stableMode !== null && mode !== stableMode) {
        options.saveMode(mode)
      }
      stableMode = mode
    }, 500)
  }
  const onUserIntent = (event: Event) => {
    if (!event.isTrusted) {
      return
    }
    const target = event.target instanceof Element ? event.target : null
    if (event instanceof KeyboardEvent) {
      if (
        target?.closest('input, textarea, [contenteditable]') ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)
      ) {
        return
      }
    } else if (event instanceof WheelEvent && (event.ctrlKey || event.metaKey)) {
      return
    }
    userTookOver = true
    positionDone = true
    restoreDone = true
    stableMode = isWebFullscreen(document)
    clearTimeout(timer)
  }
  const structureObserver = new MutationObserver(() => {
    if (
      !player?.isConnected ||
      window.location.pathname !== identity.split('|')[0] ||
      !positionDone ||
      !restoreDone
    ) {
      queueScan()
    }
  })
  structureObserver.observe(document.body, { childList: true, subtree: true })
  const modeObserver = new MutationObserver(onModeChange)
  modeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
  window.addEventListener('popstate', queueScan)
  window.addEventListener('resize', queueScan)
  window.addEventListener('pageshow', queueScan)
  window.addEventListener('wheel', onUserIntent, { passive: true })
  window.addEventListener('touchmove', onUserIntent, { passive: true })
  window.addEventListener('keydown', onUserIntent)
  queueScan()
  return () => {
    disposed = true
    structureObserver.disconnect()
    modeObserver.disconnect()
    window.cancelAnimationFrame(frame)
    clearTimeout(timer)
    clearTimeout(modeTimer)
    window.removeEventListener('popstate', queueScan)
    window.removeEventListener('resize', queueScan)
    window.removeEventListener('pageshow', queueScan)
    window.removeEventListener('wheel', onUserIntent)
    window.removeEventListener('touchmove', onUserIntent)
    window.removeEventListener('keydown', onUserIntent)
  }
}
