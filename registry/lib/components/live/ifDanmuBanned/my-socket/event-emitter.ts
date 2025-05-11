/**
 * 自定义EventEmitter实现，替代Node.js的events模块
 */

// 事件监听器类型
type Listener = (...args: any[]) => void

// 事件监听器配置
interface ListenerConfig {
  listener: Listener
  once: boolean
}

/**
 * 自定义EventEmitter类，实现事件发布订阅模式
 */
export class EventEmitter {
  private events: Map<string | symbol, ListenerConfig[]> = new Map()

  /**
   * 添加事件监听器
   * @param eventName 事件名称
   * @param listener 监听器函数
   */
  on(eventName: string | symbol, listener: Listener): this {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, [])
    }

    this.events.get(eventName)!.push({
      listener,
      once: false,
    })

    return this
  }

  /**
   * addListener方法，作为on方法的别名
   * @param eventName 事件名称
   * @param listener 监听器函数
   */
  addListener(eventName: string | symbol, listener: Listener): this {
    return this.on(eventName, listener)
  }

  /**
   * 添加一次性事件监听器
   * @param eventName 事件名称
   * @param listener 监听器函数
   */
  once(eventName: string | symbol, listener: Listener): this {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, [])
    }

    this.events.get(eventName)!.push({
      listener,
      once: true,
    })

    return this
  }

  /**
   * 移除事件监听器
   * @param eventName 事件名称
   * @param listener 监听器函数
   */
  off(eventName: string | symbol, listener: Listener): this {
    if (!this.events.has(eventName)) {
      return this
    }

    const listeners = this.events.get(eventName)!
    const index = listeners.findIndex(l => l.listener === listener)

    if (index !== -1) {
      listeners.splice(index, 1)

      if (listeners.length === 0) {
        this.events.delete(eventName)
      }
    }

    return this
  }

  /**
   * removeListener方法，作为off方法的别名
   * @param eventName 事件名称
   * @param listener 监听器函数
   */
  removeListener(eventName: string | symbol, listener: Listener): this {
    return this.off(eventName, listener)
  }

  /**
   * 移除指定事件的所有监听器
   * @param eventName 事件名称
   */
  removeAllListeners(eventName?: string | symbol): this {
    if (eventName) {
      this.events.delete(eventName)
    } else {
      this.events.clear()
    }

    return this
  }

  /**
   * 获取监听器数量
   * @param eventName 事件名称
   */
  listenerCount(eventName: string | symbol): number {
    if (!this.events.has(eventName)) {
      return 0
    }

    return this.events.get(eventName)!.length
  }

  /**
   * 获取所有监听器
   * @param eventName 事件名称
   */
  listeners(eventName: string | symbol): Listener[] {
    if (!this.events.has(eventName)) {
      return []
    }

    return this.events.get(eventName)!.map(config => config.listener)
  }

  /**
   * 触发事件
   * @param eventName 事件名称
   * @param args 传递给监听器的参数
   */
  emit(eventName: string | symbol, ...args: any[]): boolean {
    if (!this.events.has(eventName)) {
      return false
    }

    const listeners = this.events.get(eventName)!.slice()
    const oncers: number[] = []

    // 执行所有监听器
    listeners.forEach((config, index) => {
      config.listener(...args)

      // 记录一次性监听器的索引
      if (config.once) {
        oncers.push(index)
      }
    })

    // 移除一次性监听器（从后往前移除，避免索引变化）
    if (oncers.length > 0) {
      const currentListeners = this.events.get(eventName)!
      for (let i = oncers.length - 1; i >= 0; i--) {
        currentListeners.splice(oncers[i], 1)
      }

      // 如果没有监听器了，删除事件
      if (currentListeners.length === 0) {
        this.events.delete(eventName)
      }
    }

    return true
  }
}

// 导出relayEvent符号，用于NiceEventEmitter
export const relayEvent = Symbol('relay')

/**
 * 扩展的EventEmitter，支持事件转发
 */
export class NiceEventEmitter extends EventEmitter {
  /**
   * 触发事件，并通过relayEvent转发
   * @param eventName 事件名称
   * @param args 传递给监听器的参数
   */
  emit(eventName: string | symbol, ...params: any[]): boolean {
    super.emit(eventName, ...params)
    super.emit(relayEvent, eventName, ...params)
    return true
  }
}
