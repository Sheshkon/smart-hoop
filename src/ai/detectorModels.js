/** @typedef {{ index: number, className: string, label: string, roleLabel: string, appClass: 'ball' | 'hoop' | null }} DetectorClassMeta */

/** @type {DetectorClassMeta[]} */
export const DETECTOR_CLASSES = [
  {
    index: 0,
    className: 'basketball_court',
    label: 'Basketball Court',
    roleLabel: 'Мяч для игровой логики',
    appClass: 'ball',
  },
  {
    index: 1,
    className: 'basketball',
    label: 'Basketball',
    roleLabel: 'Класс модели',
    appClass: null,
  },
  {
    index: 2,
    className: 'net',
    label: 'Net',
    roleLabel: 'Кольцо для игровой логики',
    appClass: 'hoop',
  },
  {
    index: 3,
    className: 'no_ball',
    label: 'No ball',
    roleLabel: 'Класс модели',
    appClass: null,
  },
]

export const DEFAULT_CLASS_CONF_THRESHOLDS = [0.15, 0.15, 0.15, 0.15]

export const AI_MODEL_SETTINGS_VERSION = 4

export const CONF_THRESHOLD_MIN = 0.05
export const CONF_THRESHOLD_MAX = 0.95
export const CONF_THRESHOLD_STEP = 0.05

export const AI_DETECTOR_MODELS = [
  {
    id: 'hoop-and-ball-416',
    label: 'Hoop & Ball (416)',
    description: 'Все классы модели: Basketball Court, Basketball, Net, No ball',
    fileName: 'hoop-and-ball-best-416.onnx',
    inputSize: 416,
  },
  {
    id: 'hoop-and-ball-320',
    label: 'Hoop & Ball (320)',
    description: 'Все классы модели: Basketball Court, Basketball, Net, No ball',
    fileName: 'hoop-and-ball-best-320.onnx',
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
