import assert from 'node:assert/strict'
import test from 'node:test'
import { createShotStateMachine, SHOT_STATES } from './shotStateMachine.js'

const hoopBox = { x: 100, y: 100, width: 80, height: 20 }
const ballRadius = 10

function update(machine, point, timestampMs, overrides = {}) {
  return machine.update({
    ballCenter: point,
    hoopBox,
    timestampMs,
    ballVisible: point != null,
    ballMeasured: true,
    ballRadius,
    hoopStable: true,
    trackId: 1,
    ...overrides,
  })
}

test('does not count make on the first rim entry crossing', () => {
  const machine = createShotStateMachine({ cooldownMs: 100, pendingWindowMs: 800 })

  update(machine, { x: 140, y: 50 }, 0)
  update(machine, { x: 140, y: 75 }, 40)
  update(machine, { x: 140, y: 90 }, 80)
  const result = update(machine, { x: 140, y: 100 }, 120)

  assert.equal(result.event, null)
  assert.equal(result.state, SHOT_STATES.passingThroughNet)
})

test('counts make only after measured full pass through confirmation plane', () => {
  const machine = createShotStateMachine({ cooldownMs: 100, pendingWindowMs: 800 })

  update(machine, { x: 140, y: 50 }, 0)
  update(machine, { x: 140, y: 75 }, 40)
  update(machine, { x: 140, y: 90 }, 80)
  update(machine, { x: 140, y: 100 }, 120)
  update(machine, { x: 140, y: 116 }, 160)
  const result = update(machine, { x: 140, y: 140 }, 200)

  assert.equal(result.event, 'make')
  assert.equal(result.reason, 'confirmed_net_pass')
  assert.equal(result.state, SHOT_STATES.made)
  assert.ok(result.confidence > 0.7)
  assert.equal(result.type, 'make')
  assert.equal(result.isSwish, true)
  assert.equal(result.missType, undefined)
  assert.equal(typeof result.entryAngle, 'number')
  assert.equal(result.evidence.lastPointMeasured, true)
})

test('counts make when rim entry is detected with short measured history', () => {
  const machine = createShotStateMachine({ cooldownMs: 100, pendingWindowMs: 800 })

  update(machine, { x: 140, y: 94 }, 0)
  update(machine, { x: 140, y: 100 }, 40)
  update(machine, { x: 140, y: 116 }, 80)
  const result = update(machine, { x: 140, y: 140 }, 120)

  assert.equal(result.event, 'make')
  assert.equal(result.reason, 'confirmed_net_pass')
})

test('does not timeout while the ball is visible before a shot starts', () => {
  const machine = createShotStateMachine({ cooldownMs: 100, pendingWindowMs: 800 })

  update(machine, { x: 200, y: 500 }, 0)
  update(machine, { x: 200, y: 500 }, 1000)
  update(machine, { x: 200, y: 500 }, 2200)
  update(machine, { x: 140, y: 50 }, 3000)
  update(machine, { x: 140, y: 75 }, 3040)
  update(machine, { x: 140, y: 90 }, 3080)
  update(machine, { x: 140, y: 100 }, 3120)
  update(machine, { x: 140, y: 116 }, 3160)
  const result = update(machine, { x: 140, y: 140 }, 3200)

  assert.equal(result.event, 'make')
  assert.equal(result.reason, 'confirmed_net_pass')
})

test('keeps resolving a rim pass when the ball track changes after entry', () => {
  const machine = createShotStateMachine({ cooldownMs: 100, pendingWindowMs: 800 })

  update(machine, { x: 140, y: 50 }, 0, { trackId: 1 })
  update(machine, { x: 140, y: 75 }, 40, { trackId: 1 })
  update(machine, { x: 140, y: 90 }, 80, { trackId: 1 })
  update(machine, { x: 140, y: 100 }, 120, { trackId: 1 })
  update(machine, { x: 140, y: 116 }, 160, { trackId: 2 })
  const result = update(machine, { x: 140, y: 140 }, 200, { trackId: 2 })

  assert.equal(result.event, 'make')
  assert.equal(result.reason, 'confirmed_net_pass')
})

test('counts make from trajectory history when current ball is not visible', () => {
  const machine = createShotStateMachine({ cooldownMs: 100, pendingWindowMs: 800 })

  const result = update(machine, null, 120, {
    ballVisible: false,
    ballMeasured: false,
    ballTrackState: 'predicted',
    rawBallHistory: [
      { x: 140, y: 82 },
      { x: 140, y: 100 },
      { x: 140, y: 118 },
      { x: 140, y: 140 },
    ],
  })

  assert.equal(result.event, 'make')
  assert.equal(result.reason, 'trajectory_net_pass')
  assert.equal(result.evidence.usedTrajectoryForDecision, true)
})

test('counts make from a noisy trajectory that enters near the rim edge', () => {
  const machine = createShotStateMachine({ cooldownMs: 100, pendingWindowMs: 800 })

  const result = update(machine, null, 160, {
    ballVisible: false,
    ballMeasured: false,
    ballTrackState: 'predicted',
    ballRadius: 14,
    rawBallHistory: [
      { x: 93, y: 72 },
      { x: 95, y: 92 },
      { x: 96, y: 110 },
      { x: 102, y: 128 },
      { x: 112, y: 146 },
    ],
  })

  assert.equal(result.event, 'make')
  assert.equal(result.reason, 'trajectory_net_pass')
})

test('prefers smoothed visible trajectory over noisy raw trajectory', () => {
  const machine = createShotStateMachine({ cooldownMs: 100, pendingWindowMs: 800 })

  const result = update(machine, null, 160, {
    ballVisible: false,
    ballMeasured: false,
    ballTrackState: 'predicted',
    ballHistory: [
      { x: 140, y: 72, t: 0 },
      { x: 140, y: 94, t: 40 },
      { x: 140, y: 116, t: 80 },
      { x: 140, y: 140, t: 120 },
    ],
    rawBallHistory: [
      { x: 78, y: 72, t: 0 },
      { x: 82, y: 94, t: 40 },
      { x: 84, y: 116, t: 80 },
      { x: 86, y: 140, t: 120 },
    ],
  })

  assert.equal(result.event, 'make')
  assert.equal(result.reason, 'trajectory_net_pass')
})

test('counts make when visible trajectory line crosses the hoop center level', () => {
  const machine = createShotStateMachine({ cooldownMs: 100, pendingWindowMs: 800 })

  const result = update(machine, null, 200, {
    ballVisible: false,
    ballMeasured: false,
    ballTrackState: 'predicted',
    ballHistory: [
      { x: 134, y: 84, t: 0 },
      { x: 137, y: 99, t: 40 },
      { x: 141, y: 113, t: 80 },
      { x: 144, y: 128, t: 120 },
      { x: 148, y: 146, t: 160 },
    ],
  })

  assert.equal(result.event, 'make')
  assert.equal(result.reason, 'trajectory_net_pass')
})

test('counts rim-out when ball exits side after rim entry', () => {
  const machine = createShotStateMachine({ cooldownMs: 100, pendingWindowMs: 800 })

  update(machine, { x: 140, y: 50 }, 0)
  update(machine, { x: 140, y: 75 }, 40)
  update(machine, { x: 140, y: 90 }, 80)
  update(machine, { x: 140, y: 100 }, 120)
  const result = update(machine, { x: 188, y: 112 }, 160)

  assert.equal(result.event, 'miss')
  assert.equal(result.reason, 'rim_out')
  assert.equal(result.state, SHOT_STATES.missed)
  assert.equal(result.evidence.sideExit.side, 'right')
})

test('counts edge make only when the full ball fits within hoop width', () => {
  const machine = createShotStateMachine({ cooldownMs: 100, pendingWindowMs: 800 })

  update(machine, { x: 170, y: 50 }, 0)
  update(machine, { x: 170, y: 75 }, 40)
  update(machine, { x: 170, y: 90 }, 80)
  update(machine, { x: 170, y: 100 }, 120)
  update(machine, { x: 170, y: 116 }, 160)
  const result = update(machine, { x: 170, y: 140 }, 200)

  assert.equal(result.event, 'make')
  assert.equal(result.reason, 'confirmed_net_pass')
  assert.equal(result.isSwish, false)
})

test('does not count the same track again while it stays inside guard zone after a result', () => {
  const machine = createShotStateMachine({ cooldownMs: 100, pendingWindowMs: 800 })

  update(machine, { x: 140, y: 50 }, 0)
  update(machine, { x: 140, y: 75 }, 40)
  update(machine, { x: 140, y: 90 }, 80)
  update(machine, { x: 140, y: 100 }, 120)
  const firstResult = update(machine, { x: 188, y: 112 }, 160)

  assert.equal(firstResult.event, 'miss')

  const repeatedResults = [
    update(machine, { x: 188, y: 130 }, 320),
    update(machine, { x: 188, y: 150 }, 640),
    update(machine, { x: 188, y: 180 }, 1100),
    update(machine, { x: 188, y: 210 }, 1600),
  ]

  assert.deepEqual(repeatedResults.map((result) => result.event), [null, null, null, null])
})

test('counts in-and-out as miss when ball rises out of hoop width after entering net', () => {
  const machine = createShotStateMachine({ cooldownMs: 100, pendingWindowMs: 800 })

  update(machine, { x: 140, y: 50 }, 0)
  update(machine, { x: 140, y: 75 }, 40)
  update(machine, { x: 140, y: 90 }, 80)
  update(machine, { x: 140, y: 100 }, 120)
  update(machine, { x: 140, y: 116 }, 160)
  const result = update(machine, { x: 186, y: 112 }, 200)

  assert.equal(result.event, 'miss')
  assert.equal(result.reason, 'rim_out')
  assert.equal(result.missType, 'right')
  assert.equal(result.isSwish, false)
})

test('does not count a mostly horizontal pass near hoop as a miss', () => {
  const machine = createShotStateMachine({ cooldownMs: 100, pendingWindowMs: 800 })

  update(machine, { x: 40, y: 110 }, 0)
  update(machine, { x: 75, y: 112 }, 40)
  update(machine, { x: 115, y: 115 }, 80)
  update(machine, { x: 165, y: 118 }, 120)
  const result = update(machine, { x: 215, y: 122 }, 160)

  assert.equal(result.event, null)
  assert.notEqual(result.state, SHOT_STATES.missed)
})

test('does not arm from a lateral pass that drifts downward below hoop level', () => {
  const machine = createShotStateMachine({ cooldownMs: 100, pendingWindowMs: 800 })

  update(machine, { x: 40, y: 90 }, 0)
  update(machine, { x: 80, y: 96 }, 40)
  update(machine, { x: 130, y: 103 }, 80)
  update(machine, { x: 180, y: 112 }, 120)
  const result = update(machine, { x: 230, y: 126 }, 160)

  assert.equal(result.event, null)
  assert.notEqual(result.state, SHOT_STATES.missed)
})

test('returns unknown when only predicted points remain after rim entry', () => {
  const machine = createShotStateMachine({
    cooldownMs: 100,
    pendingWindowMs: 1000,
    unknownTrackLossMs: 180,
  })

  update(machine, { x: 140, y: 50 }, 0)
  update(machine, { x: 140, y: 75 }, 40)
  update(machine, { x: 140, y: 90 }, 80)
  update(machine, { x: 140, y: 100 }, 120)
  const result = update(machine, { x: 140, y: 145 }, 340, {
    ballMeasured: false,
    ballTrackState: 'predicted',
  })

  assert.equal(result.event, 'unknown')
  assert.equal(result.reason, 'predicted_only_after_entry')
  assert.equal(result.confidence, 0)
  assert.equal(result.evidence.usedPredictedForDecision, true)
})

test('returns unknown when hoop becomes unstable after rim entry', () => {
  const machine = createShotStateMachine({ cooldownMs: 100, pendingWindowMs: 800 })

  update(machine, { x: 140, y: 50 }, 0)
  update(machine, { x: 140, y: 75 }, 40)
  update(machine, { x: 140, y: 90 }, 80)
  update(machine, { x: 140, y: 100 }, 120)
  const result = update(machine, { x: 140, y: 116 }, 160, {
    hoopStable: false,
  })

  assert.equal(result.event, 'unknown')
  assert.equal(result.reason, 'unstable_hoop_after_entry')
  assert.equal(result.evidence.hoopStable, false)
})
