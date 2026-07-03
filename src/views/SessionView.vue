<template>
  <div class="page session-page">
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
      <h1 class="page-title">Сессия</h1>
      <span v-if="statusLabel" class="session-status" :class="`session-status--${status}`">
        {{ statusLabel }}
      </span>
    </header>

    <main class="page-content session-content">
      <label v-if="isIdle || isEnded" class="form-field">
        <span class="form-field__label">Название сессии</span>
        <input
          v-model="titleInput"
          type="text"
          class="form-field__input"
          placeholder="Тренировка"
          maxlength="80"
          autocomplete="off"
        >
      </label>

      <label v-if="isIdle || isEnded" class="form-field">
        <span class="form-field__label">Имя игрока</span>
        <input
          v-model="hooperNameInput"
          type="text"
          class="form-field__input"
          placeholder="Игрок"
          maxlength="50"
          autocomplete="nickname"
        >
      </label>

      <label v-if="isIdle || isEnded" class="form-field">
        <span class="form-field__label">Описание</span>
        <textarea
          v-model="descriptionInput"
          class="form-field__input form-field__textarea"
          placeholder="Например: свободные броски, командная тренировка"
          maxlength="200"
          rows="2"
        />
      </label>

      <SessionTagsInput
        v-if="isIdle || isEnded"
        v-model="tagsInput"
        class="form-field--tags"
      />

      <SessionHUD :session="session" />

      <div class="session-controls">
        <div class="session-controls__row">
          <button
            v-if="isIdle || isEnded"
            type="button"
            class="btn btn-primary btn-large"
            @click="handleStart"
          >
            Старт
          </button>

          <button
            v-if="isPaused"
            type="button"
            class="btn btn-primary btn-large"
            @click="startSession"
          >
            Продолжить
          </button>

          <button
            v-if="isActive"
            type="button"
            class="btn btn-secondary btn-large"
            @click="pauseSession"
          >
            Пауза
          </button>

          <button
            type="button"
            class="btn btn-secondary btn-large"
            :disabled="!canEnd"
            @click="endSession"
          >
            Завершить
          </button>
        </div>

        <div class="session-controls__row session-controls__row--shots">
          <button
            type="button"
            class="btn btn-make btn-large"
            :disabled="!canRecordShots"
            @click="recordMake"
          >
            Попадание
          </button>
          <button
            type="button"
            class="btn btn-miss btn-large"
            :disabled="!canRecordShots"
            @click="recordMiss"
          >
            Промах
          </button>
        </div>
      </div>

      <p v-if="isInProgress" class="session-lock-msg">
        Чтобы выйти, сначала завершите сессию
      </p>

      <p v-if="isEnded" class="session-ended-msg">
        Сессия завершена и сохранена в истории.
        <router-link to="/stats" class="session-ended-link">Посмотреть статистику →</router-link>
      </p>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import SessionHUD from '../components/SessionHUD.vue'
import SessionTagsInput from '../components/SessionTagsInput.vue'
import { useActiveSession } from '../composables/useActiveSession.js'
import { VolumeButtons } from '../plugins/volume-buttons.js'
import { loadSessionFormDraft, saveSessionFormDraft } from '../storage/sessionFormDraft.js'

const titleInput = ref('')
const hooperNameInput = ref('')
const descriptionInput = ref('')
const tagsInput = ref([])

let volumeListener = null

const {
  status,
  session,
  isActive,
  isPaused,
  isIdle,
  isEnded,
  isInProgress,
  canRecordShots,
  canEnd,
  canLeave,
  startSession,
  pauseSession,
  endSession,
  recordMake,
  recordMiss,
} = useActiveSession()

function applyFormDraft(draft) {
  titleInput.value = draft.title
  hooperNameInput.value = draft.hooperName
  descriptionInput.value = draft.description
  tagsInput.value = [...draft.tags]
}

function persistFormDraft() {
  saveSessionFormDraft({
    title: titleInput.value,
    hooperName: hooperNameInput.value,
    description: descriptionInput.value,
    tags: tagsInput.value,
  })
}

onMounted(async () => {
  if (isIdle.value || isEnded.value) {
    applyFormDraft(loadSessionFormDraft())
  }

  if (!Capacitor.isNativePlatform()) {
    return
  }

  volumeListener = await VolumeButtons.addListener('volumeButton', (event) => {
    if (event.action === 'hit') {
      recordMake()
    }

    if (event.action === 'miss') {
      recordMiss()
    }
  })
})

onBeforeUnmount(() => {
  if (volumeListener) {
    volumeListener.remove()
    volumeListener = null
  }
})

watch([titleInput, hooperNameInput, descriptionInput, tagsInput], persistFormDraft, { deep: true })

watch(isEnded, (ended) => {
  if (ended) {
    titleInput.value = session.value.title || ''
    hooperNameInput.value = session.value.hooperName
    descriptionInput.value = session.value.description
    tagsInput.value = [...(session.value.tags || [])]
    persistFormDraft()
  }
})

function handleStart() {
  startSession({
    title: titleInput.value,
    hooperName: hooperNameInput.value,
    description: descriptionInput.value,
    tags: tagsInput.value,
  })
  persistFormDraft()
}

const statusLabel = computed(() => {
  const labels = {
    idle: '',
    active: 'Идёт',
    paused: 'Пауза',
    ended: 'Завершена',
  }
  return labels[status.value]
})
</script>
