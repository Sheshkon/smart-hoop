import { boxFromCenter, distance, getBoxCenter } from '../utils/geometry.js'
import { boxIoU } from './yoloUtils.js'

const BALL_CONFIDENCE_MIN = 0.15
const BALL_CONFIDENCE_TRACKING_MIN = 0.08
const BALL_TRACK_RADIUS_PX = 120
const BALL_COAST_MAX_MS = 280
const PERSON_CONFIDENCE_MIN = 0.3
const HOOP_TRACK_RADIUS_PX = 200
const HOOP_LOST_FRAME_THRESHOLD = 18
const BALL_HISTORY_MAX = 120
const BALL_HISTORY_INTERVAL_MS = 16
const VELOCITY_SAMPLE_COUNT = 5

const HOOP_LOST_WARNING = 'Кольцо не видно'

function pushBallHistory(history, lastTimestampRef, point, timestampMs) {
  if (
    history.length > 0 &&
    timestampMs - lastTimestampRef.value < BALL_HISTORY_INTERVAL_MS
  ) {
    return
  }

  lastHistoryTimestamp.value = timestampMs
  history.push({ x: point.x, y: point.y, t: timestampMs })

  if (history.length > BALL_HISTORY_MAX) {
    history.shift()
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
 */
function pickBallDetection(ballCandidates, predictedCenter) {
  const confident = ballCandidates
    .filter((item) => item.confidence >= BALL_CONFIDENCE_MIN)
    .sort((a, b) => b.confidence - a.confidence)

  if (confident.length > 0) {
    if (!predictedCenter) return confident[0]

    const nearTrack = confident
      .map((item) => ({
        item,
        dist: distance(getBoxCenter(item.box), predictedCenter),
      }))
      .sort((a, b) => a.dist - b.dist || b.item.confidence - a.item.confidence)

    return nearTrack[0].item
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
  let lastBallBox = null
  let lastBallSeenAt = 0
  let lastBallVelocity = null
  let lastHoopBox = null
  let lastHoopDetection = null
  let hasSeenHoop = false

  function reset() {
    ballHistory.length = 0
    lastHistoryTimestamp.value = 0
    hoopLostFrames = 0
    lastBallCenter = null
    lastBallBox = null
    lastBallSeenAt = 0
    lastBallVelocity = null
    lastHoopBox = null
    lastHoopDetection = null
    hasSeenHoop = false
  }

  function predictBallCenter(timestampMs) {
    if (!lastBallCenter || !lastBallVelocity || lastBallSeenAt <= 0) return null

    const dt = timestampMs - lastBallSeenAt
    if (dt <= 0 || dt > BALL_COAST_MAX_MS) return null

    return {
      x: lastBallCenter.x + (lastBallVelocity.vx * dt) / 1000,
      y: lastBallCenter.y + (lastBallVelocity.vy * dt) / 1000,
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

    const hoopCandidates = detections.filter((item) => item.className === 'hoop')
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
    const ballCandidates = detections.filter((item) => item.className === 'ball')
    const ballDetection =
      inferenceFresh ? pickBallDetection(ballCandidates, predictedCenter) : null

    let ballCenter = null
    let ballTrackState = 'lost'
    let displayBallDetection = null

    if (ballDetection) {
      ballCenter = getBoxCenter(ballDetection.box)
      lastBallCenter = { ...ballCenter }
      lastBallBox = { ...ballDetection.box }
      lastBallSeenAt = timestampMs
      ballTrackState = ballDetection.confidence < BALL_CONFIDENCE_MIN ? 'tracked' : 'detected'
      displayBallDetection = ballDetection

      if (!paused) {
        pushBallHistory(ballHistory, lastHistoryTimestamp, ballCenter, timestampMs)
      }
    } else if (predictedCenter && lastBallBox) {
      ballCenter = predictedCenter
      ballTrackState = 'predicted'
      const size = Math.max(lastBallBox.width, lastBallBox.height)
      displayBallDetection = {
        className: 'ball',
        confidence: 0.2,
        box: boxFromCenter(predictedCenter, size),
        predicted: true,
      }

      if (!paused) {
        pushBallHistory(ballHistory, lastHistoryTimestamp, ballCenter, timestampMs)
      }
    } else if (lastBallSeenAt > 0 && timestampMs - lastBallSeenAt > BALL_COAST_MAX_MS) {
      lastBallCenter = null
      lastBallBox = null
      lastBallVelocity = null
    }

    const ballVelocity = computeVelocity(ballHistory)
    if (ballVelocity) {
      lastBallVelocity = ballVelocity
    }

    const personCandidates = detections
      .filter(
        (item) => item.className === 'person' && item.confidence >= PERSON_CONFIDENCE_MIN,
      )
      .sort((a, b) => b.confidence - a.confidence)

    const shooterDetection = pickShooter(personCandidates, ballCenter, displayHoopBox)

    const outputDetections = []

    if (displayHoopDetection && displayHoopBox) {
      outputDetections.push({
        className: 'hoop',
        confidence: displayHoopDetection.confidence,
        box: displayHoopBox,
        fromAi: true,
      })
    }

    if (displayBallDetection && ballCenter) {
      outputDetections.push(displayBallDetection)
    }

    if (shooterDetection) {
      outputDetections.push({ ...shooterDetection, role: 'shooter' })
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
