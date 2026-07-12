import { getSceneViewportForOrientation } from '../utils/sceneViewport.js'
import { getAiDetectorModelUrl } from './detectorModels.js'
import {
  getSelectedAiDetectorModel,
  getSelectedClassConfThresholds,
} from '../stores/aiModelSettings.js'
import { createDetectorWorkerClient } from './workerClient.js'
import { remapDetectionToCanvas } from './yoloUtils.js'

export function createOnnxDetector() {
  const workerClient = createDetectorWorkerClient()
  let initError = null

  return {
    mode: 'ai',
    initError: null,

    async init() {
      initError = null
      this.initError = null

      const model = getSelectedAiDetectorModel()
      const modelUrl = getAiDetectorModelUrl(model)
      const classConfThresholds = getSelectedClassConfThresholds()

      try {
        await workerClient.init(modelUrl, model.inputSize, classConfThresholds, model.classes)
      } catch (err) {
        initError = err instanceof Error ? err : new Error(String(err))
        this.initError = initError
        throw initError
      }
    },

    updateThresholds(classConfThresholds) {
      workerClient.setThresholds(classConfThresholds)
    },

    detect(input) {
      const {
        width,
        height,
        timestampMs = performance.now(),
        paused = false,
        orientation = 'portrait',
        video = null,
      } = input

      const viewport = getSceneViewportForOrientation(width, height, orientation)

      if (initError) {
        return {
          detections: [],
          viewport,
          orientation,
          aiError: initError.message,
        }
      }

      const { detections, error, inferenceFresh } = workerClient.detect({
        width,
        height,
        timestampMs,
        video,
        viewport,
      })
      const canvasDetections = detections.map((detection) =>
        remapDetectionToCanvas(detection, viewport),
      )

      return {
        detections: canvasDetections,
        viewport,
        orientation,
        inferenceFresh,
        aiError: error,
      }
    },

    dispose() {
      workerClient.dispose()
      initError = null
      this.initError = null
    },
  }
}
