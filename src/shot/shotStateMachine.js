import {
  hasPassedHoopLevel,
  isApproachingHoop,
  isBallAboveHoop,
  isBallBelowHoop,
  isBallInRimZone,
  isBallWithinHoopWidth,
  isMovingDown,
  isWideMiss,
} from './shotClassifier.js'

export const SHOT_STATES = {
  idle: 'idle',
  ballDetected: 'ball_detected',
  approachingHoop: 'approaching_hoop',
  inRimZone: 'in_rim_zone',
  made: 'made',
  missed: 'missed',
  cooldown: 'cooldown',
}

const COOLDOWN_MS = 1500
const ATTEMPT_WINDOW_MS = 2500
const MIN_MOVEMENT_PX = 8

/**
 * @param {{ cooldownMs?: number, attemptWindowMs?: number }} [options]
 */
export function createShotStateMachine(options = {}) {
  const cooldownMs = options.cooldownMs ?? COOLDOWN_MS
  const attemptWindowMs = options.attemptWindowMs ?? ATTEMPT_WINDOW_MS

  let state = SHOT_STATES.idle
  let cooldownUntil = 0
  let attemptStartedAt = null
  let wasAboveHoop = false
  let enteredRimZone = false
  let wasInApproachRange = false
  let attemptApexY = null
  let lastBallCenter = null
  let trajectoryStartCenter = null

  function reset() {
    state = SHOT_STATES.idle
    cooldownUntil = 0
    attemptStartedAt = null
    wasAboveHoop = false
    enteredRimZone = false
    wasInApproachRange = false
    attemptApexY = null
    lastBallCenter = null
    trajectoryStartCenter = null
  }

  function getState() {
    return state
  }

  /**
   * @param {{
   *   ballCenter: { x: number, y: number } | null,
   *   hoopBox: { x: number, y: number, width: number, height: number },
   *   timestampMs: number,
   *   ballVisible?: boolean,
   * }} input
   * @returns {{ state: string, event: 'make' | 'miss' | null }}
   */
  function update(input) {
    const { ballCenter, hoopBox, timestampMs } = input
    const ballVisible = input.ballVisible !== false && ballCenter != null

    if (state === SHOT_STATES.cooldown) {
      if (timestampMs >= cooldownUntil) {
        state = SHOT_STATES.idle
      } else {
        return { state, event: null }
      }
    }

    if (!ballVisible) {
      lastBallCenter = null
      return { state, event: null }
    }

    if (state === SHOT_STATES.made || state === SHOT_STATES.missed) {
      return { state, event: null }
    }

    const prevCenter = lastBallCenter
    lastBallCenter = { ...ballCenter }

    if (!trajectoryStartCenter) {
      trajectoryStartCenter = { ...ballCenter }
    }

    const movedEnough =
      distanceBetween(trajectoryStartCenter, ballCenter) >= MIN_MOVEMENT_PX

    if (state === SHOT_STATES.idle && movedEnough) {
      state = SHOT_STATES.ballDetected
    }

    if (isBallAboveHoop(ballCenter, hoopBox)) {
      wasAboveHoop = true
    }

    if (
      state === SHOT_STATES.ballDetected &&
      isApproachingHoop(ballCenter, hoopBox)
    ) {
      state = SHOT_STATES.approachingHoop
      attemptStartedAt = timestampMs
      wasInApproachRange = true
    }

    if (
      (state === SHOT_STATES.approachingHoop || state === SHOT_STATES.inRimZone) &&
      isApproachingHoop(ballCenter, hoopBox)
    ) {
      wasInApproachRange = true
    }

    if (attemptStartedAt != null || state === SHOT_STATES.approachingHoop || state === SHOT_STATES.inRimZone) {
      attemptApexY = attemptApexY == null ? ballCenter.y : Math.min(attemptApexY, ballCenter.y)
    }

    if (isBallInRimZone(ballCenter, hoopBox)) {
      enteredRimZone = true
      if (
        state === SHOT_STATES.ballDetected ||
        state === SHOT_STATES.approachingHoop
      ) {
        state = SHOT_STATES.inRimZone
        if (attemptStartedAt == null) {
          attemptStartedAt = timestampMs
        }
      }
    }

    const makeDetected =
      wasAboveHoop &&
      isMovingDown(prevCenter, ballCenter) &&
      enteredRimZone &&
      isBallBelowHoop(ballCenter, hoopBox) &&
      isBallWithinHoopWidth(ballCenter, hoopBox)

    if (makeDetected) {
      state = SHOT_STATES.made
      cooldownUntil = timestampMs + cooldownMs
      state = SHOT_STATES.cooldown
      wasAboveHoop = false
      enteredRimZone = false
      wasInApproachRange = false
      attemptApexY = null
      attemptStartedAt = null
      trajectoryStartCenter = null
      return { state, event: 'make' }
    }

    const inAttempt =
      state === SHOT_STATES.approachingHoop ||
      state === SHOT_STATES.inRimZone ||
      attemptStartedAt != null

    const attemptExpired =
      attemptStartedAt != null && timestampMs - attemptStartedAt >= attemptWindowMs

    const missByWidePath = inAttempt && !enteredRimZone && isWideMiss(ballCenter, hoopBox)
    const missByShortFall =
      inAttempt &&
      !enteredRimZone &&
      wasInApproachRange &&
      attemptApexY != null &&
      attemptApexY > hoopBox.y + hoopBox.height * 0.55 &&
      isMovingDown(prevCenter, ballCenter)
    const missByTimeout =
      inAttempt && !enteredRimZone && attemptExpired && hasPassedHoopLevel(ballCenter, hoopBox)
    const missByDropWithoutRim =
      inAttempt &&
      !enteredRimZone &&
      isBallBelowHoop(ballCenter, hoopBox) &&
      isWideMiss(ballCenter, hoopBox)

    if (missByWidePath || missByShortFall || missByTimeout || missByDropWithoutRim) {
      state = SHOT_STATES.missed
      cooldownUntil = timestampMs + cooldownMs
      state = SHOT_STATES.cooldown
      wasAboveHoop = false
      enteredRimZone = false
      wasInApproachRange = false
      attemptApexY = null
      attemptStartedAt = null
      trajectoryStartCenter = null
      return { state, event: 'miss' }
    }

    if (attemptExpired && !enteredRimZone) {
      state = SHOT_STATES.idle
      wasAboveHoop = false
      wasInApproachRange = false
      attemptApexY = null
      attemptStartedAt = null
      trajectoryStartCenter = null
    }

    return { state, event: null }
  }

  return { update, reset, getState }
}

function distanceBetween(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}
