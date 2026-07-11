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
            <span class="form-field__label">Поиск</span>
            <input
              v-model="searchQuery"
              type="search"
              class="form-field__input"
              placeholder="Название, имя, описание или #тег"
              autocomplete="off"
            >
          </label>

          <div
            v-if="availableFilterTags.length > 0"
            class="stats-filters__field stats-filters__field--grow stats-filters__tags"
          >
            <span class="form-field__label">Теги</span>
            <div class="session-tags__chips">
              <button
                v-for="tag in availableFilterTags"
                :key="tag"
                type="button"
                class="session-tags__chip"
                :class="{ 'session-tags__chip--active': isTagFilterActive(tag) }"
                @click="toggleTagFilter(tag)"
              >
                {{ formatTagLabel(tag) }}
              </button>
            </div>
          </div>

          <div class="stats-filters__dates">
            <label class="form-field stats-filters__field stats-filters__field--date">
              <span class="form-field__label">С даты</span>
              <span class="stats-filters__date-wrap" @click="openDatePicker">
                <input v-model="dateFrom" type="date" class="form-field__input form-field__input--date">
              </span>
            </label>

            <label class="form-field stats-filters__field stats-filters__field--date">
              <span class="form-field__label">По дату</span>
              <span class="stats-filters__date-wrap" @click="openDatePicker">
                <input v-model="dateTo" type="date" class="form-field__input form-field__input--date">
              </span>
            </label>
          </div>

          <div class="stats-filters__row">
            <label class="form-field stats-filters__field">
              <span class="form-field__label">Сортировка</span>
              <select v-model="sortOrder" class="form-field__input">
                <option value="newest">Новые</option>
                <option value="oldest">Старые</option>
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
          </div>

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
          <div class="stats-tabs" role="tablist" aria-label="Разделы статистики">
            <button
              type="button"
              class="stats-tabs__button"
              :class="{ 'stats-tabs__button--active': activeStatsTab === 'sessions' }"
              role="tab"
              :aria-selected="activeStatsTab === 'sessions'"
              aria-controls="stats-sessions-panel"
              @click="activeStatsTab = 'sessions'"
            >
              История тренировок
            </button>
            <button
              type="button"
              class="stats-tabs__button"
              :class="{ 'stats-tabs__button--active': activeStatsTab === 'players' }"
              role="tab"
              :aria-selected="activeStatsTab === 'players'"
              aria-controls="stats-players-panel"
              @click="activeStatsTab = 'players'"
            >
              Сводка по игрокам
            </button>
          </div>

          <section
            v-if="activeStatsTab === 'players'"
            id="stats-players-panel"
            class="player-stats"
            role="tabpanel"
            aria-labelledby="player-stats-title"
          >
            <div class="player-stats__header">
              <h2 id="player-stats-title" class="player-stats__title">Статистика по игрокам</h2>
              <span class="player-stats__meta">
                Игроков: {{ playerStatsRows.length }} · Сессий: {{ filteredSessions.length }}
              </span>
            </div>

            <div class="player-stats__table-wrap">
              <table class="player-stats__table">
                <tbody>
                  <template v-for="row in playerStatsRows" :key="row.key">
                    <tr class="player-stats__player-row">
                      <th colspan="2" scope="rowgroup">
                        <span class="player-stats__name">{{ row.name }}</span>
                      </th>
                    </tr>
                    <tr
                      v-for="stat in getPlayerStatItems(row)"
                      :key="`${row.key}-${stat.key}`"
                      class="player-stats__stat-row"
                    >
                      <td class="player-stats__stat-label">{{ stat.label }}</td>
                      <td
                        class="player-stats__stat-value"
                        :class="{
                          'player-stats__make': stat.tone === 'make',
                          'player-stats__miss': stat.tone === 'miss',
                        }"
                      >
                        {{ stat.value }}
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </section>

          <section
            v-else
            id="stats-sessions-panel"
            role="tabpanel"
            aria-label="История тренировок"
          >
            <p class="stats-summary">
              Показано {{ rangeStart }}–{{ rangeEnd }} из {{ filteredSessions.length }}
              <span v-if="hasActiveFilters">(всего {{ sessionHistory.sessions.length }})</span>
            </p>

            <ul class="stats-list">
              <li
                v-for="s in paginatedSessions"
                :key="s.id"
                class="stats-card"
                :class="{ 'stats-card--editing': editingId === s.id }"
              >
              <div v-if="editingId === s.id" class="stats-card__edit">
                <div class="stats-card__edit-header">
                  <span class="stats-card__date">{{ formatDate(s.startedAt) }}</span>
                  <span class="stats-card__duration">{{ formatDuration(s.durationMs) }}</span>
                </div>

                <label class="form-field">
                  <span class="form-field__label">Название сессии</span>
                  <input
                    v-model="editingTitle"
                    type="text"
                    class="form-field__input"
                    placeholder="Тренировка"
                    maxlength="80"
                    autocomplete="off"
                    @keydown.escape="cancelEdit"
                  >
                </label>

                <label class="form-field">
                  <span class="form-field__label">Имя игрока</span>
                  <input
                    v-model="editingName"
                    type="text"
                    class="form-field__input"
                    placeholder="Имя игрока"
                    maxlength="50"
                    autocomplete="nickname"
                    @keydown.escape="cancelEdit"
                  >
                </label>

                <label class="form-field">
                  <span class="form-field__label">Описание</span>
                  <textarea
                    v-model="editingDescription"
                    class="form-field__input form-field__textarea"
                    placeholder="Описание сессии"
                    maxlength="200"
                    rows="2"
                    @keydown.escape="cancelEdit"
                  />
                </label>

                <SessionTagsInput v-model="editingTags" class="form-field--tags" />

                <div class="stats-card__counter">
                  <span class="stats-card__counter-label stats-card__counter-label--make">Попадания</span>
                  <div class="stats-card__counter-controls">
                    <button
                      type="button"
                      class="btn btn-secondary btn-small stats-card__counter-btn"
                      aria-label="Уменьшить попадания"
                      :disabled="editingMakes <= 0"
                      @click="editingMakes--"
                    >
                      −
                    </button>
                    <input
                      v-model.number="editingMakes"
                      type="number"
                      min="0"
                      class="form-field__input stats-card__counter-input"
                      @keydown.escape="cancelEdit"
                    >
                    <button
                      type="button"
                      class="btn btn-secondary btn-small stats-card__counter-btn"
                      aria-label="Увеличить попадания"
                      @click="editingMakes++"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div class="stats-card__counter">
                  <span class="stats-card__counter-label stats-card__counter-label--miss">Промахи</span>
                  <div class="stats-card__counter-controls">
                    <button
                      type="button"
                      class="btn btn-secondary btn-small stats-card__counter-btn"
                      aria-label="Уменьшить промахи"
                      :disabled="editingMisses <= 0"
                      @click="editingMisses--"
                    >
                      −
                    </button>
                    <input
                      v-model.number="editingMisses"
                      type="number"
                      min="0"
                      class="form-field__input stats-card__counter-input"
                      @keydown.escape="cancelEdit"
                    >
                    <button
                      type="button"
                      class="btn btn-secondary btn-small stats-card__counter-btn"
                      aria-label="Увеличить промахи"
                      @click="editingMisses++"
                    >
                      +
                    </button>
                  </div>
                </div>

                <p class="stats-card__scores-preview">
                  Бросков: {{ editingAttempts }} · Точность: {{ editingMakePercentage }}% · Серия: {{ editingBestStreak }}
                </p>

                <div class="stats-card__edit-actions">
                  <button
                    type="button"
                    class="btn btn-primary btn-small"
                    @click="saveEdit(s)"
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-small"
                    @click="cancelEdit"
                  >
                    Отмена
                  </button>
                </div>
              </div>

              <template v-else>
                <div class="stats-card__header">
                  <div class="stats-card__meta">
                    <div class="stats-card__name-row">
                      <div class="stats-card__headings">
                        <span
                          v-if="s.title"
                          class="stats-card__title"
                        >
                          {{ s.title }}
                        </span>
                        <span
                          class="stats-card__hooper"
                          :class="{
                            'stats-card__hooper--empty': !s.hooperName,
                            'stats-card__hooper--secondary': s.title,
                          }"
                        >
                          {{ s.hooperName || 'Без имени' }}
                        </span>
                      </div>
                      <div class="stats-card__icon-actions">
                        <button
                          type="button"
                          class="btn btn-ghost btn-small stats-card__edit-btn"
                          aria-label="Редактировать сессию"
                          @click="startEdit(s)"
                        >
                          <svg
                            class="stats-card__action-icon"
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            aria-hidden="true"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          class="btn btn-ghost btn-small stats-card__delete-btn"
                          aria-label="Удалить сессию"
                          @click="handleDelete(s)"
                        >
                          <svg
                            class="stats-card__action-icon"
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            aria-hidden="true"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <path d="M3 6h18" />
                            <path d="M8 6V4h8v2" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div class="stats-card__submeta">
                      <span class="stats-card__date">{{ formatDate(s.startedAt) }}</span>
                      <span class="stats-card__duration">{{ formatDuration(s.durationMs) }}</span>
                    </div>
                    <p v-if="s.description" class="stats-card__description">{{ s.description }}</p>
                    <div v-if="s.tags?.length" class="stats-card__tags">
                      <span
                        v-for="tag in s.tags"
                        :key="tag"
                        class="session-tags__chip session-tags__chip--readonly"
                      >
                        {{ formatTagLabel(tag) }}
                      </span>
                    </div>
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
              </template>
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
          </section>
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
import SessionTagsInput from '../components/SessionTagsInput.vue'
import {
  sessionHistory,
  removeSession,
  clearSessionHistory,
  importSessions,
  updateSession,
} from '../stores/sessionHistory.js'
import { applySessionCounts } from '../utils/sessionStats.js'
import {
  collectAllTags,
  formatTagLabel,
  normalizeTags,
  sessionHasAnyTag,
  tagsEqual,
} from '../utils/sessionTags.js'
import { formatDate, formatDuration } from '../utils/time.js'
import {
  downloadTextFile,
  exportFilename,
  parseSessionsImport,
  sessionsToCsv,
  sessionsToJson,
} from '../utils/sessionsIo.js'

const searchQuery = ref('')
const tagFilter = ref([])
const dateFrom = ref('')
const dateTo = ref('')
const sortOrder = ref('newest')
const pageSize = ref(10)
const currentPage = ref(1)
const activeStatsTab = ref('sessions')
const showFilters = ref(false)
const importInputRef = ref(null)
const editingId = ref(null)
const editingTitle = ref('')
const editingName = ref('')
const editingDescription = ref('')
const editingTags = ref([])
const editingMakes = ref(0)
const editingMisses = ref(0)

const editingAttempts = computed(() =>
  Math.max(0, Math.floor(Number(editingMakes.value)) || 0) +
  Math.max(0, Math.floor(Number(editingMisses.value)) || 0),
)

const editingMakePercentage = computed(() => {
  const makes = Math.max(0, Math.floor(Number(editingMakes.value)) || 0)
  const attempts = editingAttempts.value
  return attempts > 0 ? Math.round((makes / attempts) * 100) : 0
})

const editingBestStreak = computed(() => {
  const session = sessionHistory.sessions.find((s) => s.id === editingId.value)
  const preview = applySessionCounts(
    { shotEvents: session?.shotEvents || [] },
    editingMakes.value,
    editingMisses.value,
  )
  return preview.bestStreak
})

const availableFilterTags = computed(() => collectAllTags(sessionHistory.sessions))

const hasActiveFilters = computed(
  () => Boolean(
    searchQuery.value.trim() ||
    tagFilter.value.length > 0 ||
    dateFrom.value ||
    dateTo.value,
  ),
)

const filteredSessions = computed(() => {
  let list = [...sessionHistory.sessions]
  const query = searchQuery.value.trim().toLowerCase().replace(/^#+/, '')

  if (query) {
    list = list.filter((session) => {
      const title = (session.title || '').toLowerCase()
      const name = (session.hooperName || '').toLowerCase()
      const description = (session.description || '').toLowerCase()
      const tags = normalizeTags(session.tags).join(' ').toLowerCase()

      return (
        title.includes(query) ||
        name.includes(query) ||
        description.includes(query) ||
        tags.includes(query)
      )
    })
  }

  if (tagFilter.value.length > 0) {
    list = list.filter((session) => sessionHasAnyTag(session, tagFilter.value))
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

const playerStatsRows = computed(() => {
  const players = new Map()

  for (const session of filteredSessions.value) {
    const name = (session.hooperName || '').trim() || 'Без имени'
    const key = name.toLowerCase()
    const startedAt = new Date(session.startedAt).getTime()
    const mode = session.mode === 'ai' ? 'AI' : 'Ручной'

    if (!players.has(key)) {
      players.set(key, {
        key,
        name,
        sessions: 0,
        attempts: 0,
        makes: 0,
        misses: 0,
        bestStreak: 0,
        durationMs: 0,
        firstStartedAt: Number.isFinite(startedAt) ? startedAt : null,
        lastStartedAt: Number.isFinite(startedAt) ? startedAt : null,
        modes: new Map(),
      })
    }

    const row = players.get(key)
    row.sessions++
    row.attempts += Number(session.attempts) || 0
    row.makes += Number(session.makes) || 0
    row.misses += Number(session.misses) || 0
    row.bestStreak = Math.max(row.bestStreak, Number(session.bestStreak) || 0)
    row.durationMs += Number(session.durationMs) || 0
    row.modes.set(mode, (row.modes.get(mode) || 0) + 1)

    if (Number.isFinite(startedAt)) {
      row.firstStartedAt = row.firstStartedAt === null ? startedAt : Math.min(row.firstStartedAt, startedAt)
      row.lastStartedAt = row.lastStartedAt === null ? startedAt : Math.max(row.lastStartedAt, startedAt)
    }
  }

  return [...players.values()]
    .map((row) => ({
      ...row,
      makePercentage: row.attempts > 0 ? Math.round((row.makes / row.attempts) * 100) : 0,
      averageAttempts: row.sessions > 0 ? (row.attempts / row.sessions).toFixed(1) : '0.0',
      modeSummary: formatCountSummary(row.modes),
      firstTrainingDate: formatOptionalDate(row.firstStartedAt),
      lastTrainingDate: formatOptionalDate(row.lastStartedAt),
    }))
    .sort((a, b) => b.attempts - a.attempts || b.sessions - a.sessions || a.name.localeCompare(b.name))
})

watch([searchQuery, tagFilter, dateFrom, dateTo, sortOrder, pageSize], () => {
  currentPage.value = 1
})

watch(totalPages, (pages) => {
  if (currentPage.value > pages) {
    currentPage.value = pages
  }
})

function resetFilters() {
  searchQuery.value = ''
  tagFilter.value = []
  dateFrom.value = ''
  dateTo.value = ''
  sortOrder.value = 'newest'
  currentPage.value = 1
}

function openDatePicker(event) {
  const input = event.currentTarget.querySelector('input[type="date"]')
  if (!input) return

  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }
  } catch {
    // showPicker can throw if not triggered by user gesture in some browsers
  }

  input.focus()
}

function isTagFilterActive(tag) {
  return tagFilter.value.some((item) => item.toLowerCase() === tag.toLowerCase())
}

function toggleTagFilter(tag) {
  if (isTagFilterActive(tag)) {
    tagFilter.value = tagFilter.value.filter((item) => item.toLowerCase() !== tag.toLowerCase())
    return
  }

  tagFilter.value = [...tagFilter.value, tag]
}

function formatCountSummary(counts) {
  const entries = [...counts.entries()]
  if (entries.length === 0) return '—'

  return entries
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => `${label}: ${count}`)
    .join(', ')
}

function formatOptionalDate(timestamp) {
  if (timestamp === null) return '—'
  return formatDate(new Date(timestamp).toISOString())
}

function getPlayerStatItems(row) {
  return [
    { key: 'makePercentage', label: 'Процент', value: `${row.makePercentage}%` },
    { key: 'attempts', label: 'Броски', value: row.attempts },
    { key: 'durationMs', label: 'Время', value: formatDuration(row.durationMs) },
    { key: 'makes', label: 'Попадания', value: row.makes, tone: 'make' },
    { key: 'misses', label: 'Промахи', value: row.misses, tone: 'miss' },
    { key: 'sessions', label: 'Тренировки', value: row.sessions },
    { key: 'bestStreak', label: 'Лучшая серия', value: row.bestStreak },
    { key: 'averageAttempts', label: 'Средн. бросков', value: row.averageAttempts },
    { key: 'firstTrainingDate', label: 'Первая тренировка', value: row.firstTrainingDate },
    { key: 'lastTrainingDate', label: 'Последняя тренировка', value: row.lastTrainingDate },
    { key: 'modeSummary', label: 'Режимы', value: row.modeSummary },
  ]
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
  const label = session.title || session.hooperName || formatDate(session.startedAt)
  if (!window.confirm(`Удалить сессию «${label}»?`)) return

  try {
    if (editingId.value === session.id) cancelEdit()
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
    cancelEdit()
  } catch (err) {
    console.error('Failed to clear session history:', err)
    window.alert('Не удалось очистить историю')
  }
}

function startEdit(session) {
  editingId.value = session.id
  editingTitle.value = session.title || ''
  editingName.value = session.hooperName || ''
  editingDescription.value = session.description || ''
  editingTags.value = [...normalizeTags(session.tags)]
  editingMakes.value = session.makes
  editingMisses.value = session.misses
}

function cancelEdit() {
  editingId.value = null
  editingTitle.value = ''
  editingName.value = ''
  editingDescription.value = ''
  editingTags.value = []
  editingMakes.value = 0
  editingMisses.value = 0
}

function hasEditChanges(session) {
  const title = editingTitle.value.trim()
  const name = editingName.value.trim()
  const description = editingDescription.value.trim()
  const tags = normalizeTags(editingTags.value)
  const makes = Math.max(0, Math.floor(Number(editingMakes.value)) || 0)
  const misses = Math.max(0, Math.floor(Number(editingMisses.value)) || 0)

  return (
    title !== (session.title || '') ||
    name !== (session.hooperName || '') ||
    description !== (session.description || '') ||
    !tagsEqual(tags, session.tags) ||
    makes !== session.makes ||
    misses !== session.misses
  )
}

async function saveEdit(session) {
  const title = editingTitle.value.trim()
  const hooperName = editingName.value.trim()
  const description = editingDescription.value.trim()
  const tags = normalizeTags(editingTags.value)
  const makes = Math.max(0, Math.floor(Number(editingMakes.value)) || 0)
  const misses = Math.max(0, Math.floor(Number(editingMisses.value)) || 0)

  if (!hasEditChanges(session)) {
    cancelEdit()
    return
  }

  try {
    await updateSession(session.id, { title, hooperName, description, tags, makes, misses })
    cancelEdit()
  } catch (err) {
    console.error('Failed to update session:', err)
    window.alert('Не удалось сохранить изменения')
  }
}
</script>
