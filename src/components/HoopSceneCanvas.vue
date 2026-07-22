<template>
  <div
    ref="containerRef"
    class="detection-overlay"
    :class="{
      'detection-overlay--camera': cameraOverlay,
      'detection-overlay--landscape': orientation === 'landscape',
    }"
  >
    <canvas ref="canvasRef" class="detection-overlay__canvas" />
    <FullscreenToggleButton
      :is-fullscreen="isFullscreen"
      @toggle="handleToggleFullscreen"
    />
    <span class="detection-overlay__badge">{{ orientationLabel }}</span>
    <span v-if="mode === 'session' && shotStatusLabel" class="detection-overlay__state">
      {{ shotStatusLabel }}
    </span>
    <div
      v-if="hoopWarningText"
      class="detection-overlay__hoop-warning"
      role="alert"
    >
      {{ hoopWarningText }}
    </div>
    <div v-if="poseWarningText" class="detection-overlay__pose-warning" role="alert">
      {{ poseWarningText }}
    </div>
    <div v-if="detectorLoading" class="detection-overlay__loading" role="status" aria-live="polite">
      <p class="detection-overlay__loading-title">Загрузка AI-модели…</p>
      <p v-if="loadingModelLabel" class="detection-overlay__loading-text">{{ loadingModelLabel }}</p>
    </div>
    <div v-if="detectorError" class="detection-overlay__ai-error" role="alert">
      <p class="detection-overlay__ai-error-title">AI-модель недоступна</p>
      <p class="detection-overlay__ai-error-text">{{ detectorError }}</p>
      <button type="button" class="btn btn-secondary btn-small" @click="retryDetector">
        Повторить загрузку
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createDetector } from '../ai/detectorFactory.js'
import { playTrajectory, resetManualDetector } from '../ai/manualDetector.js'
import { createPoseDetector } from '../ai/poseDetectorFactory.js'
import {
  createPoseTracker,
  drawPoseSkeleton,
  mapPosesToCanvas,
  updatePoseTracking,
} from '../ai/poseTracking.js'
import { createTracker } from '../ai/tracking.js'
import { useFullscreenElement } from '../composables/useFullscreenElement.js'
import { DETECTOR_MODES } from '../ai/detectorModes.js'
import { getAiDetectorModel } from '../ai/detectorModels.js'
import {
  aiModelSettings,
  getSelectedInferenceIntervalMs,
  getSelectedShotAlgorithm,
  SHOT_ALGORITHMS,
} from '../stores/aiModelSettings.js'
import { poseSettings } from '../stores/poseSettings.js'
import FullscreenToggleButton from './FullscreenToggleButton.vue'
import { TRAJECTORY_KEYS } from '../shot/testTrajectories.js'
import { createShotStateMachine, SHOT_STATES } from '../shot/shotStateMachine.js'
import { getSceneViewportForOrientation, toPortraitShotSpace } from '../utils/sceneViewport.js'
import { distance, getBackboardZone, getBoxCenter, getOrientation } from '../utils/geometry.js'

const props = defineProps({
  mode: {
    type: String,
    required: true,
    validator: (value) => value === 'session',
  },
  paused: {
    type: Boolean,
    default: false,
  },
  autoDetectShots: {
    type: Boolean,
    default: false,
  },
  detectorMode: {
    type: String,
    default: 'manual',
    validator: (value) => value === 'manual' || value === 'ai',
  },
  cameraOverlay: {
    type: Boolean,
    default: false,
  },
  video: {
    type: Object,
    default: null,
  },
  showDetectionBoxes: {
    type: Boolean,
    default: false,
  },
  showTrackedBoxes: {
    type: Boolean,
    default: false,
  },
  detectionBoxMinConfidence: {
    type: Number,
    default: 0,
  },
  showPlayerBoxes: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'shot-detected',
  'fullscreen-change',
  'detector-error',
  'detector-ready',
  'frame-result',
])

const containerRef = ref(null)
const canvasRef = ref(null)
const cameraFullscreenRoot = inject('cameraFullscreenRoot', null)

const { isFullscreen, isPseudoFullscreen, toggle: toggleFullscreen } = useFullscreenElement()

const fullscreenTarget = computed(() => cameraFullscreenRoot?.value ?? containerRef.value)
const activeDetectorMode = computed(() => props.detectorMode)

const orientation = ref('portrait')
const shotState = ref(SHOT_STATES.idle)
const detectorError = ref('')
const detectorReady = ref(false)
const detectorLoading = ref(false)
const hoopWarningText = ref('')
const poseWarningText = ref('')
const poseDetectorActive = ref(false)

let animationFrameId = null
let resizeObserver = null
let canvasWidth = 0
let canvasHeight = 0
let viewport = getSceneViewportForOrientation(1, 1, 'portrait')
/** @type {ReturnType<typeof createDetector> | null} */
let detector = null
/** @type {ReturnType<typeof createPoseDetector> | null} */
let poseDetector = null
/** @type {Promise<void> | null} */
let poseInitPromise = null
/** @type {HTMLCanvasElement | null} */
let poseCropCanvas = null
const shotMachine = createShotStateMachine()
const aiTracker = createTracker()
const poseTracker = createPoseTracker()
/** @type {Array<{ id: string, confidence: number, keypoints: Array<{ name: string, x: number, y: number, confidence: number }> }>} */
let trackedPoses = []

const orientationLabel = computed(() =>
  orientation.value === 'landscape' ? 'Альбомная' : 'Портретная',
)

const shotStateLabels = {
  [SHOT_STATES.idle]: '',
  [SHOT_STATES.candidate]: 'Мяч',
  [SHOT_STATES.armed]: 'Подлёт',
  [SHOT_STATES.rimInteractionPending]: 'Кольцо',
  [SHOT_STATES.made]: 'Попадание!',
  [SHOT_STATES.missed]: 'Промах',
  [SHOT_STATES.unknown]: 'Неясно',
  [SHOT_STATES.cooldown]: 'Пауза',
}

const shotStateLabel = computed(() => shotStateLabels[shotState.value] || '')
const shotStatusLabel = computed(() => {
  if (!props.autoDetectShots) return 'Автоучёт выкл.'
  return shotStateLabel.value
})
const RIM_VISUAL_PADDING_FACTOR = 0.18
const FRAME_RENDER_INTERVAL_MS = 16
let lastRenderAt = 0

const loadingModelLabel = computed(() => {
  if (activeDetectorMode.value !== DETECTOR_MODES.AI) return ''
  const model = getAiDetectorModel(aiModelSettings.modelId)
  return `${model.label} · ${model.inputSize}×${model.inputSize}`
})

async function initDetector() {
  disposeDetector()
  detectorError.value = ''
  detectorReady.value = false
  detectorLoading.value = activeDetectorMode.value === DETECTOR_MODES.AI

  detector = createDetector(activeDetectorMode.value)

  try {
    await detector.init()
    detectorReady.value = true
    emit('detector-ready', { mode: activeDetectorMode.value })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось загрузить AI-модель'
    detectorError.value = message
    emit('detector-error', { mode: activeDetectorMode.value, message })

    if (activeDetectorMode.value === DETECTOR_MODES.AI) {
      detector = createDetector(DETECTOR_MODES.MANUAL)
      await detector.init()
      detectorReady.value = true
    }
  } finally {
    detectorLoading.value = false
  }
}

function disposeDetector() {
  detector?.dispose()
  detector = null
  detectorReady.value = false
}

async function initPoseDetector() {
  if (poseInitPromise) {
    return poseInitPromise
  }

  poseInitPromise = (async () => {
    disposePoseDetector()
    poseWarningText.value = ''
    poseDetectorActive.value = false

    poseDetector = createPoseDetector(poseSettings.poseMode, {
      modelUrl: poseSettings.poseModel,
      targetFps: poseSettings.poseFps,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      keypointConfidenceMin: 0,
    })

    if (poseSettings.poseMode === 'off') {
      await poseDetector.init()
      return
    }

    try {
      await poseDetector.init()
      poseDetectorActive.value = true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось загрузить модель позы'
      console.warn('Pose detector init failed:', err)

      if (message.toLowerCase().includes('not found')) {
        poseWarningText.value =
          'Pose model not found. Put pose_landmarker_lite.task into public/models/mediapipe or turn pose mode off.'
      } else {
        poseWarningText.value = message
      }

      disposePoseDetector()
      poseDetector = createPoseDetector('off')
      await poseDetector.init()
      poseDetectorActive.value = false
    }
  })()

  try {
    await poseInitPromise
  } finally {
    poseInitPromise = null
  }
}

function disposePoseDetector() {
  poseDetector?.dispose()
  poseDetector = null
  poseDetectorActive.value = false
  poseTracker.players.clear()
  trackedPoses = []
}

async function retryDetector() {
  if (props.mode !== 'session') return
  await initDetector()
}

function syncCanvasSize() {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return

  const rect = container.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const width = Math.max(1, Math.floor(rect.width))
  const height = Math.max(1, Math.floor(rect.height))

  canvasWidth = width
  canvasHeight = height
  orientation.value = getOrientation(width, height)
  viewport = getSceneViewportForOrientation(canvasWidth, canvasHeight, orientation.value)

  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

}

function formatConfidencePercent(confidence) {
  const value = Number(confidence)
  if (!Number.isFinite(value)) {
    return ''
  }
  return `${Math.round(value * 100)}%`
}

function drawConfidenceLabel(ctx, text, x, y, color) {
  if (!text) return

  ctx.save()
  ctx.font = '700 12px system-ui, sans-serif'
  const textWidth = ctx.measureText(text).width
  const labelX = clamp(x, 0, Math.max(0, canvasWidth - textWidth - 12))
  const labelY = clamp(y, 18, Math.max(18, canvasHeight - 4))

  ctx.fillStyle = 'rgba(13, 13, 26, 0.9)'
  ctx.fillRect(labelX, labelY - 18, textWidth + 12, 18)
  ctx.fillStyle = color
  ctx.fillText(text, labelX + 6, labelY - 5)
  ctx.restore()
}

function drawRimIntersectionZone(ctx, rimBox) {
  const paddingX = rimBox.width * RIM_VISUAL_PADDING_FACTOR
  const zoneX = rimBox.x - paddingX
  const zoneWidth = rimBox.width + paddingX * 2

  ctx.save()
  ctx.fillStyle = 'rgba(129, 199, 132, 0.18)'
  ctx.strokeStyle = 'rgba(129, 199, 132, 0.85)'
  ctx.lineWidth = 1.5
  ctx.fillRect(zoneX, rimBox.y, zoneWidth, rimBox.height)
  ctx.strokeRect(zoneX, rimBox.y, zoneWidth, rimBox.height)

  const centerY = rimBox.y + rimBox.height / 2
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(zoneX, centerY)
  ctx.lineTo(zoneX + zoneWidth, centerY)
  ctx.stroke()
  ctx.restore()
}

function drawHoopSourceBox(ctx, sourceBox) {
  if (!sourceBox) return

  ctx.save()
  ctx.strokeStyle = 'rgba(255, 140, 0, 0.6)'
  ctx.lineWidth = 2
  ctx.setLineDash([8, 5])
  ctx.strokeRect(sourceBox.x, sourceBox.y, sourceBox.width, sourceBox.height)
  ctx.fillStyle = 'rgba(255, 140, 0, 0.06)'
  ctx.fillRect(sourceBox.x, sourceBox.y, sourceBox.width, sourceBox.height)
  ctx.restore()
}

function drawBackboardZone(ctx, hoopBox) {
  const zone = getBackboardZone(hoopBox)

  ctx.save()
  ctx.fillStyle = 'rgba(66, 165, 245, 0.08)'
  ctx.strokeStyle = 'rgba(66, 165, 245, 0.75)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([7, 5])
  ctx.strokeRect(zone.x, zone.y, zone.width, zone.height)
  ctx.fillRect(zone.x, zone.y, zone.width, zone.height)
  ctx.restore()
}

function drawHoop(ctx, hoopDetection, hoopSourceBox = null) {
  drawBackboardZone(ctx, hoopDetection.box)
  drawHoopSourceBox(ctx, hoopSourceBox)
  drawRimIntersectionZone(ctx, hoopDetection.box)
  const label = formatConfidencePercent(hoopDetection.confidence)
  drawConfidenceLabel(ctx, label, hoopDetection.box.x, hoopDetection.box.y - 6, '#81c784')
}

function drawShooter(ctx, personDetection) {
  const { box } = personDetection
  const label = `Игрок ${Math.round(personDetection.confidence * 100)}%`

  ctx.fillStyle = 'rgba(66, 165, 245, 0.12)'
  ctx.strokeStyle = 'rgba(66, 165, 245, 0.9)'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.strokeRect(box.x, box.y, box.width, box.height)
  ctx.setLineDash([])
  ctx.fillRect(box.x, box.y, box.width, box.height)

  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(13, 13, 26, 0.82)'
  const textWidth = ctx.measureText(label).width
  const labelX = box.x
  const labelY = Math.max(14, box.y - 6)
  ctx.fillRect(labelX, labelY - 12, textWidth + 8, 14)
  ctx.fillStyle = '#90caf9'
  ctx.fillText(label, labelX + 4, labelY - 2)
}

function drawBall(ctx, ballDetection, ballCenter) {
  const { box } = ballDetection
  const radius = Math.min(box.width, box.height) / 2
  const isPredicted = Boolean(ballDetection.predicted)

  if (!isPredicted) {
    ctx.fillStyle = 'rgba(233, 69, 96, 0.25)'
    ctx.strokeStyle = 'rgba(233, 69, 96, 0.85)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 3])
    ctx.strokeRect(box.x, box.y, box.width, box.height)
    ctx.setLineDash([])
  }

  ctx.beginPath()
  ctx.arc(ballCenter.x, ballCenter.y, radius, 0, Math.PI * 2)
  ctx.fillStyle = isPredicted ? 'rgba(233, 69, 96, 0.55)' : '#e94560'
  ctx.fill()
  ctx.strokeStyle = isPredicted ? 'rgba(255, 138, 155, 0.7)' : '#ff8a9b'
  ctx.lineWidth = 2
  if (isPredicted) ctx.setLineDash([3, 3])
  ctx.stroke()
  ctx.setLineDash([])

  ctx.beginPath()
  ctx.arc(ballCenter.x, ballCenter.y, 4, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  const label = formatConfidencePercent(ballDetection.confidence)
  drawConfidenceLabel(ctx, label, box.x, box.y - 6, isPredicted ? '#ff8a9b' : '#e94560')
}

function drawTrajectory(ctx, history, options = {}) {
  if (history.length < 2) return

  ctx.strokeStyle = options.color ?? 'rgba(129, 199, 132, 0.75)'
  ctx.lineWidth = options.lineWidth ?? 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (options.dash) ctx.setLineDash(options.dash)
  ctx.beginPath()
  ctx.moveTo(history[0].x, history[0].y)

  for (let i = 1; i < history.length; i++) {
    ctx.lineTo(history[i].x, history[i].y)
  }

  ctx.stroke()
  ctx.setLineDash([])
}

function drawDetectionBox(ctx, detection) {
  const { box } = detection
  if (!box) return

  const labels = {
    ball: 'Мяч',
    hoop: 'Кольцо',
    person: 'Игрок',
    make: 'Попадание',
    shot: 'Бросок',
  }
  const colors = {
    ball: '#e94560',
    hoop: '#81c784',
    person: '#42a5f5',
    make: '#66bb6a',
    player: '#42a5f5',
    shot: '#ffb74d',
  }
  const role = detection.appClass ?? detection.className
  const color = colors[role] ?? colors[detection.className] ?? '#ffd54f'
  const labelText = labels[role] ?? detection.displayLabel ?? detection.modelClassName ?? detection.className
  const label = `${labelText} ${Math.round((detection.confidence ?? 0) * 100)}%`
  const labelX = Math.max(0, box.x)
  const labelY = Math.max(18, box.y)

  ctx.save()
  ctx.lineWidth = 3
  ctx.setLineDash([])
  ctx.strokeStyle = color
  ctx.fillStyle = `${color}26`
  ctx.strokeRect(box.x, box.y, box.width, box.height)
  ctx.fillRect(box.x, box.y, box.width, box.height)

  ctx.font = '700 12px system-ui, sans-serif'
  const textWidth = ctx.measureText(label).width
  ctx.fillStyle = 'rgba(13, 13, 26, 0.9)'
  ctx.fillRect(labelX, labelY - 18, textWidth + 12, 18)
  ctx.fillStyle = '#fff'
  ctx.fillText(label, labelX + 6, labelY - 5)
  ctx.restore()
}

function drawDetectionBoxes(ctx, detections) {
  const drawableDetections = detections.filter((item) =>
    (item.confidence ?? 0) >= props.detectionBoxMinConfidence,
  )

  for (const detection of drawableDetections) {
    drawDetectionBox(ctx, detection)
  }
}

function drawDetectionBoxScene(ctx, detections, ballHistory = []) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  if (ballHistory.length) {
    drawTrajectory(ctx, ballHistory)
  }

  drawDetectionBoxes(ctx, detections)

  if (trackedPoses.length > 0) {
    drawPoseSkeleton(ctx, trackedPoses, {
      keypointMinConfidence: poseSettings.keypointConfidenceMin,
    })
  }
}

function drawSessionScene(ctx, result) {
  const hoopDetection = result.detections.find((item) => item.className === 'hoop')
  const ballDetection = result.detections.find((item) => item.className === 'ball')
  const playerDetections = result.detections.filter((item) => item.className === 'person')
  const shooterDetection =
    result.shooterDetection ??
    result.detections.find((item) => item.className === 'person' && item.role === 'shooter')
  const poseOverlayActive =
    poseSettings.poseMode !== 'off' && poseDetectorActive.value

  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  if (result.rawBallHistory?.length) {
    drawTrajectory(ctx, result.rawBallHistory, {
      color: 'rgba(255, 138, 155, 0.8)',
      lineWidth: 2,
      dash: [5, 4],
    })
  }

  if (result.ballHistory?.length) {
    drawTrajectory(ctx, result.ballHistory)
  }

  if (props.showTrackedBoxes) {
    if (hoopDetection) {
      drawHoop(ctx, hoopDetection, result.hoopSourceBox)
    }
    drawDetectionBoxes(ctx, result.detections.filter((item) => item.className !== 'hoop'))

    if (trackedPoses.length > 0) {
      drawPoseSkeleton(ctx, trackedPoses, {
        keypointMinConfidence: poseSettings.keypointConfidenceMin,
      })
    }
    return
  }

  if (hoopDetection) {
    drawHoop(ctx, hoopDetection, result.hoopSourceBox)
  }

  if (props.showPlayerBoxes) {
    for (const playerDetection of playerDetections) {
      drawShooter(ctx, playerDetection)
    }
  } else if (shooterDetection && !poseOverlayActive) {
    drawShooter(ctx, shooterDetection)
  }

  if (ballDetection && result.ballCenter) {
    drawBall(ctx, ballDetection, result.ballCenter)
  }

  if (trackedPoses.length > 0) {
    drawPoseSkeleton(ctx, trackedPoses, {
      keypointMinConfidence: poseSettings.keypointConfidenceMin,
    })
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getPoseCropCanvas() {
  if (!poseCropCanvas) {
    poseCropCanvas = document.createElement('canvas')
  }
  return poseCropCanvas
}

function getVideoDimensions(video) {
  return {
    width: video?.videoWidth || video?.naturalWidth || video?.width || 0,
    height: video?.videoHeight || video?.naturalHeight || video?.height || 0,
  }
}

function mapCanvasBoxToVideoBox(canvasBox, video) {
  const { width: videoWidth, height: videoHeight } = getVideoDimensions(video)
  if (!videoWidth || !videoHeight || !viewport.renderWidth || !viewport.renderHeight) {
    return null
  }

  const scale = Math.max(
    viewport.renderWidth / videoWidth,
    viewport.renderHeight / videoHeight,
  )
  const displayWidth = videoWidth * scale
  const displayHeight = videoHeight * scale
  const cropX = (displayWidth - viewport.renderWidth) / 2
  const cropY = (displayHeight - viewport.renderHeight) / 2

  const left = (canvasBox.x - viewport.offsetX + cropX) / scale
  const top = (canvasBox.y - viewport.offsetY + cropY) / scale
  const right = (canvasBox.x + canvasBox.width - viewport.offsetX + cropX) / scale
  const bottom = (canvasBox.y + canvasBox.height - viewport.offsetY + cropY) / scale

  const x = clamp(left, 0, videoWidth)
  const y = clamp(top, 0, videoHeight)
  const width = clamp(right, 0, videoWidth) - x
  const height = clamp(bottom, 0, videoHeight) - y

  if (width < 8 || height < 8) {
    return null
  }

  return { x, y, width, height }
}

function getExpandedCanvasBox(box, paddingRatio = 0.2) {
  const paddingX = box.width * paddingRatio
  const paddingY = box.height * paddingRatio
  const x = clamp(box.x - paddingX, 0, canvasWidth)
  const y = clamp(box.y - paddingY, 0, canvasHeight)
  const right = clamp(box.x + box.width + paddingX, 0, canvasWidth)
  const bottom = clamp(box.y + box.height + paddingY, 0, canvasHeight)
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  }
}

function getPoseTargets(result) {
  const ballCenter = result?.ballCenter ?? null

  return (result?.detections ?? [])
    .filter((item) => item.className === 'person' && item.box)
    .sort((a, b) => {
      if (ballCenter) {
        return (
          distance(getBoxCenter(a.box), ballCenter) - distance(getBoxCenter(b.box), ballCenter) ||
          b.confidence - a.confidence
        )
      }

      return a.box.x - b.box.x || b.confidence - a.confidence
    })
    .slice(0, 1)
    .map((detection, index) => ({
      id: `player-${index + 1}`,
      detection,
    }))
}

function prepareTargetPoseInput(video, targetDetection) {
  if (!targetDetection?.box) {
    return { input: video, canvasBox: null }
  }

  const canvasBox = getExpandedCanvasBox(targetDetection.box)
  const videoBox = mapCanvasBoxToVideoBox(canvasBox, video)
  if (!videoBox) {
    return { input: video, canvasBox: null }
  }

  const cropCanvas = getPoseCropCanvas()
  const maxSide = 384
  const scale = Math.min(maxSide / videoBox.width, maxSide / videoBox.height, 1)
  cropCanvas.width = Math.max(8, Math.round(videoBox.width * scale))
  cropCanvas.height = Math.max(8, Math.round(videoBox.height * scale))

  const ctx = cropCanvas.getContext('2d')
  if (!ctx) {
    return { input: video, canvasBox: null }
  }

  ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height)
  ctx.drawImage(
    video,
    videoBox.x,
    videoBox.y,
    videoBox.width,
    videoBox.height,
    0,
    0,
    cropCanvas.width,
    cropCanvas.height,
  )

  return { input: cropCanvas, canvasBox }
}

function mapCropPosesToCanvas(poses, canvasBox, cropCanvas, poseId) {
  if (!canvasBox || !cropCanvas?.width || !cropCanvas?.height) {
    return poses
  }

  return poses.map((pose) => ({
    ...pose,
    id: poseId,
    keypoints: pose.keypoints.map((keypoint) => ({
      ...keypoint,
      x: canvasBox.x + (keypoint.x / cropCanvas.width) * canvasBox.width,
      y: canvasBox.y + (keypoint.y / cropCanvas.height) * canvasBox.height,
    })),
  }))
}

function runPoseDetection(timestampMs, result = null) {
  poseTracker.keypointConfidenceMin = poseSettings.keypointConfidenceMin
  poseTracker.holdMs = Math.max(600, Math.ceil(2000 / Math.max(1, poseSettings.poseFps)))

  if (!poseDetector || !poseDetectorActive.value || poseSettings.poseMode === 'off') {
    trackedPoses = updatePoseTracking(poseTracker, [], timestampMs)
    return
  }

  const video = props.video
  if (!video) {
    trackedPoses = updatePoseTracking(poseTracker, [], timestampMs)
    return
  }

  try {
    const targets = getPoseTargets(result)

    if (targets.length === 0) {
      const rawPoses = poseDetector.detect({
        video,
        timestampMs,
      })
      if (rawPoses == null) {
        return
      }
      trackedPoses = updatePoseTracking(poseTracker, mapPosesToCanvas(rawPoses, video, viewport), timestampMs)
      return
    }

    const canvasPoses = []

    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index]
      const poseInput = prepareTargetPoseInput(video, target.detection)
      const rawPoses = poseDetector.detect({
        video: poseInput.input,
        timestampMs,
        force: index > 0,
      })

      if (rawPoses == null) {
        if (index === 0) {
          return
        }
        continue
      }

      const targetPoses = poseInput.canvasBox
        ? mapCropPosesToCanvas(rawPoses.slice(0, 1), poseInput.canvasBox, poseInput.input, target.id)
        : mapPosesToCanvas(rawPoses.slice(0, 1), video, viewport)
      canvasPoses.push(...targetPoses)
    }

    trackedPoses = updatePoseTracking(poseTracker, canvasPoses, timestampMs)
  } catch (err) {
    console.warn('Pose detection failed:', err)
    trackedPoses = updatePoseTracking(poseTracker, [], timestampMs)
  }
}

function applyTracking(rawResult, timestampMs) {
  if (activeDetectorMode.value !== DETECTOR_MODES.AI) {
    hoopWarningText.value = ''
    return rawResult
  }

  const tracked = aiTracker.update(rawResult, {
    timestampMs,
    paused: props.paused,
  })
  hoopWarningText.value = tracked.hoopWarning ?? ''
  return tracked
}

function toPortraitBallHistory(history, result) {
  if (!Array.isArray(history) || !result.hoopBox) return []

  return history
    .map((point) => {
      const mapped = toPortraitShotSpace(
        point,
        result.hoopBox,
        result.viewport,
        result.orientation,
      ).ballCenter

      return mapped ? { ...mapped, t: point.t } : null
    })
    .filter(Boolean)
}

function processShotDetection(result, timestampMs) {
  if (!props.autoDetectShots || props.paused || !result.hoopBox) return

  const shotAlgorithm = getSelectedShotAlgorithm()
  const shotHoopBox =
    shotAlgorithm === SHOT_ALGORITHMS.AVISHAH || shotAlgorithm === SHOT_ALGORITHMS.HYBRID
      ? result.hoopSourceBox ?? result.hoopBox
      : result.hoopBox
  const shotBallCenter = result.ballCenter
  const ballHistory = toPortraitBallHistory(result.ballHistory, result)
  const rawBallHistory = toPortraitBallHistory(result.rawBallHistory, result)
  const ballDetection = result.detections.find((item) => (item.appClass ?? item.className) === 'ball')
  const ballRadius = ballDetection?.box
    ? (Math.min(ballDetection.box.width, ballDetection.box.height) / 2) / result.viewport.scale
    : 0
  const { ballCenter, hoopBox } = toPortraitShotSpace(
    shotBallCenter,
    shotHoopBox,
    result.viewport,
    result.orientation,
  )
  const backboardZone = getBackboardZone(hoopBox)

  const machineResult = shotMachine.update({
    ballCenter,
    hoopBox,
    timestampMs,
    ballVisible: Boolean(ballCenter),
    ballMeasured: result.ballMeasured,
    ballTrackState: result.ballTrackState,
    ballVelocity: result.ballVelocity,
    rawBallHistory,
    ballRadius,
    ballHistory,
    backboardZone,
    hoopStable: result.hoopStable,
    hoopStability: result.hoopStability,
    hoopLost: result.hoopLost,
    trackId: result.ballTrackId,
    shotAlgorithm,
  })

  shotState.value = machineResult.state

  if (machineResult.event) {
    emit('shot-detected', {
      type: machineResult.event,
      confidence: machineResult.confidence ?? 0,
      reason: machineResult.reason,
      missType: machineResult.missType,
      isSwish: machineResult.isSwish,
      entryAngle: machineResult.entryAngle,
      evidence: machineResult.evidence,
    })
  }
}

function renderSessionFrame(timestampMs) {
  if (!canvasRef.value || canvasWidth === 0 || canvasHeight === 0 || !detector) {
    animationFrameId = requestAnimationFrame(renderSessionFrame)
    return
  }

  if (timestampMs - lastRenderAt < FRAME_RENDER_INTERVAL_MS) {
    animationFrameId = requestAnimationFrame(renderSessionFrame)
    return
  }
  lastRenderAt = timestampMs

  const rawResult = detector.detect({
    width: canvasWidth,
    height: canvasHeight,
    timestampMs,
    orientation: orientation.value,
    paused: props.paused,
    video: props.video,
  })

  if (rawResult.aiError && !detectorError.value) {
    detectorError.value = rawResult.aiError
    emit('detector-error', { mode: activeDetectorMode.value, message: rawResult.aiError })
  }

  if (props.showDetectionBoxes) {
    const trackedResult = applyTracking(rawResult, timestampMs)
    processShotDetection(trackedResult, timestampMs)
    runPoseDetection(timestampMs, trackedResult)

    emit('frame-result', {
      detections: rawResult.detections,
      rawDetections: rawResult.detections,
      ballCenter: trackedResult.ballCenter,
      rawBallCenter: trackedResult.rawBallCenter,
      hoopBox: trackedResult.hoopBox,
      hoopSourceBox: trackedResult.hoopSourceBox,
      ballHistory: trackedResult.ballHistory,
      rawBallHistory: trackedResult.rawBallHistory,
      poses: trackedPoses,
      timestampMs,
    })

    const ctx = canvasRef.value.getContext('2d')
    if (ctx) {
      drawDetectionBoxScene(ctx, rawResult.detections, trackedResult.ballHistory)
    }

    animationFrameId = requestAnimationFrame(renderSessionFrame)
    return
  }

  const result = applyTracking(rawResult, timestampMs)

  if (rawResult.inferenceFresh) {
    emit('frame-result', {
      detections: result.detections,
      rawDetections: rawResult.detections,
      ballCenter: result.ballCenter,
      rawBallCenter: result.rawBallCenter,
      hoopBox: result.hoopBox,
      hoopSourceBox: result.hoopSourceBox,
      timestampMs,
    })
  }

  processShotDetection(result, timestampMs)
  runPoseDetection(timestampMs, result)

  const ctx = canvasRef.value.getContext('2d')
  if (ctx) {
    drawSessionScene(ctx, result)
  }

  animationFrameId = requestAnimationFrame(renderSessionFrame)
}

function startSessionLoop() {
  stopSessionLoop()
  lastRenderAt = 0
  animationFrameId = requestAnimationFrame(renderSessionFrame)
}

function stopSessionLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

function runTestTrajectory(key) {
  if (activeDetectorMode.value !== DETECTOR_MODES.MANUAL) return false
  shotMachine.reset()
  shotState.value = SHOT_STATES.idle
  return playTrajectory(key)
}

async function handleToggleFullscreen() {
  await toggleFullscreen(fullscreenTarget.value)
  await nextTick()
  syncCanvasSize()
}

function handleViewportChange() {
  aiTracker.reset()
  poseTracker.players.clear()
  trackedPoses = []
  hoopWarningText.value = ''
  shotMachine.reset()
  shotState.value = SHOT_STATES.idle
  nextTick(() => syncCanvasSize())
}

async function applyMode(mode) {
  if (mode === 'session') {
    resetManualDetector()
    aiTracker.reset()
    poseTracker.players.clear()
    trackedPoses = []
    hoopWarningText.value = ''
    shotMachine.reset()
    shotState.value = SHOT_STATES.idle
    await initDetector()
    await initPoseDetector()
    startSessionLoop()
  }
}

watch(isFullscreen, (value) => {
  emit('fullscreen-change', value)
  handleViewportChange()
})

watch(isPseudoFullscreen, (value) => {
  fullscreenTarget.value?.classList.toggle('camera-view--pseudo-fullscreen', value)
  fullscreenTarget.value?.classList.toggle('media-test-view--pseudo-fullscreen', value)
})

watch(
  () => props.mode,
  (mode) => {
    applyMode(mode)
  },
)

watch(
  () => props.paused,
  (paused) => {
    if (props.mode !== 'session' || paused) return
    resetManualDetector()
    aiTracker.reset()
    poseTracker.players.clear()
    trackedPoses = []
    hoopWarningText.value = ''
    shotMachine.reset()
    shotState.value = SHOT_STATES.idle
  },
)

watch(
  () => props.autoDetectShots,
  (enabled) => {
    if (props.mode !== 'session' || !enabled) return
    shotMachine.reset()
    shotState.value = SHOT_STATES.idle
  },
)

watch(activeDetectorMode, async () => {
  if (props.mode !== 'session') return
  detectorError.value = ''
  await initDetector()
})

watch(
  () => aiModelSettings.modelId,
  async () => {
    if (props.mode !== 'session' || activeDetectorMode.value !== DETECTOR_MODES.AI) return
    detectorError.value = ''
    await initDetector()
  },
)

watch(
  () => aiModelSettings.shotAlgorithm,
  () => {
    if (props.mode !== 'session') return
    shotMachine.reset()
    shotState.value = SHOT_STATES.idle
  },
)

watch(
  () => ({
    thresholds: [...aiModelSettings.classConfThresholds],
    enabled: [...aiModelSettings.classEnabled],
  }),
  ({ thresholds, enabled }) => {
    if (
      props.mode !== 'session' ||
      activeDetectorMode.value !== DETECTOR_MODES.AI ||
      !detectorReady.value ||
      !detector?.updateThresholds
    ) {
      return
    }

    detector.updateThresholds(thresholds, enabled)
  },
)

watch(
  () => aiModelSettings.inferenceFps,
  () => {
    if (
      props.mode !== 'session' ||
      activeDetectorMode.value !== DETECTOR_MODES.AI ||
      !detectorReady.value ||
      !detector?.updateInferenceInterval
    ) {
      return
    }

    detector.updateInferenceInterval(getSelectedInferenceIntervalMs())
  },
)

watch(
  () => poseSettings.poseMode,
  async () => {
    if (props.mode !== 'session') return
    await initPoseDetector()
  },
)

watch(
  () => poseSettings.poseModel,
  async () => {
    if (props.mode !== 'session' || poseSettings.poseMode === 'off') return
    await initPoseDetector()
  },
)

watch(
  () => poseSettings.poseFps,
  async () => {
    if (props.mode !== 'session' || poseSettings.poseMode === 'off') return
    await initPoseDetector()
  },
)

onMounted(async () => {
  syncCanvasSize()

  resizeObserver = new ResizeObserver(syncCanvasSize)
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }

  window.addEventListener('orientationchange', handleViewportChange)
  window.addEventListener('resize', handleViewportChange)
  screen.orientation?.addEventListener('change', handleViewportChange)

  await applyMode(props.mode)
})

onBeforeUnmount(() => {
  stopSessionLoop()
  disposeDetector()
  disposePoseDetector()
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('orientationchange', handleViewportChange)
  window.removeEventListener('resize', handleViewportChange)
  screen.orientation?.removeEventListener('change', handleViewportChange)
  fullscreenTarget.value?.classList.remove('camera-view--pseudo-fullscreen')
  fullscreenTarget.value?.classList.remove('media-test-view--pseudo-fullscreen')
})

defineExpose({
  getOverlayCanvas: () => canvasRef.value,
  playTestMake: () => runTestTrajectory(TRAJECTORY_KEYS.make),
  playTestMissLeft: () => runTestTrajectory(TRAJECTORY_KEYS.missLeft),
  playTestMissRight: () => runTestTrajectory(TRAJECTORY_KEYS.missRight),
  playTestShortMiss: () => runTestTrajectory(TRAJECTORY_KEYS.shortMiss),
})
</script>
