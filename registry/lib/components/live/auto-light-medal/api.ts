import { LightingTrialState } from './runner'

const base = 'https://api.live.bilibili.com'
export const readJson = async (path: string, signal: AbortSignal) => {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) {
    controller.abort()
  }
  const timer = setTimeout(abort, 10000)
  try {
    const response = await fetch(base + path, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
    const json = await response.json()
    if (!response.ok || json.code !== 0) {
      throw new Error('暂时无法读取粉丝牌状态')
    }
    return json.data
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

export const normalizeMedal = (data: any): LightingTrialState => {
  const roomId = Number(data?.room_info?.room_id)
  const anchorId = Number(data?.room_info?.uid)
  if (
    !Number.isSafeInteger(roomId) ||
    roomId <= 0 ||
    !Number.isSafeInteger(anchorId) ||
    anchorId <= 0
  ) {
    throw new Error('未能确认当前房间与主播')
  }
  const legacy = data.lookup_medal
  const modern = data.lookup_v2
  const validLegacy = Number(legacy?.target_id) === anchorId && Number(legacy?.level) > 0
  const validModern = Number(modern?.ruid) === anchorId && Number(modern?.level) > 0
  const lights = [
    validLegacy ? legacy.is_lighted : null,
    validModern ? modern.is_light : null,
  ].filter(value => value === 0 || value === 1)
  const known = lights.length > 0 && lights.every(value => value === lights[0])
  return {
    roomId,
    anchorId,
    hasMedal: data.is_gain === true && (validLegacy || validModern),
    lighted: known ? lights[0] === 1 : null,
  }
}

export const readMedal = async (uid: string, anchorId: number, signal: AbortSignal) =>
  normalizeMedal(
    await readJson(
      `/xlive/app-ucenter/v1/fansMedal/user_medal_info?uid=${uid}&up_uid=${anchorId}`,
      signal,
    ),
  )

export const readCurrentMedal = async (roomId: number, uid: string, signal: AbortSignal) => {
  const info = await readJson(`/room/v1/Room/room_init?id=${roomId}`, signal)
  const anchor = Number(info?.uid)
  if (!Number.isSafeInteger(anchor) || anchor <= 0) {
    throw new Error('当前房间未提供粉丝牌信息')
  }
  const data = await readJson(
    `/xlive/app-ucenter/v1/fansMedal/user_medal_info?uid=${uid}&up_uid=${anchor}`,
    signal,
  )
  if (
    Number(data.room_info?.room_id) !== Number(info.room_id) ||
    Number(data.room_info?.uid) !== anchor
  ) {
    throw new Error('房间信息不一致，未执行点赞')
  }
  return { ...normalizeMedal(data), live: info.live_status === 1 }
}

export const freeLikeCount = (tasks: any[]): number | null => {
  if (!Array.isArray(tasks)) {
    return null
  }
  const task = tasks?.find(item => item.tag === 'like' && item.gift_price === 0)
  const target = Number(task?.title?.match(/^\s*(\d+)\s*个点赞\s*$/)?.[1])
  const current = task?.cur_progress
  if (
    task?.done !== false ||
    !Number.isInteger(target) ||
    target < 1 ||
    target > 30 ||
    !Number.isInteger(current) ||
    current < 0 ||
    current >= target
  ) {
    return null
  }
  return target - current
}

export const readLikeCount = async (state: LightingTrialState, signal: AbortSignal) => {
  const query = new URLSearchParams({
    target_id: String(state.anchorId),
    room_id: String(state.roomId),
    platform: 'pc',
  })
  const data = await readJson(`/xlive/app-ucenter/v1/fansMedal/fans_medal_info?${query}`, signal)
  if (Number(data.my_fans_medal?.target_id) !== state.anchorId) {
    throw new Error('粉丝牌归属不一致，未执行点赞')
  }
  return freeLikeCount(data.user_task?.task_list)
}
