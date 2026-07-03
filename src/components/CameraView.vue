<template>
  <div
    ref="containerRef"
    class="camera-view"
    :class="{ 'camera-view--landscape': orientation === 'landscape' }"
  >
    <video
      v-show="!error"
      ref="videoRef"
      class="camera-view__video"
      autoplay
      playsinline
      muted
    />

    <div class="camera-view__overlay-slot">
      <slot />
    </div>

    <p v-if="loading" class="camera-view__status camera-view__loading">Открываем камеру…</p>

    <div v-if="error" class="camera-view__error" role="alert">
      <p class="camera-view__error-title">Камера недоступна</p>
      <p class="camera-view__error-text">{{ error }}</p>
      <button type="button" class="btn btn-secondary btn-small" @click="retry">
        Повторить
      </button>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { attachStreamToVideo, closeCamera, openCamera } from '../media/camera.js'
import { getOrientation } from '../utils/geometry.js'
import { getSceneViewportForOrientation } from '../utils/sceneViewport.js'

const props = defineProps({
  sceneAligned: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['ready', 'error'])

const containerRef = ref(null)
const videoRef = ref(null)
const loading = ref(true)
const error = ref('')
const orientation = ref('portrait')

let stream = null
let resizeObserver = null

provide('cameraFullscreenRoot', containerRef)

function syncOrientation() {
  const el = containerRef.value
  if (!el) return

  const rect = el.getBoundingClientRect()
  orientation.value = getOrientation(rect.width, rect.height)
  syncVideoLayout()
}

function syncVideoLayout() {
  const video = videoRef.value
  const container = containerRef.value
  if (!video || !container) return

  if (!props.sceneAligned) {
    video.style.position = ''
    video.style.left = ''
    video.style.top = ''
    video.style.width = ''
    video.style.height = ''
    video.style.objectFit = 'cover'
    return
  }

  const rect = container.getBoundingClientRect()
  const viewport = getSceneViewportForOrientation(rect.width, rect.height, orientation.value)

  video.style.position = 'absolute'
  video.style.left = `${viewport.offsetX}px`
  video.style.top = `${viewport.offsetY}px`
  video.style.width = `${viewport.renderWidth}px`
  video.style.height = `${viewport.renderHeight}px`
  video.style.objectFit = 'cover'
}

async function startCamera() {
  loading.value = true
  error.value = ''

  closeCamera(stream)
  stream = null

  try {
    const result = await openCamera()
    stream = result.stream

    if (videoRef.value) {
      await attachStreamToVideo(videoRef.value, stream)
    }

    loading.value = false
    syncOrientation()
    emit('ready')
  } catch (err) {
    loading.value = false
    error.value = err?.message || 'Не удалось открыть камеру.'
    console.error('Camera error:', err)
    emit('error', err)
  }
}

function retry() {
  startCamera()
}

watch(() => props.sceneAligned, syncVideoLayout)

onMounted(() => {
  syncOrientation()
  window.addEventListener('resize', syncOrientation)
  window.addEventListener('orientationchange', syncOrientation)

  if (containerRef.value) {
    resizeObserver = new ResizeObserver(syncOrientation)
    resizeObserver.observe(containerRef.value)
  }

  startCamera()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncOrientation)
  window.removeEventListener('orientationchange', syncOrientation)
  resizeObserver?.disconnect()
  resizeObserver = null
  closeCamera(stream)
  stream = null

  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
})

defineExpose({
  containerRef,
  videoRef,
  getStream: () => stream,
  retry,
})
</script>
