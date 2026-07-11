import { boxFromCenter, distance, getBoxCenter } from '../utils/geometry.js'
import { boxIoU } from './yoloUtils.js'

const BALL_CONFIDENCE_MIN = 0.15
const BALL_CONFIDENCE_TRACKING_MIN = 0.08
const BALL_TRACK_RADIUS_PX = 120
const BALL_COAST_MAX_MS = 520
const BALL_TRAJECTORY_TTL_MS = 1400
const BALL_REACQUIRE_MIN_CONFIDENCE = 0.28
const BALL_MAX_SPEED_PX_PER_SEC = 2600
const BALL_JUMP_PADDING_PX = 52
const BALL_MIN_JUMP_GATE_PX = 110
const BALL_MAX_JUMP_GATE_PX = 260
const BALL_HISTORY_BREAK_DISTANCE_PX = 170
const BALL_HISTORY_BREAK_MS = 220
const PERSON_CONFIDENCE_MIN = 0.3
const HOOP_TRACK_RADIUS_PX = 200
const HOOP_LOST_FRAME_THRESHOLD = 18
const BALL_HISTORY_MAX = 120
const BALL_HISTORY_INTERVAL_MS = 24
const VELOCITY_SAMPLE_COUNT = 5
const BALL_SMOOTHING_ALPHA_DETECTED = 0.48
const BALL_SMOOTHING_ALPHA_TRACKED = 0.38
const BALL_SMOOTHING_ALPHA_PREDICTED = 0.78

const HOOP_LOST_WARNING = 'Кольцо не видно'

function getDetectionRole(detection) {
  return detection.appClass ?? detection.className
}

function pushBallHistory(history, lastTimestampRef, point, timestampMs) {
  if (
    history.length > 0 &&
    timestampMs - lastTimestampRef.value < BALL_HISTORY_INTERVAL_MS
  ) {
    return
  }

  lastTimestampRef.value = timestampMs
  const previous = history[history.length - 1]
  if (
    previous &&
    (timestampMs - previous.t > BALL_HISTORY_BREAK_MS ||
      distance(previous, point) > BALL_HISTORY_BREAK_DISTANCE_PX)
  ) {
    history.length = 0
  }

  history.push({ x: point.x, y: point.y, t: timestampMs })

  if (history.length > BALL_HISTORY_MAX) {
    history.shift()
  }
}

function pruneBallHistory(history, timestampMs) {
  const minTimestamp = timestampMs - BALL_TRAJECTORY_TTL_MS
  while (history.length > 0 && history[0].t < minTimestamp) {
    history.shift()
  }
}

function smoothPoint(previous, current, alpha) {
  if (!previous) return { ...current }

  return {
    x: previous.x + (current.x - previous.x) * alpha,
    y: previous.y + (current.y - previous.y) * alpha,
  }
}

function getAllowedJumpDistance(deltaMs) {
  const safeDeltaMs = Math.max(16, deltaMs)
  return Math.min(
    BALL_MAX_JUMP_GATE_PX,
    Math.max(
      BALL_MIN_JUMP_GATE_PX,
      (BALL_MAX_SPEED_PX_PER_SEC * safeDeltaMs) / 1000 + BALL_JUMP_PADDING_PX,
    ),
  )
}

function isPlausibleBallCandidate(center, predictedCenter, trackCenter, deltaMs) {
  if (!predictedCenter && !trackCenter) return true

  const allowedDistance = getAllowedJumpDistance(deltaMs)
  if (predictedCenter && distance(center, predictedCenter) <= allowedDistance) {
    return true
  }

  return Boolean(trackCenter && distance(center, trackCenter) <= allowedDistance)
}

function moveBoxToCenter(box, center) {
  return {
    ...box,
    x: center.x - box.width / 2,
    y: center.y - box.height / 2,
  }
}

/**
 * @param {Array<{ x: number, y: number, t: number }>} history
 * @returns {{ vx: number, vy: number } | null}
 */
function computeVelocity(history) {
  if (history.length < 2) return null

  const sample = history.slice(-VELOCITY_SAMPLE_COUNT)
  const first = sample[0]
  const last = sample[sample.length - 1]
  const dt = last.t - first.t

  if (dt <= 0) return null

  return {
    vx: ((last.x - first.x) / dt) * 1000,
    vy: ((last.y - first.y) / dt) * 1000,
  }
}

/**
 * @param {Array<{ className: string, confidence: number, box: object }>} hoopCandidates
 * @param {{ x: number, y: number, width: number, height: number } | null} lastHoopBox
 */
function pickHoopDetection(hoopCandidates, lastHoopBox) {
  if (hoopCandidates.length === 0) return null

  const confident = [...hoopCandidates].sort((a, b) => b.confidence - a.confidence)
  if (!lastHoopBox) return confident[0]

  const nearTrack = confident
    .map((item) => ({
      item,
      dist: distance(getBoxCenter(item.box), getBoxCenter(lastHoopBox)),
      iou: boxIoU(item.box, lastHoopBox),
    }))
    .filter((entry) => entry.dist <= HOOP_TRACK_RADIUS_PX || entry.iou >= 0.05)
    .sort((a, b) => b.iou - a.iou || a.dist - b.dist || b.item.confidence - a.item.confidence)

  return nearTrack[0]?.item ?? confident[0]
}

/**
 * @param {Array<{ className: string, confidence: number, box: object }>} ballCandidates
 * @param {{ x: number, y: number } | null} predictedCenter
 * @param {{ x: number, y: number } | null} trackCenter
 * @param {number} deltaMs
 * @param {boolean} canReacquire
 */
function pickBallDetection(ballCandidates, predictedCenter, trackCenter, deltaMs, canReacquire) {
  const confident = ballCandidates
    .filter((item) => item.confidence >= BALL_CONFIDENCE_MIN)
    .sort((a, b) => b.confidence - a.confidence)

  if (confident.length > 0) {
    if (!predictedCenter && !trackCenter) return confident[0]

    const nearTrack = confident
      .map((item) => ({
        item,
        center: getBoxCenter(item.box),
      }))
      .map((entry) => ({
        ...entry,
        dist: distance(entry.center, predictedCenter ?? trackCenter),
        plausible: isPlausibleBallCandidate(entry.center, predictedCenter, trackCenter, deltaMs),
      }))
      .filter((entry) => entry.plausible)
      .sort((a, b) => a.dist - b.dist || b.item.confidence - a.item.confidence)

    if (nearTrack.length > 0) return nearTrack[0].item

    if (canReacquire) {
      return confident.find((item) => item.confidence >= BALL_REACQUIRE_MIN_CONFIDENCE) ?? null
    }

    return null
  }

  if (!predictedCenter) return null

  const tracked = ballCandidates
    .filter((item) => item.confidence >= BALL_CONFIDENCE_TRACKING_MIN)
    .map((item) => ({
      item,
      dist: distance(getBoxCenter(item.box), predictedCenter),
    }))
    .filter((entry) => entry.dist <= BALL_TRACK_RADIUS_PX)
    .sort((a, b) => a.dist - b.dist || b.item.confidence - a.item.confidence)

  return tracked[0]?.item ?? null
}

/**
 * @param {Array<{ className: string, confidence: number, box: object }>} persons
 * @param {{ x: number, y: number } | null} ballCenter
 * @param {{ x: number, y: number, width: number, height: number } | null} hoopBox
 */
function pickShooter(persons, ballCenter, hoopBox) {
  if (persons.length === 0) return null
  if (persons.length === 1) return persons[0]

  if (ballCenter) {
    return [...persons].sort(
      (a, b) =>
        distance(getBoxCenter(a.box), ballCenter) - distance(getBoxCenter(b.box), ballCenter),
    )[0]
  }

  if (!hoopBox) return persons[0]

  const belowHoop = persons.filter(
    (person) => getBoxCenter(person.box).y > hoopBox.y + hoopBox.height * 0.2,
  )
  const candidates = belowHoop.length > 0 ? belowHoop : persons

  return [...candidates].sort(
    (a, b) => b.box.width * b.box.height - a.box.width * a.box.height,
  )[0]
}

export function createTracker() {
  const ballHistory = []
  const lastHistoryTimestamp = { value: 0 }
  let hoopLostFrames = 0
  let lastBallCenter = null
  let lastDetectedBallCenter = null
  let lastBallDetectedAt = 0
  let lastBallUpdatedAt = 0
  let lastBallBox = null
  let lastBallVelocity = null
  let lastHoopBox = null
  let lastHoopDetection = null
  let hasSeenHoop = false

  function reset() {
    ballHistory.length = 0
    lastHistoryTimestamp.value = 0
    hoopLostFrames = 0
    lastBallCenter = null
    lastDetectedBallCenter = null
    lastBallDetectedAt = 0
    lastBallUpdatedAt = 0
    lastBallBox = null
    lastBallVelocity = null
    lastHoopBox = null
    lastHoopDetection = null
    hasSeenHoop = false
  }

  function predictBallCenter(timestampMs) {
    if (!lastDetectedBallCenter || !lastBallVelocity || lastBallDetectedAt <= 0) return null

    const dt = timestampMs - lastBallDetectedAt
    if (dt <= 0 || dt > BALL_COAST_MAX_MS) return null

    return {
      x: lastDetectedBallCenter.x + (lastBallVelocity.vx * dt) / 1000,
      y: lastDetectedBallCenter.y + (lastBallVelocity.vy * dt) / 1000,
    }
  }

  /**
   * @param {{
   *   detections: Array<{ className: string, confidence: number, box: object }>,
   *   viewport: object,
   *   orientation: string,
   *   inferenceFresh?: boolean,
   * }} rawResult
   * @param {{ timestampMs?: number, paused?: boolean }} context
   */
  function update(rawResult, context = {}) {
    const { detections, viewport, orientation } = rawResult
    const timestampMs = context.timestampMs ?? performance.now()
    const paused = context.paused ?? false
    const inferenceFresh = rawResult.inferenceFresh ?? false

    if (!paused) {
      pruneBallHistory(ballHistory, timestampMs)
    }

    const hoopCandidates = detections.filter((item) => getDetectionRole(item) === 'hoop')
    const hoopDetection = pickHoopDetection(hoopCandidates, lastHoopBox)
    let hoopWarning = null

    if (!paused && hoopDetection) {
      lastHoopBox = { ...hoopDetection.box }
      lastHoopDetection = hoopDetection
      hoopLostFrames = 0
      hasSeenHoop = true
    } else if (!paused && inferenceFresh && hasSeenHoop) {
      hoopLostFrames += 1

      if (hoopLostFrames >= HOOP_LOST_FRAME_THRESHOLD) {
        hoopWarning = HOOP_LOST_WARNING
        lastHoopBox = null
        lastHoopDetection = null
        hasSeenHoop = false
      }
    }

    const displayHoopBox = lastHoopBox ? { ...lastHoopBox } : null
    const displayHoopDetection = lastHoopDetection
      ? { ...lastHoopDetection, box: displayHoopBox }
      : null

    const predictedCenter = predictBallCenter(timestampMs)
    const ballCandidates = detections.filter((item) => getDetectionRole(item) === 'ball')
    const trackIsRecent =
      lastBallUpdatedAt > 0 && timestampMs - lastBallUpdatedAt <= BALL_COAST_MAX_MS
    const trackCenter = trackIsRecent ? lastBallCenter : null
    const ballDetection = inferenceFresh
      ? pickBallDetection(
          ballCandidates,
          predictedCenter,
          trackCenter,
          lastBallUpdatedAt > 0 ? timestampMs - lastBallUpdatedAt : 16,
          !trackIsRecent,
        )
      : null

    let ballCenter = null
    let ballTrackState = 'lost'
    let displayBallDetection = null

    if (ballDetection) {
      const detectedCenter = getBoxCenter(ballDetection.box)
      const smoothingAlpha =
        ballDetection.confidence < BALL_CONFIDENCE_MIN
          ? BALL_SMOOTHING_ALPHA_TRACKED
          : BALL_SMOOTHING_ALPHA_DETECTED
      ballCenter = smoothPoint(lastBallCenter, detectedCenter, smoothingAlpha)
      lastBallCenter = { ...ballCenter }
      lastDetectedBallCenter = { ...ballCenter }
      lastBallDetectedAt = timestampMs
      lastBallUpdatedAt = timestampMs
      lastBallBox = moveBoxToCenter(ballDetection.box, ballCenter)
      ballTrackState = ballDetection.confidence < BALL_CONFIDENCE_MIN ? 'tracked' : 'detected'
      displayBallDetection = {
        ...ballDetection,
        box: lastBallBox,
      }

      if (!paused) {
        pushBallHistory(ballHistory, lastHistoryTimestamp, ballCenter, timestampMs)
      }
    } else if (predictedCenter && lastBallBox) {
      ballCenter = smoothPoint(lastBallCenter, predictedCenter, BALL_SMOOTHING_ALPHA_PREDICTED)
      lastBallCenter = { ...ballCenter }
      lastBallUpdatedAt = timestampMs
      ballTrackState = 'predicted'
      const size = Math.max(lastBallBox.width, lastBallBox.height)
      displayBallDetection = {
        className: 'ball',
        confidence: 0.2,
        box: boxFromCenter(ballCenter, size),
        predicted: true,
      }

      if (!paused) {
        pushBallHistory(ballHistory, lastHistoryTimestamp, ballCenter, timestampMs)
      }
    } else if (lastBallDetectedAt > 0 && timestampMs - lastBallDetectedAt > BALL_COAST_MAX_MS) {
      lastBallCenter = null
      lastDetectedBallCenter = null
      lastBallDetectedAt = 0
      lastBallUpdatedAt = 0
      lastBallBox = null
      lastBallVelocity = null
      ballHistory.length = 0
      lastHistoryTimestamp.value = 0
    }

    const ballVelocity = computeVelocity(ballHistory)
    if (ballVelocity) {
      lastBallVelocity = ballVelocity
    }

    const personCandidates = detections
      .filter(
        (item) => getDetectionRole(item) === 'person' && item.confidence >= PERSON_CONFIDENCE_MIN,
      )
      .sort((a, b) => b.confidence - a.confidence)

    const shooterDetection = pickShooter(personCandidates, ballCenter, displayHoopBox)

    const outputDetections = []

    if (displayHoopDetection && displayHoopBox) {
      outputDetections.push({
        ...displayHoopDetection,
        className: 'hoop',
        appClass: 'hoop',
        confidence: displayHoopDetection.confidence,
        box: displayHoopBox,
        fromAi: true,
      })
    }

    if (displayBallDetection && ballCenter) {
      outputDetections.push({
        ...displayBallDetection,
        className: 'ball',
        appClass: 'ball',
      })
    }

    for (const personDetection of personCandidates) {
      const isShooter = personDetection === shooterDetection
      outputDetections.push({
        ...personDetection,
        className: 'person',
        appClass: 'person',
        role: isShooter ? 'shooter' : 'player',
      })
    }

    return {
      detections: outputDetections,
      ballCenter,
      ballHistory: ballHistory.map((point) => ({ ...point })),
      ballVelocity,
      ballTrackState,
      shooterDetection,
      hoopBox: displayHoopBox,
      viewport,
      orientation,
      hoopLost: hoopWarning != null,
      hoopWarning,
      trajectoryPlaying: false,
      aiError: rawResult.aiError ?? null,
    }
  }

  return { update, reset }
}
