<template>
  <div class="ai-test-panel">
    <label class="ai-test-upload" :class="{ 'ai-test-upload--has-file': mediaUrl }">
      <input
        ref="fileInputRef"
        class="ai-test-upload__input"
        type="file"
        accept="video/*,image/*"
        @change="handleFileChange"
      >
      <span class="ai-test-upload__label">
        {{ mediaName || 'Выбрать видео или фото' }}
      </span>
      <span class="ai-test-upload__meta">
        {{ mediaMeta || 'MP4, MOV, WebM, JPG, PNG' }}
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
        v-if="mediaType === 'video'"
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
      />

      <img
        v-else-if="mediaType === 'image'"
        ref="imageRef"
        class="media-test-view__media"
        :style="mediaStyle"
        :src="mediaUrl"
        alt=""
        @load="handleImageReady"
      >

      <div v-else class="media-test-view__placeholder">
        Загрузите файл для проверки AI-детектора
      </div>

      <HoopSceneCanvas
        v-if="mediaElement"
        ref="sceneRef"
        mode="session"
        :paused="false"
        :auto-detect-shots="false"
        detector-mode="ai"
        :video="mediaElement"
        camera-overlay
        show-detection-boxes
        :detection-box-min-confidence="TEST_DETECTION_MIN_CONFIDENCE"
        @detector-ready="handleDetectorReady"
        @detector-error="handleDetectorError"
        @fullscreen-change="handleFullscreenChange"
        @frame-result="handleFrameResult"
      />
    </div>

    <div v-if="mediaUrl" class="ai-test-result" :class="`ai-test-result--${resultTone}`">
      <p class="ai-test-result__title">{{ resultTitle }}</p>
      <p v-if="resultText" class="ai-test-result__text">{{ resultText }}</p>
      <div v-if="detectedItems.length" class="ai-test-result__items">
        <span
          v-for="item in detectedItems"
          :key="item.key"
          class="ai-test-result__item"
        >
          {{ item.label }} {{ item.confidence }}%
        </span>
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
const sceneRef = ref(null)
const videoRef = ref(null)
const imageRef = ref(null)
const mediaUrl = ref('')
const mediaName = ref('')
const mediaType = ref('')
const mediaElement = ref(null)
const mediaOrientation = ref('portrait')
const videoPlaying = ref(false)
const fileError = ref('')
const detectorState = ref('idle')
const detectorErrorText = ref('')
const detectedItems = ref([])
const mediaStyle = ref({})
const TEST_DETECTION_MIN_CONFIDENCE = 0.15
let resizeObserver = null

provide('cameraFullscreenRoot', mediaFrameRef)

const mediaMeta = computed(() => {
  if (!mediaElement.value) return ''

  if (mediaType.value === 'video') {
    const video = mediaElement.value
    if (!video.videoWidth || !video.videoHeight) return 'Видео'
    return `${video.videoWidth}×${video.videoHeight}`
  }

  if (mediaType.value === 'image') {
    const image = mediaElement.value
    if (!image.naturalWidth || !image.naturalHeight) return 'Фото'
    return `${image.naturalWidth}×${image.naturalHeight}`
  }

  return ''
})

function resetMedia() {
  if (mediaUrl.value) {
    URL.revokeObjectURL(mediaUrl.value)
  }

  mediaUrl.value = ''
  mediaName.value = ''
  mediaType.value = ''
  mediaElement.value = null
  mediaOrientation.value = 'portrait'
  videoPlaying.value = false
  detectorState.value = 'idle'
  detectorErrorText.value = ''
  detectedItems.value = []
}

const resultTone = computed(() => {
  if (detectorState.value === 'error') return 'error'
  if (detectorState.value === 'detected') return 'success'
  if (detectorState.value === 'empty') return 'warning'
  return 'muted'
})

const resultTitle = computed(() => {
  const titles = {
    idle: 'Файл загружен',
    loading: 'Загрузка AI-модели',
    ready: 'Модель готова',
    processing: 'Обработка кадра',
    detected: 'Объекты найдены',
    empty: 'Ничего не найдено',
    error: 'AI-модель недоступна',
  }

  return titles[detectorState.value] ?? titles.idle
})

const resultText = computed(() => {
  if (detectorState.value === 'error') return detectorErrorText.value
  if (detectorState.value === 'idle') return 'Ожидаем готовность модели.'
  if (detectorState.value === 'ready') return 'Первый кадр скоро будет обработан.'
  if (detectorState.value === 'processing') return 'Детектор анализирует загруженный файл.'
  if (detectorState.value === 'empty') {
    return 'В кадре нет мяча или кольца выше текущих порогов уверенности.'
  }
  return ''
})

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

  const viewport = getSceneViewportForOrientation(
    rect.width,
    rect.height,
    frameOrientation,
  )

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
  fileError.value = ''
  resetMedia()

  if (!file) return

  const isVideo = file.type.startsWith('video/')
  const isImage = file.type.startsWith('image/')

  if (!isVideo && !isImage) {
    fileError.value = 'Выберите видео или изображение.'
    if (fileInputRef.value) fileInputRef.value.value = ''
    return
  }

  mediaUrl.value = URL.createObjectURL(file)
  mediaName.value = file.name
  mediaType.value = isVideo ? 'video' : 'image'
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

async function handleImageReady() {
  await nextTick()
  const image = imageRef.value
  if (!image) return

  setMediaDimensions(image.naturalWidth, image.naturalHeight)
  mediaElement.value = image
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
  if (mediaType.value !== 'video') return
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

function formatDetection(item, index) {
  const labels = {
    ball: 'Мяч',
    hoop: 'Кольцо',
    person: 'Игрок',
    pose: 'Поза',
  }
  const role = item.appClass ?? item.className

  return {
    key: `${item.className}-${index}`,
    label: labels[role] ?? item.displayLabel ?? item.modelClassName ?? item.className,
    confidence: Math.round((item.confidence ?? 0) * 100),
  }
}

function handleFrameResult({ detections, poses = [] }) {
  const objectItems = detections
    .filter(
      (item) =>
        (item.confidence ?? 0) >= TEST_DETECTION_MIN_CONFIDENCE,
    )
    .map(formatDetection)

  const poseItems = poses.map((pose, index) =>
    formatDetection({
      className: 'pose',
      confidence: pose.confidence,
    }, index),
  )

  detectedItems.value = [...objectItems, ...poseItems]

  detectorState.value = detectedItems.value.length > 0 ? 'detected' : 'empty'
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  resetMedia()
})

onMounted(() => {
  if (mediaFrameRef.value) {
    resizeObserver = new ResizeObserver(syncMediaLayout)
    resizeObserver.observe(mediaFrameRef.value)
  }
  window.addEventListener('resize', syncMediaLayout)
  window.addEventListener('orientationchange', syncMediaLayout)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncMediaLayout)
  window.removeEventListener('orientationchange', syncMediaLayout)
})
</script>
