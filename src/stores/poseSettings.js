import { reactive } from 'vue'
import { getPoseModelUrl, POSE_MODEL_RELATIVE } from '../ai/mediapipePoseDetector.js'
import { POSE_MODES } from '../ai/poseDetectorFactory.js'

const STORAGE_KEY = 'smart-hoop.pose-settings'

export const POSE_FPS_MIN = 5
export const POSE_FPS_MAX = 30
export const POSE_FPS_DEFAULT = 15

export const poseSettings = reactive({
  poseMode: POSE_MODES.MEDIAPIPE,
  poseFps: POSE_FPS_DEFAULT,
  poseModel: POSE_MODEL_RELATIVE,
})

function clampPoseFps(value) {
  const fps = Number(value)
  if (!Number.isFinite(fps)) {
    return POSE_FPS_DEFAULT
  }
  return Math.min(POSE_FPS_MAX, Math.max(POSE_FPS_MIN, Math.round(fps)))
}

function normalizePoseModelPath(stored) {
  if (/^https?:\/\//i.test(stored)) {
    return stored
  }

  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  let path = stored.trim()

  if (base && path.startsWith(base)) {
    path = path.slice(base.length)
  }

  path = path.replace(/^\//, '').replace(/^models\//, '')
  return path || POSE_MODEL_RELATIVE
}

function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return
    }

    const parsed = JSON.parse(stored)
    if (parsed.poseMode === POSE_MODES.OFF || parsed.poseMode === POSE_MODES.MEDIAPIPE) {
      poseSettings.poseMode = parsed.poseMode
    }
    if (parsed.poseFps != null) {
      poseSettings.poseFps = clampPoseFps(parsed.poseFps)
    }
    if (typeof parsed.poseModel === 'string' && parsed.poseModel.trim()) {
      poseSettings.poseModel = normalizePoseModelPath(parsed.poseModel)
    }
  } catch {
    // ignore
  }
}

function saveSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        poseMode: poseSettings.poseMode,
        poseFps: poseSettings.poseFps,
        poseModel: poseSettings.poseModel,
      }),
    )
  } catch (err) {
    console.error('Failed to save pose settings:', err)
  }
}

export function initPoseSettings() {
  loadSettings()
  saveSettings()
}

/**
 * @param {'off' | 'mediapipe'} mode
 * @param {{ persist?: boolean }} [options]
 */
export function setPoseMode(mode, options = {}) {
  const { persist = true } = options
  if (mode !== POSE_MODES.OFF && mode !== POSE_MODES.MEDIAPIPE) {
    return
  }
  poseSettings.poseMode = mode
  if (persist) {
    saveSettings()
  }
}

export function setPoseFps(fps) {
  poseSettings.poseFps = clampPoseFps(fps)
  saveSettings()
}

export function setPoseModel(modelUrl) {
  const trimmed = modelUrl?.trim()
  if (!trimmed) {
    return
  }
  poseSettings.poseModel = normalizePoseModelPath(trimmed)
  saveSettings()
}

export function getPoseModelFileName() {
  const parts = poseSettings.poseModel.split('/')
  return parts[parts.length - 1] || poseSettings.poseModel
}

export function getResolvedPoseModelUrl() {
  return getPoseModelUrl(poseSettings.poseModel)
}
