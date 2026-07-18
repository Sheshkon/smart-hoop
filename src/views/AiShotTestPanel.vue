<template>
  <div class="ai-test-panel">
    <label class="ai-test-upload" :class="{ 'ai-test-upload--has-file': mediaUrl }">
      <input
        ref="fileInputRef"
        class="ai-test-upload__input"
        type="file"
        accept="video/*"
        @change="handleFileChange"
      >
      <span class="ai-test-upload__label">
        {{ mediaName || 'Выбрать видео броска' }}
      </span>
      <span class="ai-test-upload__meta">
        {{ mediaMeta || 'MP4, MOV, WebM' }}
      </span>
    </label>

    <div
      ref="mediaFrameRef"
      class="media-test-view"
      :class="{
        'media-test-view--empty': !mediaUrl,
        'media-test-view--landscape': mediaOrientation === 'landscape',
      }"
      @click="handleMediaFrameClick"
    >
      <video
        v-if="mediaUrl"
        ref="videoRef"
        class="media-test-view__media"
        :style="mediaStyle"
        :src="mediaUrl"
        controls
        controlslist="nofullscreen nodownload noremoteplayback"
        disablepictureinpicture
        disableremoteplayback
        playsinline
        muted
        preload="metadata"
        @loadedmetadata="handleVideoReady"
        @loadeddata="handleVideoReady"
        @seeked="resetShotTest"
      />

      <div v-else class="media-test-view__placeholder">
        Загрузите видео броска для проверки попадания
      </div>

      <HoopSceneCanvas
        v-if="mediaElement"
        ref="sceneRef"
        mode="session"
        :paused="false"
        auto-detect-shots
        detector-mode="ai"
        :video="mediaElement"
        camera-overlay
        show-player-boxes
        show-tracked-boxes
        @shot-detected="handleShotDetected"
        @detector-ready="handleDetectorReady"
        @detector-error="handleDetectorError"
        @fullscreen-change="handleFullscreenChange"
        @frame-result="handleFrameResult"
      />
    </div>

    <div v-if="mediaUrl" class="ai-test-result" :class="`ai-test-result--${resultTone}`">
      <p class="ai-test-result__title">{{ resultTitle }}</p>
      <p v-if="resultText" class="ai-test-result__text">{{ resultText }}</p>
      <div class="ai-test-result__items">
        <span class="ai-test-result__item">Попадания {{ makes }}</span>
        <span class="ai-test-result__item">Промахи {{ misses }}</span>
        <span v-if="lastShotLabel" class="ai-test-result__item">{{ lastShotLabel }}</span>
        <span v-if="trackingLabel" class="ai-test-result__item">{{ trackingLabel }}</span>
      </div>
      <div class="ai-test-result__actions">
        <button
          type="button"
          class="btn btn-secondary btn-small"
          :disabled="exporting || detectorState !== 'ready'"
          @click="downloadResultVideo"
        >
          {{ exporting ? 'Готовим видео…' : 'Скачать результат' }}
        </button>
      </div>
    </div>

    <p v-if="fileError" class="ai-test-panel__error" role="alert">
      {{ fileError }}
    </p>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import HoopSceneCanvas from '../components/HoopSceneCanvas.vue'
import { getOrientation } from '../utils/geometry.js'
import { getSceneViewportForOrientation } from '../utils/sceneViewport.js'

const fileInputRef = ref(null)
const mediaFrameRef = ref(null)
const videoRef = ref(null)
const sceneRef = ref(null)
const mediaUrl = ref('')
const mediaName = ref('')
const mediaElement = ref(null)
const mediaOrientation = ref('portrait')
const videoPlaying = ref(false)
const fileError = ref('')
const detectorState = ref('idle')
const detectorErrorText = ref('')
const mediaStyle = ref({})
const makes = ref(0)
const misses = ref(0)
const lastShotType = ref('')
const ballVisible = ref(false)
const hoopVisible = ref(false)
const exporting = ref(false)
let resizeObserver = null

provide('cameraFullscreenRoot', mediaFrameRef)

const mediaMeta = computed(() => {
  const video = mediaElement.value
  if (!video?.videoWidth || !video?.videoHeight) return ''
  return `${video.videoWidth}x${video.videoHeight}`
})

const lastShotLabel = computed(() => {
  if (lastShotType.value === 'make') return 'Последний: попадание'
  if (lastShotType.value === 'miss') return 'Последний: промах'
  if (lastShotType.value === 'unknown') return 'Последний: неясно'
  return ''
})

const trackingLabel = computed(() => {
  if (ballVisible.value && hoopVisible.value) return 'Мяч и кольцо видны'
  if (ballVisible.value) return 'Виден мяч'
  if (hoopVisible.value) return 'Видно кольцо'
  return ''
})

const resultTone = computed(() => {
  if (detectorState.value === 'error') return 'error'
  if (makes.value > 0) return 'success'
  if (misses.value > 0) return 'warning'
  if (ballVisible.value || hoopVisible.value) return 'success'
  return 'muted'
})

const resultTitle = computed(() => {
  if (detectorState.value === 'error') return 'AI-модель недоступна'
  if (lastShotType.value === 'make') return 'Попадание определено'
  if (lastShotType.value === 'miss') return 'Промах определён'
  if (lastShotType.value === 'unknown') return 'Недостаточно данных'
  if (detectorState.value === 'loading') return 'Загрузка AI-модели'
  if (detectorState.value === 'ready') return 'Ожидаем бросок'
  if (ballVisible.value || hoopVisible.value) return 'Трекинг активен'
  return 'Видео загружено'
})

const resultText = computed(() => {
  if (detectorState.value === 'error') return detectorErrorText.value
  if (!mediaElement.value) return 'Ожидаем готовность видео.'
  if (!ballVisible.value && !hoopVisible.value) {
    return 'Для определения броска в кадре должны появиться мяч и кольцо.'
  }
  return ''
})

function resetShotTest() {
  makes.value = 0
  misses.value = 0
  lastShotType.value = ''
}

function resetMedia() {
  if (mediaUrl.value) {
    URL.revokeObjectURL(mediaUrl.value)
  }

  mediaUrl.value = ''
  mediaName.value = ''
  mediaElement.value = null
  mediaOrientation.value = 'portrait'
  videoPlaying.value = false
  detectorState.value = 'idle'
  detectorErrorText.value = ''
  fileError.value = ''
  ballVisible.value = false
  hoopVisible.value = false
  exporting.value = false
  resetShotTest()
}

function setMediaDimensions(width, height) {
  if (!width || !height) return
  mediaOrientation.value = getOrientation(width, height)
  syncMediaLayout()
}

function syncMediaLayout() {
  const frame = mediaFrameRef.value
  if (!frame) return

  const rect = frame.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const frameOrientation = getOrientation(rect.width, rect.height)
  const viewport = getSceneViewportForOrientation(rect.width, rect.height, frameOrientation)

  mediaStyle.value = {
    left: `${viewport.offsetX}px`,
    top: `${viewport.offsetY}px`,
    width: `${viewport.renderWidth}px`,
    height: `${viewport.renderHeight}px`,
  }
}

function scheduleMediaLayoutSync() {
  nextTick(() => {
    syncMediaLayout()
    requestAnimationFrame(() => {
      syncMediaLayout()
      requestAnimationFrame(syncMediaLayout)
    })
  })
}

function handleFileChange(event) {
  const [file] = event.target.files ?? []
  resetMedia()

  if (!file) return

  if (!file.type.startsWith('video/')) {
    fileError.value = 'Выберите видео броска.'
    if (fileInputRef.value) fileInputRef.value.value = ''
    return
  }

  mediaUrl.value = URL.createObjectURL(file)
  mediaName.value = file.name
  detectorState.value = 'loading'
}

async function handleVideoReady() {
  await nextTick()
  const video = videoRef.value
  if (!video) return

  setMediaDimensions(video.videoWidth, video.videoHeight)
  mediaElement.value = video
  videoPlaying.value = !video.paused

  video.onplay = () => {
    videoPlaying.value = true
  }
  video.onpause = () => {
    videoPlaying.value = false
  }
  video.onended = () => {
    videoPlaying.value = false
  }
}

async function togglePlayback() {
  const video = videoRef.value
  if (!video) return

  if (video.paused) {
    await video.play()
  } else {
    video.pause()
  }
}

function handleMediaFrameClick(event) {
  if (event.target.closest?.('.detection-overlay__fullscreen-btn')) return
  togglePlayback()
}

function handleFullscreenChange() {
  scheduleMediaLayoutSync()
}

function handleDetectorReady() {
  detectorState.value = 'ready'
  detectorErrorText.value = ''
}

function handleDetectorError({ message }) {
  detectorState.value = 'error'
  detectorErrorText.value = message || 'Не удалось загрузить или выполнить AI-модель.'
}

function handleFrameResult({ ballCenter, hoopBox }) {
  ballVisible.value = Boolean(ballCenter)
  hoopVisible.value = Boolean(hoopBox)
}

function handleShotDetected({ type }) {
  lastShotType.value = type
  if (type === 'make') {
    makes.value += 1
  } else if (type === 'miss') {
    misses.value += 1
  }
}

function getSupportedRecordingType() {
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]

  return types.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

function waitForVideoEvent(video, eventName) {
  return new Promise((resolve) => {
    video.addEventListener(eventName, resolve, { once: true })
  })
}

function drawCoverVideo(ctx, video, width, height) {
  const videoRatio = video.videoWidth / video.videoHeight
  const canvasRatio = width / height
  let sx = 0
  let sy = 0
  let sw = video.videoWidth
  let sh = video.videoHeight

  if (videoRatio > canvasRatio) {
    sw = video.videoHeight * canvasRatio
    sx = (video.videoWidth - sw) / 2
  } else {
    sh = video.videoWidth / canvasRatio
    sy = (video.videoHeight - sh) / 2
  }

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height)
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function downloadResultVideo() {
  const video = videoRef.value
  const overlayCanvas = sceneRef.value?.getOverlayCanvas?.()

  if (!video || !overlayCanvas) return
  if (!('MediaRecorder' in window) || !HTMLCanvasElement.prototype.captureStream) {
    fileError.value = 'Браузер не поддерживает запись результата.'
    return
  }

  exporting.value = true
  fileError.value = ''

  const wasPaused = video.paused
  const previousTime = video.currentTime
  const exportCanvas = document.createElement('canvas')
  exportCanvas.width = overlayCanvas.width
  exportCanvas.height = overlayCanvas.height
  const ctx = exportCanvas.getContext('2d')

  if (!ctx) {
    exporting.value = false
    fileError.value = 'Не удалось подготовить canvas для записи.'
    return
  }

  const chunks = []
  const mimeType = getSupportedRecordingType()
  const stream = exportCanvas.captureStream(30)
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  let frameId = null

  const drawFrame = () => {
    ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height)
    drawCoverVideo(ctx, video, exportCanvas.width, exportCanvas.height)
    ctx.drawImage(overlayCanvas, 0, 0, exportCanvas.width, exportCanvas.height)
    frameId = requestAnimationFrame(drawFrame)
  }

  try {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }

    const stopped = new Promise((resolve) => {
      recorder.onstop = resolve
    })

    resetShotTest()
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForVideoEvent(video, 'loadeddata')
    }
    if (Math.abs(video.currentTime) > 0.01) {
      const seeked = waitForVideoEvent(video, 'seeked')
      video.currentTime = 0
      await seeked
    } else {
      video.currentTime = 0
    }

    drawFrame()
    recorder.start(250)
    await video.play()
    await waitForVideoEvent(video, 'ended')
    recorder.stop()
    await stopped

    downloadBlob(
      new Blob(chunks, { type: mimeType || 'video/webm' }),
      `${mediaName.value.replace(/\.[^.]+$/, '') || 'smart-hoop-result'}.webm`,
    )
  } catch (err) {
    fileError.value = err instanceof Error ? err.message : 'Не удалось скачать результат.'
    if (recorder.state !== 'inactive') recorder.stop()
  } finally {
    if (frameId != null) cancelAnimationFrame(frameId)
    for (const track of stream.getTracks()) track.stop()
    video.currentTime = previousTime
    if (!wasPaused) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
    exporting.value = false
  }
}

onMounted(() => {
  if (mediaFrameRef.value) {
    resizeObserver = new ResizeObserver(syncMediaLayout)
    resizeObserver.observe(mediaFrameRef.value)
  }
  window.addEventListener('resize', syncMediaLayout)
  window.addEventListener('orientationchange', syncMediaLayout)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', syncMediaLayout)
  window.removeEventListener('orientationchange', syncMediaLayout)
  resetMedia()
})
</script>
