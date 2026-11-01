import { defineComponentMetadata } from '@/components/define'
import { getComponentSettings } from '@/core/settings'
import { select } from '@/core/spin-query'
import { liveUrls } from '@/core/utils/urls'
import { mountPlayerPosition } from './behavior'

const name = 'livePlayerPosition'
let dispose: (() => void) | null = null
let generation = 0

const unload = () => {
  generation += 1
  dispose?.()
  dispose = null
}
const load = async () => {
  unload()
  const current = generation
  await select('body')
  if (generation !== current) {
    return
  }
  const { options } = getComponentSettings<{
    autoPosition: boolean
    rememberWebFullscreen: boolean
    savedWebMode: string
  }>(name)
  dispose = mountPlayerPosition(document, {
    autoPosition: options.autoPosition,
    rememberWebFullscreen: options.rememberWebFullscreen,
    readMode: () => {
      if (options.savedWebMode === '网页全屏') {
        return true
      }
      return options.savedWebMode === '普通' ? false : null
    },
    saveMode: mode => {
      options.savedWebMode = mode ? '网页全屏' : '普通'
    },
  })
}

export const component = defineComponentMetadata({
  name,
  displayName: '直播播放器定位与网页全屏记忆',
  author: { name: 'ccccHz', link: 'https://github.com/ccccHz' },
  tags: [componentsTags.live],
  urlInclude: liveUrls,
  enabledByDefault: false,
  entry: load,
  reload: load,
  unload,
  options: {
    autoPosition: { displayName: '播放器不可充分见时自动定位', defaultValue: true },
    rememberWebFullscreen: { displayName: '记住并恢复网页全屏', defaultValue: true },
    savedWebMode: { defaultValue: '未记录', hidden: true },
  },
})
