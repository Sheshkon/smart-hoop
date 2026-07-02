<template>
  <div class="page stats-page">
    <header class="page-header page-header--row">
      <router-link to="/" class="btn btn-ghost btn-small">← Назад</router-link>
      <h1 class="page-title">Статистика</h1>
    </header>

    <main class="page-content">
      <p v-if="!sessionHistory.loaded" class="placeholder-text">
        Загрузка истории…
      </p>

      <p v-else-if="sessionHistory.sessions.length === 0" class="placeholder-text">
        Завершённые сессии появятся здесь после окончания тренировки
      </p>

      <ul v-else class="stats-list">
        <li
          v-for="s in sessionHistory.sessions"
          :key="s.id"
          class="stats-card"
        >
          <div class="stats-card__header">
            <div class="stats-card__meta">
              <span v-if="s.hooperName" class="stats-card__hooper">{{ s.hooperName }}</span>
              <span class="stats-card__date">{{ formatDate(s.startedAt) }}</span>
            </div>
            <div class="stats-card__actions">
              <span class="stats-card__duration">{{ formatDuration(s.durationMs) }}</span>
              <button
                type="button"
                class="btn btn-ghost btn-small stats-card__delete"
                aria-label="Удалить сессию"
                @click="handleDelete(s)"
              >
                Удалить
              </button>
            </div>
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

      <button
        v-if="sessionHistory.loaded && sessionHistory.sessions.length > 0"
        type="button"
        class="btn btn-secondary btn-large stats-clear-btn"
        @click="handleClearAll"
      >
        Очистить историю
      </button>
    </main>
  </div>
</template>

<script setup>
import { sessionHistory, removeSession, clearSessionHistory } from '../stores/sessionHistory.js'
import { formatDate, formatDuration } from '../utils/time.js'

async function handleDelete(session) {
  const label = session.hooperName || formatDate(session.startedAt)
  if (!window.confirm(`Удалить сессию «${label}»?`)) return

  try {
    await removeSession(session.id)
  } catch (err) {
    console.error('Failed to delete session:', err)
    window.alert('Не удалось удалить сессию')
  }
}

async function handleClearAll() {
  if (!window.confirm('Удалить всю историю тренировок? Это действие нельзя отменить.')) return

  try {
    await clearSessionHistory()
  } catch (err) {
    console.error('Failed to clear session history:', err)
    window.alert('Не удалось очистить историю')
  }
}
</script>
