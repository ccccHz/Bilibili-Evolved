/** Bounded execution; all account interaction is supplied by the native-button driver. */
export interface LightingTrialState {
  roomId: number
  anchorId: number
  hasMedal: boolean
  lighted: boolean | null
  live?: boolean
}

export interface LightingTrialDriver {
  currentRoomId: () => number
  readState: () => Promise<LightingTrialState>
  clickNativeLike: () => Promise<void>
  wait: (ms: number) => Promise<void>
  /** Read from the native control before the trial; units are milliseconds. */
  cooldownMs: number
  reportMaxMs: number
  maxClicks?: number
  onClick?: (count: number) => void
  signal?: AbortSignal
}

/** At most thirty click attempts; success requires a fresh authoritative medal state. */
export const runLightingTrial = async (driver: LightingTrialDriver) => {
  const roomId = driver.currentRoomId()
  let clicks = 0
  const maxClicks = driver.maxClicks ?? 30
  const result = (status: string) => ({ status, clicks })
  const cancelled = () => driver.signal?.aborted || driver.currentRoomId() !== roomId
  if (!Number.isSafeInteger(roomId) || roomId <= 0 || cancelled()) {
    return result('cancelled')
  }
  if (
    !Number.isInteger(maxClicks) ||
    maxClicks < 1 ||
    maxClicks > 30 ||
    !Number.isFinite(driver.cooldownMs) ||
    driver.cooldownMs < 0 ||
    driver.cooldownMs > 10000 ||
    !Number.isFinite(driver.reportMaxMs) ||
    driver.reportMaxMs < 0 ||
    driver.reportMaxMs > 30000
  ) {
    return result('invalid-timing')
  }
  try {
    const initial = await driver.readState()
    const classify = (state: LightingTrialState) => {
      if (cancelled()) {
        return 'cancelled'
      }
      if (state.roomId !== roomId || state.anchorId !== initial.anchorId) {
        return 'identity-changed'
      }
      if (!Number.isSafeInteger(state.anchorId) || state.anchorId <= 0) {
        return 'unknown-state'
      }
      if (!state.hasMedal) {
        return 'no-medal'
      }
      if (state.live === false) {
        return 'not-live'
      }
      if (state.lighted === true) {
        return clicks ? 'lit' : 'already-lit'
      }
      return state.lighted === false ? null : 'unknown-state'
    }
    const initialStatus = classify(initial)
    if (initialStatus) {
      return result(initialStatus)
    }
    while (clicks < maxClicks) {
      if (clicks) {
        await driver.wait(Math.max(400, driver.cooldownMs + 50))
      }
      if (cancelled()) {
        return result('cancelled')
      }
      await driver.clickNativeLike()
      clicks++
      driver.onClick?.(clicks)
      if (clicks % 5 === 0) {
        const status = classify(await driver.readState())
        if (status) {
          return result(status)
        }
      }
    }
    // Native clicks are aggregated; allow the final batch to be reported.
    await driver.wait(driver.reportMaxMs + 1000)
    if (cancelled()) {
      return result('cancelled')
    }
    return result(classify(await driver.readState()) || 'not-lit-after-trial')
  } catch {
    return result('failed')
  }
}
