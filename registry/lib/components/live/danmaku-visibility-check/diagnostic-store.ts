export type DiagnosticObserverStatus = 'inactive' | 'starting' | 'connecting' | 'ready' | 'error'

export type SendWindowState = 'manual' | 'fixed-experience'

export interface SendLatencyResult {
  content: string
  status: 'observed' | 'not-observed' | 'observed-late'
  elapsedMs: number
  recordedAt: number
}

export interface DanmakuDiagnosticViewState {
  observerStatus: DiagnosticObserverStatus
  configuredWindowMs: number
  effectiveWindowMs: number
  fallbackWindowMs: number
  sendWindowState: SendWindowState
  capturedSends: number
  matchedSends: number
  timedOutSends: number
  pendingSends: number
  latePendingSends: number
  lateMatchedSends: number
  sendEndToEndSamples: number[]
  sendEndToEndP50Ms: number | null
  sendEndToEndP95Ms: number | null
  sendEndToEndMaxMs: number | null
  sessionSuggestedWindowMs: number | null
  latencyPairs: number
  observerMinusPageSamples: number[]
  observerMinusPageP50Ms: number | null
  observerMinusPageP95Ms: number | null
  absoluteLatencyP95Ms: number | null
  lastSendResult: SendLatencyResult | null
}

export const initialDiagnosticViewState: DanmakuDiagnosticViewState = {
  observerStatus: 'inactive',
  configuredWindowMs: 0,
  effectiveWindowMs: 2200,
  fallbackWindowMs: 2200,
  sendWindowState: 'fixed-experience',
  capturedSends: 0,
  matchedSends: 0,
  timedOutSends: 0,
  pendingSends: 0,
  latePendingSends: 0,
  lateMatchedSends: 0,
  sendEndToEndSamples: [],
  sendEndToEndP50Ms: null,
  sendEndToEndP95Ms: null,
  sendEndToEndMaxMs: null,
  sessionSuggestedWindowMs: null,
  latencyPairs: 0,
  observerMinusPageSamples: [],
  observerMinusPageP50Ms: null,
  observerMinusPageP95Ms: null,
  absoluteLatencyP95Ms: null,
  lastSendResult: null,
}

let state = { ...initialDiagnosticViewState }
const listeners = new Set<(value: DanmakuDiagnosticViewState) => void>()

export const getDiagnosticViewState = () => state

export const updateDiagnosticViewState = (patch: Partial<DanmakuDiagnosticViewState>) => {
  state = { ...state, ...patch }
  listeners.forEach(listener => listener(state))
}

export const resetDiagnosticViewState = () => {
  state = { ...initialDiagnosticViewState }
  listeners.forEach(listener => listener(state))
}

export const subscribeDiagnosticViewState = (
  listener: (value: DanmakuDiagnosticViewState) => void,
) => {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}
