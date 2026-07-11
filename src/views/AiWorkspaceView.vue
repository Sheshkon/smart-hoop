<template>
  <div class="page ai-workspace-page">
    <header class="page-header page-header--row">
      <router-link
        v-if="canLeave"
        to="/"
        class="btn btn-ghost btn-small"
      >
        ← Назад
      </router-link>
      <span v-else class="btn btn-ghost btn-small btn-ghost--disabled" aria-disabled="true">
        ← Назад
      </span>
      <h1 class="page-title">{{ pageTitle }}</h1>
      <span class="session-mode-badge">AI</span>
      <span v-if="isSessionRoute && statusLabel" class="session-status" :class="`session-status--${status}`">
        {{ statusLabel }}
      </span>
    </header>

    <main class="page-content session-content">
      <nav class="ai-workspace-tabs" aria-label="AI разделы">
        <router-link to="/ai/session" class="ai-workspace-tabs__item">
          Сессия
        </router-link>
        <router-link to="/ai/test" class="ai-workspace-tabs__item">
          Тест
        </router-link>
      </nav>

      <CameraView v-if="isSessionRoute" ref="cameraRef" scene-aligned @ready="syncVideoElement">
        <HoopSceneCanvas
          ref="sceneRef"
          mode="session"
          :paused="scenePaused"
          :auto-detect-shots="sceneAutoDetect"
          :video="videoElement"
          detector-mode="ai"
          camera-overlay
          @shot-detected="handleAutoShot"
        />
      </CameraView>

      <router-view />
    </main>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import CameraView from '../components/CameraView.vue'
import HoopSceneCanvas from '../components/HoopSceneCanvas.vue'
import { useActiveSession } from '../composables/useActiveSession.js'

const route = useRoute()
const cameraRef = ref(null)
const sceneRef = ref(null)
const videoElement = ref(null)

function syncVideoElement() {
  const exposedVideo = cameraRef.value?.videoRef
  videoElement.value = exposedVideo?.value ?? exposedVideo ?? null
}

const isSessionRoute = computed(() => route.name === 'session-ai')
const isTestRoute = computed(() => route.name === 'ai-test')

const pageTitle = computed(() => {
  if (isTestRoute.value) return 'Тест AI'
  return 'Сессия AI'
})

const {
  status,
  isActive,
  isPaused,
  isIdle,
  isEnded,
  canLeave,
  recordMake,
  recordMiss,
} = useActiveSession()

const scenePaused = computed(() => {
  return isPaused.value || isIdle.value || isEnded.value
})

const sceneAutoDetect = computed(() => isSessionRoute.value && isActive.value)

const statusLabel = computed(() => {
  const labels = {
    idle: '',
    active: 'Идёт',
    paused: 'Пауза',
    ended: 'Завершена',
  }
  return labels[status.value]
})

function handleAutoShot({ type, confidence }) {
  if (type === 'make') {
    recordMake({ source: 'ai', confidence })
  } else if (type === 'miss') {
    recordMiss({ source: 'ai', confidence })
  }
}
</script>
