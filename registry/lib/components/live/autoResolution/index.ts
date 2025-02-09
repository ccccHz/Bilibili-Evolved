import { defineComponentMetadata } from '@/components/define'
import { getUID } from '@/core/utils'
import { liveUrls } from '@/core/utils/urls'

const entry = async () => {
  if (!getUID()) {
    return
  }
  console.log('liveAutoResolution')
  const { select } = await import('@/core/spin-query')
  const video = (await select('#live-player > video')) as HTMLVideoElement
  const changeQuailty = () => {
    let { livePlayer } = unsafeWindow
    if (!livePlayer) {
      livePlayer = unsafeWindow.top.livePlayer
    }
    const info = livePlayer.getPlayerInfo()
    if (info.qualityCandidates.length > 1) {
      console.log(info.qualityCandidates)
      for (let index = 0; index < info.qualityCandidates.length; index++) {
        // 想要默认其他画质,请修改"原画"为"原画PRO"诸如此类
        if (info.qualityCandidates[index].desc === '原画') {
          livePlayer.switchQuality(info.qualityCandidates[index].qn)
        }
        // else{
        //  livePlayer.switchQuality(info.qualityCandidates[0].qn)
        // }
      }
    }
  }
  if (video !== null) {
    changeQuailty()
  }
  // const decideToChange = () => {
  //   if (video.paused) {
  //     video.addEventListener('play', changeQuailty)
  //   } else {
  //     changeQuailty()
  //   }
  // }

  // 等待livePlayer加载
  // const interval: NodeJS.Timer = setInterval(() => {
  //   let { livePlayer } = unsafeWindow
  //   const p2pLivePlayer = unsafeWindow.$P2PLivePlayer
  //   if (typeof livePlayer === 'undefined' && typeof p2pLivePlayer === 'undefined') {
  //     return
  //   }
  //   clearInterval(interval)
  //   if (typeof livePlayer === 'undefined') {
  //     livePlayer = p2pLivePlayer
  //   }
  //   decideToChange()
  // }, 10)
}
export const component = defineComponentMetadata({
  name: 'liveAutoResolution',
  displayName: '直播自动高分辨率',
  description: {
    'zh-CN': '直播自动切换到最高分辨率',
  },
  author: [
    {
      name: 'chz',
      link: 'axn',
    },
  ],
  tags: [componentsTags.live, componentsTags.style],
  entry,
  // reload: entry,
  urlInclude: liveUrls,
})
