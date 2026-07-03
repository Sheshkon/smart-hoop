import {
  boxFromCenter,
  getOrientation,
  lerp,
  scaleBox,
} from '../utils/geometry.js'

const TRAJECTORY_CYCLE_MS = 3200
const BALL_HISTORY_MAX = 120
const BALL_HISTORY_INTERVAL_MS = 50

const PORTRAIT_SCENE = { width: 400, height: 640 }
const LANDSCAPE_SCENE = { width: 640, height: 400 }

const ballHistory = []
let lastHistoryTimestamp = 0

export function resetManualDetector() {
  ballHistory.length = 0
  lastHistoryTimestamp = 0
}

function getPortraitLayout() {
  return {
    scene: PORTRAIT_SCENE,
    hoopBox: { x: 140, y: 100, width: 120, height: 80 },
    ballSize: 40,
    trajectory: [
      { x: 200, y: 520, t: 0 },
      { x: 205, y: 420, t: 0.2 },
      { x: 210, y: 320, t: 0.4 },
      { x: 198, y: 220, t: 0.55 },
      { x: 200, y: 160, t: 0.7 },
      { x: 202, y: 200, t: 0.85 },
      { x: 205, y: 340, t: 1 },
    ],
  }
}

function getLandscapeLayout() {
  return {
    scene: LANDSCAPE_SCENE,
    hoopBox: { x: 460, y: 140, width: 120, height: 80 },
    ballSize: 40,
    trajectory: [
      { x: 80, y: 300, t: 0 },
      { x: 180, y: 270, t: 0.2 },
      { x: 300, y: 230, t: 0.4 },
      { x: 420, y: 195, t: 0.55 },
      { x: 500, y: 175, t: 0.7 },
      { x: 540, y: 210, t: 0.85 },
      { x: 580, y: 320, t: 1 },
    ],
  }
}

function getSceneLayout(orientation) {
  return orientation === 'landscape' ? getLandscapeLayout() : getPortraitLayout()
}

function interpolateTrajectory(trajectory, progress) {
  const t = progress % 1

  for (let i = 0; i < trajectory.length - 1; i++) {
    const current = trajectory[i]
    const next = trajectory[i + 1]

    if (t >= current.t && t <= next.t) {
      const segmentProgress = (t - current.t) / (next.t - current.t)
      return {
        x: lerp(current.x, next.x, segmentProgress),
        y: lerp(current.y, next.y, segmentProgress),
      }
    }
  }

  return trajectory[trajectory.length - 1]
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

/**
 * Returns test detections compatible with future ONNX detector output.
 * @param {{ width: number, height: number, timestampMs?: number, orientation?: string, paused?: boolean }} input
 */
export function detect(input) {
  const { width, height, timestampMs = performance.now(), paused = false } = input
  const orientation = input.orientation || getOrientation(width, height)
  const layout = getSceneLayout(orientation)

  const progress = paused ? 0 : (timestampMs % TRAJECTORY_CYCLE_MS) / TRAJECTORY_CYCLE_MS
  const ballCenterScene = interpolateTrajectory(layout.trajectory, progress)

  const hoopBox = scaleBox(
    layout.hoopBox,
    layout.scene.width,
    layout.scene.height,
    width,
    height,
  )

  const ballBox = scaleBox(
    boxFromCenter(ballCenterScene, layout.ballSize),
    layout.scene.width,
    layout.scene.height,
    width,
    height,
  )

  const ballCenter = {
    x: ballBox.x + ballBox.width / 2,
    y: ballBox.y + ballBox.height / 2,
  }

  if (!paused) {
    pushBallHistory(ballCenter, timestampMs)
  }

  const detections = [
    {
      className: 'hoop',
      confidence: 0.95,
      box: hoopBox,
    },
    {
      className: 'ball',
      confidence: 0.9,
      box: ballBox,
    },
  ]

  return {
    detections,
    ballCenter,
    ballHistory: ballHistory.map((point) => ({ ...point })),
    orientation,
  }
}
