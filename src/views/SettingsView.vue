<template>
  <div class="page settings-page">
    <header class="page-header page-header--row">
      <router-link to="/" class="btn btn-ghost btn-small">← Назад</router-link>
      <h1 class="page-title">Настройки</h1>
    </header>

    <main class="page-content">
      <section class="settings-section">
        <h2 class="settings-section__title">AI-модель детектора</h2>
        <p class="settings-section__hint">
          Используется в AI-сессии. При смене модели детектор перезагрузится автоматически.
        </p>

        <div class="model-picker" role="radiogroup" aria-label="AI-модель детектора">
          <button
            v-for="model in aiModels"
            :key="model.id"
            type="button"
            class="model-picker__option"
            :class="{ 'model-picker__option--active': aiModelSettings.modelId === model.id }"
            role="radio"
            :aria-checked="aiModelSettings.modelId === model.id"
            @click="setAiDetectorModel(model.id)"
          >
            <span class="model-picker__title">{{ model.label }}</span>
            <span class="model-picker__meta">{{ model.description }} · {{ model.inputSize }}×{{ model.inputSize }}</span>
            <span class="model-picker__file">{{ model.fileName }}</span>
          </button>
        </div>
      </section>

      <section class="settings-section">
        <h2 class="settings-section__title">Скелет игрока (MediaPipe)</h2>
        <p class="settings-section__hint">
          Отдельная система от детектора мяча и кольца. Накладывает скелет поверх видео в AI-сессии.
        </p>

        <p class="settings-section__model-path">
          Модель скелета:
          <code class="settings-section__model-code">{{ poseModelFileName }}</code>
        </p>

        <div class="model-picker" role="radiogroup" aria-label="Режим позы">
          <button
            v-for="option in poseModeOptions"
            :key="option.value"
            type="button"
            class="model-picker__option"
            :class="{ 'model-picker__option--active': poseSettings.poseMode === option.value }"
            role="radio"
            :aria-checked="poseSettings.poseMode === option.value"
            @click="setPoseMode(option.value)"
          >
            <span class="model-picker__title">{{ option.label }}</span>
            <span class="model-picker__meta">{{ option.description }}</span>
          </button>
        </div>

        <label v-if="poseSettings.poseMode === 'mediapipe'" class="form-field settings-fps-field">
          <span class="form-field__label">
            Частота позы: {{ poseSettings.poseFps }} FPS
          </span>
          <input
            :value="poseSettings.poseFps"
            type="range"
            class="settings-fps-field__range"
            :min="POSE_FPS_MIN"
            :max="POSE_FPS_MAX"
            step="1"
            @input="setPoseFps(Number($event.target.value))"
          >
        </label>
      </section>

      <section class="settings-section">
        <h2 class="settings-section__title">Тема оформления</h2>
        <div class="theme-picker" role="radiogroup" aria-label="Тема оформления">
          <button
            v-for="option in themeOptions"
            :key="option.value"
            type="button"
            class="theme-picker__option"
            :class="{ 'theme-picker__option--active': themeSettings.preference === option.value }"
            role="radio"
            :aria-checked="themeSettings.preference === option.value"
            @click="setThemePreference(option.value)"
          >
            <span class="theme-picker__swatch" :class="`theme-picker__swatch--${option.value}`" aria-hidden="true" />
            {{ option.label }}
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { AI_DETECTOR_MODELS } from '../ai/detectorModels.js'
import { POSE_MODES } from '../ai/poseDetectorFactory.js'
import { aiModelSettings, setAiDetectorModel } from '../stores/aiModelSettings.js'
import {
  getPoseModelFileName,
  POSE_FPS_MAX,
  POSE_FPS_MIN,
  poseSettings,
  setPoseFps,
  setPoseMode,
} from '../stores/poseSettings.js'
import { themeSettings, setThemePreference, THEME_OPTIONS } from '../stores/theme.js'

const aiModels = AI_DETECTOR_MODELS
const poseModelFileName = computed(() => getPoseModelFileName())

const poseModeOptions = [
  {
    value: POSE_MODES.OFF,
    label: 'Выключено',
    description: 'Скелет не отображается',
  },
  {
    value: POSE_MODES.MEDIAPIPE,
    label: 'MediaPipe Pose',
    description: 'Скелет игрока поверх видео',
  },
]

const themeOptions = [
  { value: THEME_OPTIONS.LIGHT, label: 'Светлая' },
  { value: THEME_OPTIONS.DARK, label: 'Тёмная' },
  { value: THEME_OPTIONS.SYSTEM, label: 'Как в системе' },
]
</script>
