import { DETECTOR_MODES } from './detectorModes.js'
import { createManualDetector } from './manualDetector.js'
import { createOnnxDetector } from './onnxDetector.js'

/**
 * @param {'manual' | 'ai'} mode
 */
export function createDetector(mode) {
  if (mode === DETECTOR_MODES.AI) {
    return createOnnxDetector()
  }
  return createManualDetector()
}
