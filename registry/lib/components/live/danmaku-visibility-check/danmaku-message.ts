import { ObservedDanmaku } from './types'

const toNumber = (value: unknown) => {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const parseExtra = (value: unknown) => {
  if (typeof value !== 'string') {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const parseDanmakuMessage = (data: unknown): ObservedDanmaku | null => {
  if (!data || typeof data !== 'object') {
    return null
  }
  const { info } = data as { info?: unknown }
  if (!Array.isArray(info) || typeof info[1] !== 'string') {
    return null
  }
  const metadata = Array.isArray(info[0]) ? info[0] : []
  const user = Array.isArray(info[2]) ? info[2] : []
  const extension = isRecord(metadata[15]) ? metadata[15] : null
  const nestedUser = extension && isRecord(extension.user) ? extension.user : null
  const nestedBase = nestedUser && isRecord(nestedUser.base) ? nestedUser.base : null
  const extra = parseExtra(extension?.extra)
  const legacyUid = toNumber(user[0])
  const nestedUid = toNumber(nestedUser?.uid)
  let uid: number | null = null
  let identitySource: ObservedDanmaku['identitySource'] = 'none'
  if (legacyUid && legacyUid > 0) {
    uid = legacyUid
    identitySource = 'legacy'
  } else if (nestedUid && nestedUid > 0) {
    uid = nestedUid
    identitySource = 'nested-user'
  }
  const legacyUsername = typeof user[1] === 'string' ? user[1] : null
  const nestedUsername = typeof nestedBase?.name === 'string' ? nestedBase.name : null
  const username = legacyUsername || nestedUsername
  const sentAt = toNumber(metadata[4])
  return {
    content: info[1],
    uid,
    username,
    sentAt,
    identitySource,
    sendFromMe: typeof extra?.send_from_me === 'boolean' ? extra.send_from_me : null,
    messageId: typeof extra?.id_str === 'string' && extra.id_str ? extra.id_str : null,
  }
}
