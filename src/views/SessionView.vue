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
        <span class="form-field__label">Имя игрока</span>
        <input
          v-model="hooperNameInput"
          type="text"
          class="form-field__input"
          placeholder="Hooper"
          maxlength="50"
          autocomplete="nickname"
        >
      </label>

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
            Mock попадание
          </button>
          <button
            type="button"
            class="btn btn-miss btn-large"
            :disabled="!canRecordShots"
            @click="recordMiss"
          >
            Mock промах
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
import { computed, ref, watch } from 'vue'
import SessionHUD from '../components/SessionHUD.vue'
import { useActiveSession } from '../composables/useActiveSession.js'

const hooperNameInput = ref('')

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

watch(isEnded, (ended) => {
  if (ended) {
    hooperNameInput.value = session.value.hooperName
  }
})

function handleStart() {
  startSession(hooperNameInput.value)
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
