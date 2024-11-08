import { liveUrls } from '@/core/utils/urls'
import { defineComponentMetadata } from '@/components/define'
import { mountVueComponent } from '@/core/utils'
import { select } from '@/core/spin-query'

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
  entry: async () => {
    console.log('liveDataReAdd')
    const Data = await import('./Data.vue')
    const data: Vue = mountVueComponent(Data)
    const upperRow = (await select(() => dq('.upper-row .right-ctnr'))) as HTMLElement
    upperRow?.prepend(data.$el)
  },
  urlInclude: liveUrls,
})
