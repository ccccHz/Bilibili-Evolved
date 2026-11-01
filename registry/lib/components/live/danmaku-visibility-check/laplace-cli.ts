import { ObserverRecovery } from './observer-recovery'
import { LaplaceDanmakuObserver } from './laplace-adapter'
import { LiveWS } from './laplace-node-runtime'
import { LaplaceLiveClientConstructor, ObservedDanmaku } from './types'

const [roomArgument, maxMessagesArgument] = process.argv.slice(2).filter(value => value !== '--')
const shortRoomId = Number(roomArgument)
const maxMessages = Number(maxMessagesArgument ?? 0)
if (!Number.isSafeInteger(shortRoomId) || shortRoomId <= 0) {
  throw new Error('用法: pnpm laplace-cli <直播间号> [条数]')
}
if (!Number.isSafeInteger(maxMessages) || maxMessages < 0) {
  throw new Error('条数必须是非负整数')
}

const getJson = async (url: string, signal: AbortSignal) => {
  const response = await fetch(url, {
    signal,
    headers: {
      Origin: 'https://live.bilibili.com',
      Referer: `https://live.bilibili.com/${shortRoomId}`,
      'User-Agent': 'Mozilla/5.0',
    },
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json()
}

const recovery = new ObserverRecovery(
  async signal => {
    const init = await getJson(
      `https://api.live.bilibili.com/room/v1/Room/mobileRoomInit?id=${shortRoomId}`,
      signal,
    )
    const roomId = Number(init?.data?.room_id)
    if (init?.code !== 0 || !Number.isSafeInteger(roomId) || roomId <= 0) {
      throw new Error('解析直播间号失败')
    }
    const config = await getJson(
      `https://api.live.bilibili.com/room/v1/Danmu/getConf?${new URLSearchParams({
        room_id: String(roomId),
        platform: 'pc',
        player: 'web',
      })}`,
      signal,
    )
    const key = config?.data?.token
    const host = config?.data?.host_server_list?.[0]
    if (config?.code !== 0 || typeof key !== 'string' || !host?.host || !host?.wss_port) {
      throw new Error('获取弹幕服务器配置失败')
    }
    const configuredBuvid = process.env.BILIBILI_BUVID
    const spi = configuredBuvid
      ? null
      : await getJson('https://api.bilibili.com/x/frontend/finger/spi', signal)
    const buvid = configuredBuvid || spi?.data?.b_3
    if (typeof buvid !== 'string' || !buvid) {
      throw new Error('获取匿名 buvid 失败')
    }
    return {
      roomId,
      key,
      buvid,
      address: `wss://${host.host}${host.wss_port === 443 ? '' : `:${host.wss_port}`}/sub`,
    }
  },
  () => new LaplaceDanmakuObserver(undefined, undefined, LiveWS as LaplaceLiveClientConstructor),
)

let received = 0
let stopping = false
const stop = () => {
  if (stopping) {
    return
  }
  stopping = true
  recovery.close()
  // Native WebSocket may retain its closing handshake. This is a standalone
  // CLI: flush both streams before exiting rather than waiting for that socket.
  Promise.all([
    new Promise<void>(resolve => process.stdout.write('', () => resolve())),
    new Promise<void>(resolve => process.stderr.write('', () => resolve())),
  ]).then(() => process.exit(process.exitCode || 0))
}
recovery.addEventListener('danmaku', event => {
  const message = (event as CustomEvent<ObservedDanmaku | null>).detail
  if (!message) {
    return
  }
  received += 1
  console.log(JSON.stringify({ command: 'DANMU_MSG', ...message }))
  if (maxMessages > 0 && received >= maxMessages) {
    stop()
  }
})
recovery.addEventListener('status', () => {
  console.error(
    `[${recovery.status}] room=${recovery.roomId || shortRoomId} attempts=${recovery.attempts}`,
  )
  if (recovery.status === 'error') {
    process.exitCode = 1
    stop()
  }
})
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
recovery.start()
