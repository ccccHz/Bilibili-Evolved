import { getCookieValue } from '@/core/utils'
import { DanmakuObserverConfig } from './types'

interface BilibiliResponse<T> {
  code: number
  message: string
  msg?: string
  data?: T
}

interface RoomInitData {
  room_id: number
}

interface DanmakuHost {
  host: string
  wss_port: number
}

interface DanmakuConfigData {
  token: string
  host_server_list: DanmakuHost[]
}

const getShortRoomId = () => {
  const shortRoomId = Number(window.location.pathname.match(/^\/(?:blanc\/)?(\d+)/)?.[1])
  if (!Number.isFinite(shortRoomId) || shortRoomId <= 0) {
    throw new Error('无法从当前网址获取直播间号')
  }
  return shortRoomId
}

const requireData = <T>(response: BilibiliResponse<T>, operation: string): T => {
  if (response.code !== 0 || !response.data) {
    throw new Error(`${operation}失败: ${response.code} ${response.message || response.msg || ''}`)
  }
  return response.data
}

const getJson = async <T>(url: string, signal: AbortSignal): Promise<T> => {
  const response = await fetch(url, { credentials: 'omit', signal })
  if (!response.ok) {
    throw new Error(`获取观察连接配置失败: HTTP ${response.status}`)
  }
  return response.json()
}

const getLongRoomId = async (shortRoomId: number, signal: AbortSignal) => {
  const response = await getJson<BilibiliResponse<RoomInitData>>(
    `https://api.live.bilibili.com/room/v1/Room/mobileRoomInit?id=${shortRoomId}`,
    signal,
  )
  const { room_id: roomId } = requireData(response, '解析直播间号')
  if (!Number.isFinite(roomId) || roomId <= 0) {
    throw new Error('解析直播间号失败: 返回了无效房间号')
  }
  return roomId
}

const getDanmakuConfig = async (roomId: number, signal: AbortSignal) => {
  const query = new URLSearchParams({
    room_id: String(roomId),
    platform: 'pc',
    player: 'web',
  })
  const response = await getJson<BilibiliResponse<DanmakuConfigData>>(
    `https://api.live.bilibili.com/room/v1/Danmu/getConf?${query}`,
    signal,
  )
  const data = requireData(response, '获取弹幕服务器配置')
  if (!data.token || !data.host_server_list?.length) {
    throw new Error('获取弹幕服务器配置失败: 缺少 token 或 host')
  }
  return data
}

export const resolveObserverConfig = async (
  signal: AbortSignal,
): Promise<DanmakuObserverConfig> => {
  const roomId = await getLongRoomId(getShortRoomId(), signal)
  const { token: key, host_server_list: hosts } = await getDanmakuConfig(roomId, signal)
  const [{ host, wss_port: wssPort }] = hosts
  if (!host || !wssPort) {
    throw new Error('获取弹幕服务器配置失败: host 无效')
  }
  const address = `wss://${host}${wssPort === 443 ? '' : `:${wssPort}`}/sub`
  return {
    roomId,
    key,
    address,
    buvid: getCookieValue('buvid3') || undefined,
  }
}
