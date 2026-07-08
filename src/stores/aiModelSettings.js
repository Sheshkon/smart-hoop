import { reactive } from 'vue'
import {
  AI_DETECTOR_MODELS,
  AI_MODEL_SETTINGS_VERSION,
  clampClassConfThreshold,
  DEFAULT_AI_MODEL_ID,
  DEFAULT_CLASS_CONF_THRESHOLDS,
  getAiDetectorModel,
  normalizeClassConfThresholds,
} from '../ai/detectorModels.js'

const STORAGE_KEY = 'smart-hoop.ai-model-settings'
const LEGACY_STORAGE_KEY = 'smart-hoop.ai-model'

export const aiModelSettings = reactive({
  modelId: DEFAULT_AI_MODEL_ID,
  classConfThresholds: [...DEFAULT_CLASS_CONF_THRESHOLDS],
})

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

      return {
        modelId,
        classConfThresholds: useDefaultThresholds
          ? [...DEFAULT_CLASS_CONF_THRESHOLDS]
          : normalizeClassConfThresholds(parsed.classConfThresholds),
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
      }
    }
  } catch {
    // ignore
  }

  return {
    modelId: DEFAULT_AI_MODEL_ID,
    classConfThresholds: [...DEFAULT_CLASS_CONF_THRESHOLDS],
  }
}

function saveSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        settingsVersion: AI_MODEL_SETTINGS_VERSION,
        modelId: aiModelSettings.modelId,
        classConfThresholds: [...aiModelSettings.classConfThresholds],
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
  saveSettings()
}

export function setAiDetectorModel(modelId) {
  const model = getAiDetectorModel(modelId)
  if (!model) return

  aiModelSettings.modelId = model.id
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

export function getSelectedAiDetectorModel() {
  return getAiDetectorModel(aiModelSettings.modelId)
}

export function getSelectedClassConfThresholds() {
  return normalizeClassConfThresholds(aiModelSettings.classConfThresholds)
}
