<template>
  <div class="ai-session-panel">
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
    </div>

    <p v-if="isInProgress" class="session-lock-msg">
      Чтобы выйти, сначала завершите сессию
    </p>

    <p v-if="isEnded" class="session-ended-msg">
      Сессия завершена и сохранена в истории.
      <router-link to="/stats" class="session-ended-link">Посмотреть статистику →</router-link>
    </p>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import SessionHUD from '../components/SessionHUD.vue'
import SessionTagsInput from '../components/SessionTagsInput.vue'
import { useActiveSession } from '../composables/useActiveSession.js'
import { loadSessionFormDraft, saveSessionFormDraft } from '../storage/sessionFormDraft.js'
import { normalizeTags } from '../utils/sessionTags.js'

const titleInput = ref('')
const hooperNameInput = ref('')
const descriptionInput = ref('')
const tagsInput = ref([])

const {
  session,
  isActive,
  isPaused,
  isIdle,
  isEnded,
  isInProgress,
  canEnd,
  startSession,
  pauseSession,
  endSession,
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
  }, 'ai')
}

onMounted(() => {
  if (isIdle.value || isEnded.value) {
    applyFormDraft(loadSessionFormDraft('ai'))
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
    tags: normalizeTags(['ai', ...tagsInput.value]),
    mode: 'ai',
  })
  persistFormDraft()
}
</script>
