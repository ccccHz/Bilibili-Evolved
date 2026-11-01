import { defineOptionsMetadata, OptionsOfMetadata } from '@/components/define'

export const minimumManualSendMatchTimeout = 500
export const maximumManualSendMatchTimeout = 10000

export const validateManualSendMatchTimeout = (value: number, oldValue: number) => {
  const numericValue = Number(value)
  if (numericValue === 0) {
    return numericValue
  }
  if (
    Number.isInteger(numericValue) &&
    numericValue >= minimumManualSendMatchTimeout &&
    numericValue <= maximumManualSendMatchTimeout
  ) {
    return numericValue
  }
  return oldValue
}

export const danmakuVisibilityCheckOptions = defineOptionsMetadata({
  showChatSpeed: {
    displayName: '输入框显示弹幕速度（最近 30 秒折算条/分）',
    defaultValue: true,
  },
  sendMatchTimeoutMs: {
    displayName: '检测窗口 (ms，0 = 经验值 2200)',
    defaultValue: 0,
    validator: validateManualSendMatchTimeout,
  },
})

export type DanmakuVisibilityCheckOptions = OptionsOfMetadata<typeof danmakuVisibilityCheckOptions>
