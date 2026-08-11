import { exportMeasurementHistory, importMeasurementHistory } from './measurement-history'

export type VisibilityAttemptOutcome = 'suspected' | 'observed-late'

export type VisibilityAttemptTag =
  | 'needs-review'
  | 'manually-visible'
  | 'manually-blocked'
  | 'room-specific'
  | 'cross-room'
  | 'suspected-global'
  | 'false-positive'
  | 'known-sensitive'

export interface DanmakuVisibilityFailureRecord {
  id: string
  schemaVersion: 1
  roomId: number | null
  content: string
  normalizedContent: string
  contentHash: string
  windowMs: number
  lateObservationLimitMs: number
  outcome: VisibilityAttemptOutcome
  waitedMs: number
  observedLatencyMs: number | null
  recordedAt: number
  updatedAt: number
  tags: VisibilityAttemptTag[]
  note: string
}

export interface VisibilityTagEvent {
  id: string
  attemptId: string
  createdAt: number
  action: 'add' | 'remove'
  tag: VisibilityAttemptTag
}

const databaseName = 'be-live-danmaku-visibility'
const databaseVersion = 1
const attemptsStoreName = 'attempts'
const tagEventsStoreName = 'tagEvents'
const legacyStorageKey = 'be-live-danmaku-visibility-failures-v1'
const fallbackStorageKey = 'be-live-danmaku-visibility-attempts-v2'

export const visibilityAttemptTags: Array<{ value: VisibilityAttemptTag; text: string }> = [
  { value: 'needs-review', text: '待复核' },
  { value: 'manually-visible', text: '手动复测可见' },
  { value: 'manually-blocked', text: '手动复测不可见' },
  { value: 'room-specific', text: '疑似房间独有' },
  { value: 'cross-room', text: '跨房间复现' },
  { value: 'suspected-global', text: '疑似全站' },
  { value: 'false-positive', text: '误判' },
  { value: 'known-sensitive', text: '已知敏感词' },
]

const normalizeContent = (content: string) => content.trim().normalize('NFKC')

const hashContent = (content: string) => {
  let hash = 5381
  for (let index = 0; index < content.length; index += 1) {
    hash = (hash * 33 + content.charCodeAt(index)) % 4294967296
  }
  return `djb2-${hash.toString(16).padStart(8, '0')}`
}

const isFailureRecord = (value: unknown): value is DanmakuVisibilityFailureRecord => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Partial<DanmakuVisibilityFailureRecord>
  return (
    typeof record.id === 'string' &&
    record.schemaVersion === 1 &&
    (record.roomId === null ||
      (typeof record.roomId === 'number' && Number.isSafeInteger(record.roomId))) &&
    typeof record.content === 'string' &&
    typeof record.normalizedContent === 'string' &&
    typeof record.contentHash === 'string' &&
    typeof record.windowMs === 'number' &&
    typeof record.lateObservationLimitMs === 'number' &&
    (record.outcome === 'suspected' || record.outcome === 'observed-late') &&
    typeof record.waitedMs === 'number' &&
    (record.observedLatencyMs === null || typeof record.observedLatencyMs === 'number') &&
    typeof record.recordedAt === 'number' &&
    typeof record.updatedAt === 'number' &&
    Array.isArray(record.tags) &&
    typeof record.note === 'string'
  )
}

export const parseFailureHistory = (serialized: string | null) => {
  if (!serialized) {
    return [] as DanmakuVisibilityFailureRecord[]
  }
  try {
    const value = JSON.parse(serialized)
    if (!Array.isArray(value)) {
      return []
    }
    return value.filter(isFailureRecord)
  } catch {
    return []
  }
}

let records: DanmakuVisibilityFailureRecord[] = []
let databasePromise: Promise<IDBDatabase | null> | null = null
let initializationPromise: Promise<void> | null = null
const listeners = new Set<(value: DanmakuVisibilityFailureRecord[]) => void>()
let synchronizationChannel: BroadcastChannel | null = null

const getLocalStorage = () => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const notify = () => {
  const snapshot = [...records]
  listeners.forEach(listener => listener(snapshot))
}

const broadcastChange = () => synchronizationChannel?.postMessage('changed')

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
      if (!database.objectStoreNames.contains(attemptsStoreName)) {
        const attempts = database.createObjectStore(attemptsStoreName, { keyPath: 'id' })
        attempts.createIndex('recordedAt', 'recordedAt')
        attempts.createIndex('contentHash', 'contentHash')
        attempts.createIndex('roomId', 'roomId')
        attempts.createIndex('outcome', 'outcome')
      }
      if (!database.objectStoreNames.contains(tagEventsStoreName)) {
        const events = database.createObjectStore(tagEventsStoreName, { keyPath: 'id' })
        events.createIndex('attemptId', 'attemptId')
        events.createIndex('createdAt', 'createdAt')
      }
    })
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => resolve(null))
    request.addEventListener('blocked', () => resolve(null))
  })
  return databasePromise
}

const readAllRecords = async (database: IDBDatabase | null) => {
  if (!database) {
    return parseFailureHistory(getLocalStorage()?.getItem(fallbackStorageKey) ?? null)
  }
  const transaction = database.transaction(attemptsStoreName, 'readonly')
  return requestResult(
    transaction.objectStore(attemptsStoreName).getAll() as IDBRequest<
      DanmakuVisibilityFailureRecord[]
    >,
  )
}

const putRecord = async (record: DanmakuVisibilityFailureRecord) => {
  const database = await openDatabase()
  if (!database) {
    getLocalStorage()?.setItem(fallbackStorageKey, JSON.stringify(records))
    return
  }
  const transaction = database.transaction(attemptsStoreName, 'readwrite')
  await requestResult(transaction.objectStore(attemptsStoreName).put(record))
}

const putTagEvent = async (event: VisibilityTagEvent) => {
  const database = await openDatabase()
  if (!database) {
    return
  }
  const transaction = database.transaction(tagEventsStoreName, 'readwrite')
  await requestResult(transaction.objectStore(tagEventsStoreName).put(event))
}

const putManyRecords = async (nextRecords: DanmakuVisibilityFailureRecord[]) => {
  const database = await openDatabase()
  if (!database) {
    getLocalStorage()?.setItem(fallbackStorageKey, JSON.stringify(nextRecords))
    return
  }
  const transaction = database.transaction(attemptsStoreName, 'readwrite')
  const store = transaction.objectStore(attemptsStoreName)
  await Promise.all(nextRecords.map(record => requestResult(store.put(record))))
}

const migrateLegacyRecords = async () => {
  const storage = getLocalStorage()
  const serialized = storage?.getItem(legacyStorageKey)
  if (!serialized) {
    return
  }
  try {
    const legacy = JSON.parse(serialized)
    if (!Array.isArray(legacy)) {
      return
    }
    const migrated = legacy
      .filter(item => item && typeof item.content === 'string')
      .map(item => {
        const normalizedContent = normalizeContent(item.content)
        const recordedAt = Number(item.recordedAt) || Date.now()
        return {
          id: String(item.id || `legacy-${recordedAt}-${Math.random().toString(36).slice(2, 8)}`),
          schemaVersion: 1 as const,
          roomId: Number.isSafeInteger(item.roomId) ? item.roomId : null,
          content: item.content,
          normalizedContent,
          contentHash: hashContent(normalizedContent),
          windowMs: Number(item.waitedMs) || 2200,
          lateObservationLimitMs: 5000,
          outcome: 'suspected' as const,
          waitedMs: Number(item.waitedMs) || 2200,
          observedLatencyMs: null,
          recordedAt,
          updatedAt: recordedAt,
          tags: ['needs-review' as VisibilityAttemptTag],
          note: '',
        }
      })
    await putManyRecords(migrated)
    storage?.removeItem(legacyStorageKey)
  } catch {
    // Keep malformed legacy data untouched so it can still be recovered manually.
  }
}

export const initializeFailureHistory = () => {
  if (initializationPromise) {
    return initializationPromise
  }
  initializationPromise = (async () => {
    await migrateLegacyRecords()
    records = (await readAllRecords(await openDatabase())).filter(isFailureRecord)
    records.sort((a, b) => b.recordedAt - a.recordedAt)
    notify()
  })().catch(() => {
    records = parseFailureHistory(getLocalStorage()?.getItem(fallbackStorageKey) ?? null)
    notify()
  })
  return initializationPromise
}

export const getFailureHistory = () => [...records]

export const recordSuspectedFailure = async (input: {
  id: string
  roomId: number | null
  content: string
  waitedMs: number
  windowMs: number
  lateObservationLimitMs: number
  recordedAt: number
}) => {
  await initializeFailureHistory()
  const normalizedContent = normalizeContent(input.content)
  const record: DanmakuVisibilityFailureRecord = {
    ...input,
    schemaVersion: 1,
    normalizedContent,
    contentHash: hashContent(normalizedContent),
    outcome: 'suspected',
    observedLatencyMs: null,
    updatedAt: Date.now(),
    tags: ['needs-review'],
    note: '',
  }
  const index = records.findIndex(item => item.id === record.id)
  if (index === -1) {
    records.unshift(record)
  } else {
    records.splice(index, 1, record)
  }
  await putRecord(record)
  notify()
  broadcastChange()
  return record
}

export const markFailureObservedLate = async (id: string, latencyMs: number) => {
  await initializeFailureHistory()
  const record = records.find(item => item.id === id)
  if (!record) {
    return
  }
  record.outcome = 'observed-late'
  record.observedLatencyMs = latencyMs
  record.updatedAt = Date.now()
  record.tags = record.tags.filter(tag => tag !== 'needs-review')
  if (!record.tags.includes('false-positive')) {
    record.tags.push('false-positive')
  }
  await putRecord(record)
  notify()
  broadcastChange()
}

export const setFailureNote = async (id: string, note: string) => {
  await initializeFailureHistory()
  const record = records.find(item => item.id === id)
  if (!record) {
    return
  }
  record.note = note.trim()
  record.updatedAt = Date.now()
  await putRecord(record)
  notify()
  broadcastChange()
}

export const setFailureTag = async (id: string, tag: VisibilityAttemptTag, enabled: boolean) => {
  await initializeFailureHistory()
  const record = records.find(item => item.id === id)
  if (!record) {
    return
  }
  const hasTag = record.tags.includes(tag)
  if (hasTag === enabled) {
    return
  }
  record.tags = enabled ? [...record.tags, tag] : record.tags.filter(value => value !== tag)
  record.updatedAt = Date.now()
  const event: VisibilityTagEvent = {
    id: `${record.updatedAt}-${Math.random().toString(36).slice(2, 9)}`,
    attemptId: id,
    createdAt: record.updatedAt,
    action: enabled ? 'add' : 'remove',
    tag,
  }
  await Promise.all([putRecord(record), putTagEvent(event)])
  notify()
  broadcastChange()
}

export const importFailureHistory = async (serialized: string) => {
  let imported = parseFailureHistory(serialized)
  if (imported.length === 0) {
    try {
      const value = JSON.parse(serialized)
      imported = parseFailureHistory(JSON.stringify(value?.records))
    } catch {
      imported = []
    }
  }
  let measurementCount = 0
  try {
    const value = JSON.parse(serialized)
    measurementCount = await importMeasurementHistory(
      Array.isArray(value?.measurements) ? value.measurements : [],
    )
  } catch {
    measurementCount = 0
  }
  if (imported.length === 0 && measurementCount === 0) {
    throw new Error('导入文件中没有有效的屏蔽检测或测量记录')
  }
  if (imported.length > 0) {
    await initializeFailureHistory()
    const merged = new Map(records.map(record => [record.id, record]))
    imported.forEach(record => merged.set(record.id, record))
    records = [...merged.values()].sort((a, b) => b.recordedAt - a.recordedAt)
    await putManyRecords(imported)
    notify()
    broadcastChange()
  }
  return { failureCount: imported.length, measurementCount }
}

export const exportFailureHistory = () =>
  JSON.stringify(
    {
      schema: 'bilibili-evolved-live-danmaku-visibility-attempts',
      version: 1,
      exportedAt: Date.now(),
      records,
      measurements: exportMeasurementHistory(),
    },
    null,
    2,
  )

export const parseFailureHistoryExport = (serialized: string) => {
  try {
    const value = JSON.parse(serialized)
    return parseFailureHistory(JSON.stringify(Array.isArray(value) ? value : value?.records))
  } catch {
    return []
  }
}

export const clearFailureHistory = async () => {
  await initializeFailureHistory()
  records = []
  const database = await openDatabase()
  if (database) {
    const transaction = database.transaction([attemptsStoreName, tagEventsStoreName], 'readwrite')
    await Promise.all([
      requestResult(transaction.objectStore(attemptsStoreName).clear()),
      requestResult(transaction.objectStore(tagEventsStoreName).clear()),
    ])
  }
  getLocalStorage()?.removeItem(fallbackStorageKey)
  notify()
  broadcastChange()
}

export const subscribeFailureHistory = (
  listener: (value: DanmakuVisibilityFailureRecord[]) => void,
) => {
  listeners.add(listener)
  listener([...records])
  initializeFailureHistory().catch(() => undefined)
  return () => listeners.delete(listener)
}

if (typeof window !== 'undefined') {
  initializeFailureHistory().catch(() => undefined)
  if (typeof BroadcastChannel !== 'undefined') {
    synchronizationChannel = new BroadcastChannel('be-live-danmaku-visibility-sync')
    synchronizationChannel.addEventListener('message', () => {
      openDatabase()
        .then(readAllRecords)
        .then(nextRecords => {
          records = nextRecords.filter(isFailureRecord).sort((a, b) => b.recordedAt - a.recordedAt)
          notify()
        })
        .catch(() => undefined)
    })
  }
}
