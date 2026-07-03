<template>
  <div class="session-hud">
    <p v-if="session.title" class="session-hud__title">{{ session.title }}</p>
    <p
      v-if="session.hooperName"
      class="session-hud__hooper"
      :class="{ 'session-hud__hooper--secondary': session.title }"
    >
      {{ session.hooperName }}
    </p>
    <div class="session-hud__timer">{{ formattedDuration }}</div>

    <div class="session-hud__grid">
      <div class="session-hud__stat">
        <span class="session-hud__value session-hud__value--make">{{ session.makes }}</span>
        <span class="session-hud__label">Попадания</span>
      </div>
      <div class="session-hud__stat">
        <span class="session-hud__value session-hud__value--miss">{{ session.misses }}</span>
        <span class="session-hud__label">Промахи</span>
      </div>
      <div class="session-hud__stat">
        <span class="session-hud__value">{{ session.attempts }}</span>
        <span class="session-hud__label">Всего</span>
      </div>
      <div class="session-hud__stat">
        <span class="session-hud__value">{{ session.makePercentage }}%</span>
        <span class="session-hud__label">Точность</span>
      </div>
      <div class="session-hud__stat">
        <span class="session-hud__value">{{ session.currentStreak }}</span>
        <span class="session-hud__label">Серия</span>
      </div>
      <div class="session-hud__stat">
        <span class="session-hud__value session-hud__value--best">{{ session.bestStreak }}</span>
        <span class="session-hud__label">Лучшая</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatDuration } from '../utils/time.js'

const props = defineProps({
  session: {
    type: Object,
    required: true,
  },
})

const formattedDuration = computed(() => formatDuration(props.session.durationMs))
</script>
