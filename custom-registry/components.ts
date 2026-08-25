export interface PublishedComponent {
  id: string
  displayName: string
  description: string
}

export const publishedComponents: PublishedComponent[] = [
  {
    id: 'live/danmaku-hover-actions',
    displayName: '直播弹幕悬停操作',
    description: '悬停冻结直播飘屏弹幕，并提供 +1、@回复和复制操作.',
  },
  {
    id: 'live/danmaku-visibility-check',
    displayName: '直播弹幕公开可见性检测',
    description: '通过独立弹幕流检查本地发送的弹幕是否可能被屏蔽.',
  },
  {
    id: 'live/danmaku-send-history',
    displayName: '直播弹幕发送历史',
    description: '使用上下方向键切换当前直播间发送过的弹幕.',
  },
  {
    id: 'live/autoResolution',
    displayName: '直播自动高分辨率',
    description: '进入直播间后自动切换到可用的最高分辨率.',
  },
  {
    id: 'live/liveData-reAdd',
    displayName: '当前观众数和舰长数显示',
    description: '在直播控制栏恢复当前观众数和舰长数显示.',
  },
]
