import { boxFromCenter, distance, getBoxCenter, getTopBoxBand } from '../utils/geometry.js'
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
const BALL_KALMAN_PROCESS_NOISE = 12000
const BALL_KALMAN_MEASUREMENT_NOISE = 12
const BALL_KALMAN_INITIAL_VELOCITY_VARIANCE = 260000
const HOOP_RIM_HEIGHT_FACTOR = 0.28
const HOOP_RIM_MIN_HEIGHT_PX = 8
const HOOP_RIM_MAX_HEIGHT_PX = 30
const HOOP_SMOOTHING_HISTORY_MAX = 7

const HOOP_LOST_WARNING = 'Кольцо не видно'

function getDetectionRole(detection) {
  return detection.appClass ?? detection.className
}

function pushBallHistory(
  history,
  lastTimestampRef,
  point,
  timestampMs,
  breakDistancePx = BALL_HISTORY_BREAK_DISTANCE_PX,
) {
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
      distance(previous, point) > breakDistancePx)
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

function getMedian(values) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

function getMedianBox(boxes) {
  return {
    x: getMedian(boxes.map((box) => box.x)),
    y: getMedian(boxes.map((box) => box.y)),
    width: getMedian(boxes.map((box) => box.width)),
    height: getMedian(boxes.map((box) => box.height)),
  }
}

function pushHoopSourceBox(history, box) {
  history.push({ ...box })
  if (history.length > HOOP_SMOOTHING_HISTORY_MAX) {
    history.shift()
  }

  return getMedianBox(history)
}

function getHoopStability(history) {
  if (history.length < 3) {
    return {
      stable: history.length > 0,
      score: history.length > 0 ? 0.65 : 0,
    }
  }

  const median = getMedianBox(history)
  const medianCenter = getBoxCenter(median)
  const referenceWidth = Math.max(1, median.width)
  const centerOffsets = history.map((box) => distance(getBoxCenter(box), medianCenter) / referenceWidth)
  const widthOffsets = history.map((box) => Math.abs(box.width - median.width) / referenceWidth)
  const maxCenterOffset = Math.max(...centerOffsets)
  const maxWidthOffset = Math.max(...widthOffsets)
  const score = 1 - Math.min(1, maxCenterOffset / 0.22 + maxWidthOffset / 0.35)

  return {
    stable: maxCenterOffset <= 0.18 && maxWidthOffset <= 0.25,
    score: Math.max(0, score),
  }
}

function createBallKalmanFilter() {
  let initialized = false
  let lastTimestampMs = 0
  let state = [0, 0, 0, 0]
  let covariance = createIdentityMatrix(4, 1)

  function reset() {
    initialized = false
    lastTimestampMs = 0
    state = [0, 0, 0, 0]
    covariance = createIdentityMatrix(4, 1)
  }

  function init(center, timestampMs) {
    initialized = true
    lastTimestampMs = timestampMs
    state = [center.x, center.y, 0, 0]
    covariance = [
      [80, 0, 0, 0],
      [0, 80, 0, 0],
      [0, 0, BALL_KALMAN_INITIAL_VELOCITY_VARIANCE, 0],
      [0, 0, 0, BALL_KALMAN_INITIAL_VELOCITY_VARIANCE],
    ]
  }

  function predict(timestampMs) {
    if (!initialized) return null

    const dt = Math.max(0.001, Math.min(0.25, (timestampMs - lastTimestampMs) / 1000))
    lastTimestampMs = timestampMs

    const transition = [
      [1, 0, dt, 0],
      [0, 1, 0, dt],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ]
    const processNoise = createProcessNoise(dt)

    state = multiplyMatrixVector(transition, state)
    covariance = addMatrices(
      multiplyMatrices(multiplyMatrices(transition, covariance), transposeMatrix(transition)),
      processNoise,
    )

    return getCenter()
  }

  function correct(center, timestampMs, confidence = 1) {
    if (!initialized) {
      init(center, timestampMs)
      return getCenter()
    }

    if (timestampMs > lastTimestampMs) {
      predict(timestampMs)
    }

    const measurement = [center.x, center.y]
    const measurementMatrix = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
    ]
    const confidenceScale = Math.max(0.35, Math.min(1.6, 1 / Math.max(0.08, confidence)))
    const measurementNoise = createIdentityMatrix(
      2,
      BALL_KALMAN_MEASUREMENT_NOISE * confidenceScale,
    )
    const innovation = subtractVectors(measurement, multiplyMatrixVector(measurementMatrix, state))
    const innovationCovariance = addMatrices(
      multiplyMatrices(multiplyMatrices(measurementMatrix, covariance), transposeMatrix(measurementMatrix)),
      measurementNoise,
    )
    const kalmanGain = multiplyMatrices(
      multiplyMatrices(covariance, transposeMatrix(measurementMatrix)),
      invert2x2(innovationCovariance),
    )
    state = addVectors(state, multiplyMatrixVector(kalmanGain, innovation))
    covariance = multiplyMatrices(
      subtractMatrices(createIdentityMatrix(4, 1), multiplyMatrices(kalmanGain, measurementMatrix)),
      covariance,
    )

    return getCenter()
  }

  function getCenter() {
    if (!initialized) return null
    return { x: state[0], y: state[1] }
  }

  function getVelocity() {
    if (!initialized) return null
    return { vx: state[2], vy: state[3] }
  }

  return { correct, getCenter, getVelocity, predict, reset }
}

function createProcessNoise(dt) {
  const dt2 = dt * dt
  const dt3 = dt2 * dt
  const dt4 = dt2 * dt2
  const q = BALL_KALMAN_PROCESS_NOISE

  return [
    [(dt4 / 4) * q, 0, (dt3 / 2) * q, 0],
    [0, (dt4 / 4) * q, 0, (dt3 / 2) * q],
    [(dt3 / 2) * q, 0, dt2 * q, 0],
    [0, (dt3 / 2) * q, 0, dt2 * q],
  ]
}

function createIdentityMatrix(size, value) {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => (row === column ? value : 0)),
  )
}

function transposeMatrix(matrix) {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]))
}

function multiplyMatrices(a, b) {
  return a.map((row) =>
    b[0].map((_, column) => row.reduce((sum, value, index) => sum + value * b[index][column], 0)),
  )
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0))
}

function addMatrices(a, b) {
  return a.map((row, rowIndex) => row.map((value, columnIndex) => value + b[rowIndex][columnIndex]))
}

function subtractMatrices(a, b) {
  return a.map((row, rowIndex) => row.map((value, columnIndex) => value - b[rowIndex][columnIndex]))
}

function addVectors(a, b) {
  return a.map((value, index) => value + b[index])
}

function subtractVectors(a, b) {
  return a.map((value, index) => value - b[index])
}

function invert2x2(matrix) {
  const [[a, b], [c, d]] = matrix
  const determinant = a * d - b * c
  if (Math.abs(determinant) < 1e-9) {
    return createIdentityMatrix(2, 1)
  }

  const invDeterminant = 1 / determinant
  return [
    [d * invDeterminant, -b * invDeterminant],
    [-c * invDeterminant, a * invDeterminant],
  ]
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
  const rawBallHistory = []
  const hoopSourceHistory = []
  const lastHistoryTimestamp = { value: 0 }
  const lastRawHistoryTimestamp = { value: 0 }
  let hoopLostFrames = 0
  let lastBallCenter = null
  let lastDetectedBallCenter = null
  let lastBallDetectedAt = 0
  let lastBallUpdatedAt = 0
  let lastBallBox = null
  let lastBallVelocity = null
  let lastHoopBox = null
  let lastHoopSourceBox = null
  let lastHoopDetection = null
  let hasSeenHoop = false
  let ballTrackId = 0
  let activeBallTrackId = null
  const ballKalman = createBallKalmanFilter()

  function reset() {
    ballHistory.length = 0
    rawBallHistory.length = 0
    hoopSourceHistory.length = 0
    lastHistoryTimestamp.value = 0
    lastRawHistoryTimestamp.value = 0
    hoopLostFrames = 0
    lastBallCenter = null
    lastDetectedBallCenter = null
    lastBallDetectedAt = 0
    lastBallUpdatedAt = 0
    lastBallBox = null
    lastBallVelocity = null
    lastHoopBox = null
    lastHoopSourceBox = null
    lastHoopDetection = null
    hasSeenHoop = false
    ballTrackId = 0
    activeBallTrackId = null
    ballKalman.reset()
  }

  function predictBallCenter(timestampMs) {
    if (!lastDetectedBallCenter || lastBallDetectedAt <= 0) return null

    const dt = timestampMs - lastBallDetectedAt
    if (dt <= 0 || dt > BALL_COAST_MAX_MS) return null

    return ballKalman.predict(timestampMs)
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
      pruneBallHistory(rawBallHistory, timestampMs)
    }

    const hoopCandidates = detections.filter((item) => getDetectionRole(item) === 'hoop')
    const hoopDetection = pickHoopDetection(hoopCandidates, lastHoopSourceBox)
    let hoopWarning = null

    if (!paused && hoopDetection) {
      lastHoopSourceBox = pushHoopSourceBox(hoopSourceHistory, hoopDetection.box)
      lastHoopBox = getTopBoxBand(lastHoopSourceBox, {
        factor: HOOP_RIM_HEIGHT_FACTOR,
        minHeight: HOOP_RIM_MIN_HEIGHT_PX,
        maxHeight: HOOP_RIM_MAX_HEIGHT_PX,
      })
      lastHoopDetection = hoopDetection
      hoopLostFrames = 0
      hasSeenHoop = true
    } else if (!paused && inferenceFresh && hasSeenHoop) {
      hoopLostFrames += 1

      if (hoopLostFrames >= HOOP_LOST_FRAME_THRESHOLD) {
        hoopWarning = HOOP_LOST_WARNING
        lastHoopBox = null
        lastHoopSourceBox = null
        hoopSourceHistory.length = 0
        lastHoopDetection = null
        hasSeenHoop = false
      }
    }

    const displayHoopBox = lastHoopBox ? { ...lastHoopBox } : null
    const displayHoopDetection = lastHoopDetection
      ? { ...lastHoopDetection, box: displayHoopBox }
      : null
    const hoopStability = getHoopStability(hoopSourceHistory)
    const ballHistoryBreakDistancePx = displayHoopBox
      ? Math.max(80, displayHoopBox.width * 2.2)
      : BALL_HISTORY_BREAK_DISTANCE_PX

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
    let rawBallCenter = null
    let ballTrackState = 'lost'
    let ballMeasured = false
    let ballConfidence = 0
    let displayBallDetection = null

    if (ballDetection) {
      if (!trackIsRecent || activeBallTrackId == null) {
        ballTrackId += 1
        activeBallTrackId = ballTrackId
      }

      const detectedCenter = getBoxCenter(ballDetection.box)
      rawBallCenter = detectedCenter
      ballMeasured = true
      ballConfidence = ballDetection.confidence
      const measuredCenter =
        ballDetection.confidence < BALL_CONFIDENCE_MIN
          ? smoothPoint(lastBallCenter, detectedCenter, BALL_SMOOTHING_ALPHA_TRACKED)
          : detectedCenter
      ballCenter = ballKalman.correct(measuredCenter, timestampMs, ballDetection.confidence)
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
        pushBallHistory(
          ballHistory,
          lastHistoryTimestamp,
          ballCenter,
          timestampMs,
          ballHistoryBreakDistancePx,
        )
        pushBallHistory(
          rawBallHistory,
          lastRawHistoryTimestamp,
          rawBallCenter,
          timestampMs,
          ballHistoryBreakDistancePx,
        )
      }
    } else if (predictedCenter && lastBallBox) {
      ballCenter = smoothPoint(lastBallCenter, predictedCenter, BALL_SMOOTHING_ALPHA_PREDICTED)
      lastBallCenter = { ...ballCenter }
      lastBallUpdatedAt = timestampMs
      ballTrackState = 'predicted'
      ballMeasured = false
      ballConfidence = 0.2
      const size = Math.max(lastBallBox.width, lastBallBox.height)
      displayBallDetection = {
        className: 'ball',
        confidence: 0.2,
        box: boxFromCenter(ballCenter, size),
        predicted: true,
      }

      if (!paused) {
        pushBallHistory(
          ballHistory,
          lastHistoryTimestamp,
          ballCenter,
          timestampMs,
          ballHistoryBreakDistancePx,
        )
      }
    } else if (lastBallDetectedAt > 0 && timestampMs - lastBallDetectedAt > BALL_COAST_MAX_MS) {
      lastBallCenter = null
      lastDetectedBallCenter = null
      lastBallDetectedAt = 0
      lastBallUpdatedAt = 0
      lastBallBox = null
      lastBallVelocity = null
      activeBallTrackId = null
      ballKalman.reset()
      ballHistory.length = 0
      rawBallHistory.length = 0
      lastHistoryTimestamp.value = 0
      lastRawHistoryTimestamp.value = 0
    }

    const ballVelocity = ballKalman.getVelocity() ?? computeVelocity(ballHistory)
    lastBallVelocity = ballVelocity ?? null

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
      rawBallCenter,
      ballHistory: ballHistory.map((point) => ({ ...point })),
      rawBallHistory: rawBallHistory.map((point) => ({ ...point })),
      ballVelocity,
      ballTrackState,
      ballMeasured,
      ballConfidence,
      ballTrackId: activeBallTrackId,
      shooterDetection,
      hoopBox: displayHoopBox,
      hoopSourceBox: lastHoopSourceBox ? { ...lastHoopSourceBox } : null,
      hoopStable: hoopStability.stable,
      hoopStability: hoopStability.score,
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
