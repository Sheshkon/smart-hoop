/** Reference scene size (portrait) for trajectory coordinates. */
export const SCENE_WIDTH = 400
export const SCENE_HEIGHT = 640

/** Trajectories are authored relative to the default hoop box (center ~200, 140). */
export const REFERENCE_HOOP_BOX = {
  x: 140,
  y: 100,
  width: 120,
  height: 80,
}

export const makeTrajectory = [
  { x: 200, y: 520, t: 0 },
  { x: 200, y: 380, t: 300 },
  { x: 200, y: 220, t: 550 },
  { x: 200, y: 115, t: 800 },
  { x: 200, y: 140, t: 950 },
  { x: 200, y: 210, t: 1150 },
  { x: 200, y: 360, t: 1400 },
]

export const missLeftTrajectory = [
  { x: 200, y: 520, t: 0 },
  { x: 185, y: 420, t: 250 },
  { x: 150, y: 300, t: 500 },
  { x: 110, y: 180, t: 750 },
  { x: 95, y: 160, t: 950 },
  { x: 80, y: 240, t: 1150 },
  { x: 70, y: 380, t: 1400 },
]

export const missRightTrajectory = [
  { x: 200, y: 520, t: 0 },
  { x: 215, y: 420, t: 250 },
  { x: 250, y: 300, t: 500 },
  { x: 290, y: 180, t: 750 },
  { x: 305, y: 160, t: 950 },
  { x: 320, y: 240, t: 1150 },
  { x: 330, y: 380, t: 1400 },
]

export const shortMissTrajectory = [
  { x: 200, y: 520, t: 0 },
  { x: 200, y: 400, t: 400 },
  { x: 200, y: 250, t: 800 },
  { x: 200, y: 320, t: 1100 },
  { x: 200, y: 450, t: 1400 },
]

export const TRAJECTORY_KEYS = {
  make: 'make',
  missLeft: 'missLeft',
  missRight: 'missRight',
  shortMiss: 'shortMiss',
}

export const TRAJECTORIES = {
  [TRAJECTORY_KEYS.make]: makeTrajectory,
  [TRAJECTORY_KEYS.missLeft]: missLeftTrajectory,
  [TRAJECTORY_KEYS.missRight]: missRightTrajectory,
  [TRAJECTORY_KEYS.shortMiss]: shortMissTrajectory,
}

/**
 * @param {Array<{ x: number, y: number, t: number }>} trajectory
 * @param {number} elapsedMs
 */
export function interpolateTrajectoryByTime(trajectory, elapsedMs) {
  if (!trajectory.length) {
    return { x: 0, y: 0 }
  }

  const lastPoint = trajectory[trajectory.length - 1]
  if (elapsedMs >= lastPoint.t) {
    return { x: lastPoint.x, y: lastPoint.y }
  }

  for (let i = 0; i < trajectory.length - 1; i++) {
    const current = trajectory[i]
    const next = trajectory[i + 1]

    if (elapsedMs >= current.t && elapsedMs <= next.t) {
      const segmentDuration = next.t - current.t
      const segmentProgress = segmentDuration === 0 ? 1 : (elapsedMs - current.t) / segmentDuration
      return {
        x: current.x + (next.x - current.x) * segmentProgress,
        y: current.y + (next.y - current.y) * segmentProgress,
      }
    }
  }

  return { x: trajectory[0].x, y: trajectory[0].y }
}

/**
 * @param {string} key
 */
export function getTrajectoryDurationMs(key) {
  const trajectory = TRAJECTORIES[key]
  if (!trajectory?.length) return 0
  return trajectory[trajectory.length - 1].t
}

/**
 * @param {Array<{ x: number, y: number, t: number }>} trajectory
 */
export function portraitTrajectoryToLandscape(trajectory) {
  return trajectory.map((point) => ({
    x: point.y,
    y: SCENE_WIDTH - point.x,
    t: point.t,
  }))
}

/**
 * Maps authored trajectory points onto the current hoop box (position + size).
 * @param {Array<{ x: number, y: number, t: number }>} trajectory
 * @param {{ x: number, y: number, width: number, height: number }} targetHoopBox
 * @param {{ x: number, y: number, width: number, height: number }} [referenceHoopBox]
 */
export function transformTrajectoryToHoop(
  trajectory,
  targetHoopBox,
  referenceHoopBox = REFERENCE_HOOP_BOX,
) {
  const refCenter = {
    x: referenceHoopBox.x + referenceHoopBox.width / 2,
    y: referenceHoopBox.y + referenceHoopBox.height / 2,
  }
  const targetCenter = {
    x: targetHoopBox.x + targetHoopBox.width / 2,
    y: targetHoopBox.y + targetHoopBox.height / 2,
  }
  const scaleX = targetHoopBox.width / referenceHoopBox.width
  const scaleY = targetHoopBox.height / referenceHoopBox.height

  return trajectory.map((point) => ({
    x: targetCenter.x + (point.x - refCenter.x) * scaleX,
    y: targetCenter.y + (point.y - refCenter.y) * scaleY,
    t: point.t,
  }))
}
