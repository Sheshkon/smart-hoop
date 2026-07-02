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

      <template v-else>
        <div class="stats-toolbar">
          <template v-if="sessionHistory.sessions.length > 0">
            <button
              type="button"
              class="btn btn-secondary btn-small"
              :class="{ 'stats-toolbar__filters-btn--active': hasActiveFilters }"
              :aria-expanded="showFilters"
              @click="showFilters = !showFilters"
            >
              {{ showFilters ? 'Скрыть фильтры' : 'Фильтры' }}
              <span v-if="hasActiveFilters && !showFilters" class="stats-toolbar__badge" aria-hidden="true" />
            </button>
            <button type="button" class="btn btn-secondary btn-small" @click="handleExportJson">
              Экспорт JSON
            </button>
            <button type="button" class="btn btn-secondary btn-small" @click="handleExportCsv">
              Экспорт CSV
            </button>
          </template>
          <button type="button" class="btn btn-secondary btn-small" @click="triggerImport">
            Импорт JSON
          </button>
          <input
            ref="importInputRef"
            type="file"
            accept=".json,application/json"
            class="stats-import-input"
            @change="handleImport"
          >
        </div>

        <div v-if="sessionHistory.sessions.length > 0 && showFilters" class="stats-filters">
          <label class="form-field stats-filters__field stats-filters__field--grow">
            <span class="form-field__label">Поиск по имени</span>
            <input
              v-model="searchQuery"
              type="search"
              class="form-field__input"
              placeholder="Имя игрока"
              autocomplete="off"
            >
          </label>

          <label class="form-field stats-filters__field">
            <span class="form-field__label">С даты</span>
            <input v-model="dateFrom" type="date" class="form-field__input">
          </label>

          <label class="form-field stats-filters__field">
            <span class="form-field__label">По дату</span>
            <input v-model="dateTo" type="date" class="form-field__input">
          </label>

          <label class="form-field stats-filters__field">
            <span class="form-field__label">Сортировка</span>
            <select v-model="sortOrder" class="form-field__input">
              <option value="newest">Сначала новые</option>
              <option value="oldest">Сначала старые</option>
            </select>
          </label>

          <label class="form-field stats-filters__field">
            <span class="form-field__label">На странице</span>
            <select v-model.number="pageSize" class="form-field__input">
              <option :value="5">5</option>
              <option :value="10">10</option>
              <option :value="20">20</option>
            </select>
          </label>

          <button
            v-if="hasActiveFilters"
            type="button"
            class="btn btn-ghost btn-small stats-filters__reset"
            @click="resetFilters"
          >
            Сбросить фильтры
          </button>
        </div>

        <p v-if="sessionHistory.sessions.length === 0" class="placeholder-text">
          Завершённые сессии появятся здесь после окончания тренировки или импорта из JSON
        </p>

        <p v-else-if="filteredSessions.length === 0" class="placeholder-text">
          Ничего не найдено. Попробуйте изменить фильтры.
        </p>

        <template v-else>
          <p class="stats-summary">
            Показано {{ rangeStart }}–{{ rangeEnd }} из {{ filteredSessions.length }}
            <span v-if="hasActiveFilters">(всего {{ sessionHistory.sessions.length }})</span>
          </p>

          <ul class="stats-list">
            <li
              v-for="s in paginatedSessions"
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

          <nav v-if="totalPages > 1" class="stats-pagination" aria-label="Навигация по страницам">
            <button
              type="button"
              class="btn btn-secondary btn-small"
              :disabled="currentPage <= 1"
              @click="currentPage--"
            >
              ← Назад
            </button>
            <span class="stats-pagination__info">
              {{ currentPage }} / {{ totalPages }}
            </span>
            <button
              type="button"
              class="btn btn-secondary btn-small"
              :disabled="currentPage >= totalPages"
              @click="currentPage++"
            >
              Вперёд →
            </button>
          </nav>
        </template>

        <button
          v-if="sessionHistory.sessions.length > 0"
          type="button"
          class="btn btn-secondary btn-large stats-clear-btn"
          @click="handleClearAll"
        >
          Очистить историю
        </button>
      </template>
    </main>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  sessionHistory,
  removeSession,
  clearSessionHistory,
  importSessions,
} from '../stores/sessionHistory.js'
import { formatDate, formatDuration } from '../utils/time.js'
import {
  downloadTextFile,
  exportFilename,
  parseSessionsImport,
  sessionsToCsv,
  sessionsToJson,
} from '../utils/sessionsIo.js'

const searchQuery = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const sortOrder = ref('newest')
const pageSize = ref(10)
const currentPage = ref(1)
const showFilters = ref(false)
const importInputRef = ref(null)

const hasActiveFilters = computed(
  () => Boolean(searchQuery.value.trim() || dateFrom.value || dateTo.value),
)

const filteredSessions = computed(() => {
  let list = [...sessionHistory.sessions]
  const query = searchQuery.value.trim().toLowerCase()

  if (query) {
    list = list.filter((session) => (session.hooperName || '').toLowerCase().includes(query))
  }

  if (dateFrom.value) {
    const from = new Date(`${dateFrom.value}T00:00:00`).getTime()
    list = list.filter((session) => new Date(session.startedAt).getTime() >= from)
  }

  if (dateTo.value) {
    const to = new Date(`${dateTo.value}T23:59:59.999`).getTime()
    list = list.filter((session) => new Date(session.startedAt).getTime() <= to)
  }

  list.sort((a, b) => {
    const diff = new Date(b.startedAt) - new Date(a.startedAt)
    return sortOrder.value === 'newest' ? diff : -diff
  })

  return list
})

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredSessions.value.length / pageSize.value)),
)

const paginatedSessions = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredSessions.value.slice(start, start + pageSize.value)
})

const rangeStart = computed(() => {
  if (filteredSessions.value.length === 0) return 0
  return (currentPage.value - 1) * pageSize.value + 1
})

const rangeEnd = computed(() =>
  Math.min(currentPage.value * pageSize.value, filteredSessions.value.length),
)

watch([searchQuery, dateFrom, dateTo, sortOrder, pageSize], () => {
  currentPage.value = 1
})

watch(totalPages, (pages) => {
  if (currentPage.value > pages) {
    currentPage.value = pages
  }
})

function resetFilters() {
  searchQuery.value = ''
  dateFrom.value = ''
  dateTo.value = ''
  sortOrder.value = 'newest'
  currentPage.value = 1
}

function getExportSessions() {
  return hasActiveFilters.value ? filteredSessions.value : sessionHistory.sessions
}

function handleExportJson() {
  const sessions = getExportSessions()
  if (sessions.length === 0) return

  downloadTextFile(
    sessionsToJson(sessions),
    exportFilename('json'),
    'application/json',
  )
}

function handleExportCsv() {
  const sessions = getExportSessions()
  if (sessions.length === 0) return

  downloadTextFile(
    sessionsToCsv(sessions),
    exportFilename('csv'),
    'text/csv;charset=utf-8',
  )
}

function triggerImport() {
  importInputRef.value?.click()
}

async function handleImport(event) {
  const file = event.target.files?.[0]
  event.target.value = ''

  if (!file) return

  try {
    const text = await file.text()
    const sessions = parseSessionsImport(text)
    const { imported, skipped } = await importSessions(sessions)

    window.alert(
      imported > 0
        ? `Импортировано сессий: ${imported}${skipped > 0 ? `, пропущено дубликатов: ${skipped}` : ''}`
        : 'Новых сессий не найдено — все уже есть в истории',
    )
  } catch (err) {
    console.error('Failed to import sessions:', err)
    window.alert(err instanceof Error ? err.message : 'Не удалось импортировать файл')
  }
}

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
    resetFilters()
  } catch (err) {
    console.error('Failed to clear session history:', err)
    window.alert('Не удалось очистить историю')
  }
}
</script>
