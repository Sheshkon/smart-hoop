import * as ort from 'onnxruntime-web'
import './ortSetup.js'
import { DEFAULT_CLASS_CONF_THRESHOLDS, normalizeClassConfThresholds } from './detectorModels.js'
import {
  filterAppDetections,
  mapDetectionToCanvas,
  postprocessYoloOutput,
  preprocessFrame,
} from './yoloUtils.js'

/** @type {ort.InferenceSession | null} */
let session = null
let inputName = 'images'
let outputName = 'output0'
let inputSize = 416
let inferInFlight = false
/** @type {number[]} */
let classConfThresholds = [...DEFAULT_CLASS_CONF_THRESHOLDS]

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

async function handleInit(modelUrl, size, thresholds) {
  inputSize = size
  if (thresholds) {
    classConfThresholds = normalizeClassConfThresholds(thresholds)
  }
  session = await createInferenceSession(modelUrl)
  inputName = session.inputNames[0] ?? 'images'
  outputName = session.outputNames[0] ?? 'output0'

  self.postMessage({
    type: 'init-ok',
    inputName,
    outputName,
  })
}

async function handleDetect(data) {
  if (!session || inferInFlight) return

  const { bitmap, canvasWidth, canvasHeight, sourceWidth, sourceHeight, viewport } = data
  inferInFlight = true

  try {
    const preprocessMeta = preprocessFrame(bitmap, inputSize)
    preprocessMeta.sourceWidth = sourceWidth
    preprocessMeta.sourceHeight = sourceHeight

    const tensor = new ort.Tensor('float32', preprocessMeta.tensorData, [
      1,
      3,
      inputSize,
      inputSize,
    ])

    const outputs = await session.run({ [inputName]: tensor })
    const output = outputs[outputName]
    const rawDetections = postprocessYoloOutput(output, { classConfThresholds })
    const detections = filterAppDetections(
      rawDetections.map((item) =>
        mapDetectionToCanvas(
          item,
          preprocessMeta,
          canvasWidth,
          canvasHeight,
          viewport,
          inputSize,
        ),
      ),
    )

    self.postMessage({ type: 'detect-result', detections })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    self.postMessage({ type: 'detect-error', message })
  } finally {
    bitmap.close()
    inferInFlight = false
  }
}

self.onmessage = async (event) => {
  const { type } = event.data

  if (type === 'init') {
    try {
      await handleInit(event.data.modelUrl, event.data.inputSize, event.data.classConfThresholds)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      self.postMessage({ type: 'init-error', message })
    }
    return
  }

  if (type === 'set-thresholds') {
    classConfThresholds = normalizeClassConfThresholds(event.data.classConfThresholds)
    return
  }

  if (type === 'detect') {
    await handleDetect(event.data)
  }
}
