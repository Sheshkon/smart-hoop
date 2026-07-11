import { DEFAULT_HOOP_BOX, getCalibration } from '../shot/hoopCalibration.js'
import {
  getTrajectoryDurationMs,
  interpolateTrajectoryByTime,
  portraitTrajectoryToLandscape,
  REFERENCE_HOOP_BOX,
  TRAJECTORIES,
  transformTrajectoryToHoop,
} from '../shot/testTrajectories.js'
import { boxFromCenter, getOrientation } from '../utils/geometry.js'
import {
  getSceneViewportForOrientation,
  portraitBoxToLandscape,
  sceneBoxToCanvas,
  scenePointToCanvas,
} from '../utils/sceneViewport.js'

const BALL_HISTORY_MAX = 120
const BALL_HISTORY_INTERVAL_MS = 50
const BALL_TRAJECTORY_TTL_MS = 1400
const BALL_SIZE = 40

const ballHistory = []
let lastHistoryTimestamp = 0
let activeTrajectoryKey = null
let trajectoryStartedAt = 0

export function resetManualDetector() {
  ballHistory.length = 0
  lastHistoryTimestamp = 0
  activeTrajectoryKey = null
  trajectoryStartedAt = 0
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function playTrajectory(key) {
  if (!TRAJECTORIES[key]) return false

  ballHistory.length = 0
  lastHistoryTimestamp = 0
  activeTrajectoryKey = key
  trajectoryStartedAt = performance.now()
  return true
}

export function isTrajectoryPlaying(timestampMs = performance.now()) {
  if (!activeTrajectoryKey) return false
  const duration = getTrajectoryDurationMs(activeTrajectoryKey)
  return timestampMs - trajectoryStartedAt <= duration + 50
}

/**
 * Calibration is stored in portrait scene coords; map to active orientation.
 * @param {'portrait' | 'landscape'} orientation
 * @param {ReturnType<typeof getCalibration>} calibration
 */
function getHoopBoxScene(orientation, calibration) {
  const portraitBox = calibration.manuallyAdjusted ? calibration.hoopBox : DEFAULT_HOOP_BOX
  if (orientation === 'landscape') {
    return portraitBoxToLandscape(portraitBox)
  }
  return { ...portraitBox }
}

function getReferenceHoopBox(orientation) {
  if (orientation === 'landscape') {
    return portraitBoxToLandscape(REFERENCE_HOOP_BOX)
  }
  return REFERENCE_HOOP_BOX
}

function getTrajectoryForOrientation(key, orientation, hoopBoxScene) {
  const baseTrajectory = TRAJECTORIES[key]
  const sceneTrajectory =
    orientation === 'landscape'
      ? portraitTrajectoryToLandscape(baseTrajectory)
      : baseTrajectory

  return transformTrajectoryToHoop(
    sceneTrajectory,
    hoopBoxScene,
    getReferenceHoopBox(orientation),
  )
}

function getBallCenterScene(timestampMs, paused, orientation) {
  if (paused || !activeTrajectoryKey) {
    return null
  }

  const elapsedMs = timestampMs - trajectoryStartedAt
  const duration = getTrajectoryDurationMs(activeTrajectoryKey)

  if (elapsedMs > duration + 50) {
    activeTrajectoryKey = null
    return null
  }

  const calibration = getCalibration()
  const hoopBoxScene = getHoopBoxScene(orientation, calibration)
  const trajectory = getTrajectoryForOrientation(activeTrajectoryKey, orientation, hoopBoxScene)

  return interpolateTrajectoryByTime(trajectory, elapsedMs)
}

function pushBallHistory(point, timestampMs) {
  if (
    ballHistory.length > 0 &&
    timestampMs - lastHistoryTimestamp < BALL_HISTORY_INTERVAL_MS
  ) {
    return
  }

  lastHistoryTimestamp = timestampMs
  ballHistory.push({ x: point.x, y: point.y, t: timestampMs })

  if (ballHistory.length > BALL_HISTORY_MAX) {
    ballHistory.shift()
  }
}

function pruneBallHistory(timestampMs) {
  const minTimestamp = timestampMs - BALL_TRAJECTORY_TTL_MS
  while (ballHistory.length > 0 && ballHistory[0].t < minTimestamp) {
    ballHistory.shift()
  }
}

/**
 * @param {{ width: number, height: number, timestampMs?: number, orientation?: string, paused?: boolean }} input
 */
export function runManualDetection(input) {
  const { width, height, timestampMs = performance.now(), paused = false } = input
  const orientation = input.orientation || getOrientation(width, height)
  const calibration = getCalibration()
  const viewport = getSceneViewportForOrientation(width, height, orientation)

  if (!paused) {
    pruneBallHistory(timestampMs)
  }

  const hoopBoxScene = getHoopBoxScene(orientation, calibration)
  const hoopBox = sceneBoxToCanvas(hoopBoxScene, viewport)

  const ballCenterScene = getBallCenterScene(timestampMs, paused, orientation)
  const detections = [
    {
      className: 'hoop',
      confidence: calibration.manuallyAdjusted ? 1 : 0.95,
      box: hoopBox,
    },
  ]

  let ballCenter = null

  if (ballCenterScene) {
    const ballBoxScene = boxFromCenter(ballCenterScene, BALL_SIZE)
    const ballBox = sceneBoxToCanvas(ballBoxScene, viewport)

    ballCenter = scenePointToCanvas(ballCenterScene, viewport)

    if (!paused) {
      pushBallHistory(ballCenter, timestampMs)
    }

    detections.push({
      className: 'ball',
      confidence: 0.9,
      box: ballBox,
    })
  }

  return {
    detections,
    ballCenter,
    ballHistory: ballHistory.map((point) => ({ ...point })),
    hoopBox,
    viewport,
    orientation,
    trajectoryPlaying: isTrajectoryPlaying(timestampMs),
  }
}

/** @deprecated Use runManualDetection or createManualDetector().detect() */
export function detect(input) {
  return runManualDetection(input)
}

export function createManualDetector() {
  return {
    mode: 'manual',

    async init() {
      resetManualDetector()
    },

    detect(input) {
      return runManualDetection(input)
    },

    dispose() {
      resetManualDetector()
    },
  }
}
