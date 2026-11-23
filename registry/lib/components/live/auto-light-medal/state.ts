import { reactive } from 'vue'

export const lightingState = reactive({
  message: '组件未开启',
  clicks: 0,
  total: 0,
  busy: false,
})
export const lightingActions: { check: () => void; cancel: () => void } = {
  check: () => undefined,
  cancel: () => undefined,
}
