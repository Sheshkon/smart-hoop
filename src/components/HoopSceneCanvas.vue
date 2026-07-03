<template>
  <div
    ref="containerRef"
    class="detection-overlay detection-overlay--camera"
    :class="{
      'detection-overlay--landscape': orientation === 'landscape',
      'detection-overlay--interactive': mode === 'calibration',
    }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="onPointerUp"
  >
    <canvas ref="canvasRef" class="detection-overlay__canvas" />
    <FullscreenToggleButton
      :is-fullscreen="isFullscreen"
      @toggle="handleToggleFullscreen"
    />
    <span class="detection-overlay__badge">{{ orientationLabel }}</span>
    <span v-if="mode === 'session' && shotStateLabel" class="detection-overlay__state">
      {{ shotStateLabel }}
    </span>
  </div>
</template>

<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { detect, playTrajectory, resetManualDetector } from '../ai/manualDetector.js'
import { useFullscreenElement } from '../composables/useFullscreenElement.js'
import { useHoopCalibrationEditor } from '../composables/useHoopCalibrationEditor.js'
import FullscreenToggleButton from './FullscreenToggleButton.vue'
import { TRAJECTORY_KEYS } from '../shot/testTrajectories.js'
import { createShotStateMachine, SHOT_STATES } from '../shot/shotStateMachine.js'
import { drawHoopBox } from '../utils/hoopCanvasDrawing.js'
import { getSceneViewportForOrientation, toPortraitShotSpace } from '../utils/sceneViewport.js'
import { getOrientation } from '../utils/geometry.js'

const props = defineProps({
  mode: {
    type: String,
    required: true,
    validator: (value) => value === 'session' || value === 'calibration',
  },
  paused: {
    type: Boolean,
    default: false,
  },
  autoDetectShots: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['shot-detected', 'fullscreen-change'])

const containerRef = ref(null)
const canvasRef = ref(null)
const cameraFullscreenRoot = inject('cameraFullscreenRoot', null)

const { isFullscreen, isPseudoFullscreen, toggle: toggleFullscreen } = useFullscreenElement()
const calibrationEditor = useHoopCalibrationEditor()

const fullscreenTarget = computed(() => cameraFullscreenRoot?.value ?? containerRef.value)

const orientation = ref('portrait')
const shotState = ref(SHOT_STATES.idle)

let animationFrameId = null
let resizeObserver = null
let canvasWidth = 0
let canvasHeight = 0
let viewport = getSceneViewportForOrientation(1, 1, 'portrait')
const shotMachine = createShotStateMachine()

const orientationLabel = computed(() =>
  orientation.value === 'landscape' ? 'Альбомная' : 'Портретная',
)

const shotStateLabels = {
  [SHOT_STATES.idle]: '',
  [SHOT_STATES.ballDetected]: 'Мяч',
  [SHOT_STATES.approachingHoop]: 'Подлёт',
  [SHOT_STATES.inRimZone]: 'Кольцо',
  [SHOT_STATES.made]: 'Попадание!',
  [SHOT_STATES.missed]: 'Промах',
  [SHOT_STATES.cooldown]: 'Пауза',
}

const shotStateLabel = computed(() => shotStateLabels[shotState.value] || '')

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

  if (props.mode === 'calibration') {
    drawCalibrationFrame()
  }
}

function drawHoop(ctx, hoopDetection) {
  drawHoopBox(ctx, hoopDetection.box)
}

function drawBall(ctx, ballDetection, ballCenter) {
  const { box } = ballDetection
  const radius = Math.min(box.width, box.height) / 2

  ctx.fillStyle = 'rgba(233, 69, 96, 0.25)'
  ctx.strokeStyle = 'rgba(233, 69, 96, 0.85)'
  ctx.lineWidth = 2
  ctx.setLineDash([4, 3])
  ctx.strokeRect(box.x, box.y, box.width, box.height)
  ctx.setLineDash([])

  ctx.beginPath()
  ctx.arc(ballCenter.x, ballCenter.y, radius, 0, Math.PI * 2)
  ctx.fillStyle = '#e94560'
  ctx.fill()
  ctx.strokeStyle = '#ff8a9b'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(ballCenter.x, ballCenter.y, 4, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
}

function drawTrajectory(ctx, history) {
  if (history.length < 2) return

  ctx.strokeStyle = 'rgba(129, 199, 132, 0.75)'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(history[0].x, history[0].y)

  for (let i = 1; i < history.length; i++) {
    ctx.lineTo(history[i].x, history[i].y)
  }

  ctx.stroke()
}

function drawSessionScene(ctx, result) {
  const hoopDetection = result.detections.find((item) => item.className === 'hoop')
  const ballDetection = result.detections.find((item) => item.className === 'ball')
  if (!hoopDetection) return

  ctx.clearRect(0, 0, canvasWidth, canvasHeight)
  drawTrajectory(ctx, result.ballHistory)
  drawHoop(ctx, hoopDetection)

  if (ballDetection && result.ballCenter) {
    drawBall(ctx, ballDetection, result.ballCenter)
  }
}

function drawCalibrationFrame() {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvasWidth, canvasHeight)
  calibrationEditor.drawCalibrationHoop(ctx, viewport, orientation.value)
}

function processShotDetection(result, timestampMs) {
  if (!props.autoDetectShots || props.paused) return

  const { ballCenter, hoopBox } = toPortraitShotSpace(
    result.ballCenter,
    result.hoopBox,
    result.viewport,
    result.orientation,
  )

  const machineResult = shotMachine.update({
    ballCenter,
    hoopBox,
    timestampMs,
    ballVisible: Boolean(ballCenter),
  })

  shotState.value = machineResult.state

  if (machineResult.event) {
    emit('shot-detected', { type: machineResult.event, confidence: 0.9 })
  }
}

function renderSessionFrame(timestampMs) {
  if (!canvasRef.value || canvasWidth === 0 || canvasHeight === 0) {
    animationFrameId = requestAnimationFrame(renderSessionFrame)
    return
  }

  const result = detect({
    width: canvasWidth,
    height: canvasHeight,
    timestampMs,
    orientation: orientation.value,
    paused: props.paused,
  })

  processShotDetection(result, timestampMs)

  const ctx = canvasRef.value.getContext('2d')
  if (ctx) {
    drawSessionScene(ctx, result)
  }

  animationFrameId = requestAnimationFrame(renderSessionFrame)
}

function startSessionLoop() {
  stopSessionLoop()
  animationFrameId = requestAnimationFrame(renderSessionFrame)
}

function stopSessionLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

function runTestTrajectory(key) {
  shotMachine.reset()
  shotState.value = SHOT_STATES.idle
  playTrajectory(key)
}

function onPointerDown(event) {
  if (props.mode !== 'calibration') return

  const changed = calibrationEditor.pointerDown(
    event,
    containerRef.value,
    viewport,
    orientation.value,
  )
  if (changed) drawCalibrationFrame()
}

function onPointerMove(event) {
  if (props.mode !== 'calibration') return

  const changed = calibrationEditor.pointerMove(
    event,
    containerRef.value,
    viewport,
    orientation.value,
  )
  if (changed) drawCalibrationFrame()
}

function onPointerUp(event) {
  if (props.mode !== 'calibration') return
  calibrationEditor.pointerUp(event, containerRef.value)
}

async function handleToggleFullscreen() {
  await toggleFullscreen(fullscreenTarget.value)
  await nextTick()
  syncCanvasSize()
}

function handleViewportChange() {
  calibrationEditor.resetDrag()
  nextTick(() => syncCanvasSize())
}

function applyMode(mode) {
  calibrationEditor.resetDrag()

  if (mode === 'session') {
    resetManualDetector()
    shotMachine.reset()
    shotState.value = SHOT_STATES.idle
    startSessionLoop()
    return
  }

  stopSessionLoop()
  calibrationEditor.reloadFromStorage()
  drawCalibrationFrame()
}

watch(isFullscreen, (value) => {
  emit('fullscreen-change', value)
  handleViewportChange()
})

watch(isPseudoFullscreen, (value) => {
  fullscreenTarget.value?.classList.toggle('camera-view--pseudo-fullscreen', value)
})

watch(
  () => props.mode,
  (mode) => applyMode(mode),
)

watch(
  () => props.paused,
  (paused) => {
    if (props.mode !== 'session' || paused) return
    resetManualDetector()
    shotMachine.reset()
    shotState.value = SHOT_STATES.idle
  },
)

onMounted(() => {
  syncCanvasSize()

  resizeObserver = new ResizeObserver(syncCanvasSize)
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }

  window.addEventListener('orientationchange', handleViewportChange)
  window.addEventListener('resize', handleViewportChange)
  screen.orientation?.addEventListener('change', handleViewportChange)

  applyMode(props.mode)
})

onBeforeUnmount(() => {
  stopSessionLoop()
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('orientationchange', handleViewportChange)
  window.removeEventListener('resize', handleViewportChange)
  screen.orientation?.removeEventListener('change', handleViewportChange)
  fullscreenTarget.value?.classList.remove('camera-view--pseudo-fullscreen')
})

defineExpose({
  playTestMake: () => runTestTrajectory(TRAJECTORY_KEYS.make),
  playTestMissLeft: () => runTestTrajectory(TRAJECTORY_KEYS.missLeft),
  playTestMissRight: () => runTestTrajectory(TRAJECTORY_KEYS.missRight),
  playTestShortMiss: () => runTestTrajectory(TRAJECTORY_KEYS.shortMiss),
  resetCalibration: () => {
    calibrationEditor.resetBox()
    drawCalibrationFrame()
  },
  confirmCalibration: () => calibrationEditor.confirmCalibration(),
})
</script>
