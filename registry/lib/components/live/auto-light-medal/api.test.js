import assert from 'node:assert/strict'
import test from 'node:test'
import { freeLikeCount, normalizeMedal } from './api'

const state = {
  room_info: { room_id: 7, uid: 9 }, is_gain: true,
  lookup_medal: { target_id: 9, level: 19, is_lighted: 0 },
  lookup_v2: { ruid: 9, level: 19, is_light: 0 },
  curr_weared: { target_id: 99, is_lighted: 1 },
}
test('reads the current anchor medal regardless of an unrelated worn medal', () => {
  assert.deepEqual(normalizeMedal(state), { roomId: 7, anchorId: 9, hasMedal: true, lighted: false })
  assert.equal(normalizeMedal({ ...state, lookup_v2: { ...state.lookup_v2, is_light: 1 } }).lighted, null)
  assert.equal(normalizeMedal({ ...state, is_gain: false }).hasMedal, false)
  assert.throws(() => normalizeMedal({ ...state, room_info: null }))
})
test('uses only an explicit bounded free like task and respects existing progress', () => {
  const task = { tag: 'like', gift_price: 0, title: '30个点赞', done: false, cur_progress: 0 }
  assert.equal(freeLikeCount([task]), 30)
  assert.equal(freeLikeCount([{ ...task, cur_progress: 12 }]), 18)
  for (const changed of [{ tag: 'pay_task' }, { gift_price: 100 }, { title: '300个点赞' },
    { done: true }, { cur_progress: -1 }, { cur_progress: 30 }, { title: '观看15分钟' }]) {
    assert.equal(freeLikeCount([{ ...task, ...changed }]), null)
  }
  assert.equal(freeLikeCount(null), null)
})
