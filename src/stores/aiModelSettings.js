import { reactive } from 'vue'
import {
  AI_DETECTOR_MODELS,
  AI_MODEL_SETTINGS_VERSION,
  clampClassConfThreshold,
  DEFAULT_CLASS_ENABLED,
  DEFAULT_AI_MODEL_ID,
  DEFAULT_CLASS_CONF_THRESHOLDS,
  getAiDetectorModel,
  normalizeClassEnabled,
  normalizeClassConfThresholds,
} from '../ai/detectorModels.js'

const STORAGE_KEY = 'smart-hoop.ai-model-settings'
const LEGACY_STORAGE_KEY = 'smart-hoop.ai-model'

export const AI_INFERENCE_FPS_MIN = 10
export const AI_INFERENCE_FPS_MAX = 60
export const AI_INFERENCE_FPS_STEP = 1
export const DEFAULT_AI_INFERENCE_FPS = 30
export const SHOT_ALGORITHMS = {
  SMART_HOOP: 'smart-hoop',
  HYBRID: 'hybrid',
  AVISHAH: 'avishah',
}
export const DEFAULT_SHOT_ALGORITHM = SHOT_ALGORITHMS.SMART_HOOP

export const aiModelSettings = reactive({
  modelId: DEFAULT_AI_MODEL_ID,
  classConfThresholds: [...DEFAULT_CLASS_CONF_THRESHOLDS],
  classEnabled: [...DEFAULT_CLASS_ENABLED],
  inferenceFps: DEFAULT_AI_INFERENCE_FPS,
  shotAlgorithm: DEFAULT_SHOT_ALGORITHM,
})

function clampInferenceFps(value) {
  const fps = Number(value)
  if (!Number.isFinite(fps)) return DEFAULT_AI_INFERENCE_FPS

  return Math.min(
    AI_INFERENCE_FPS_MAX,
    Math.max(AI_INFERENCE_FPS_MIN, Math.round(fps / AI_INFERENCE_FPS_STEP) * AI_INFERENCE_FPS_STEP),
  )
}

function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      const modelId =
        typeof parsed.modelId === 'string' &&
        AI_DETECTOR_MODELS.some((model) => model.id === parsed.modelId)
          ? parsed.modelId
          : DEFAULT_AI_MODEL_ID

      const settingsVersion = Number(parsed.settingsVersion) || 1
      const useDefaultThresholds = settingsVersion < AI_MODEL_SETTINGS_VERSION

      const model = getAiDetectorModel(modelId)

      return {
        modelId,
        classConfThresholds: normalizeClassConfThresholds(
          useDefaultThresholds ? DEFAULT_CLASS_CONF_THRESHOLDS : parsed.classConfThresholds,
          model.classes,
        ),
        classEnabled: normalizeClassEnabled(parsed.classEnabled, model.classes),
        inferenceFps: clampInferenceFps(parsed.inferenceFps),
        shotAlgorithm: normalizeShotAlgorithm(parsed.shotAlgorithm),
      }
    }
  } catch {
    // ignore
  }

  try {
    const legacyModelId = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacyModelId && AI_DETECTOR_MODELS.some((model) => model.id === legacyModelId)) {
      return {
        modelId: legacyModelId,
        classConfThresholds: [...DEFAULT_CLASS_CONF_THRESHOLDS],
        classEnabled: [...DEFAULT_CLASS_ENABLED],
        inferenceFps: DEFAULT_AI_INFERENCE_FPS,
        shotAlgorithm: DEFAULT_SHOT_ALGORITHM,
      }
    }
  } catch {
    // ignore
  }

  return {
    modelId: DEFAULT_AI_MODEL_ID,
    classConfThresholds: [...DEFAULT_CLASS_CONF_THRESHOLDS],
    classEnabled: [...DEFAULT_CLASS_ENABLED],
    inferenceFps: DEFAULT_AI_INFERENCE_FPS,
    shotAlgorithm: DEFAULT_SHOT_ALGORITHM,
  }
}

function normalizeShotAlgorithm(value) {
  return Object.values(SHOT_ALGORITHMS).includes(value) ? value : DEFAULT_SHOT_ALGORITHM
}

function saveSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settingsVersion: AI_MODEL_SETTINGS_VERSION,
        modelId: aiModelSettings.modelId,
        classConfThresholds: [...aiModelSettings.classConfThresholds],
        classEnabled: [...aiModelSettings.classEnabled],
        inferenceFps: aiModelSettings.inferenceFps,
        shotAlgorithm: aiModelSettings.shotAlgorithm,
      }),
    )
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch (err) {
    console.error('Failed to save AI model settings:', err)
  }
}

export function initAiModelSettings() {
  const settings = loadSettings()
  aiModelSettings.modelId = settings.modelId
  aiModelSettings.classConfThresholds = settings.classConfThresholds
  aiModelSettings.classEnabled = settings.classEnabled
  aiModelSettings.inferenceFps = settings.inferenceFps
  aiModelSettings.shotAlgorithm = settings.shotAlgorithm
  saveSettings()
}

export function setAiDetectorModel(modelId) {
  const model = getAiDetectorModel(modelId)
  if (!model) return

  aiModelSettings.modelId = model.id
  aiModelSettings.classConfThresholds = normalizeClassConfThresholds(
    aiModelSettings.classConfThresholds,
    model.classes,
  )
  aiModelSettings.classEnabled = normalizeClassEnabled(aiModelSettings.classEnabled, model.classes)
  saveSettings()
}

/**
 * @param {number} index
 * @param {number} value
 */
export function setClassConfThreshold(index, value) {
  if (index < 0 || index >= aiModelSettings.classConfThresholds.length) return

  aiModelSettings.classConfThresholds[index] = clampClassConfThreshold(index, value)
  saveSettings()
}

export function resetClassConfThresholds() {
  aiModelSettings.classConfThresholds = [...DEFAULT_CLASS_CONF_THRESHOLDS]
  saveSettings()
}

/**
 * @param {number} index
 * @param {boolean} enabled
 */
export function setClassEnabled(index, enabled) {
  if (index < 0 || index >= aiModelSettings.classEnabled.length) return

  aiModelSettings.classEnabled[index] = Boolean(enabled)
  saveSettings()
}

export function setAiInferenceFps(value) {
  aiModelSettings.inferenceFps = clampInferenceFps(value)
  saveSettings()
}

export function setShotAlgorithm(value) {
  aiModelSettings.shotAlgorithm = normalizeShotAlgorithm(value)
  saveSettings()
}

export function resetAiDetectorSettings() {
  aiModelSettings.modelId = DEFAULT_AI_MODEL_ID
  aiModelSettings.classConfThresholds = [...DEFAULT_CLASS_CONF_THRESHOLDS]
  aiModelSettings.classEnabled = [...DEFAULT_CLASS_ENABLED]
  aiModelSettings.inferenceFps = DEFAULT_AI_INFERENCE_FPS
  aiModelSettings.shotAlgorithm = DEFAULT_SHOT_ALGORITHM
  saveSettings()
}

export function getSelectedAiDetectorModel() {
  return getAiDetectorModel(aiModelSettings.modelId)
}

export function getSelectedClassConfThresholds() {
  return normalizeClassConfThresholds(
    aiModelSettings.classConfThresholds,
    getSelectedAiDetectorModel().classes,
  )
}

export function getSelectedClassEnabled() {
  return normalizeClassEnabled(
    aiModelSettings.classEnabled,
    getSelectedAiDetectorModel().classes,
  )
}

export function getSelectedInferenceIntervalMs() {
  return Math.round(1000 / clampInferenceFps(aiModelSettings.inferenceFps))
}

export function getSelectedShotAlgorithm() {
  return normalizeShotAlgorithm(aiModelSettings.shotAlgorithm)
}
