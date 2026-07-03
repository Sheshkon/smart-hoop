<template>
  <div class="ai-calibration-panel calibration-content">
    <p class="calibration-hint">
      Наведите рамку на кольцо в кадре камеры. Перетащите и измените размер за углы. Калибровка сохраняется для портретной и альбомной сессии.
    </p>

    <div class="session-controls">
      <div class="session-controls__row">
        <button type="button" class="btn btn-secondary btn-large" @click="resetBox">
          Сбросить
        </button>
        <button type="button" class="btn btn-primary btn-large" @click="confirm">
          Готово
        </button>
      </div>
    </div>

    <p v-if="savedMessage" class="calibration-saved">{{ savedMessage }}</p>
  </div>
</template>

<script setup>
import { inject, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const hoopSceneRef = inject('hoopSceneRef', null)
const savedMessage = ref('')

function resetBox() {
  hoopSceneRef?.value?.resetCalibration()
  savedMessage.value = ''
}

function confirm() {
  hoopSceneRef?.value?.confirmCalibration()
  savedMessage.value = 'Калибровка сохранена'
  setTimeout(() => {
    router.push('/ai/session')
  }, 400)
}
</script>
