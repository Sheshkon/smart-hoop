<template>
  <div class="page home-page">
    <header class="page-header">
      <h1 class="app-title">Smart Hoop</h1>
      <p class="app-subtitle">Тренировка бросков</p>
    </header>

    <nav class="home-nav">
      <div class="home-session-picker">
        <button
          v-if="!showSessionModes"
          type="button"
          class="btn btn-primary btn-large"
          @click="showSessionModes = true"
        >
          Новая сессия
        </button>

        <template v-else>
          <router-link to="/session/manual" class="btn btn-primary btn-large home-session-picker__mode">
            Ручной
          </router-link>
          <router-link to="/ai/session" class="btn btn-secondary btn-large home-session-picker__mode">
            AI
          </router-link>
          <button
            type="button"
            class="btn btn-ghost btn-small home-session-picker__cancel"
            @click="showSessionModes = false"
          >
            Отмена
          </button>
        </template>
      </div>
      <router-link to="/stats" class="btn btn-secondary btn-large">
        Статистика
      </router-link>
      <router-link to="/settings" class="btn btn-secondary btn-large">
        Настройки
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const showSessionModes = ref(false)
</script>
