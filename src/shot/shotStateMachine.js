import {
  didBallCrossRimZone,
  didSegmentTouchBox,
  getRimLineCrossing,
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
const RIM_CROSSING_HISTORY_POINTS = 10

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
  let touchedBackboardZone = false
  let rimLineNearMissCandidate = false
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
    touchedBackboardZone = false
    rimLineNearMissCandidate = false
    wasInApproachRange = false
    attemptApexY = null
    lastBallCenter = null
    trajectoryStartCenter = null
  }

  function getState() {
    return state
  }

  function finishAttempt(event, timestampMs) {
    state = event === 'make' ? SHOT_STATES.made : SHOT_STATES.missed
    cooldownUntil = timestampMs + cooldownMs
    state = SHOT_STATES.cooldown
    wasAboveHoop = false
    enteredRimZone = false
    touchedBackboardZone = false
    rimLineNearMissCandidate = false
    wasInApproachRange = false
    attemptApexY = null
    attemptStartedAt = null
    trajectoryStartCenter = null
    return { state, event }
  }

  function getLatestDownwardRimCrossing(history, hoopBox, ballRadius) {
    if (!Array.isArray(history) || history.length < 2) return null

    const recent = history.slice(-RIM_CROSSING_HISTORY_POINTS)
    let latestNearCrossing = null

    for (let index = recent.length - 1; index > 0; index -= 1) {
      const crossing = getRimLineCrossing(
        recent[index - 1],
        recent[index],
        hoopBox,
        ballRadius,
      )
      if (crossing?.direction !== 'down') continue
      if (crossing.withinWidth) return crossing
      if (!latestNearCrossing && crossing.nearHoop) {
        latestNearCrossing = crossing
      }
    }

    return latestNearCrossing
  }

  /**
   * @param {{
   *   ballCenter: { x: number, y: number } | null,
   *   hoopBox: { x: number, y: number, width: number, height: number },
   *   timestampMs: number,
   *   ballVisible?: boolean,
   *   ballRadius?: number,
   *   ballHistory?: Array<{ x: number, y: number }>,
   *   backboardZone?: { x: number, y: number, width: number, height: number },
   * }} input
   * @returns {{ state: string, event: 'make' | 'miss' | null }}
   */
  function update(input) {
    const { ballCenter, hoopBox, timestampMs } = input
    const ballRadius = Math.max(0, Number(input.ballRadius) || 0)
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

    const crossedRimZone = didBallCrossRimZone(prevCenter, ballCenter, hoopBox)
    if (didSegmentTouchBox(prevCenter, ballCenter, input.backboardZone)) {
      touchedBackboardZone = true
    }
    const rimLineCrossing =
      getLatestDownwardRimCrossing(input.ballHistory, hoopBox, ballRadius) ??
      getRimLineCrossing(prevCenter, ballCenter, hoopBox, ballRadius)
    const hasAttemptSignal =
      wasAboveHoop &&
      movedEnough &&
      (state !== SHOT_STATES.idle || isApproachingHoop(ballCenter, hoopBox))

    if (hasAttemptSignal && rimLineCrossing?.direction === 'down') {
      if (rimLineCrossing.withinWidth) {
        enteredRimZone = true
        return finishAttempt('make', timestampMs)
      }

      if (rimLineCrossing.nearHoop) {
        rimLineNearMissCandidate = true
      }
    }

    if (crossedRimZone || isBallInRimZone(ballCenter, hoopBox)) {
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
      return finishAttempt('make', timestampMs)
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
    const missByBackboard =
      inAttempt &&
      touchedBackboardZone &&
      !enteredRimZone &&
      isMovingDown(prevCenter, ballCenter) &&
      isBallBelowHoop(ballCenter, hoopBox)
    const missByRimLineNearCrossing =
      inAttempt &&
      rimLineNearMissCandidate &&
      !enteredRimZone &&
      isBallBelowHoop(ballCenter, hoopBox)

    if (
      missByWidePath ||
      missByShortFall ||
      missByTimeout ||
      missByDropWithoutRim ||
      missByBackboard ||
      missByRimLineNearCrossing
    ) {
      return finishAttempt('miss', timestampMs)
    }

    if (attemptExpired && !enteredRimZone) {
      state = SHOT_STATES.idle
      wasAboveHoop = false
      touchedBackboardZone = false
      rimLineNearMissCandidate = false
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
