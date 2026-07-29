import { KeepLiveWS } from '@laplace.live/ws'

const [roomArgument, maxMessagesArgument] = process.argv.slice(2).filter(value => value !== '--')
const shortRoomId = Number(roomArgument)
const maxMessages = Number(maxMessagesArgument ?? 0)

if (!Number.isSafeInteger(shortRoomId) || shortRoomId <= 0) {
  throw new Error('用法: pnpm laplace-cli <直播间号> [条数]')
}
if (!Number.isSafeInteger(maxMessages) || maxMessages < 0) {
  throw new Error('条数必须是非负整数')
}

const getJson = async url => {
  const response = await fetch(url, {
    headers: {
      Origin: 'https://live.bilibili.com',
      Referer: `https://live.bilibili.com/${shortRoomId}`,
      'User-Agent': 'Mozilla/5.0',
    },
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`)
  }
  return response.json()
}

const roomInit = await getJson(
  `https://api.live.bilibili.com/room/v1/Room/mobileRoomInit?id=${shortRoomId}`,
)
const roomId = Number(roomInit?.data?.room_id)
if (roomInit?.code !== 0 || !Number.isSafeInteger(roomId) || roomId <= 0) {
  throw new Error(`解析直播间号失败: ${roomInit?.code} ${roomInit?.message ?? ''}`)
}

const config = await getJson(
  `https://api.live.bilibili.com/room/v1/Danmu/getConf?${new URLSearchParams({
    room_id: String(roomId),
    platform: 'pc',
    player: 'web',
  })}`,
)
const token = config?.data?.token
const host = config?.data?.host_server_list?.[0]
if (config?.code !== 0 || typeof token !== 'string' || !host?.host || !host?.wss_port) {
  throw new Error(`获取弹幕服务器配置失败: ${config?.code} ${config?.message ?? ''}`)
}

const configuredBuvid = process.env.BILIBILI_BUVID
const spi = configuredBuvid ? null : await getJson('https://api.bilibili.com/x/frontend/finger/spi')
const buvid = configuredBuvid || spi?.data?.b_3
if (typeof buvid !== 'string' || !buvid) {
  throw new Error('获取匿名 buvid 失败；可通过 BILIBILI_BUVID 环境变量显式提供')
}

const address = `wss://${host.host}${host.wss_port === 443 ? '' : `:${host.wss_port}`}/sub`
const live = new KeepLiveWS(roomId, {
  address,
  key: token,
  protover: 2,
  uid: 0,
  buvid,
})

let received = 0
let stopped = false
live.addEventListener('msg', ({ data }) => {
  if (stopped) {
    return
  }
  const command = data?.cmd ?? data?.msg?.cmd
  if (typeof command !== 'string' || command.split(':')[0] !== 'DANMU_MSG') {
    return
  }
  const payload = data?.info ? data : data?.msg
  const info = Array.isArray(payload?.info) ? payload.info : []
  const metadata = Array.isArray(info[0]) ? info[0] : []
  const user = Array.isArray(info[2]) ? info[2] : []
  const content = typeof info[1] === 'string' ? info[1] : ''
  const extension = metadata[15]
  let extra = null
  if (typeof extension?.extra === 'string') {
    try {
      extra = JSON.parse(extension.extra)
    } catch {
      // Ignore malformed optional metadata; the danmaku body is still usable.
    }
  }
  const message = {
    command,
    messageId: typeof extra?.id_str === 'string' ? extra.id_str : null,
    sentAt: Number(metadata[4]) || null,
    uid: Number(user[0]) || null,
    username: typeof user[1] === 'string' ? user[1] : null,
    content,
  }
  received += 1
  console.log(JSON.stringify(message))
  if (maxMessages > 0 && received >= maxMessages) {
    stopped = true
    live.close()
  }
})

live.addEventListener('live', () => console.error(`[connected] room=${roomId} ${address}`))
live.addEventListener('close', () => {
  console.error(stopped ? '[close] 已停止' : '[close] Laplace 将自动重连')
})
live.addEventListener('error', () => console.error('[error] Laplace 连接错误'))

process.once('SIGINT', () => {
  stopped = true
  live.close()
})
