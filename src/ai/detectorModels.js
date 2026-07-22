/** @typedef {{ index: number, className: string, label: string, roleLabel: string, appClass: 'ball' | 'hoop' | 'person' | null }} DetectorClassMeta */
/** @typedef {{ id: string, label: string, description: string, fileName: string, inputSize: number, classes: DetectorClassMeta[], sourceUrl?: string }} AiDetectorModel */

/** @type {DetectorClassMeta[]} */
export const BASKETBALL_DETECTOR_CLASSES = [
  {
    index: 0,
    className: 'ball',
    label: 'Мяч',
    roleLabel: 'Мяч для игровой логики',
    appClass: 'ball',
  },
  {
    index: 1,
    className: 'human',
    label: 'Игрок',
    roleLabel: 'Игрок для игровой логики',
    appClass: 'person',
  },
  {
    index: 2,
    className: 'rim',
    label: 'Кольцо',
    roleLabel: 'Кольцо для игровой логики',
    appClass: 'hoop',
  },
]

export const DETECTOR_CLASSES = BASKETBALL_DETECTOR_CLASSES

export const AVISHAH_DETECTOR_CLASSES = [
  {
    index: 0,
    className: 'basketball',
    label: 'Basketball',
    roleLabel: 'Мяч для алгоритма Avi Shah',
    appClass: 'ball',
  },
  {
    index: 1,
    className: 'basketball_hoop',
    label: 'Basketball Hoop',
    roleLabel: 'Кольцо для алгоритма Avi Shah',
    appClass: 'hoop',
  },
]

export const DEFAULT_CLASS_CONF_THRESHOLDS = [0.15, 0.15, 0.15]
export const DEFAULT_CLASS_ENABLED = [true, true, true]

export const AI_MODEL_SETTINGS_VERSION = 10

export const CONF_THRESHOLD_MIN = 0.05
export const CONF_THRESHOLD_MAX = 0.95
export const CONF_THRESHOLD_STEP = 0.01

/**
 * @param {number} size
 * @returns {AiDetectorModel}
 */
function createBasketballYolo26Model(size) {
  return {
    id: `basketball-yolo26-${size}`,
    label: `Basketball YOLO26 (${size})`,
    description: 'Классы: мяч, игрок, кольцо',
    fileName: `nano/basketball_yolo26_${size}.onnx`,
    inputSize: size,
    classes: BASKETBALL_DETECTOR_CLASSES,
  }
}

/** @type {AiDetectorModel[]} */
export const AI_DETECTOR_MODELS = [
  createBasketballYolo26Model(640),
  createBasketballYolo26Model(480),
  createBasketballYolo26Model(352),
  {
    id: 'avishah-yolov8-best-640',
    label: 'Avi Shah YOLOv8 best (640)',
    description: 'Классы: Basketball, Basketball Hoop',
    fileName: 'avishah/best.onnx',
    inputSize: 640,
    classes: AVISHAH_DETECTOR_CLASSES,
    sourceUrl: 'https://github.com/avishah3/AI-Basketball-Shot-Detection-Tracker',
  },
]

export const DEFAULT_AI_MODEL_ID = 'basketball-yolo26-480'

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
export function normalizeClassConfThresholds(thresholds, classes = DETECTOR_CLASSES) {
  return classes.map((_, index) =>
    clampClassConfThreshold(index, thresholds?.[index] ?? DEFAULT_CLASS_CONF_THRESHOLDS[index]),
  )
}

/**
 * @param {boolean[] | undefined} enabled
 * @param {DetectorClassMeta[]} [classes]
 */
export function normalizeClassEnabled(enabled, classes = DETECTOR_CLASSES) {
  return classes.map((_, index) => enabled?.[index] !== false)
}
