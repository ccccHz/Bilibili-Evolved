import assert from 'node:assert/strict'
import test from 'node:test'
import { proposeFreeMedalLighting } from './auto-plan'

const state = { currentRoomId: 7, medalRoomId: 7, live: true, lighted: false, tasks: [
  { kind: 'like', current: 12, target: 30, free: true },
] }
test('proposes only the remaining server-declared free likes', () => {
  assert.deepEqual(proposeFreeMedalLighting(state), { status: 'like-candidate', likes: 18 })
  assert.equal(proposeFreeMedalLighting({ ...state, tasks: [{kind:'like', current:0, target:50, free:true}] }).likes, 50)
})
test('never substitutes paid tasks, an unrelated worn medal, or a fixed fallback of thirty likes', () => {
  for (const changed of [ {medalRoomId:8}, {tasks:null}, {tasks:[{kind:'paid',current:0,target:1,free:false}]},
    {lighted:true}, {live:false}, {tasks:[{kind:'like',current:0,target:101,free:true}]},
    {tasks:[{kind:'like',current:-1,target:30,free:true}]} ]) {
    assert.equal(proposeFreeMedalLighting({ ...state, ...changed }).likes, 0)
  }
})
