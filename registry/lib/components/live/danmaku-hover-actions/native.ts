/** Narrow adapter for the live engine. No persistent prototype hooks or DOM removal interception. */
interface RenderItem {
  element: HTMLElement
  textData: { mode: number }
  isHover: boolean
  endTime: number
  mouseEnter: () => void
  mouseLeave: () => void
  shouldDestroy: () => boolean
}
interface Engine {
  layerWrap: HTMLElement
  danmaku: { core: { manager: { visualArray: RenderItem[] } } }
}

export const pauseNativeItem = (item: RenderItem, alive: () => boolean) => {
  if (
    ![1, 6].includes(item.textData?.mode) ||
    item.isHover ||
    !Number.isFinite(item.endTime) ||
    typeof item.mouseEnter !== 'function' ||
    typeof item.mouseLeave !== 'function' ||
    typeof item.shouldDestroy !== 'function'
  ) {
    return null
  }
  const descriptor = Object.getOwnPropertyDescriptor(item, 'shouldDestroy')
  const protect = () => false
  let released = false
  const release = () => {
    if (released) {
      return
    }
    released = true
    try {
      if (alive()) {
        item.mouseLeave()
      }
    } catch (error) {
      console.warn('原生弹幕恢复失败，已清理暂停保护', error)
    } finally {
      if (item.shouldDestroy === protect) {
        if (descriptor) {
          Object.defineProperty(item, 'shouldDestroy', descriptor)
        } else {
          delete item.shouldDestroy
        }
      }
    }
  }
  try {
    item.shouldDestroy = protect
    item.mouseEnter()
    return release
  } catch {
    release()
    return null
  }
}

export const createNativeHover = (page: Window & typeof globalThis) => {
  const context: { engine: Engine | null } = { engine: null }
  let disposed = false
  let pending = false
  let deadline = 0
  let timer = 0
  let restoreHook: (() => void) | null = null
  const stopCapture = () => {
    window.clearTimeout(timer)
    restoreHook?.()
    restoreHook = null
    pending = false
  }
  const capture = () => {
    if (disposed) {
      return
    }
    const prototype = page.LiveDanmakuEngine?.default?.prototype
    const original = prototype?.handleSocketMessage
    if (typeof original !== 'function') {
      if (Date.now() < deadline) {
        timer = window.setTimeout(capture, 250)
      } else {
        stopCapture()
      }
      return
    }
    const hook = function captureEngine(this: Engine, ...args: unknown[]) {
      stopCapture()
      if (this.layerWrap?.isConnected && Array.isArray(this.danmaku?.core?.manager?.visualArray)) {
        context.engine = this
      }
      return original.apply(this, args)
    }
    prototype.handleSocketMessage = hook
    restoreHook = () => {
      if (prototype.handleSocketMessage === hook) {
        prototype.handleSocketMessage = original
      }
    }
    timer = window.setTimeout(stopCapture, Math.max(0, deadline - Date.now()))
  }
  const requestCapture = () => {
    if (pending || disposed) {
      return
    }
    pending = true
    deadline = Date.now() + 15000
    capture()
  }
  requestCapture()
  return {
    pause(element: HTMLElement) {
      const { engine } = context
      if (!engine?.layerWrap.isConnected) {
        context.engine = null
        requestCapture()
        return null
      }
      const manager = engine.danmaku?.core?.manager
      const item = manager?.visualArray?.find(render => render.element === element)
      if (!item) {
        return null
      }
      return pauseNativeItem(item, () => element.isConnected && manager.visualArray?.includes(item))
    },
    dispose() {
      disposed = true
      stopCapture()
      context.engine = null
    },
  }
}
