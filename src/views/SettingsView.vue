<template>
  <div class="page settings-page">
    <header class="page-header page-header--row">
      <router-link to="/" class="btn btn-ghost btn-small">← Назад</router-link>
      <h1 class="page-title">Настройки</h1>
    </header>

    <main class="page-content">
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
            <span v-if="model.sourceUrl" class="model-picker__file">Нужен экспорт best.pt → ONNX из внешнего репозитория</span>
          </button>
        </div>
      </section>

      <section class="settings-section">
        <h2 class="settings-section__title">Алгоритм определения броска</h2>
        <p class="settings-section__hint">
          Avi Shah использует переход мяча из зоны над кольцом вниз и линейный прогноз пересечения траектории с кольцом.
        </p>

        <div class="model-picker" role="radiogroup" aria-label="Алгоритм определения броска">
          <button
            v-for="option in shotAlgorithmOptions"
            :key="option.value"
            type="button"
            class="model-picker__option"
            :class="{ 'model-picker__option--active': aiModelSettings.shotAlgorithm === option.value }"
            role="radio"
            :aria-checked="aiModelSettings.shotAlgorithm === option.value"
            @click="setShotAlgorithm(option.value)"
          >
            <span class="model-picker__title">{{ option.label }}</span>
            <span class="model-picker__meta">{{ option.description }}</span>
          </button>
        </div>
      </section>

      <section class="settings-section">
        <h2 class="settings-section__title">Пороги уверенности детектора</h2>
        <p class="settings-section__hint">
          Минимальная уверенность модели для каждого класса. Применяется сразу, без перезагрузки модели.
        </p>

        <div
          v-for="cls in detectorClasses"
          :key="cls.index"
          class="settings-class-control"
        >
          <label class="settings-class-toggle">
            <input
              :checked="aiModelSettings.classEnabled[cls.index] !== false"
              type="checkbox"
              class="settings-class-toggle__input"
              @change="setClassEnabled(cls.index, $event.target.checked)"
            >
            <span class="settings-class-toggle__slider" aria-hidden="true" />
            <span class="settings-class-toggle__text">
              <span class="settings-class-toggle__label">{{ cls.label }}</span>
              <span class="settings-class-toggle__meta">{{ cls.roleLabel }}</span>
            </span>
          </label>

          <label class="form-field settings-fps-field">
            <span class="form-field__label">
              Порог: {{ formatThreshold(aiModelSettings.classConfThresholds[cls.index]) }}
            </span>
            <input
              :value="aiModelSettings.classConfThresholds[cls.index]"
              type="range"
              class="settings-fps-field__range"
              :disabled="aiModelSettings.classEnabled[cls.index] === false"
              :min="CONF_THRESHOLD_MIN"
              :max="CONF_THRESHOLD_MAX"
              :step="CONF_THRESHOLD_STEP"
              @input="setClassConfThreshold(cls.index, Number($event.target.value))"
            >
          </label>
        </div>

      </section>

      <section class="settings-section">
        <h2 class="settings-section__title">Частота AI-детекции</h2>
        <p class="settings-section__hint">
          Чем выше FPS, тем лучше ловится быстрый мяч, но тем выше нагрузка на устройство.
        </p>

        <label class="form-field settings-fps-field">
          <span class="form-field__label">
            Частота: {{ aiModelSettings.inferenceFps }} FPS
          </span>
          <input
            :value="aiModelSettings.inferenceFps"
            type="range"
            class="settings-fps-field__range"
            :min="AI_INFERENCE_FPS_MIN"
            :max="AI_INFERENCE_FPS_MAX"
            :step="AI_INFERENCE_FPS_STEP"
            @input="setAiInferenceFps(Number($event.target.value))"
          >
        </label>
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

        <label v-if="poseSettings.poseMode === 'mediapipe'" class="form-field settings-fps-field">
          <span class="form-field__label">
            Порог уверенности точек скелета: {{ formatThreshold(poseSettings.keypointConfidenceMin) }}
          </span>
          <input
            :value="poseSettings.keypointConfidenceMin"
            type="range"
            class="settings-fps-field__range"
            :min="POSE_KEYPOINT_CONFIDENCE_MIN"
            :max="POSE_KEYPOINT_CONFIDENCE_MAX"
            :step="POSE_KEYPOINT_CONFIDENCE_STEP"
            @input="setPoseKeypointConfidenceMin(Number($event.target.value))"
          >
        </label>
      </section>

      <section class="settings-section settings-section--reset">
        <button type="button" class="btn btn-secondary btn-large" @click="resetDetectorSettings">
          Сбросить настройки детекторов
        </button>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  AI_DETECTOR_MODELS,
  CONF_THRESHOLD_MAX,
  CONF_THRESHOLD_MIN,
  CONF_THRESHOLD_STEP,
  getAiDetectorModel,
} from '../ai/detectorModels.js'
import { POSE_MODES } from '../ai/poseDetectorFactory.js'
import {
  AI_INFERENCE_FPS_MAX,
  AI_INFERENCE_FPS_MIN,
  AI_INFERENCE_FPS_STEP,
  aiModelSettings,
  resetAiDetectorSettings,
  setAiInferenceFps,
  setClassEnabled,
  setAiDetectorModel,
  setClassConfThreshold,
  setShotAlgorithm,
  SHOT_ALGORITHMS,
} from '../stores/aiModelSettings.js'
import {
  getPoseModelFileName,
  POSE_FPS_MAX,
  POSE_FPS_MIN,
  POSE_KEYPOINT_CONFIDENCE_MAX,
  POSE_KEYPOINT_CONFIDENCE_MIN,
  POSE_KEYPOINT_CONFIDENCE_STEP,
  poseSettings,
  setPoseFps,
  setPoseKeypointConfidenceMin,
  setPoseMode,
  resetPoseSettings,
} from '../stores/poseSettings.js'
import { themeSettings, setThemePreference, THEME_OPTIONS } from '../stores/theme.js'

const aiModels = AI_DETECTOR_MODELS
const detectorClasses = computed(() => getAiDetectorModel(aiModelSettings.modelId).classes)
const poseModelFileName = computed(() => getPoseModelFileName())

function formatThreshold(value) {
  return `${Math.round(value * 100)}%`
}

function resetDetectorSettings() {
  resetAiDetectorSettings()
  resetPoseSettings()
}

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

const shotAlgorithmOptions = [
  {
    value: SHOT_ALGORITHMS.SMART_HOOP,
    label: 'Smart Hoop',
    description: 'Текущая логика: вход в кольцо, прохождение сетки, rim-out и защита от повторного счёта',
  },
  {
    value: SHOT_ALGORITHMS.HYBRID,
    label: 'Гибрид',
    description: 'Smart Hoop как основной алгоритм, Avi Shah как траекторный fallback после прохода мяча вниз',
  },
  {
    value: SHOT_ALGORITHMS.AVISHAH,
    label: 'Avi Shah',
    description: 'Линейный прогноз траектории по последним точкам мяча относительно найденного кольца',
  },
]

const themeOptions = [
  { value: THEME_OPTIONS.LIGHT, label: 'Светлая' },
  { value: THEME_OPTIONS.DARK, label: 'Тёмная' },
  { value: THEME_OPTIONS.SYSTEM, label: 'Как в системе' },
]
</script>
