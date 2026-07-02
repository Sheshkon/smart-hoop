<template>
  <div class="page stats-page">
    <header class="page-header page-header--row">
      <router-link to="/" class="btn btn-ghost btn-small">← Назад</router-link>
      <h1 class="page-title">Статистика</h1>
    </header>

    <main class="page-content">
      <p v-if="sessionHistory.sessions.length === 0" class="placeholder-text">
        Завершённые сессии появятся здесь после окончания тренировки
      </p>

      <ul v-else class="stats-list">
        <li
          v-for="s in sessionHistory.sessions"
          :key="s.id"
          class="stats-card"
        >
          <div class="stats-card__header">
            <span class="stats-card__date">{{ formatDate(s.startedAt) }}</span>
            <span class="stats-card__duration">{{ formatDuration(s.durationMs) }}</span>
          </div>
          <div class="stats-card__grid">
            <div class="stats-card__item">
              <span class="stats-card__value">{{ s.attempts }}</span>
              <span class="stats-card__label">Бросков</span>
            </div>
            <div class="stats-card__item">
              <span class="stats-card__value stats-card__value--make">{{ s.makes }}</span>
              <span class="stats-card__label">Попадания</span>
            </div>
            <div class="stats-card__item">
              <span class="stats-card__value stats-card__value--miss">{{ s.misses }}</span>
              <span class="stats-card__label">Промахи</span>
            </div>
            <div class="stats-card__item">
              <span class="stats-card__value">{{ s.makePercentage }}%</span>
              <span class="stats-card__label">Точность</span>
            </div>
            <div class="stats-card__item">
              <span class="stats-card__value">{{ s.bestStreak }}</span>
              <span class="stats-card__label">Лучшая серия</span>
            </div>
          </div>
        </li>
      </ul>
    </main>
  </div>
</template>

<script setup>
import { sessionHistory } from '../stores/sessionHistory.js'
import { formatDate, formatDuration } from '../utils/time.js'
</script>
