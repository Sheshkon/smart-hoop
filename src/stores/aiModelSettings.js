import { reactive } from 'vue'
import {
  AI_DETECTOR_MODELS,
  DEFAULT_AI_MODEL_ID,
  getAiDetectorModel,
} from '../ai/detectorModels.js'

const STORAGE_KEY = 'smart-hoop.ai-model'

export const aiModelSettings = reactive({
  modelId: DEFAULT_AI_MODEL_ID,
})

function loadModelId() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && AI_DETECTOR_MODELS.some((model) => model.id === stored)) {
      return stored
    }
  } catch {
    // ignore
  }
  return DEFAULT_AI_MODEL_ID
}

function saveModelId(modelId) {
  try {
    localStorage.setItem(STORAGE_KEY, modelId)
  } catch (err) {
    console.error('Failed to save AI model preference:', err)
  }
}

export function initAiModelSettings() {
  aiModelSettings.modelId = loadModelId()
}

export function setAiDetectorModel(modelId) {
  const model = getAiDetectorModel(modelId)
  if (!model) return

  aiModelSettings.modelId = model.id
  saveModelId(model.id)
}

export function getSelectedAiDetectorModel() {
  return getAiDetectorModel(aiModelSettings.modelId)
}
