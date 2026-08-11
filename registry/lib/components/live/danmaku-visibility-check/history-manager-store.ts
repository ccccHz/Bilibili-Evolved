let open = false
const listeners = new Set<(value: boolean) => void>()

const notify = () => listeners.forEach(listener => listener(open))

export const isVisibilityHistoryManagerOpen = () => open

export const openVisibilityHistoryManager = () => {
  open = true
  notify()
}

export const closeVisibilityHistoryManager = () => {
  open = false
  notify()
}

export const subscribeVisibilityHistoryManager = (listener: (value: boolean) => void) => {
  listeners.add(listener)
  listener(open)
  return () => listeners.delete(listener)
}
