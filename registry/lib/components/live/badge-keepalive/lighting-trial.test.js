import assert from 'node:assert/strict'
import test from 'node:test'
import { runLightingTrial } from './lighting-trial'

const fixture = (change = {}) => {
  const state = { roomId: 7, anchorId: 9, hasMedal: true, lighted: false, ...change }
  const waits = []
  let clicks = 0
  const driver = {
    currentRoomId: () => 7,
    readState: async () => ({ ...state }),
    clickNativeLike: async () => { clicks++ },
    wait: async ms => { waits.push(ms) },
    cooldownMs: 350,
    reportMaxMs: 10000,
  }
  return { state, driver, waits, clicks: () => clicks }
}

test('does not click for a lit, absent, unknown, or unrelated medal', async () => {
  for (const change of [{ lighted: true }, { hasMedal: false }, { lighted: null }, { roomId: 8 }, { anchorId: 0 }]) {
    const f = fixture(change)
    await runLightingTrial(f.driver)
    assert.equal(f.clicks(), 0)
  }
})

test('limits the experiment to thirty paced clicks and verifies after native reporting', async () => {
  const f = fixture()
  assert.deepEqual(await runLightingTrial(f.driver), { status: 'not-lit-after-trial', clicks: 30 })
  assert.equal(f.waits.filter(ms => ms === 400).length, 29)
  assert.equal(f.waits.at(-1), 11000)
})

test('stops when a fresh read confirms lighting', async () => {
  const f = fixture()
  f.driver.readState = async () => ({ ...f.state, lighted: f.clicks() >= 5 })
  assert.deepEqual(await runLightingTrial(f.driver), { status: 'lit', clicks: 5 })
})

test('stops on navigation, cancellation, identity changes, and request failures', async () => {
  const moved = fixture()
  moved.driver.currentRoomId = () => moved.clicks() >= 2 ? 8 : 7
  assert.deepEqual(await runLightingTrial(moved.driver), { status: 'cancelled', clicks: 2 })
  const abort = fixture()
  const controller = new AbortController()
  abort.driver.signal = controller.signal
  abort.driver.wait = async () => { controller.abort() }
  assert.deepEqual(await runLightingTrial(abort.driver), { status: 'cancelled', clicks: 1 })
  const changed = fixture()
  changed.driver.readState = async () => ({ ...changed.state, anchorId: changed.clicks() ? 10 : 9 })
  assert.deepEqual(await runLightingTrial(changed.driver), { status: 'identity-changed', clicks: 5 })
  const failed = fixture()
  failed.driver.clickNativeLike = async () => { throw new Error('native control unavailable') }
  assert.deepEqual(await runLightingTrial(failed.driver), { status: 'failed', clicks: 0 })
})
