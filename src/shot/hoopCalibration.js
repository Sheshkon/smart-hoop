import { SCENE_HEIGHT, SCENE_WIDTH } from './testTrajectories.js'

const STORAGE_KEY = 'smart-hoop-hoop-calibration'

export const DEFAULT_HOOP_BOX = {
  x: 140,
  y: 100,
  width: 120,
  height: 80,
}

function createDefaultCalibration() {
  return {
    hoopBox: { ...DEFAULT_HOOP_BOX },
    manuallyAdjusted: false,
    confidence: 0.95,
    createdAt: null,
  }
}

let calibration = createDefaultCalibration()

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return

    const parsed = JSON.parse(raw)
    if (!parsed?.hoopBox) return

    calibration = {
      hoopBox: {
        x: Number(parsed.hoopBox.x) || DEFAULT_HOOP_BOX.x,
        y: Number(parsed.hoopBox.y) || DEFAULT_HOOP_BOX.y,
        width: Number(parsed.hoopBox.width) || DEFAULT_HOOP_BOX.width,
        height: Number(parsed.hoopBox.height) || DEFAULT_HOOP_BOX.height,
      },
      manuallyAdjusted: Boolean(parsed.manuallyAdjusted),
      confidence: parsed.manuallyAdjusted ? 1 : 0.95,
      createdAt: parsed.createdAt || null,
    }
  } catch {
    calibration = createDefaultCalibration()
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(calibration))
  } catch {
    // ignore quota errors
  }
}

loadFromStorage()

export function getCalibration() {
  return {
    hoopBox: { ...calibration.hoopBox },
    manuallyAdjusted: calibration.manuallyAdjusted,
    confidence: calibration.confidence,
    createdAt: calibration.createdAt,
  }
}

export function hasManualCalibration() {
  return calibration.manuallyAdjusted
}

/**
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 */
export function saveCalibration(hoopBox) {
  calibration = {
    hoopBox: {
      x: hoopBox.x,
      y: hoopBox.y,
      width: hoopBox.width,
      height: hoopBox.height,
    },
    manuallyAdjusted: true,
    confidence: 1,
    createdAt: new Date().toISOString(),
  }
  persist()
  return getCalibration()
}

export function resetCalibration() {
  calibration = createDefaultCalibration()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  return getCalibration()
}

export function getSceneSize() {
  return { width: SCENE_WIDTH, height: SCENE_HEIGHT }
}
