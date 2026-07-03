import { createMediaPipePoseDetector } from './mediapipePoseDetector.js'

export const POSE_MODES = {
  OFF: 'off',
  MEDIAPIPE: 'mediapipe',
}

function createNoOpPoseDetector() {
  return {
    lastError: null,
    async init() {},
    detect() {
      return []
    },
    dispose() {},
  }
}

/**
 * @param {'off' | 'mediapipe'} mode
 * @param {object} [options]
 */
export function createPoseDetector(mode, options = {}) {
  if (mode === POSE_MODES.MEDIAPIPE) {
    return createMediaPipePoseDetector(options)
  }
  return createNoOpPoseDetector()
}
