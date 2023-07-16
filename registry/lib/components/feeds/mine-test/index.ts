import { defineComponentMetadata } from '@/components/define'

export const component = defineComponentMetadata({
  name: 'test mine',
  displayName: 'test 测试脚本123',
  entry: () => {
    console.log('test mine')
  },
  urlInclude: ['https://www.bilibili.com/'],
  tags: [componentsTags.general],
  description: {
    'zh-CN': `测试脚本`.trim(),
  },
})
