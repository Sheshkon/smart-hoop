export const BODY_SKELETON_CONNECTIONS = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
  ['left_ankle', 'left_heel'],
  ['right_ankle', 'right_heel'],
  ['left_heel', 'left_foot_index'],
  ['right_heel', 'right_foot_index'],
]

const FACE_LANDMARKS = new Set([
  'nose',
  'left_eye_inner',
  'left_eye',
  'left_eye_outer',
  'right_eye_inner',
  'right_eye',
  'right_eye_outer',
  'left_ear',
  'right_ear',
  'mouth_left',
  'mouth_right',
])

/**
 * @param {object} [options]
 */
export function createPoseTracker(options = {}) {
  return {
    smoothingFactor: options.smoothingFactor ?? 0.65,
    keypointConfidenceMin: options.keypointConfidenceMin ?? 0.5,
    holdMs: options.holdMs ?? 250,
    players: new Map(),
  }
}

/**
 * @param {ReturnType<typeof createPoseTracker>} tracker
 * @param {Array<{ id: string, confidence: number, keypoints: Array<{ name: string, x: number, y: number, confidence: number }> }>} poses
 * @param {number} timestamp
 */
export function updatePoseTracking(tracker, poses, timestamp) {
  const seenIds = new Set()

  for (const pose of poses) {
    seenIds.add(pose.id)

    let player = tracker.players.get(pose.id)
    if (!player) {
      player = { id: pose.id, confidence: pose.confidence, keypoints: new Map() }
      tracker.players.set(pose.id, player)
    }

    player.confidence = pose.confidence

    for (const keypoint of pose.keypoints) {
      if (keypoint.confidence < tracker.keypointConfidenceMin) {
        continue
      }

      const previous = player.keypoints.get(keypoint.name)
      const alpha = tracker.smoothingFactor

      const smoothed = previous
        ? {
            x: alpha * keypoint.x + (1 - alpha) * previous.x,
            y: alpha * keypoint.y + (1 - alpha) * previous.y,
            confidence: keypoint.confidence,
            lastSeen: timestamp,
          }
        : {
            x: keypoint.x,
            y: keypoint.y,
            confidence: keypoint.confidence,
            lastSeen: timestamp,
          }

      player.keypoints.set(keypoint.name, smoothed)
    }
  }

  for (const [id, player] of tracker.players) {
    if (!seenIds.has(id)) {
      for (const [name, keypoint] of player.keypoints) {
        if (timestamp - keypoint.lastSeen > tracker.holdMs) {
          player.keypoints.delete(name)
        }
      }
      if (player.keypoints.size === 0) {
        tracker.players.delete(id)
      }
    }
  }

  return getTrackedPoses(tracker, timestamp)
}

/**
 * @param {ReturnType<typeof createPoseTracker>} tracker
 * @param {number} timestamp
 */
function getTrackedPoses(tracker, timestamp) {
  const poses = []

  for (const player of tracker.players.values()) {
    const keypoints = []

    for (const [name, keypoint] of player.keypoints) {
      if (timestamp - keypoint.lastSeen > tracker.holdMs) {
        continue
      }
      if (keypoint.confidence < tracker.keypointConfidenceMin) {
        continue
      }
      keypoints.push({
        name,
        x: keypoint.x,
        y: keypoint.y,
        confidence: keypoint.confidence,
      })
    }

    if (keypoints.length > 0) {
      poses.push({
        id: player.id,
        confidence: player.confidence,
        keypoints,
      })
    }
  }

  return poses
}

/**
 * Map pose keypoints from video pixel space to overlay canvas coordinates.
 * @param {Array<{ id: string, confidence: number, keypoints: Array<{ name: string, x: number, y: number, confidence: number }> }>} poses
 * @param {HTMLVideoElement | null | undefined} video
 * @param {{ offsetX: number, offsetY: number, renderWidth: number, renderHeight: number }} viewport
 */
export function mapPosesToCanvas(poses, video, viewport) {
  if (!video || !viewport) {
    return poses
  }

  const videoWidth = video.videoWidth
  const videoHeight = video.videoHeight
  if (!videoWidth || !videoHeight) {
    return []
  }

  const scale = Math.max(
    viewport.renderWidth / videoWidth,
    viewport.renderHeight / videoHeight,
  )
  const displayWidth = videoWidth * scale
  const displayHeight = videoHeight * scale
  const cropX = (displayWidth - viewport.renderWidth) / 2
  const cropY = (displayHeight - viewport.renderHeight) / 2

  return poses.map((pose) => ({
    ...pose,
    keypoints: pose.keypoints.map((keypoint) => ({
      ...keypoint,
      x: viewport.offsetX + keypoint.x * scale - cropX,
      y: viewport.offsetY + keypoint.y * scale - cropY,
    })),
  }))
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{ id: string, confidence: number, keypoints: Array<{ name: string, x: number, y: number, confidence: number }> }>} trackedPoses
 * @param {object} [options]
 */
export function drawPoseSkeleton(ctx, trackedPoses, options = {}) {
  const {
    keypointMinConfidence = 0.5,
    showKeypoints = true,
    drawFaceLandmarks = false,
    lineColor = 'rgba(129, 199, 132, 0.9)',
    keypointColor = 'rgba(255, 255, 255, 0.95)',
    lineWidth = 2,
    keypointRadius = 3,
  } = options

  for (const pose of trackedPoses) {
    const keypointMap = new Map(
      pose.keypoints
        .filter((keypoint) => keypoint.confidence >= keypointMinConfidence)
        .map((keypoint) => [keypoint.name, keypoint]),
    )

    ctx.strokeStyle = lineColor
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'

    for (const [fromName, toName] of BODY_SKELETON_CONNECTIONS) {
      const from = keypointMap.get(fromName)
      const to = keypointMap.get(toName)
      if (!from || !to) {
        continue
      }

      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
    }

    if (!showKeypoints) {
      continue
    }

    ctx.fillStyle = keypointColor
    for (const keypoint of keypointMap.values()) {
      if (!drawFaceLandmarks && FACE_LANDMARKS.has(keypoint.name)) {
        continue
      }

      ctx.beginPath()
      ctx.arc(keypoint.x, keypoint.y, keypointRadius, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
