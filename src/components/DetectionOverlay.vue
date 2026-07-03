<template>
  <div
    ref="containerRef"
    class="detection-overlay"
    :class="{ 'detection-overlay--landscape': orientation === 'landscape' }"
  >
    <canvas ref="canvasRef" class="detection-overlay__canvas" />
    <span class="detection-overlay__badge">{{ orientationLabel }}</span>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { detect, resetManualDetector } from '../ai/manualDetector.js'
import { getBoxCenter, getOrientation } from '../utils/geometry.js'

const props = defineProps({
  paused: {
    type: Boolean,
    default: false,
  },
})

const containerRef = ref(null)
const canvasRef = ref(null)

const orientation = ref('portrait')
let animationFrameId = null
let resizeObserver = null
let canvasWidth = 0
let canvasHeight = 0

const orientationLabel = computed(() =>
  orientation.value === 'landscape' ? 'Альбомная' : 'Портретная',
)

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

  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
}

function drawHoop(ctx, hoopDetection) {
  const { box } = hoopDetection
  const center = getBoxCenter(box)
  const rimRadius = Math.min(box.width, box.height) * 0.42

  ctx.strokeStyle = 'rgba(255, 140, 0, 0.9)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(center.x, center.y, rimRadius, rimRadius * 0.55, 0, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255, 140, 0, 0.35)'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.strokeRect(box.x, box.y, box.width, box.height)
  ctx.setLineDash([])

  ctx.fillStyle = 'rgba(255, 140, 0, 0.15)'
  ctx.fillRect(box.x, box.y, box.width, box.height)
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

function drawScene(ctx, result) {
  const hoopDetection = result.detections.find((item) => item.className === 'hoop')
  const ballDetection = result.detections.find((item) => item.className === 'ball')
  if (!hoopDetection || !ballDetection) return

  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight)
  gradient.addColorStop(0, '#1f2a44')
  gradient.addColorStop(1, '#12182b')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = 1
  const gridStep = 40
  for (let x = 0; x <= canvasWidth; x += gridStep) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvasHeight)
    ctx.stroke()
  }
  for (let y = 0; y <= canvasHeight; y += gridStep) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvasWidth, y)
    ctx.stroke()
  }

  drawTrajectory(ctx, result.ballHistory)
  drawHoop(ctx, hoopDetection)
  drawBall(ctx, ballDetection, result.ballCenter)
}

function renderFrame(timestampMs) {
  if (!canvasRef.value || canvasWidth === 0 || canvasHeight === 0) {
    animationFrameId = requestAnimationFrame(renderFrame)
    return
  }

  const result = detect({
    width: canvasWidth,
    height: canvasHeight,
    timestampMs,
    orientation: orientation.value,
    paused: props.paused,
  })

  const ctx = canvasRef.value.getContext('2d')
  if (ctx) {
    drawScene(ctx, result)
  }

  animationFrameId = requestAnimationFrame(renderFrame)
}

function startLoop() {
  stopLoop()
  animationFrameId = requestAnimationFrame(renderFrame)
}

function stopLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

onMounted(() => {
  resetManualDetector()
  syncCanvasSize()

  resizeObserver = new ResizeObserver(() => {
    syncCanvasSize()
  })

  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }

  startLoop()
})

onBeforeUnmount(() => {
  stopLoop()
  resizeObserver?.disconnect()
  resizeObserver = null
})

watch(
  () => props.paused,
  (paused) => {
    if (!paused) {
      resetManualDetector()
    }
  },
)
</script>
