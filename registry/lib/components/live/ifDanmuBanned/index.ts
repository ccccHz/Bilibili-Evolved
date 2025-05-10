import { select } from '@/core/spin-query'
import { getCookieValue, getUID } from '@/core/utils'
import { liveUrls } from '@/core/utils/urls'
import { originalTextAreaSelector, sendButtonSelector } from '../danmaku-sendbar/original-elements'
import { Toast } from '@/core/toast'
import { getConf, KeepLiveWS } from './my-socket/browser'

// 屏蔽词参考 https://greasyfork.org/zh-CN/scripts/432741-b%E7%AB%99%E7%9B%B4%E6%92%AD%E8%81%8A%E5%A4%A9%E5%AE%A4%E5%BC%B9%E5%B9%95%E5%8F%91%E9%80%81%E5%A2%9E%E5%BC%BA/code
const componentName = 'ifDanmuBanned'

function ifDanmuSentOut(targetDanmuContent: string, socket: KeepLiveWS): Promise<boolean> {
  return new Promise(resolve => {
    const task = msg => {
      if (msg.info?.[1] === targetDanmuContent) {
        socket.removeListener('danmaku', task)
        console.log(componentName, 'danmaku sent out')
        resolve(true) // 解决 Promise 并返回 true
      }
    }

    socket.addListener('DANMU_MSG', task)

    // 设置超时，如果10秒内没有匹配的弹幕，则认为弹幕被ban了
    setTimeout(() => {
      socket.removeListener('DANMU_MSG', task)
      resolve(false) // 解决 Promise 并返回 false
    }, 7500)
  })
}

/** 表示一条直播弹幕 from live-socket bilibili-evolved deprecated */
export interface LiveDanmaku {
  /** 内容 */
  content: string
  /** 发送的时间点 */
  sendTime: number
  /** 直播的开始时间点 */
  startTime: number
  /** 相对直播开始时间的弹幕发送时间 */
  time: number
  /** 字体大小(25为标准) */
  fontSize: number
  /** 颜色(そうなのか？) */
  color: number
  userHash: string
  userName: string
  userID: number
  /** 弹幕类型
   * (我猜跟视频的弹幕类型含义一样)
   * 1 - 滚动
   * 4 - 底端
   * 5 - 顶端
   */
  type: number
}
async function createWS(): Promise<KeepLiveWS> {
  const roomId = window.location.href.match(/live\.bilibili\.com\/(\d+)/)?.[1]
  const buvid = getCookieValue('buvid3')
  const uid = 0
  const { key, host, address } = await getConf(parseInt(roomId))

  const live = new KeepLiveWS(parseInt(roomId), {
    key,
    host,
    address,
    protover: 3,
    buvid,
    uid,
  } as any)
  live.on('open', () => console.log('Connection is established'))
  live.on('error', error => console.error('Connection error:', error))
  live.on('close', () => console.log('Connection is closed'))
  live.on('live', () => {
    console.log('Live event triggered')
    live.on('heartbeat', online => console.log('Heartbeat received, online:', online))
    live.on('DANMU_MSG', msg => {
      console.log(
        'dammu received:\n',
        `${msg.info?.[2]?.[1] ?? 'unknown'}:${msg.info?.[1] ?? 'unknown'}`,
      )
    })
  })

  return live
}

// track the value of the textarea with lastSendDanmu.content, always keep the same with the original textarea,
// only when the value became empty, the lastSendDanmu.content still has original non-empty value,
function trackTextArea(origin: HTMLTextAreaElement, target: LiveDanmaku) {
  origin.addEventListener('input', () => {
    if (origin.value !== '') {
      target.content = origin.value
      console.log(componentName, 'value changed target:', target)
    }
  })
}

const entry = async () => {
  if (!getUID()) {
    return
  }
  console.log(componentName, 'loaded')

  const socket = await createWS()

  // get from current urls in forms of https://live.bilibili.com/${roomId}
  const sendButton = (await select(sendButtonSelector)) as HTMLButtonElement
  const originalTextArea = (await select(originalTextAreaSelector)) as HTMLTextAreaElement
  let lastSendDanmu: LiveDanmaku = {
    userID: parseInt(getUID()),
    content: '',
    sendTime: 0,
    startTime: 0,
    time: 0,
    fontSize: 0,
    color: 0,
    userHash: '',
    userName: '',
    type: 0,
  }
  trackTextArea(originalTextArea, lastSendDanmu)

  const task = async (lastDanmuContent: string) => {
    const snapshotOfDanmu = lastDanmuContent
    const ifSent = await ifDanmuSentOut(lastDanmuContent, socket)
    if (!ifSent) {
      Toast.error(`弹幕:${snapshotOfDanmu}`, '弹幕被ban了', 6000)
    }
  }

  // button按下,content还不为空
  // 但enter按下,content会被清空
  sendButton.addEventListener('mousedown', () => {
    if (originalTextArea.value && originalTextArea.value.length > 0) {
      task(originalTextArea.value)
      lastSendDanmu = { ...lastSendDanmu, content: originalTextArea.value, sendTime: Date.now() }
    }
  })

  originalTextArea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // console.log(componentName, 'enter pressed:', lastSendDanmu)
      task(lastSendDanmu.content)
      lastSendDanmu.content = ''
    }
  })
}

export const component = {
  name: componentName,
  displayName: `检测发出的弹幕是否被ban`,
  description: {
    'zh-CN': '检测发出的弹幕是否被ban',
  },
  author: [
    {
      name: 'chz',
      link: 'axn',
    },
  ],
  tags: ['live'],
  entry,
  urlInclude: liveUrls,
}
