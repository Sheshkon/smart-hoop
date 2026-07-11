/** @typedef {{ index: number, className: string, label: string, roleLabel: string, appClass: 'ball' | 'hoop' | 'person' | null }} DetectorClassMeta */

/** @type {DetectorClassMeta[]} */
export const DETECTOR_CLASSES = [
  {
    index: 0,
    className: 'ball',
    label: 'Мяч',
    roleLabel: 'Мяч для игровой логики',
    appClass: 'ball',
  },
  {
    index: 1,
    className: 'make',
    label: 'Попадание',
    roleLabel: 'Событие модели',
    appClass: null,
  },
  {
    index: 2,
    className: 'player',
    label: 'Игрок',
    roleLabel: 'Игрок для игровой логики',
    appClass: 'person',
  },
  {
    index: 3,
    className: 'hoop',
    label: 'Кольцо',
    roleLabel: 'Кольцо для игровой логики',
    appClass: 'hoop',
  },
  {
    index: 4,
    className: 'shot',
    label: 'Бросок',
    roleLabel: 'Событие модели',
    appClass: null,
  },
]

export const DEFAULT_CLASS_CONF_THRESHOLDS = [0.15, 0.15, 0.15, 0.15, 0.15]

export const AI_MODEL_SETTINGS_VERSION = 5

export const CONF_THRESHOLD_MIN = 0.05
export const CONF_THRESHOLD_MAX = 0.95
export const CONF_THRESHOLD_STEP = 0.05

export const AI_DETECTOR_MODELS = [
  {
    id: 'basketball-detection-640',
    label: 'Basketball Detection (640)',
    description: 'Классы: мяч, попадание, игрок, кольцо, бросок',
    fileName: 'best_640.onnx',
    inputSize: 640,
  },
  {
    id: 'basketball-detection-480',
    label: 'Basketball Detection (480)',
    description: 'Классы: мяч, попадание, игрок, кольцо, бросок',
    fileName: 'best_480.onnx',
    inputSize: 480,
  },
  {
    id: 'basketball-detection-320',
    label: 'Basketball Detection (320)',
    description: 'Классы: мяч, попадание, игрок, кольцо, бросок',
    fileName: 'best_320.onnx',
    inputSize: 320,
  },
]

export const DEFAULT_AI_MODEL_ID = AI_DETECTOR_MODELS[0].id

/**
 * @param {string} [id]
 */
export function getAiDetectorModel(id) {
  return AI_DETECTOR_MODELS.find((model) => model.id === id) ?? AI_DETECTOR_MODELS[0]
}

/**
 * @param {{ fileName: string }} model
 */
export function getAiDetectorModelUrl(model) {
  return `${import.meta.env.BASE_URL}models/${model.fileName}`
}

/**
 * @param {number} index
 * @param {number} value
 */
export function clampClassConfThreshold(index, value) {
  const threshold = Number(value)
  if (!Number.isFinite(threshold)) {
    return DEFAULT_CLASS_CONF_THRESHOLDS[index] ?? 0.25
  }
  return Math.min(
    CONF_THRESHOLD_MAX,
    Math.max(CONF_THRESHOLD_MIN, Math.round(threshold / CONF_THRESHOLD_STEP) * CONF_THRESHOLD_STEP),
  )
}

/**
 * @param {number[] | undefined} thresholds
 */
export function normalizeClassConfThresholds(thresholds) {
  return DETECTOR_CLASSES.map((_, index) =>
    clampClassConfThreshold(index, thresholds?.[index] ?? DEFAULT_CLASS_CONF_THRESHOLDS[index]),
  )
}
