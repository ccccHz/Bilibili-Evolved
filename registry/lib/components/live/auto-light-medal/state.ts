import { reactive } from 'vue'

export const lightingState = reactive({
  message: '等待当前直播间',
  clicks: 0,
  total: 0,
  busy: false,
})
export const lightingActions: { check: () => void; cancel: () => void } = {
  check: () => undefined,
  cancel: () => undefined,
}
