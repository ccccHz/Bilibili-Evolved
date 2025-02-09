import { liveUrls } from '@/core/utils/urls'
import { defineComponentMetadata } from '@/components/define'
import { mountVueComponent } from '@/core/utils'
import { waitForControlBar } from '@/components/live/live-control-bar'

const entry = async () => {
  console.log('liveDataReAdd')
  // const Data = await import('./Data.vue')
  // const data: Vue = mountVueComponent(Data)
  // const upperRow = (await select(() => dq('.upper-row .right-ctnr'))) as HTMLElement
  // upperRow?.prepend(data.$el)

  const leftControllerSelector = '.left-area'
  let danmakuSendBarElement: Element
  waitForControlBar({
    callback: async controlBar => {
      const leftController = dq(controlBar, leftControllerSelector) as HTMLDivElement
      if (!leftController) {
        throw new Error('[live-data] leftController not found')
      }
      if (dq(controlBar, '.live-data')) {
        return
      }
      if (!danmakuSendBarElement) {
        const DanmakuSendBar = await import('./Data.vue')
        danmakuSendBarElement = mountVueComponent(DanmakuSendBar).$el
      }
      leftController.insertAdjacentElement('beforeend', danmakuSendBarElement)
    },
  })
}

export const component = defineComponentMetadata({
  name: 'liveDataReAdd',
  displayName: '当前观众数和舰长数显示',
  description: {
    'zh-CN': '当前观众数和舰长数显示',
  },
  author: [
    {
      name: 'chz',
      link: 'axn',
    },
  ],
  tags: [componentsTags.live],
  entry,
  urlInclude: liveUrls,
})
