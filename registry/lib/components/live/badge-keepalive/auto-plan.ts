/** A reviewable plan only. No requests, timers, gifting, or account mutations. */
export interface MedalLightingTask {
  kind: 'like' | 'watch' | 'danmaku' | 'paid'
  current: number
  target: number
  free: boolean
}

export interface MedalLightingState {
  currentRoomId: number
  medalRoomId: number
  live: boolean
  lighted: boolean
  tasks: MedalLightingTask[] | null
}

export const proposeFreeMedalLighting = (state: MedalLightingState) => {
  if (
    !Number.isSafeInteger(state.currentRoomId) ||
    state.currentRoomId <= 0 ||
    state.medalRoomId !== state.currentRoomId
  ) {
    return { status: 'room-mismatch' as const, likes: 0 }
  }
  if (state.lighted) {
    return { status: 'already-lit' as const, likes: 0 }
  }
  if (!state.live) {
    return { status: 'not-live' as const, likes: 0 }
  }
  const task = state.tasks?.find(item => item.kind === 'like' && item.free)
  if (
    !task ||
    !Number.isSafeInteger(task.current) ||
    !Number.isSafeInteger(task.target) ||
    task.current < 0 ||
    task.target <= 0
  ) {
    return { status: 'needs-task-data' as const, likes: 0 }
  }
  const remaining = Math.max(0, task.target - task.current)
  if (!remaining) {
    return { status: 'needs-status-refresh' as const, likes: 0 }
  }
  if (remaining > 100) {
    return { status: 'needs-review' as const, likes: 0 }
  }
  return { status: 'like-candidate' as const, likes: remaining }
}
