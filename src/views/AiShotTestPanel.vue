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
