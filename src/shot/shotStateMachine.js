import {
  didSegmentTouchBox,
  getBallPlaneCrossing,
  getRimControlPlanes,
  hasPassedHoopLevel,
  isApproachingHoop,
  isBallAboveHoop,
  isBallBelowHoop,
  isBallCenterInsideInnerOpening,
  isBallOutsideGuardZone,
  isBallWithinHoopWidth,
  isMovingDown,
  missByPassingHoopLevel,
} from './shotClassifier.js'

export const SHOT_STATES = {
  idle: 'idle',
  candidate: 'candidate',
  armed: 'armed',
  rimInteractionPending: 'rim_interaction_pending',
  passingThroughNet: 'passing_through_net',
  made: 'made',
  missed: 'missed',
  unknown: 'unknown',
  cooldown: 'cooldown',

  // Backward-compatible aliases used by older UI labels/tests.
  ballDetected: 'candidate',
  approachingHoop: 'armed',
  inRimZone: 'rim_interaction_pending',
}

const COOLDOWN_MS = 1100
const ATTEMPT_WINDOW_MS = 2600
const PENDING_WINDOW_MS = 900
const UNKNOWN_TRACK_LOSS_MS = 360
const MIN_MEASURED_POINTS = 3
const MIN_ARMED_MEASURED_POINTS = 2
const MIN_DOWNWARD_SEGMENTS = 2
const MIN_HOOP_NORMALIZED_SPEED_PER_SEC = 0.35
const MIN_SHOT_VERTICAL_COMPONENT = 0.42
const MIN_SHOT_VERTICAL_PROGRESS_FACTOR = 0.75
const MIN_ENTRY_VERTICAL_COMPONENT = 0.3
const MIN_ENTRY_VERTICAL_PROGRESS_FACTOR = 0.25
const TRAJECTORY_ENTRY_TOLERANCE_FACTOR = 0.16
export const SHOT_ALGORITHMS = {
  SMART_HOOP: 'smart-hoop',
  HYBRID: 'hybrid',
  AVISHAH: 'avishah',
}

/**
 * @param {{
 *   cooldownMs?: number,
 *   attemptWindowMs?: number,
 *   pendingWindowMs?: number,
 *   unknownTrackLossMs?: number,
 * }} [options]
 */
export function createShotStateMachine(options = {}) {
  const cooldownMs = options.cooldownMs ?? COOLDOWN_MS
  const attemptWindowMs = options.attemptWindowMs ?? ATTEMPT_WINDOW_MS
  const pendingWindowMs = options.pendingWindowMs ?? PENDING_WINDOW_MS
  const unknownTrackLossMs = options.unknownTrackLossMs ?? UNKNOWN_TRACK_LOSS_MS

  let state = SHOT_STATES.idle
  let cooldownUntil = 0
  let attemptStartedAt = null
  let pendingStartedAt = null
  let lastBallCenter = null
  let lastMeasuredAt = null
  let lastTrackId = null
  let attemptId = 0
  let resultSequence = 0
  let lastResultAt = null
  let lastPointMeasured = false
  let wasAboveHoop = false
  let wasInApproachRange = false
  let touchedBackboardZone = false
  let rimEntry = null
  let measuredPoints = []
  let recentCenters = []
  let lastHoopBox = null
  let lastBallRadius = 0
  let avishahFrameCount = 0
  let avishahBallPos = []
  let avishahHoopPos = []
  let avishahUp = false
  let avishahDown = false
  let avishahUpFrame = 0
  let avishahDownFrame = 0

  function resetAttemptData() {
    attemptStartedAt = null
    pendingStartedAt = null
    lastBallCenter = null
    lastMeasuredAt = null
    lastPointMeasured = false
    wasAboveHoop = false
    wasInApproachRange = false
    touchedBackboardZone = false
    rimEntry = null
    measuredPoints = []
    recentCenters = []
    lastHoopBox = null
    lastBallRadius = 0
    resetAvishahAttemptData()
  }

  function resetAvishahAttemptData() {
    avishahBallPos = []
    avishahHoopPos = []
    avishahUp = false
    avishahDown = false
    avishahUpFrame = 0
    avishahDownFrame = 0
  }

  function reset() {
    state = SHOT_STATES.idle
    cooldownUntil = 0
    lastTrackId = null
    lastResultAt = null
    avishahFrameCount = 0
    resetAttemptData()
  }

  function getState() {
    return state
  }

  function buildEvidence(extra = {}) {
    const measuredCount = measuredPoints.length
    const recentMeasured = measuredPoints.slice(-5)
    const downwardSegments = countDownwardSegments(recentMeasured)
    const latestVelocity = getLatestMeasuredVelocity(recentMeasured)

    return {
      attemptId,
      measuredCount,
      downwardSegments,
      wasAboveHoop,
      wasInApproachRange,
      touchedBackboardZone,
      rimEntry,
      latestVelocity,
      ...extra,
    }
  }

  function getConfidence(event, reason, evidence, analytics) {
    if (event === 'unknown') return 0

    let confidence = 0.35 + (analytics.centeringScore ?? 0.5) * 0.38
    if (evidence.measuredCount >= 5) confidence += 0.12
    if (evidence.downwardSegments >= 3) confidence += 0.1
    if (evidence.hoopStable !== false) confidence += 0.08
    if (evidence.lastPointMeasured) confidence += 0.08
    if (reason === 'confirmed_net_pass' || reason === 'trajectory_net_pass') confidence += 0.08
    if (reason === 'rim_out' || reason === 'side_exit') confidence += 0.08
    if (evidence.usedTrajectoryForDecision) confidence -= 0.08
    if (evidence.usedPredictedForDecision) confidence -= 0.25

    return clamp(confidence, 0.2, 0.96)
  }

  function getShotAnalytics(event, reason, evidence) {
    const hoopBox = lastHoopBox
    if (!hoopBox) {
      return {
        centeringScore: 0.5,
        missType: event === 'miss' ? 'short' : undefined,
        isSwish: false,
        entryAngle: null,
      }
    }

    const hoopCenter = getHoopCenter(hoopBox)
    const entryPoint = rimEntry ?? evidence.entryCrossing ?? evidence.confirmationCrossing ?? lastBallCenter
    const centeringScore = getCenteringScore(entryPoint, hoopCenter, hoopBox, lastBallRadius)
    const entryAngle = getEntryAngle(measuredPoints, recentCenters)

    return {
      centeringScore,
      missType: event === 'miss'
        ? getMissType(reason, evidence, lastBallCenter, hoopBox, lastBallRadius)
        : undefined,
      isSwish: event === 'make' ? getIsSwish(entryPoint, hoopCenter, hoopBox, lastBallRadius) : false,
      entryAngle,
    }
  }

  function finishAttempt(event, timestampMs, details = {}) {
    const evidence = buildEvidence(details.evidence)
    const reason = details.reason ?? event
    const analytics = getShotAnalytics(event, reason, evidence)
    const result = {
      state: event === 'make'
        ? SHOT_STATES.made
        : event === 'miss'
          ? SHOT_STATES.missed
          : SHOT_STATES.unknown,
      event,
      type: event,
      reason,
      confidence: getConfidence(event, reason, evidence, analytics),
      missType: event === 'miss' ? analytics.missType : undefined,
      isSwish: event === 'make' ? analytics.isSwish : false,
      entryAngle: analytics.entryAngle,
      evidence,
    }

    resultSequence += 1
    result.evidence.resultSequence = resultSequence

    state = SHOT_STATES.cooldown
    cooldownUntil = timestampMs + cooldownMs
    lastResultAt = timestampMs
    resetAttemptData()
    return result
  }

  function startAttempt(timestampMs, trackId) {
    attemptId += 1
    attemptStartedAt = timestampMs
    pendingStartedAt = null
    lastTrackId = trackId ?? lastTrackId
    rimEntry = null
    touchedBackboardZone = false
    wasInApproachRange = false
    wasAboveHoop = false
    measuredPoints = []
    recentCenters = []
  }

  function updateCooldown(ballCenter, hoopBox, timestampMs, trackId, latestTrajectoryAt) {
    if (state !== SHOT_STATES.cooldown) return false

    const trackChanged = trackId != null && lastTrackId != null && trackId !== lastTrackId
    const outsideGuard = ballCenter && hoopBox && isBallOutsideGuardZone(ballCenter, hoopBox)
    const ballGone = ballCenter == null
    const hasFreshTrajectory = latestTrajectoryAt == null ||
      lastResultAt == null ||
      latestTrajectoryAt > lastResultAt
    const minElapsed = timestampMs >= cooldownUntil
    const canRearm = minElapsed && hasFreshTrajectory && (outsideGuard || trackChanged || ballGone)

    if (canRearm) {
      state = SHOT_STATES.idle
      return false
    }

    return true
  }

  function rememberPoint(point, timestampMs, measured) {
    recentCenters.push({ ...point, t: timestampMs, measured })
    if (recentCenters.length > 8) recentCenters.shift()

    if (measured) {
      measuredPoints.push({ ...point, t: timestampMs })
      if (measuredPoints.length > 12) measuredPoints.shift()
      lastMeasuredAt = timestampMs
    }
  }

  /**
   * @param {{
   *   ballCenter: { x: number, y: number } | null,
   *   hoopBox: { x: number, y: number, width: number, height: number },
   *   timestampMs: number,
   *   ballVisible?: boolean,
   *   ballMeasured?: boolean,
   *   ballTrackState?: 'detected' | 'tracked' | 'predicted' | 'lost',
   *   ballRadius?: number,
   *   ballHistory?: Array<{ x: number, y: number, t?: number }>,
   *   rawBallHistory?: Array<{ x: number, y: number, t?: number }>,
   *   ballVelocity?: { vx: number, vy: number } | null,
   *   backboardZone?: { x: number, y: number, width: number, height: number },
   *   hoopStable?: boolean,
   *   hoopStability?: number,
   *   hoopLost?: boolean,
   *   trackId?: number | string | null,
   * }} input
   * @returns {{
   *   state: string,
   *   event: 'make' | 'miss' | 'unknown' | null,
   *   type?: 'make' | 'miss' | 'unknown' | null,
   *   reason?: string,
   *   confidence?: number,
   *   missType?: 'short' | 'long' | 'left' | 'right',
   *   isSwish?: boolean,
   *   entryAngle?: number | null,
   *   evidence?: object,
   * }}
  */
  function update(input) {
    const algorithm = input.shotAlgorithm ?? options.shotAlgorithm ?? SHOT_ALGORITHMS.SMART_HOOP
    const { hoopBox, timestampMs } = input
    const trackId = input.trackId ?? null
    const trajectorySets = getTrajectorySets(input, timestampMs)
    const trajectoryPoints = trajectorySets[0]?.points ?? []
    const latestTrajectoryPoint = trajectoryPoints[trajectoryPoints.length - 1] ?? null
    const latestTrajectoryAt = getLatestTrajectoryAt(trajectorySets)
    const ballCenter = input.ballCenter ?? latestTrajectoryPoint
    const ballRadius = Math.max(0, Number(input.ballRadius) || 0)
    lastBallRadius = ballRadius
    const ballVisible = (input.ballVisible !== false && ballCenter != null) || trajectoryPoints.length >= 2
    const ballMeasured =
      input.ballMeasured ??
      (input.ballTrackState == null ||
        input.ballTrackState === 'detected' ||
        input.ballTrackState === 'tracked')
    const hoopStable = input.hoopStable !== false && input.hoopLost !== true
    let hybridAvishahDecision = null

    if (updateCooldown(ballCenter, hoopBox, timestampMs, trackId, latestTrajectoryAt)) {
      return { state, event: null }
    }

    if (algorithm === SHOT_ALGORITHMS.AVISHAH) {
      return updateAvishahAlgorithm({
        ballCenter,
        hoopBox,
        timestampMs,
        ballVisible,
        ballMeasured,
        ballRadius,
        hoopStable,
        trackId,
        hoopLost: input.hoopLost,
      })
    }

    if (algorithm === SHOT_ALGORITHMS.HYBRID) {
      hybridAvishahDecision = updateAvishahTracking({
        ballCenter,
        hoopBox,
        ballVisible,
        ballMeasured,
        ballRadius,
        trackId,
      })
    }

    if (state !== SHOT_STATES.idle && input.hoopLost) {
      return finishAttempt('unknown', timestampMs, {
        reason: 'hoop_lost',
        evidence: { hoopStable: false },
      })
    }

    if (!ballVisible) {
      if (
        (state === SHOT_STATES.rimInteractionPending || state === SHOT_STATES.passingThroughNet) &&
        lastMeasuredAt != null &&
        timestampMs - lastMeasuredAt >= unknownTrackLossMs
      ) {
        return finishAttempt('unknown', timestampMs, {
          reason: 'track_lost_after_entry',
          evidence: { hoopStable, lastPointMeasured: false },
        })
      }

      lastBallCenter = null
      return { state, event: null }
    }

    const prevCenter = lastBallCenter
    const prevPointMeasured = lastPointMeasured
    lastBallCenter = { ...ballCenter }
    lastHoopBox = { ...hoopBox }

    const resolvingRimPass =
      state === SHOT_STATES.rimInteractionPending || state === SHOT_STATES.passingThroughNet
    if (
      trackId != null &&
      lastTrackId != null &&
      trackId !== lastTrackId &&
      state !== SHOT_STATES.idle &&
      !resolvingRimPass
    ) {
      return finishAttempt('unknown', timestampMs, {
        reason: 'track_changed',
        evidence: { hoopStable, lastPointMeasured: Boolean(ballMeasured) },
      })
    }

    if (state === SHOT_STATES.idle) {
      if (!isPotentialAttemptStart(ballCenter, hoopBox, trajectoryPoints)) {
        lastPointMeasured = Boolean(ballMeasured)
        return { state, event: null }
      }

      if (trackId != null) lastTrackId = trackId
      startAttempt(timestampMs, trackId)
      state = SHOT_STATES.candidate
    }

    rememberPoint(ballCenter, timestampMs, Boolean(ballMeasured))
    lastPointMeasured = Boolean(ballMeasured)

    if (trajectoryWasAboveHoop(trajectoryPoints, hoopBox) || isBallAboveHoop(ballCenter, hoopBox)) {
      wasAboveHoop = true
    }

    if (isApproachingHoop(ballCenter, hoopBox)) {
      wasInApproachRange = true
    }

    if (didSegmentTouchBox(prevCenter, ballCenter, input.backboardZone)) {
      touchedBackboardZone = true
    }

    const trajectoryDecision = analyzeCompleteTrajectories(
      trajectorySets,
      hoopBox,
      ballRadius,
      ballMeasured,
      prevPointMeasured,
    )
    if (trajectoryDecision && state !== SHOT_STATES.cooldown) {
      if (trajectoryDecision.rimEntry) rimEntry = trajectoryDecision.rimEntry
      return finishAttempt(trajectoryDecision.event, timestampMs, {
        reason: trajectoryDecision.reason,
        evidence: {
          hoopStable,
          lastPointMeasured: Boolean(ballMeasured),
          usedTrajectoryForDecision: true,
          entryCrossing: trajectoryDecision.rimEntry,
          trajectorySource: trajectoryDecision.source,
          trajectoryDecision: trajectoryDecision.evidence,
        },
      })
    }

    const measuredCount = measuredPoints.length
    const recentMeasuredPoints = measuredPoints.slice(-5)
    const downwardSegments = countDownwardSegments(recentMeasuredPoints)
    const normalizedSpeed = getNormalizedSpeed(input.ballVelocity, hoopBox)
    const movingFastEnough = normalizedSpeed == null || normalizedSpeed >= MIN_HOOP_NORMALIZED_SPEED_PER_SEC
    const hasStableTrack = measuredCount >= MIN_ARMED_MEASURED_POINTS
    const recentTrajectoryPoints = trajectoryPoints.length >= MIN_MEASURED_POINTS
      ? trajectoryPoints.slice(-6)
      : recentMeasuredPoints
    const hasAttemptShape = hasDownwardShotTrajectory(recentTrajectoryPoints, hoopBox) &&
      wasAboveHoop &&
      isApproachingHoop(ballCenter, hoopBox)

    if (
      state === SHOT_STATES.candidate &&
      hasStableTrack &&
      movingFastEnough &&
      hasAttemptShape
    ) {
      state = SHOT_STATES.armed
    }

    const attemptExpired =
      attemptStartedAt != null && timestampMs - attemptStartedAt >= attemptWindowMs
    const pendingExpired =
      pendingStartedAt != null && timestampMs - pendingStartedAt >= pendingWindowMs

    if (
      state === SHOT_STATES.candidate ||
      state === SHOT_STATES.armed ||
      state === SHOT_STATES.rimInteractionPending
    ) {
      const entryCrossing =
        getLatestEntryCrossing(trajectoryPoints, hoopBox, ballRadius) ??
        getEntryCrossing(prevCenter, ballCenter, hoopBox, ballRadius)
      const insideEntry = entryCrossing
        ? isCrossingInsideInnerOpening(entryCrossing, hoopBox, ballRadius)
        : isBallCenterInsideInnerOpening(ballCenter, hoopBox, ballRadius)
      const entryLooksLikeShot =
        state === SHOT_STATES.armed ||
        (wasAboveHoop &&
          (hasDownwardShotSegment(prevCenter, ballCenter, hoopBox) ||
            hasDownwardShotTrajectory(trajectoryPoints.slice(-4), hoopBox)))
      const fastSegmentDecision = getFastSegmentDecision(
        prevCenter,
        ballCenter,
        hoopBox,
        ballRadius,
        entryLooksLikeShot,
      )

      if (
        fastSegmentDecision &&
        hoopStable &&
        ballMeasured &&
        prevPointMeasured
      ) {
        if (fastSegmentDecision.rimEntry) rimEntry = fastSegmentDecision.rimEntry
        return finishAttempt(fastSegmentDecision.event, timestampMs, {
          reason: fastSegmentDecision.reason,
          evidence: {
            hoopStable,
            lastPointMeasured: true,
            usedTrajectoryForDecision: true,
            entryCrossing: fastSegmentDecision.rimEntry,
            trajectoryDecision: fastSegmentDecision.evidence,
          },
        })
      }

      if (
        (state === SHOT_STATES.candidate || state === SHOT_STATES.armed) &&
        hasReliableTrajectoryForDecision(ballMeasured, prevPointMeasured, trajectoryPoints) &&
        hoopStable &&
        entryCrossing?.direction === 'down' &&
        insideEntry &&
        entryLooksLikeShot
      ) {
        state = SHOT_STATES.passingThroughNet
        pendingStartedAt = timestampMs
        rimEntry = {
          x: entryCrossing.x,
          y: entryCrossing.y,
          timestampMs,
        }
      } else if (entryCrossing?.direction === 'down' && !insideEntry) {
        const nearHoop = isNearHoop(entryCrossing, hoopBox)
        if (nearHoop && ballMeasured && prevPointMeasured && entryLooksLikeShot) {
          return finishAttempt('miss', timestampMs, {
            reason: 'side_exit',
            evidence: {
              hoopStable,
              lastPointMeasured: true,
              entryCrossing,
            },
          })
        }
      }
    }

    if (state === SHOT_STATES.rimInteractionPending) {
      if (!hoopStable) {
        return finishAttempt('unknown', timestampMs, {
          reason: 'unstable_hoop_after_entry',
          evidence: { hoopStable: false, lastPointMeasured: Boolean(ballMeasured) },
        })
      }

      const sideExit = detectSideExit(prevCenter, ballCenter, hoopBox, ballRadius)
      if (ballMeasured && prevPointMeasured && sideExit) {
        return finishAttempt('miss', timestampMs, {
          reason: 'rim_out',
          evidence: {
            hoopStable,
            lastPointMeasured: true,
            sideExit,
          },
        })
      }

      const entryUpCrossing = getEntryCrossing(prevCenter, ballCenter, hoopBox, ballRadius)
      if (ballMeasured && prevPointMeasured && entryUpCrossing?.direction === 'up') {
        return finishAttempt('miss', timestampMs, {
          reason: 'rim_out',
          evidence: {
            hoopStable,
            lastPointMeasured: true,
            entryCrossing: entryUpCrossing,
          },
        })
      }

      const confirmationCrossing =
        getLatestConfirmationCrossing(trajectoryPoints, hoopBox, ballRadius) ??
        getConfirmationCrossing(prevCenter, ballCenter, hoopBox, ballRadius)
      const enoughMeasuredEvidence =
        ballMeasured &&
        prevPointMeasured &&
        measuredPoints.length >= MIN_MEASURED_POINTS &&
        countDownwardSegments(measuredPoints.slice(-5)) >= MIN_DOWNWARD_SEGMENTS
      const insideConfirmation = confirmationCrossing
        ? isCrossingInsideExitOpening(confirmationCrossing, hoopBox, ballRadius)
        : isBallCenterInsideExitOpening(ballCenter, hoopBox, ballRadius)

      if (
        confirmationCrossing?.direction === 'down' &&
        insideConfirmation &&
        enoughMeasuredEvidence
      ) {
        state = SHOT_STATES.passingThroughNet
        pendingStartedAt = timestampMs
      }

      const belowOutsideOpening =
        ballMeasured &&
        isBallBelowHoop(ballCenter, hoopBox) &&
        !isBallCenterInsideExitOpening(ballCenter, hoopBox, ballRadius)

      if (belowOutsideOpening) {
        return finishAttempt('miss', timestampMs, {
          reason: 'rim_out',
          evidence: {
            hoopStable,
            lastPointMeasured: true,
          },
        })
      }

      if (
        !ballMeasured &&
        lastMeasuredAt != null &&
        timestampMs - lastMeasuredAt >= unknownTrackLossMs
      ) {
        return finishAttempt('unknown', timestampMs, {
          reason: 'predicted_only_after_entry',
          evidence: {
            hoopStable,
            lastPointMeasured: false,
            usedPredictedForDecision: true,
          },
        })
      }

      if (pendingExpired) {
        return finishAttempt('unknown', timestampMs, {
          reason: 'pending_timeout',
          evidence: {
            hoopStable,
            lastPointMeasured: Boolean(ballMeasured),
          },
        })
      }
    }

    if (state === SHOT_STATES.passingThroughNet) {
      if (!hoopStable) {
        return finishAttempt('unknown', timestampMs, {
          reason: 'unstable_hoop_after_entry',
          evidence: { hoopStable: false, lastPointMeasured: Boolean(ballMeasured) },
        })
      }

      const sideExit =
        getLatestSideExit(trajectoryPoints, hoopBox, ballRadius) ??
        detectSideExit(prevCenter, ballCenter, hoopBox, ballRadius)
      if (hasReliableTrajectoryForDecision(ballMeasured, prevPointMeasured, trajectoryPoints) && sideExit) {
        return finishAttempt('miss', timestampMs, {
          reason: 'rim_out',
          evidence: {
            hoopStable,
            lastPointMeasured: true,
            sideExit,
          },
        })
      }

      if (
        hasReliableTrajectoryForDecision(ballMeasured, prevPointMeasured, trajectoryPoints) &&
        (isMovingUp(prevCenter, ballCenter) || trajectoryMovedUp(trajectoryPoints)) &&
        !isBallWithinHoopWidth(ballCenter, hoopBox, ballRadius)
      ) {
        return finishAttempt('miss', timestampMs, {
          reason: 'rim_out',
          evidence: {
            hoopStable,
            lastPointMeasured: true,
          },
        })
      }

      if (
        hasReliableTrajectoryForDecision(ballMeasured, prevPointMeasured, trajectoryPoints) &&
        trajectoryHasPassedHoopLevel(trajectoryPoints, hoopBox, ballCenter)
      ) {
        return finishAttempt('make', timestampMs, {
          reason: 'confirmed_net_pass',
          evidence: {
            hoopStable,
            lastPointMeasured: true,
            usedTrajectoryForDecision: !ballMeasured,
          },
        })
      }

      if (
        !ballMeasured &&
        lastMeasuredAt != null &&
        timestampMs - lastMeasuredAt >= unknownTrackLossMs
      ) {
        return finishAttempt('unknown', timestampMs, {
          reason: 'predicted_only_after_entry',
          evidence: {
            hoopStable,
            lastPointMeasured: false,
            usedPredictedForDecision: true,
          },
        })
      }

      if (pendingExpired) {
        return finishAttempt('unknown', timestampMs, {
          reason: 'pending_timeout',
          evidence: {
            hoopStable,
            lastPointMeasured: Boolean(ballMeasured),
          },
        })
      }
    }

    const inAttempt = state === SHOT_STATES.candidate || state === SHOT_STATES.armed
    const scoringMissCandidate = state === SHOT_STATES.armed

    if (algorithm === SHOT_ALGORITHMS.HYBRID && inAttempt && hybridAvishahDecision) {
      return finishAttempt(hybridAvishahDecision.event, timestampMs, {
        reason: hybridAvishahDecision.reason,
        evidence: {
          hoopStable,
          lastPointMeasured: Boolean(ballMeasured),
          usedTrajectoryForDecision: true,
          algorithm: SHOT_ALGORITHMS.HYBRID,
          avishahFallback: true,
          avishahDecision: hybridAvishahDecision.evidence,
        },
      })
    }

    if (scoringMissCandidate && ballMeasured && missByPassingHoopLevel(ballCenter, hoopBox, ballRadius)) {
      return finishAttempt('miss', timestampMs, {
        reason: 'passed_hoop_level',
        evidence: { hoopStable, lastPointMeasured: true },
      })
    }

    if (
      scoringMissCandidate &&
      ballMeasured &&
      touchedBackboardZone &&
      isMovingDown(prevCenter, ballCenter) &&
      isBallBelowHoop(ballCenter, hoopBox) &&
      !isBallCenterInsideInnerOpening(ballCenter, hoopBox, ballRadius)
    ) {
      return finishAttempt('miss', timestampMs, {
        reason: 'backboard_miss',
        evidence: { hoopStable, lastPointMeasured: true },
      })
    }

    if (inAttempt && attemptExpired) {
      const event = measuredCount >= MIN_MEASURED_POINTS && hasPassedHoopLevel(ballCenter, hoopBox)
        ? 'miss'
        : 'unknown'
      return finishAttempt(event, timestampMs, {
        reason: event === 'miss' ? 'attempt_timeout' : 'insufficient_evidence_timeout',
        evidence: {
          hoopStable,
          lastPointMeasured: Boolean(ballMeasured),
        },
      })
    }

    return { state, event: null }
  }

  function updateAvishahAlgorithm(input) {
    const {
      ballCenter,
      hoopBox,
      timestampMs,
      ballVisible,
      ballMeasured,
      ballRadius,
      hoopStable,
      trackId,
      hoopLost,
    } = input

    if (hoopLost) {
      return finishAttempt('unknown', timestampMs, {
        reason: 'hoop_lost',
        evidence: { algorithm: SHOT_ALGORITHMS.AVISHAH, hoopStable: false },
      })
    }

    const decision = updateAvishahTracking({
      ballCenter,
      hoopBox,
      ballVisible,
      ballMeasured,
      ballRadius,
      trackId,
    })

    if (!decision) {
      if (!ballVisible || !ballCenter) {
        state = avishahUp || avishahDown ? SHOT_STATES.candidate : SHOT_STATES.idle
      } else {
        state = avishahUp ? SHOT_STATES.armed : SHOT_STATES.candidate
      }
      return { state, event: null }
    }

    return finishAttempt(decision.event, timestampMs, {
      reason: decision.reason,
      evidence: {
        algorithm: SHOT_ALGORITHMS.AVISHAH,
        hoopStable,
        lastPointMeasured: Boolean(ballMeasured),
        measuredCount: avishahBallPos.length,
        usedTrajectoryForDecision: true,
        avishahDecision: decision.evidence,
      },
    })
  }

  function updateAvishahTracking(input) {
    const {
      ballCenter,
      hoopBox,
      ballVisible,
      ballMeasured,
      ballRadius,
      trackId,
    } = input

    avishahFrameCount += 1
    lastHoopBox = { ...hoopBox }
    lastBallRadius = ballRadius
    if (trackId != null) lastTrackId = trackId

    avishahHoopPos.push({
      center: getHoopCenter(hoopBox),
      frame: avishahFrameCount,
      width: hoopBox.width,
      height: hoopBox.height,
      confidence: 1,
    })
    avishahHoopPos = cleanAvishahHoopPos(avishahHoopPos)

    if (!ballVisible || !ballCenter) return null

    const diameter = Math.max(0, ballRadius * 2)
    avishahBallPos.push({
      center: { ...ballCenter },
      frame: avishahFrameCount,
      width: diameter,
      height: diameter,
      confidence: ballMeasured ? 1 : 0.3,
    })
    avishahBallPos = cleanAvishahBallPos(avishahBallPos, avishahFrameCount)

    if (!avishahUp && avishahDetectUp(avishahBallPos, avishahHoopPos)) {
      avishahUp = true
      avishahUpFrame = avishahBallPos[avishahBallPos.length - 1].frame
      state = SHOT_STATES.armed
    }

    if (avishahUp && !avishahDown && avishahDetectDown(avishahBallPos, avishahHoopPos)) {
      avishahDown = true
      avishahDownFrame = avishahBallPos[avishahBallPos.length - 1].frame
    }

    if (avishahUp && avishahDown && avishahUpFrame < avishahDownFrame) {
      const made = avishahScore(avishahBallPos, avishahHoopPos)
      return {
        event: made ? 'make' : 'miss',
        reason: made ? 'avishah_trajectory_score' : 'avishah_trajectory_miss',
        evidence: {
          measuredCount: avishahBallPos.length,
          upFrame: avishahUpFrame,
          downFrame: avishahDownFrame,
        },
      }
    }

    return null
  }

  return { update, reset, getState }
}

function getTrajectorySets(input, timestampMs) {
  const sets = []
  const smoothed = getTrajectoryPoints(input.ballHistory, input.ballCenter, timestampMs)
  const raw = getTrajectoryPoints(input.rawBallHistory, input.ballCenter, timestampMs)

  if (smoothed.length) sets.push({ source: 'smoothed', points: smoothed })
  if (raw.length) sets.push({ source: 'raw', points: raw })
  if (sets.length === 0) {
    const current = normalizeTrajectoryPoint(input.ballCenter, timestampMs, 0)
    if (current) sets.push({ source: 'current', points: [current] })
  }

  return sets
}

function getTrajectoryPoints(source, currentPoint, timestampMs) {
  const history = Array.isArray(source) ? source : []
  const points = []

  for (let index = 0; index < history.length; index += 1) {
    const point = normalizeTrajectoryPoint(history[index], timestampMs, history.length - index)
    if (point) points.push(point)
  }

  const current = normalizeTrajectoryPoint(currentPoint, timestampMs, 0)
  const last = points[points.length - 1]
  if (
    current &&
    (!last || Math.abs(last.x - current.x) > 0.001 || Math.abs(last.y - current.y) > 0.001)
  ) {
    points.push(current)
  }

  return points.slice(-12)
}

function getLatestTrajectoryAt(trajectorySets) {
  let latest = null
  for (const { points } of trajectorySets) {
    for (const point of points) {
      if (!Number.isFinite(point.t)) continue
      latest = latest == null ? point.t : Math.max(latest, point.t)
    }
  }
  return latest
}

function normalizeTrajectoryPoint(point, timestampMs, framesBack) {
  if (!point) return null
  const x = Number(point.x)
  const y = Number(point.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null

  return {
    x,
    y,
    t: Number.isFinite(point.t) ? point.t : timestampMs - framesBack * 33,
  }
}

function avishahScore(ballPos, hoopPos) {
  if (!ballPos.length || !hoopPos.length) return false

  const hoop = hoopPos[hoopPos.length - 1]
  const rimHeight = hoop.center.y - 0.5 * hoop.height
  const x = []
  const y = []

  for (let index = ballPos.length - 1; index >= 0; index -= 1) {
    if (ballPos[index].center.y < rimHeight) {
      x.push(ballPos[index].center.x)
      y.push(ballPos[index].center.y)
      if (index + 1 < ballPos.length) {
        x.push(ballPos[index + 1].center.x)
        y.push(ballPos[index + 1].center.y)
      }
      break
    }
  }

  if (x.length < 2) return false

  const predictedX = x[1] === x[0]
    ? x[0]
    : y[1] === y[0]
      ? x[0]
    : x[0] + ((rimHeight - y[0]) * (x[1] - x[0])) / (y[1] - y[0])
  const rimX1 = hoop.center.x - 0.4 * hoop.width
  const rimX2 = hoop.center.x + 0.4 * hoop.width
  const reboundZone = 10

  return predictedX > rimX1 - reboundZone && predictedX < rimX2 + reboundZone
}

function avishahDetectDown(ballPos, hoopPos) {
  if (!ballPos.length || !hoopPos.length) return false
  const ball = ballPos[ballPos.length - 1]
  const hoop = hoopPos[hoopPos.length - 1]
  return ball.center.y > hoop.center.y + 0.5 * hoop.height
}

function avishahDetectUp(ballPos, hoopPos) {
  if (!ballPos.length || !hoopPos.length) return false
  const ball = ballPos[ballPos.length - 1]
  const hoop = hoopPos[hoopPos.length - 1]
  const x1 = hoop.center.x - 4 * hoop.width
  const x2 = hoop.center.x + 4 * hoop.width
  const y1 = hoop.center.y - 2 * hoop.height
  const y2 = hoop.center.y - 0.5 * hoop.height

  return ball.center.x > x1 && ball.center.x < x2 && ball.center.y > y1 && ball.center.y < y2
}

function cleanAvishahBallPos(ballPos, frameCount) {
  if (ballPos.length > 1) {
    const previous = ballPos[ballPos.length - 2]
    const current = ballPos[ballPos.length - 1]
    const frameDiff = current.frame - previous.frame
    const dist = Math.hypot(
      current.center.x - previous.center.x,
      current.center.y - previous.center.y,
    )
    const maxDist = Math.max(12, 4 * Math.hypot(previous.width, previous.height))

    if (dist > maxDist && frameDiff < 5) {
      ballPos.pop()
    } else if (current.width * 1.4 < current.height || current.height * 1.4 < current.width) {
      ballPos.pop()
    }
  }

  while (ballPos.length && frameCount - ballPos[0].frame > 30) {
    ballPos.shift()
  }

  return ballPos
}

function cleanAvishahHoopPos(hoopPos) {
  if (hoopPos.length > 1) {
    const previous = hoopPos[hoopPos.length - 2]
    const current = hoopPos[hoopPos.length - 1]
    const frameDiff = current.frame - previous.frame
    const dist = Math.hypot(
      current.center.x - previous.center.x,
      current.center.y - previous.center.y,
    )
    const maxDist = 0.5 * Math.hypot(previous.width, previous.height)

    if (dist > maxDist && frameDiff < 5) {
      hoopPos.pop()
    } else if (current.width * 1.3 < current.height || current.height * 1.3 < current.width) {
      hoopPos.pop()
    }
  }

  while (hoopPos.length > 25) {
    hoopPos.shift()
  }

  return hoopPos
}

function trajectoryWasAboveHoop(points, hoopBox) {
  return points.some((point) => isBallAboveHoop(point, hoopBox))
}

function isPotentialAttemptStart(ballCenter, hoopBox, trajectoryPoints) {
  return (
    isApproachingHoop(ballCenter, hoopBox) ||
    isBallAboveHoop(ballCenter, hoopBox) ||
    trajectoryWasAboveHoop(trajectoryPoints, hoopBox)
  )
}

function analyzeCompleteTrajectories(trajectorySets, hoopBox, ballRadius, ballMeasured, prevPointMeasured) {
  let missDecision = null

  for (const { source, points } of trajectorySets) {
    const decision = analyzeCompleteTrajectory(
      points,
      hoopBox,
      ballRadius,
      ballMeasured,
      prevPointMeasured,
    )
    if (decision) {
      const sourcedDecision = {
        ...decision,
        source,
        evidence: {
          ...decision.evidence,
          trajectorySource: source,
        },
      }
      if (decision.event === 'make') return sourcedDecision
      missDecision ??= sourcedDecision
    }
  }

  return missDecision
}

function analyzeCompleteTrajectory(points, hoopBox, ballRadius, ballMeasured, prevPointMeasured) {
  if (points.length < 2) return null

  if (!ballMeasured && points.length < MIN_MEASURED_POINTS) {
    const sweptDecision = analyzeSweptBallHoopPass(points, hoopBox, ballRadius)
    if (sweptDecision) return sweptDecision
  }

  if (!hasReliableTrajectoryForDecision(ballMeasured, prevPointMeasured, points)) return null

  const visualDecision = analyzeVisibleHoopPass(points, hoopBox, ballRadius)
  if (visualDecision) return visualDecision

  if (!ballMeasured) {
    const sweptDecision = analyzeSweptBallHoopPass(points, hoopBox, ballRadius)
    if (sweptDecision) return sweptDecision
  }

  if (points.length < MIN_MEASURED_POINTS) return null
  if (!trajectoryWasAboveHoop(points, hoopBox)) return null
  if (!trajectoryHasPassedHoopLevel(points, hoopBox, null)) return null
  if (!hasDownwardShotTrajectory(points.slice(-8), hoopBox)) return null

  const entryCrossing =
    getLatestEntryCrossing(points, hoopBox, ballRadius) ??
    getLatestRimCenterCrossing(points, hoopBox)
  if (entryCrossing?.direction !== 'down') return null

  const rimEntry = {
    x: entryCrossing.x,
    y: entryCrossing.y,
  }
  const hoopCenterX = hoopBox.x + hoopBox.width / 2
  const tolerance = Math.min(
    hoopBox.width * TRAJECTORY_ENTRY_TOLERANCE_FACTOR,
    Math.max(2, ballRadius * 0.8),
  )
  const relaxedLeft = hoopBox.x - tolerance
  const relaxedRight = hoopBox.x + hoopBox.width + tolerance
  const centerOffset = Math.abs(entryCrossing.x - hoopCenterX)
  const centering = clamp(1 - centerOffset / Math.max(1, hoopBox.width / 2), 0, 1)

  if (entryCrossing.x >= relaxedLeft && entryCrossing.x <= relaxedRight) {
    return {
      event: 'make',
      reason: 'trajectory_net_pass',
      rimEntry,
      evidence: {
        centering,
        entryTolerance: tolerance,
        pointCount: points.length,
      },
    }
  }

  if (isNearHoop(entryCrossing, hoopBox)) {
    return {
      event: 'miss',
      reason: 'trajectory_passed_hoop_level',
      rimEntry,
      evidence: {
        centering,
        entryTolerance: tolerance,
        pointCount: points.length,
      },
    }
  }

  return null
}

function analyzeSweptBallHoopPass(points, hoopBox, ballRadius) {
  const radius = Math.max(0, Number(ballRadius) || 0)
  if (points.length < 2 || radius <= 0) return null

  const rimPlaneY = hoopBox.y + hoopBox.height / 2
  const hoopBottom = hoopBox.y + hoopBox.height
  const startIndex = Math.max(1, points.length - 10)

  for (let index = startIndex; index < points.length; index += 1) {
    const prev = points[index - 1]
    const current = points[index]
    if (!hasDownwardShotSegment(prev, current, hoopBox)) continue
    if (prev.y >= hoopBox.y || current.y + radius <= hoopBottom) continue

    const crossing = getBallPlaneCrossing(prev, current, rimPlaneY, 0, 'center')
    if (crossing?.direction !== 'down') continue

    const overlap = getOpeningOverlapRatio(crossing.x, hoopBox, radius)
    if (overlap <= 0) continue

    const centering = clamp(1 - Math.abs(crossing.x - getHoopCenter(hoopBox).x) / Math.max(1, hoopBox.width / 2), 0, 1)
    const enoughOverlapForMake = overlap >= 0.35

    return {
      event: enoughOverlapForMake ? 'make' : 'miss',
      reason: enoughOverlapForMake ? 'swept_ball_net_pass' : 'trajectory_passed_hoop_level',
      rimEntry: {
        x: crossing.x,
        y: crossing.y,
      },
      evidence: {
        centering,
        ballRadius: radius,
        openingOverlapRatio: overlap,
        sweptBall: true,
        pointCount: points.length,
      },
    }
  }

  return null
}

function getFastSegmentDecision(prevCenter, ballCenter, hoopBox, ballRadius, entryLooksLikeShot) {
  if (!entryLooksLikeShot || !prevCenter) return null

  const confirmationCrossing = getConfirmationCrossing(prevCenter, ballCenter, hoopBox, ballRadius)
  if (confirmationCrossing?.direction !== 'down') return null

  const entryCrossing =
    getEntryCrossing(prevCenter, ballCenter, hoopBox, ballRadius) ??
    getBallPlaneCrossing(prevCenter, ballCenter, hoopBox.y + hoopBox.height / 2, 0, 'center')
  if (entryCrossing?.direction !== 'down') return null
  if (!isNearHoop(entryCrossing, hoopBox)) return null

  const insideEntry = isCrossingInsideInnerOpening(entryCrossing, hoopBox, ballRadius)
  const insideConfirmation = isCrossingInsideExitOpening(
    confirmationCrossing,
    hoopBox,
    ballRadius,
  )

  return {
    event: insideEntry && insideConfirmation ? 'make' : 'miss',
    reason: insideEntry && insideConfirmation ? 'fast_net_pass' : 'trajectory_passed_hoop_level',
    rimEntry: {
      x: entryCrossing.x,
      y: entryCrossing.y,
    },
    evidence: {
      fastSegment: true,
      confirmationCrossing,
    },
  }
}

function analyzeVisibleHoopPass(points, hoopBox, ballRadius) {
  const crossing = getVisibleHoopCrossing(points, hoopBox, ballRadius)
  if (!crossing) return null

  const hasAboveBefore = points
    .slice(0, crossing.segmentIndex + 1)
    .some((point) => point.y < hoopBox.y)
  const hasBelowAfter = points
    .slice(crossing.segmentIndex)
    .some((point) => point.y > hoopBox.y + hoopBox.height)
  if (!hasAboveBefore || !hasBelowAfter) return null

  const hoopCenterX = hoopBox.x + hoopBox.width / 2
  const centerOffset = Math.abs(crossing.x - hoopCenterX)
  const centering = clamp(1 - centerOffset / Math.max(1, hoopBox.width / 2), 0, 1)

  return {
    event: crossing.inside ? 'make' : 'miss',
    reason: crossing.inside ? 'trajectory_net_pass' : 'trajectory_passed_hoop_level',
    rimEntry: {
      x: crossing.x,
      y: crossing.y,
    },
    evidence: {
      centering,
      entryTolerance: crossing.tolerance,
      pointCount: points.length,
      visualCrossing: true,
    },
  }
}

function getVisibleHoopCrossing(points, hoopBox, ballRadius) {
  const planeY = hoopBox.y + hoopBox.height / 2
  const tolerance = Math.max(
    hoopBox.width * TRAJECTORY_ENTRY_TOLERANCE_FACTOR,
    Math.min(hoopBox.width * 0.28, ballRadius * 1.25),
  )
  const insideLeft = hoopBox.x - tolerance
  const insideRight = hoopBox.x + hoopBox.width + tolerance
  const nearLeft = hoopBox.x - hoopBox.width * 0.75
  const nearRight = hoopBox.x + hoopBox.width * 1.75

  let latestNearCrossing = null
  const startIndex = Math.max(1, points.length - 10)
  for (let index = startIndex; index < points.length; index += 1) {
    const prev = points[index - 1]
    const current = points[index]
    if (current.y <= prev.y) continue
    if (prev.y > planeY || current.y < planeY) continue
    if (!hasDownwardShotSegment(prev, current, hoopBox)) continue

    const progress = (planeY - prev.y) / (current.y - prev.y)
    const x = prev.x + (current.x - prev.x) * progress
    const crossing = {
      direction: 'down',
      segmentIndex: index,
      x,
      y: planeY,
      tolerance,
      inside: x >= insideLeft && x <= insideRight,
    }

    if (crossing.inside) return crossing
    if (x >= nearLeft && x <= nearRight) latestNearCrossing = crossing
  }

  return latestNearCrossing
}

function getLatestEntryCrossing(points, hoopBox, ballRadius) {
  return getLatestPlaneCrossing(points, hoopBox, ballRadius, getEntryCrossing)
}

function getLatestConfirmationCrossing(points, hoopBox, ballRadius) {
  return getLatestPlaneCrossing(points, hoopBox, ballRadius, getConfirmationCrossing)
}

function getLatestRimCenterCrossing(points, hoopBox) {
  if (points.length < 2) return null

  const planeY = hoopBox.y + hoopBox.height / 2
  let latestCrossing = null
  const startIndex = Math.max(1, points.length - 8)
  for (let index = startIndex; index < points.length; index += 1) {
    const crossing = getBallPlaneCrossing(points[index - 1], points[index], planeY, 0, 'center')
    if (crossing?.direction === 'down') latestCrossing = crossing
  }
  return latestCrossing
}

function getLatestPlaneCrossing(points, hoopBox, ballRadius, getCrossing) {
  if (points.length < 2) return null

  let latestCrossing = null
  const startIndex = Math.max(1, points.length - 6)
  for (let index = startIndex; index < points.length; index += 1) {
    const crossing = getCrossing(points[index - 1], points[index], hoopBox, ballRadius)
    if (crossing?.direction === 'down') latestCrossing = crossing
  }
  return latestCrossing
}

function getLatestSideExit(points, hoopBox, ballRadius) {
  if (points.length < 2) return null

  let latestExit = null
  const startIndex = Math.max(1, points.length - 6)
  for (let index = startIndex; index < points.length; index += 1) {
    const sideExit = detectSideExit(points[index - 1], points[index], hoopBox, ballRadius)
    if (sideExit) latestExit = sideExit
  }
  return latestExit
}

function hasReliableTrajectoryForDecision(ballMeasured, prevPointMeasured, points) {
  if (ballMeasured && prevPointMeasured) return true
  if (points.length < MIN_MEASURED_POINTS) return false
  return countDownwardSegments(points.slice(-5)) >= 1
}

function trajectoryHasPassedHoopLevel(points, hoopBox, ballCenter) {
  if (ballCenter && hasPassedHoopLevel(ballCenter, hoopBox)) return true
  const latest = points[points.length - 1]
  return Boolean(latest && hasPassedHoopLevel(latest, hoopBox))
}

function trajectoryMovedUp(points) {
  if (points.length < 2) return false
  const prev = points[points.length - 2]
  const current = points[points.length - 1]
  return isMovingUp(prev, current)
}

function getEntryCrossing(prevCenter, ballCenter, hoopBox, ballRadius) {
  const { entryY } = getRimControlPlanes(hoopBox, ballRadius)
  return getBallPlaneCrossing(prevCenter, ballCenter, entryY, ballRadius, 'leading')
}

function getConfirmationCrossing(prevCenter, ballCenter, hoopBox, ballRadius) {
  const { confirmationY } = getRimControlPlanes(hoopBox, ballRadius)
  return getBallPlaneCrossing(prevCenter, ballCenter, confirmationY, ballRadius, 'trailing')
}

function isCrossingInsideInnerOpening(crossing, hoopBox, ballRadius) {
  const { innerLeft, innerRight } = getRimControlPlanes(hoopBox, ballRadius)
  return crossing.x >= innerLeft && crossing.x <= innerRight
}

function isCrossingInsideExitOpening(crossing, hoopBox, ballRadius) {
  const { exitLeft, exitRight } = getRimControlPlanes(hoopBox, ballRadius)
  return crossing.x >= exitLeft && crossing.x <= exitRight
}

function isBallCenterInsideExitOpening(ballCenter, hoopBox, ballRadius) {
  return isBallWithinHoopWidth(ballCenter, hoopBox, ballRadius)
}

function isNearHoop(crossing, hoopBox) {
  return crossing.x >= hoopBox.x - hoopBox.width * 0.75 &&
    crossing.x <= hoopBox.x + hoopBox.width * 1.75
}

function detectSideExit(prevCenter, ballCenter, hoopBox, ballRadius) {
  if (!prevCenter) return null

  const { exitLeft, exitRight, entryY, confirmationY } = getRimControlPlanes(hoopBox, ballRadius)
  const minY = Math.min(entryY, confirmationY)
  const maxY = Math.max(entryY, confirmationY)
  const withinVerticalBand = ballCenter.y >= minY - ballRadius && ballCenter.y <= maxY + ballRadius

  if (!withinVerticalBand) return null

  if (prevCenter.x >= exitLeft && ballCenter.x < exitLeft) {
    return { side: 'left', x: ballCenter.x, y: ballCenter.y }
  }

  if (prevCenter.x <= exitRight && ballCenter.x > exitRight) {
    return { side: 'right', x: ballCenter.x, y: ballCenter.y }
  }

  return null
}

function getHoopCenter(hoopBox) {
  return {
    x: hoopBox.x + hoopBox.width / 2,
    y: hoopBox.y + hoopBox.height / 2,
  }
}

function getCenteringScore(point, hoopCenter, hoopBox, ballRadius) {
  if (!point || !hoopBox.width) return 0.5
  const usableRadius = Math.max(1, hoopBox.width / 2 - Math.max(0, ballRadius))
  const distanceFromCenter = Math.abs(point.x - hoopCenter.x)
  return clamp(1 - distanceFromCenter / usableRadius, 0, 1)
}

function getIsSwish(point, hoopCenter, hoopBox, ballRadius) {
  if (!point) return false
  const hoopRadius = hoopBox.width / 2
  const cleanRadius = Math.max(0, hoopRadius - Math.max(0, ballRadius))
  return distanceBetween(point, hoopCenter) < cleanRadius
}

function getOpeningOverlapRatio(centerX, hoopBox, ballRadius) {
  const radius = Math.max(0, Number(ballRadius) || 0)
  if (radius <= 0) {
    return centerX >= hoopBox.x && centerX <= hoopBox.x + hoopBox.width ? 1 : 0
  }

  const ballLeft = centerX - radius
  const ballRight = centerX + radius
  const hoopLeft = hoopBox.x
  const hoopRight = hoopBox.x + hoopBox.width
  const overlap = Math.max(0, Math.min(ballRight, hoopRight) - Math.max(ballLeft, hoopLeft))
  return overlap / (radius * 2)
}

function getEntryAngle(measuredPoints, recentCenters) {
  const points = measuredPoints.length >= 2
    ? measuredPoints
    : recentCenters.filter((point) => point.measured !== false)
  if (points.length < 2) return null

  const lastIndex = points.length - 1
  let firstIndex = Math.max(0, lastIndex - 4)
  while (
    firstIndex < lastIndex - 1 &&
    (points[lastIndex].t ?? 0) - (points[firstIndex].t ?? 0) > 220
  ) {
    firstIndex += 1
  }

  const first = points[firstIndex]
  const last = points[lastIndex]
  const dx = last.x - first.x
  const dy = last.y - first.y
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return null
  return Math.round((Math.atan2(dy, dx) * 180) / Math.PI)
}

function getMissType(reason, evidence, ballCenter, hoopBox, ballRadius) {
  const radius = Math.max(0, Number(ballRadius) || 0)
  const point = evidence.entryCrossing ?? evidence.sideExit ?? ballCenter

  if (point?.x + radius < hoopBox.x) return 'left'
  if (point?.x - radius > hoopBox.x + hoopBox.width) return 'right'
  if (evidence.sideExit?.side === 'left') return 'left'
  if (evidence.sideExit?.side === 'right') return 'right'
  if (reason === 'rim_out') return point?.y <= hoopBox.y + hoopBox.height / 2 ? 'short' : 'long'
  if (point?.y < hoopBox.y) return 'short'
  return 'long'
}

function isMovingUp(prevCenter, currentCenter) {
  if (!prevCenter) return false
  return currentCenter.y < prevCenter.y - 0.5
}

function countDownwardSegments(points) {
  let count = 0
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].y > points[index - 1].y + 0.5) count += 1
  }
  return count
}

function getLatestMeasuredVelocity(points) {
  if (points.length < 2) return null
  const first = points[points.length - 2]
  const last = points[points.length - 1]
  const dt = last.t - first.t
  if (dt <= 0) return null
  return {
    vx: ((last.x - first.x) / dt) * 1000,
    vy: ((last.y - first.y) / dt) * 1000,
  }
}

function getNormalizedSpeed(velocity, hoopBox) {
  if (!velocity || !hoopBox?.width) return null
  return Math.sqrt(velocity.vx * velocity.vx + velocity.vy * velocity.vy) / hoopBox.width
}

function hasDownwardShotTrajectory(points, hoopBox) {
  if (points.length < MIN_MEASURED_POINTS) return false
  if (countDownwardSegments(points) < MIN_DOWNWARD_SEGMENTS) return false

  const first = points[0]
  const last = points[points.length - 1]
  const dx = last.x - first.x
  const dy = last.y - first.y
  if (dy <= hoopBox.height * MIN_SHOT_VERTICAL_PROGRESS_FACTOR) return false

  const length = Math.sqrt(dx * dx + dy * dy)
  if (length <= 0) return false

  return dy / length >= MIN_SHOT_VERTICAL_COMPONENT
}

function hasDownwardShotSegment(prevCenter, currentCenter, hoopBox) {
  if (!prevCenter) return false

  const dx = currentCenter.x - prevCenter.x
  const dy = currentCenter.y - prevCenter.y
  if (dy <= hoopBox.height * MIN_ENTRY_VERTICAL_PROGRESS_FACTOR) return false

  const length = Math.sqrt(dx * dx + dy * dy)
  if (length <= 0) return false

  return dy / length >= MIN_ENTRY_VERTICAL_COMPONENT
}

function distanceBetween(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}
