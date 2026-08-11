export type VisibilityMeasurementOutcome = 'observed' | 'observed-late' | 'not-observed'

export interface DanmakuVisibilityMeasurement {
  id: string
  schemaVersion: 1
  sessionId: string
  roomId: number | null
  content: string
  capturedAt: number
  completedAt: number
  outcome: VisibilityMeasurementOutcome
  latencyMs: number | null
  windowMs: number
  lateObservationLimitMs: number
}

export interface VisibilityMeasurementSummary {
  total: number
  observed: number
  observedLate: number
  notObserved: number
  p50Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
  maximumMs: number | null
  suggestedWindowMs: number | null
}

const databaseName = 'be-live-danmaku-visibility-measurements'
const databaseVersion = 1
const storeName = 'measurements'
const fallbackStorageKey = 'be-live-danmaku-visibility-measurements-v1'
const maximumStoredMeasurements = 5000
const minimumSuggestionSamples = 30
const suggestionSafetyMarginMs = 300
const minimumSuggestedWindowMs = 1500
const maximumSuggestedWindowMs = 5000

let records: DanmakuVisibilityMeasurement[] = []
let databasePromise: Promise<IDBDatabase | null> | null = null
let initializationPromise: Promise<void> | null = null
const listeners = new Set<(value: DanmakuVisibilityMeasurement[]) => void>()
let synchronizationChannel: BroadcastChannel | null = null

const isMeasurement = (value: unknown): value is DanmakuVisibilityMeasurement => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Partial<DanmakuVisibilityMeasurement>
  return (
    typeof record.id === 'string' &&
    record.schemaVersion === 1 &&
    typeof record.sessionId === 'string' &&
    (record.roomId === null ||
      (typeof record.roomId === 'number' && Number.isSafeInteger(record.roomId))) &&
    typeof record.content === 'string' &&
    typeof record.capturedAt === 'number' &&
    typeof record.completedAt === 'number' &&
    (record.outcome === 'observed' ||
      record.outcome === 'observed-late' ||
      record.outcome === 'not-observed') &&
    (record.latencyMs === null || typeof record.latencyMs === 'number') &&
    typeof record.windowMs === 'number' &&
    typeof record.lateObservationLimitMs === 'number'
  )
}

export const parseMeasurementHistory = (serialized: string | null) => {
  if (!serialized) {
    return [] as DanmakuVisibilityMeasurement[]
  }
  try {
    const value = JSON.parse(serialized)
    return Array.isArray(value) ? value.filter(isMeasurement) : []
  } catch {
    return []
  }
}

const getLocalStorage = () => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error))
  })

const openDatabase = () => {
  if (databasePromise) {
    return databasePromise
  }
  databasePromise = new Promise(resolve => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    const request = indexedDB.open(databaseName, databaseVersion)
    request.addEventListener('upgradeneeded', () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) {
        const store = database.createObjectStore(storeName, { keyPath: 'id' })
        store.createIndex('capturedAt', 'capturedAt')
        store.createIndex('roomId', 'roomId')
        store.createIndex('outcome', 'outcome')
      }
    })
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => resolve(null))
    request.addEventListener('blocked', () => resolve(null))
  })
  return databasePromise
}

const readAll = async (database: IDBDatabase | null) => {
  if (!database) {
    return parseMeasurementHistory(getLocalStorage()?.getItem(fallbackStorageKey) ?? null)
  }
  const transaction = database.transaction(storeName, 'readonly')
  return requestResult(
    transaction.objectStore(storeName).getAll() as IDBRequest<DanmakuVisibilityMeasurement[]>,
  )
}

const persistRecord = async (record: DanmakuVisibilityMeasurement, removedIds: string[] = []) => {
  const database = await openDatabase()
  if (!database) {
    getLocalStorage()?.setItem(fallbackStorageKey, JSON.stringify(records))
    return
  }
  const transaction = database.transaction(storeName, 'readwrite')
  const store = transaction.objectStore(storeName)
  await Promise.all([
    requestResult(store.put(record)),
    ...removedIds.map(id => requestResult(store.delete(id))),
  ])
}

const notify = () => {
  const snapshot = [...records]
  listeners.forEach(listener => listener(snapshot))
}

const broadcastChange = () => synchronizationChannel?.postMessage('changed')

export const initializeMeasurementHistory = () => {
  if (initializationPromise) {
    return initializationPromise
  }
  initializationPromise = (async () => {
    const nextRecords = await readAll(await openDatabase())
    records = nextRecords.filter(isMeasurement).sort((a, b) => b.capturedAt - a.capturedAt)
    notify()
  })()
  return initializationPromise
}

export const getMeasurementHistory = () => [...records]

export const recordVisibilityMeasurement = async (record: DanmakuVisibilityMeasurement) => {
  await initializeMeasurementHistory()
  const index = records.findIndex(item => item.id === record.id)
  if (index === -1) {
    records.unshift(record)
  } else {
    records.splice(index, 1, record)
  }
  const removedIds =
    records.length > maximumStoredMeasurements
      ? records.splice(maximumStoredMeasurements).map(item => item.id)
      : []
  await persistRecord(record, removedIds)
  notify()
  broadcastChange()
}

const percentile = (values: number[], proportion: number) => {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil((sorted.length - 1) * proportion)]
}

export const summarizeMeasurements = (
  measurements: DanmakuVisibilityMeasurement[],
): VisibilityMeasurementSummary => {
  const successfulLatencies = measurements
    .filter(record => record.outcome === 'observed' || record.outcome === 'observed-late')
    .map(record => record.latencyMs)
    .filter((value): value is number => value !== null && Number.isFinite(value))
  const p99Ms = percentile(successfulLatencies, 0.99)
  return {
    total: measurements.length,
    observed: measurements.filter(record => record.outcome === 'observed').length,
    observedLate: measurements.filter(record => record.outcome === 'observed-late').length,
    notObserved: measurements.filter(record => record.outcome === 'not-observed').length,
    p50Ms: percentile(successfulLatencies, 0.5),
    p95Ms: percentile(successfulLatencies, 0.95),
    p99Ms,
    maximumMs: successfulLatencies.length === 0 ? null : Math.max(...successfulLatencies),
    suggestedWindowMs:
      successfulLatencies.length < minimumSuggestionSamples || p99Ms === null
        ? null
        : Math.min(
            maximumSuggestedWindowMs,
            Math.max(
              minimumSuggestedWindowMs,
              Math.ceil((p99Ms + suggestionSafetyMarginMs) / 100) * 100,
            ),
          ),
  }
}

export const exportMeasurementHistory = () => [...records]

export const importMeasurementHistory = async (nextRecords: unknown[]) => {
  const imported = nextRecords.filter(isMeasurement)
  if (imported.length === 0) {
    return 0
  }
  await initializeMeasurementHistory()
  const merged = new Map(records.map(record => [record.id, record]))
  imported.forEach(record => merged.set(record.id, record))
  records = [...merged.values()]
    .sort((a, b) => b.capturedAt - a.capturedAt)
    .slice(0, maximumStoredMeasurements)
  const database = await openDatabase()
  if (database) {
    const transaction = database.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    await Promise.all([
      requestResult(store.clear()),
      ...records.map(record => requestResult(store.put(record))),
    ])
  } else {
    getLocalStorage()?.setItem(fallbackStorageKey, JSON.stringify(records))
  }
  notify()
  broadcastChange()
  return imported.length
}

export const clearMeasurementHistory = async () => {
  await initializeMeasurementHistory()
  records = []
  const database = await openDatabase()
  if (database) {
    await requestResult(database.transaction(storeName, 'readwrite').objectStore(storeName).clear())
  }
  getLocalStorage()?.removeItem(fallbackStorageKey)
  notify()
  broadcastChange()
}

export const subscribeMeasurementHistory = (
  listener: (value: DanmakuVisibilityMeasurement[]) => void,
) => {
  listeners.add(listener)
  listener([...records])
  initializeMeasurementHistory().catch(() => undefined)
  return () => listeners.delete(listener)
}

if (typeof window !== 'undefined') {
  initializeMeasurementHistory().catch(() => undefined)
  if (typeof BroadcastChannel !== 'undefined') {
    synchronizationChannel = new BroadcastChannel('be-live-danmaku-visibility-measurement-sync')
    synchronizationChannel.addEventListener('message', () => {
      openDatabase()
        .then(readAll)
        .then(nextRecords => {
          records = nextRecords.filter(isMeasurement).sort((a, b) => b.capturedAt - a.capturedAt)
          notify()
        })
        .catch(() => undefined)
    })
  }
}
