import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

export const POSE_MODEL_RELATIVE = 'mediapipe/pose_landmarker_lite.task'

/**
 * Resolve pose model path for current deploy base (e.g. /smart-hoop/ on GitHub Pages).
 * @param {string} [path]
 */
export function getPoseModelUrl(path = POSE_MODEL_RELATIVE) {
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  const base = import.meta.env.BASE_URL || '/'

  if (path.startsWith(base)) {
    return path
  }

  if (path.startsWith('/')) {
    return `${base.replace(/\/$/, '')}${path}`
  }

  const normalized = path.replace(/^models\//, '')
  return `${base}models/${normalized}`
}

/** @deprecated Use getPoseModelUrl() — kept for settings migration */
export const POSE_MODEL_URL = getPoseModelUrl()

const MEDIAPIPE_VISION_VERSION = '0.10.35'
const WASM_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VISION_VERSION}/wasm`

const LANDMARK_NAMES = [
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
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_pinky',
  'right_pinky',
  'left_index',
  'right_index',
  'left_thumb',
  'right_thumb',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
  'left_heel',
  'right_heel',
  'left_foot_index',
  'right_foot_index',
]

/**
 * @param {object} [options]
 */
export function createMediaPipePoseDetector(options = {}) {
  const {
    modelUrl = getPoseModelUrl(),
    targetFps = 15,
    numPoses = 1,
    minPoseDetectionConfidence = 0.5,
    minPosePresenceConfidence = 0.5,
    minTrackingConfidence = 0.5,
    keypointConfidenceMin = 0.5,
  } = options

  /** @type {PoseLandmarker | null} */
  let landmarker = null
  let ready = false
  let lastError = null
  let lastDetectAt = 0
  let poseBusy = false
  let mediaPipeTimestampMs = 0

  async function modelExists(url) {
    try {
      const headResponse = await fetch(url, { method: 'HEAD' })
      if (headResponse.ok) {
        return true
      }

      if (headResponse.status === 404 || headResponse.status === 405) {
        const getResponse = await fetch(url, { method: 'GET' })
        return getResponse.ok
      }

      return false
    } catch {
      return false
    }
  }

  async function createLandmarker(delegate, resolvedModelUrl) {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN)
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: resolvedModelUrl,
        delegate,
      },
      runningMode: 'VIDEO',
      numPoses,
      minPoseDetectionConfidence,
      minPosePresenceConfidence,
      minTrackingConfidence,
      outputSegmentationMasks: false,
    })
  }

  function resolveInputElement(input) {
    if (!input) return null
    if (
      input instanceof HTMLVideoElement ||
      input instanceof HTMLImageElement ||
      input instanceof HTMLCanvasElement
    ) {
      return input
    }
    if (input instanceof ImageBitmap) {
      return input
    }
    if (input.video) {
      return input.video
    }
    return null
  }

  function getInputDimensions(element) {
    if (element instanceof HTMLVideoElement) {
      return { width: element.videoWidth, height: element.videoHeight }
    }
    if (element instanceof HTMLImageElement) {
      return { width: element.naturalWidth, height: element.naturalHeight }
    }
    if (element instanceof HTMLCanvasElement) {
      return { width: element.width, height: element.height }
    }
    if (element instanceof ImageBitmap) {
      return { width: element.width, height: element.height }
    }
    return { width: 0, height: 0 }
  }

  function isVideoReady(element) {
    if (element instanceof HTMLVideoElement) {
      return element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    }
    if (element instanceof HTMLImageElement) {
      return element.complete && element.naturalWidth > 0 && element.naturalHeight > 0
    }
    return true
  }

  function mapLandmarks(landmarks, inputWidth, inputHeight) {
    return landmarks.map((landmark, index) => {
      const confidence = landmark.visibility ?? landmark.presence ?? 1
      return {
        name: LANDMARK_NAMES[index] ?? `landmark_${index}`,
        x: landmark.x * inputWidth,
        y: landmark.y * inputHeight,
        confidence,
      }
    }).filter((keypoint) => keypoint.confidence >= keypointConfidenceMin)
  }

  return {
    lastError: null,

    async init() {
      lastError = null
      this.lastError = null
      ready = false

      const resolvedModelUrl = getPoseModelUrl(modelUrl)
      const exists = await modelExists(resolvedModelUrl)
      if (!exists) {
        const err = new Error(`Pose model not found at ${resolvedModelUrl}`)
        lastError = err
        this.lastError = err
        throw err
      }

      try {
        landmarker = await createLandmarker('GPU', resolvedModelUrl)
      } catch {
        try {
          landmarker = await createLandmarker('CPU', resolvedModelUrl)
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err))
          lastError = error
          this.lastError = error
          throw error
        }
      }

      ready = true
    },

    detect(input) {
      if (!ready || !landmarker || poseBusy) {
        return []
      }

      const element = resolveInputElement(input)
      if (!element || !isVideoReady(element)) {
        return []
      }

      const now = performance.now()
      const minInterval = 1000 / Math.max(1, targetFps)
      if (now - lastDetectAt < minInterval) {
        return []
      }

      const { width: inputWidth, height: inputHeight } = getInputDimensions(element)
      if (!inputWidth || !inputHeight) {
        return []
      }

      const timestampMs = input?.timestampMs ?? now
      const frameStepMs = Math.max(1, Math.round(1000 / Math.max(1, targetFps)))
      const mediaPipeTimestamp = Math.max(mediaPipeTimestampMs + frameStepMs, Math.round(timestampMs))

      poseBusy = true
      lastDetectAt = now

      try {
        const result = landmarker.detectForVideo(element, mediaPipeTimestamp, {})
        mediaPipeTimestampMs = mediaPipeTimestamp

        if (!result?.landmarks?.length) {
          return []
        }

        return result.landmarks.map((landmarks, index) => {
          const keypoints = mapLandmarks(landmarks, inputWidth, inputHeight)
          const confidence =
            keypoints.length > 0
              ? keypoints.reduce((sum, keypoint) => sum + keypoint.confidence, 0) /
                keypoints.length
              : 0

          return {
            id: `player-${index + 1}`,
            confidence,
            keypoints,
          }
        })
      } catch (err) {
        console.warn('Pose detection failed:', err)
        lastError = err instanceof Error ? err : new Error(String(err))
        this.lastError = lastError
        return []
      } finally {
        poseBusy = false
      }
    },

    dispose() {
      landmarker?.close?.()
      landmarker = null
      ready = false
      lastError = null
      this.lastError = null
      lastDetectAt = 0
      poseBusy = false
      mediaPipeTimestampMs = 0
    },
  }
}
