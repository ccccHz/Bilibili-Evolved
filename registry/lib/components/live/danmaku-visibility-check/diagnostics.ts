import { DanmakuDiagnosticSnapshot, ObservedDanmaku } from './types'

const summaryInterval = 30000
const sampleLimit = 3
const fallbackSendMatchTimeout = 1500
const latencyCalibrationMinimumSamples = 10
const maximumValidAbsoluteLatencyP95 = 1000
const latencySampleLimit = 120
const sendLatencySafetyMargin = 100
const maximumDynamicSendLatencyP95 = fallbackSendMatchTimeout - sendLatencySafetyMargin
const sendLatencySampleLimit = 30
const arrivalCacheLimit = 200

type NicknameEvidence = 'exact' | 'masked' | 'prefix' | 'mismatch' | 'unavailable'

interface PendingSend {
  id: number
  content: string
  capturedAt: number
  timeout: number
}

export interface PageDanmakuArrival {
  messageId: string
  content: string
  username: string | null
}

export interface DanmakuDiagnosticCallbacks {
  onNotObserved?: (result: { content: string; waitedMs: number }) => void
}

const maskUsername = (username: string | null) => {
  if (!username) {
    return null
  }
  if (username.length === 1) {
    return '*'
  }
  return `${username[0]}***${username[username.length - 1]}`
}

const getNicknameEvidence = (
  currentUsername: string | null,
  observedUsername: string | null,
): NicknameEvidence => {
  if (!currentUsername || !observedUsername) {
    return 'unavailable'
  }
  if (currentUsername === observedUsername) {
    return 'exact'
  }
  if (observedUsername.includes('*')) {
    const prefix = observedUsername.slice(0, observedUsername.indexOf('*'))
    const suffix = observedUsername.slice(observedUsername.lastIndexOf('*') + 1)
    if (
      (prefix || suffix) &&
      currentUsername.startsWith(prefix) &&
      currentUsername.endsWith(suffix)
    ) {
      return 'masked'
    }
  }
  const prefixLength = Math.min(2, currentUsername.length, observedUsername.length)
  if (
    prefixLength > 0 &&
    currentUsername.slice(0, prefixLength) === observedUsername.slice(0, prefixLength)
  ) {
    return 'prefix'
  }
  return 'mismatch'
}

const getInitialSnapshot = (): DanmakuDiagnosticSnapshot => ({
  received: 0,
  parsed: 0,
  withUid: 0,
  withLegacyUid: 0,
  withNestedUid: 0,
  withMessageId: 0,
  markedFromMe: 0,
  own: 0,
  capturedSends: 0,
  matchedSends: 0,
  timedOutSends: 0,
  startedAt: Date.now(),
  lastMessageAt: null,
})

const percentile = (values: number[], proportion: number) => {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil((sorted.length - 1) * proportion)]
}

export class DanmakuDiagnostics {
  private snapshot = getInitialSnapshot()
  private timer = 0
  private nextPendingId = 1
  private pendingSends: PendingSend[] = []
  private lastCapturedContent = ''
  private lastCapturedAt = 0
  private observerArrivals = new Map<string, number>()
  private pageArrivals = new Map<string, number>()
  private observerMinusPageSamples: number[] = []
  private sendEndToEndSamples: number[] = []

  constructor(
    private componentName: string,
    private currentUid: number,
    private currentUsername: string | null,
    private callbacks: DanmakuDiagnosticCallbacks = {},
  ) {}

  start() {
    this.timer = window.setInterval(() => this.logSummary('periodic'), summaryInterval)
    console.log(this.componentName, 'diagnostic started')
  }

  captureSend(content: string) {
    const normalizedContent = content.trim()
    if (!normalizedContent) {
      return
    }
    const capturedAt = Date.now()
    if (normalizedContent === this.lastCapturedContent && capturedAt - this.lastCapturedAt < 300) {
      return
    }
    this.lastCapturedContent = normalizedContent
    this.lastCapturedAt = capturedAt
    const id = this.nextPendingId
    this.nextPendingId += 1
    const matchTimeout = this.getSendMatchTimeout()
    const timeout = window.setTimeout(() => {
      const pending = this.takePending(id)
      if (!pending) {
        return
      }
      this.snapshot.timedOutSends += 1
      const waitedMs = Date.now() - pending.capturedAt
      console.warn(
        this.componentName,
        'captured danmaku not observed within diagnostic window',
        JSON.stringify({
          content: pending.content,
          waitedMs,
          conclusion: 'not-observed',
        }),
      )
      this.callbacks.onNotObserved?.({ content: pending.content, waitedMs })
    }, matchTimeout)
    this.pendingSends.push({ id, content: normalizedContent, capturedAt, timeout })
    this.snapshot.capturedSends += 1
    console.log(
      this.componentName,
      'send captured',
      JSON.stringify({
        content: normalizedContent,
        timeoutMs: matchTimeout,
        calibratedFromPairs: this.observerMinusPageSamples.length,
      }),
    )
  }

  recordPageDanmaku(arrival: PageDanmakuArrival) {
    if (!arrival.messageId) {
      return
    }
    this.pageArrivals.set(arrival.messageId, Date.now())
    this.trimArrivalCache(this.pageArrivals)
    this.pairArrival(arrival.messageId)
  }

  record(rawReceived: boolean, danmaku: ObservedDanmaku | null) {
    if (rawReceived) {
      this.snapshot.received += 1
    }
    if (!danmaku) {
      return
    }
    this.snapshot.parsed += 1
    this.snapshot.lastMessageAt = Date.now()
    if (danmaku.messageId) {
      this.observerArrivals.set(danmaku.messageId, Date.now())
      this.trimArrivalCache(this.observerArrivals)
      this.pairArrival(danmaku.messageId)
    }
    if (danmaku.uid !== null) {
      this.snapshot.withUid += 1
    }
    if (danmaku.identitySource === 'legacy') {
      this.snapshot.withLegacyUid += 1
    } else if (danmaku.identitySource === 'nested-user') {
      this.snapshot.withNestedUid += 1
    }
    if (danmaku.messageId !== null) {
      this.snapshot.withMessageId += 1
    }
    if (danmaku.sendFromMe === true) {
      this.snapshot.markedFromMe += 1
    }
    const matchingSend = this.pendingSends.find(pending => pending.content === danmaku.content)
    if (matchingSend) {
      const sendEndToEndMs = Date.now() - matchingSend.capturedAt
      this.takePending(matchingSend.id)
      this.sendEndToEndSamples.push(sendEndToEndMs)
      if (this.sendEndToEndSamples.length > sendLatencySampleLimit) {
        this.sendEndToEndSamples.splice(0, this.sendEndToEndSamples.length - sendLatencySampleLimit)
      }
      this.snapshot.matchedSends += 1
      console.log(
        this.componentName,
        'captured danmaku observed',
        JSON.stringify({
          content: danmaku.content,
          latencyMs: sendEndToEndMs,
          identitySource: danmaku.identitySource,
          sendFromMe: danmaku.sendFromMe,
          hasMessageId: danmaku.messageId !== null,
          nicknameEvidence: getNicknameEvidence(this.currentUsername, danmaku.username),
          nextTimeoutMs: this.getSendMatchTimeout(),
          conclusion: 'observed',
        }),
      )
    }
    if (danmaku.uid === this.currentUid || danmaku.sendFromMe === true) {
      this.snapshot.own += 1
      console.log(
        this.componentName,
        'own danmaku observed',
        JSON.stringify({
          content: danmaku.content,
          sentAt: danmaku.sentAt,
          identitySource: danmaku.identitySource,
          sendFromMe: danmaku.sendFromMe,
          hasMessageId: danmaku.messageId !== null,
        }),
      )
    } else if (this.snapshot.parsed <= sampleLimit) {
      console.log(
        this.componentName,
        'diagnostic sample',
        JSON.stringify({
          content: danmaku.content.slice(0, 80),
          hasUid: danmaku.uid !== null,
          identitySource: danmaku.identitySource,
          sendFromMe: danmaku.sendFromMe,
          hasMessageId: danmaku.messageId !== null,
          username: maskUsername(danmaku.username),
          sentAt: danmaku.sentAt,
        }),
      )
    }
    if (this.snapshot.parsed === 1) {
      this.logSummary('first-message')
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = 0
    }
    this.pendingSends.forEach(pending => clearTimeout(pending.timeout))
    this.pendingSends = []
    this.observerArrivals.clear()
    this.pageArrivals.clear()
    this.logSummary('stopped')
  }

  private takePending(id: number) {
    const index = this.pendingSends.findIndex(pending => pending.id === id)
    if (index === -1) {
      return null
    }
    const [pending] = this.pendingSends.splice(index, 1)
    clearTimeout(pending.timeout)
    return pending
  }

  private pairArrival(messageId: string) {
    const observerAt = this.observerArrivals.get(messageId)
    const pageAt = this.pageArrivals.get(messageId)
    if (observerAt === undefined || pageAt === undefined) {
      return
    }
    this.observerArrivals.delete(messageId)
    this.pageArrivals.delete(messageId)
    this.observerMinusPageSamples.push(observerAt - pageAt)
    if (this.observerMinusPageSamples.length > latencySampleLimit) {
      this.observerMinusPageSamples.splice(
        0,
        this.observerMinusPageSamples.length - latencySampleLimit,
      )
    }
    const sampleCount = this.observerMinusPageSamples.length
    if (
      sampleCount === 1 ||
      sampleCount === latencyCalibrationMinimumSamples ||
      sampleCount % 20 === 0
    ) {
      this.logLatencyCalibration()
    }
  }

  private trimArrivalCache(cache: Map<string, number>) {
    while (cache.size > arrivalCacheLimit) {
      const oldestKey = cache.keys().next().value as string | undefined
      if (oldestKey === undefined) {
        return
      }
      cache.delete(oldestKey)
    }
  }

  private getSendMatchTimeout() {
    const p95 = percentile(this.sendEndToEndSamples, 0.95)
    if (p95 === null || !Number.isFinite(p95) || p95 < 0 || p95 > maximumDynamicSendLatencyP95) {
      return fallbackSendMatchTimeout
    }
    return Math.max(100, Math.ceil((sendLatencySafetyMargin + p95) / 100) * 100)
  }

  private getLatencySummary() {
    const absoluteSamples = this.observerMinusPageSamples.map(Math.abs)
    const absoluteLatencyP95 = percentile(absoluteSamples, 0.95)
    const hasEnoughLatencyPairs =
      this.observerMinusPageSamples.length >= latencyCalibrationMinimumSamples
    const isValidLatencyCalibration =
      hasEnoughLatencyPairs &&
      absoluteLatencyP95 !== null &&
      Number.isFinite(absoluteLatencyP95) &&
      absoluteLatencyP95 <= maximumValidAbsoluteLatencyP95
    const sendEndToEndP95 = percentile(this.sendEndToEndSamples, 0.95)
    const isValidSendWindow =
      sendEndToEndP95 !== null &&
      Number.isFinite(sendEndToEndP95) &&
      sendEndToEndP95 >= 0 &&
      sendEndToEndP95 <= maximumDynamicSendLatencyP95
    let latencyCalibrationState = 'warming-up'
    if (isValidLatencyCalibration) {
      latencyCalibrationState = 'healthy'
    } else if (hasEnoughLatencyPairs) {
      latencyCalibrationState = 'abnormal'
    }
    let sendWindowState = 'fallback-no-samples'
    if (isValidSendWindow) {
      sendWindowState = 'dynamic'
    } else if (sendEndToEndP95 !== null) {
      sendWindowState = 'fallback-abnormal'
    }
    return {
      latencyPairs: this.observerMinusPageSamples.length,
      observerMinusPageP50Ms: percentile(this.observerMinusPageSamples, 0.5),
      observerMinusPageP95Ms: percentile(this.observerMinusPageSamples, 0.95),
      absoluteLatencyP95Ms: absoluteLatencyP95,
      latencyCalibrationState,
      sendEndToEndSamples: this.sendEndToEndSamples.length,
      sendEndToEndP50Ms: percentile(this.sendEndToEndSamples, 0.5),
      sendEndToEndP95Ms: sendEndToEndP95,
      sendMatchTimeoutMs: this.getSendMatchTimeout(),
      sendWindowState,
    }
  }

  private logLatencyCalibration() {
    console.log(this.componentName, 'latency calibration', JSON.stringify(this.getLatencySummary()))
  }

  private logSummary(reason: 'first-message' | 'periodic' | 'stopped') {
    console.log(
      this.componentName,
      'diagnostic summary',
      JSON.stringify({
        reason,
        received: this.snapshot.received,
        parsed: this.snapshot.parsed,
        withUid: this.snapshot.withUid,
        withLegacyUid: this.snapshot.withLegacyUid,
        withNestedUid: this.snapshot.withNestedUid,
        withMessageId: this.snapshot.withMessageId,
        markedFromMe: this.snapshot.markedFromMe,
        own: this.snapshot.own,
        capturedSends: this.snapshot.capturedSends,
        matchedSends: this.snapshot.matchedSends,
        timedOutSends: this.snapshot.timedOutSends,
        pendingSends: this.pendingSends.length,
        ...this.getLatencySummary(),
        runningForMs: Date.now() - this.snapshot.startedAt,
        lastMessageAgoMs:
          this.snapshot.lastMessageAt === null ? null : Date.now() - this.snapshot.lastMessageAt,
      }),
    )
  }
}
