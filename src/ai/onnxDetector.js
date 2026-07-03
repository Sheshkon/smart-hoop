import * as ort from 'onnxruntime-web'
import './ortSetup.js'
import { DEFAULT_HOOP_BOX, getCalibration } from '../shot/hoopCalibration.js'
import { getBoxCenter } from '../utils/geometry.js'
import {
  getSceneViewportForOrientation,
  portraitBoxToLandscape,
  sceneBoxToCanvas,
} from '../utils/sceneViewport.js'
import {
  filterAppDetections,
  mapDetectionToCanvas,
  postprocessYoloOutput,
  preprocessFrame,
} from './yoloUtils.js'
import { getAiDetectorModelUrl } from './detectorModels.js'
import { getSelectedAiDetectorModel } from '../stores/aiModelSettings.js'
const INFERENCE_INTERVAL_MS = 120
const BALL_HISTORY_MAX = 120
const BALL_HISTORY_INTERVAL_MS = 50

const ballHistory = []
let lastHistoryTimestamp = 0

function resetBallHistory() {
  ballHistory.length = 0
  lastHistoryTimestamp = 0
}

function pushBallHistory(point, timestampMs) {
  if (
    ballHistory.length > 0 &&
    timestampMs - lastHistoryTimestamp < BALL_HISTORY_INTERVAL_MS
  ) {
    return
  }

  lastHistoryTimestamp = timestampMs
  ballHistory.push({ x: point.x, y: point.y, t: timestampMs })

  if (ballHistory.length > BALL_HISTORY_MAX) {
    ballHistory.shift()
  }
}

function getHoopBoxScene(orientation, calibration) {
  const portraitBox = calibration.manuallyAdjusted ? calibration.hoopBox : DEFAULT_HOOP_BOX
  if (orientation === 'landscape') {
    return portraitBoxToLandscape(portraitBox)
  }
  return { ...portraitBox }
}

async function createInferenceSession(modelUrl) {
  const executionProviders =
    typeof navigator !== 'undefined' && 'gpu' in navigator
      ? ['webgpu', 'wasm']
      : ['wasm']

  return ort.InferenceSession.create(modelUrl, {
    graphOptimizationLevel: 'all',
    executionProviders,
  })
}

export function createOnnxDetector() {
  /** @type {ort.InferenceSession | null} */
  let session = null
  let inputName = 'images'
  let outputName = 'output0'
  let inputSize = getSelectedAiDetectorModel().inputSize
  let initError = null
  let inferInFlight = false
  let lastInferenceAt = 0
  let lastResult = null

  return {
    mode: 'ai',
    initError: null,

    async init() {
      resetBallHistory()
      initError = null
      this.initError = null

      const model = getSelectedAiDetectorModel()
      inputSize = model.inputSize
      const modelUrl = getAiDetectorModelUrl(model)

      try {
        session = await createInferenceSession(modelUrl)
        inputName = session.inputNames[0] ?? 'images'
        outputName = session.outputNames[0] ?? 'output0'
      } catch (err) {
        initError = err instanceof Error ? err : new Error(String(err))
        this.initError = initError
        session = null
        throw initError
      }
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

      const calibration = getCalibration()
      const viewport = getSceneViewportForOrientation(width, height, orientation)

      if (initError || !session) {
        return buildFallbackResult({
          width,
          height,
          orientation,
          calibration,
          viewport,
          paused,
          timestampMs,
          error: initError?.message ?? 'AI model is not loaded',
        })
      }

      if (!video || video.readyState < 2) {
        return lastResult ?? buildFallbackResult({
          width,
          height,
          orientation,
          calibration,
          viewport,
          paused,
          timestampMs,
        })
      }

      const shouldRunInference =
        !inferInFlight &&
        !paused &&
        timestampMs - lastInferenceAt >= INFERENCE_INTERVAL_MS

      if (shouldRunInference) {
        inferInFlight = true
        lastInferenceAt = timestampMs

        runInference(session, inputName, outputName, video, {
          width,
          height,
          orientation,
          calibration,
          viewport,
          paused,
          timestampMs,
        }, inputSize)
          .then((result) => {
            lastResult = result
          })
          .catch((err) => {
            console.error('ONNX inference failed:', err)
          })
          .finally(() => {
            inferInFlight = false
          })
      }

      if (lastResult) {
        return {
          ...lastResult,
          ballHistory: ballHistory.map((point) => ({ ...point })),
          trajectoryPlaying: false,
        }
      }

      return buildFallbackResult({
        width,
        height,
        orientation,
        calibration,
        viewport,
        paused,
        timestampMs,
      })
    },

    dispose() {
      resetBallHistory()
      lastResult = null
      inferInFlight = false
      lastInferenceAt = 0

      if (session) {
        session = null
      }

      initError = null
      this.initError = null
    },
  }
}

async function runInference(session, inputName, outputName, video, context, modelInputSize) {
  const { width, height, orientation, calibration, viewport, paused, timestampMs } = context
  const preprocessMeta = preprocessFrame(video, modelInputSize)
  const tensor = new ort.Tensor('float32', preprocessMeta.tensorData, [
    1,
    3,
    modelInputSize,
    modelInputSize,
  ])

  const outputs = await session.run({ [inputName]: tensor })
  const output = outputs[outputName]
  const rawDetections = postprocessYoloOutput(output)
  const mappedDetections = filterAppDetections(
    rawDetections.map((item) =>
      mapDetectionToCanvas(item, preprocessMeta, width, height, modelInputSize),
    ),
  )

  return buildDetectionResult({
    mappedDetections,
    width,
    height,
    orientation,
    calibration,
    viewport,
    paused,
    timestampMs,
  })
}

function buildFallbackResult({
  width,
  height,
  orientation,
  calibration,
  viewport,
  paused,
  timestampMs,
  error = null,
}) {
  const hoopBoxScene = getHoopBoxScene(orientation, calibration)
  const hoopBox = sceneBoxToCanvas(hoopBoxScene, viewport)

  return {
    detections: [
      {
        className: 'hoop',
        confidence: calibration.manuallyAdjusted ? 1 : 0.5,
        box: hoopBox,
      },
    ],
    ballCenter: null,
    ballHistory: ballHistory.map((point) => ({ ...point })),
    hoopBox,
    viewport,
    orientation,
    trajectoryPlaying: false,
    aiError: error,
  }
}

function buildDetectionResult({
  mappedDetections,
  orientation,
  calibration,
  viewport,
  paused,
  timestampMs,
}) {
  let hoopDetection = mappedDetections.find((item) => item.className === 'hoop')
  const ballDetection = mappedDetections.find((item) => item.className === 'ball')

  if (calibration.manuallyAdjusted || !hoopDetection) {
    const hoopBoxScene = getHoopBoxScene(orientation, calibration)
    const hoopBox = sceneBoxToCanvas(hoopBoxScene, viewport)

    hoopDetection = {
      className: 'hoop',
      confidence: calibration.manuallyAdjusted ? 1 : hoopDetection?.confidence ?? 0.5,
      box: hoopBox,
    }
  }

  const detections = [hoopDetection]
  let ballCenter = null

  if (ballDetection) {
    detections.push(ballDetection)
    ballCenter = getBoxCenter(ballDetection.box)

    if (!paused) {
      pushBallHistory(ballCenter, timestampMs)
    }
  }

  return {
    detections,
    ballCenter,
    ballHistory: ballHistory.map((point) => ({ ...point })),
    hoopBox: hoopDetection.box,
    viewport,
    orientation,
    trajectoryPlaying: false,
    aiError: null,
  }
}
