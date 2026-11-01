export interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

export const clipFrozenDanmaku = (item: Bounds, player: Bounds) =>
  `inset(${Math.max(0, player.top - item.top)}px ${Math.max(
    0,
    item.right - player.right,
  )}px ${Math.max(0, item.bottom - player.bottom)}px ${Math.max(0, player.left - item.left)}px)`

export const placeToolbar = (
  pointerX: number,
  item: Bounds,
  player: Bounds,
  width: number,
  height: number,
) => ({
  left: Math.max(player.left + 8, Math.min(pointerX - width / 2, player.right - width - 8)),
  top:
    item.bottom + height + 16 <= player.bottom
      ? item.bottom + 8
      : Math.max(player.top + 8, Math.min(item.top - height - 8, player.bottom - height - 8)),
})
