export const MODEL_INPUT_SIZE = 704

/** BODD_yolov8n — 4 classes from model output channels (8 = 4 bbox + 4 classes). */
export const YOLO_CLASS_NAMES = ['ball', 'hoop', 'person', 'referee']

const APP_CLASS_NAMES = new Set(['ball', 'hoop'])

/**
 * @param {HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap} source
 * @param {number} [inputSize]
 * @returns {{ tensorData: Float32Array, scaleX: number, scaleY: number, sourceWidth: number, sourceHeight: number }}
 */
export function preprocessFrame(source, inputSize = MODEL_INPUT_SIZE) {
  const sourceWidth = source.videoWidth || source.width
  const sourceHeight = source.videoHeight || source.height

  if (!sourceWidth || !sourceHeight) {
    throw new Error('Frame source has no dimensions')
  }

  const canvas = document.createElement('canvas')
  canvas.width = inputSize
  canvas.height = inputSize

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable')
  }

  ctx.drawImage(source, 0, 0, inputSize, inputSize)

  const { data } = ctx.getImageData(0, 0, inputSize, inputSize)
  const tensorData = new Float32Array(3 * inputSize * inputSize)
  const channelSize = inputSize * inputSize

  for (let i = 0; i < channelSize; i++) {
    const offset = i * 4
    const r = data[offset] / 255
    const g = data[offset + 1] / 255
    const b = data[offset + 2] / 255

    tensorData[i] = r
    tensorData[channelSize + i] = g
    tensorData[channelSize * 2 + i] = b
  }

  return {
    tensorData,
    scaleX: sourceWidth / inputSize,
    scaleY: sourceHeight / inputSize,
    sourceWidth,
    sourceHeight,
  }
}

function boxIoU(a, b) {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  if (intersection <= 0) return 0

  const union = a.width * a.height + b.width * b.height - intersection
  return union > 0 ? intersection / union : 0
}

/**
 * @param {Array<{ classIndex: number, confidence: number, box: { x: number, y: number, width: number, height: number } }>} boxes
 * @param {number} [iouThreshold]
 */
export function nonMaxSuppression(boxes, iouThreshold = 0.45) {
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence)
  const kept = []

  for (const candidate of sorted) {
    const overlaps = kept.some(
      (item) =>
        item.classIndex === candidate.classIndex &&
        boxIoU(item.box, candidate.box) > iouThreshold,
    )

    if (!overlaps) {
      kept.push(candidate)
    }
  }

  return kept
}

/**
 * @param {import('onnxruntime-web').Tensor} output
 * @param {{ confThreshold?: number, iouThreshold?: number }} [options]
 */
export function postprocessYoloOutput(output, options = {}) {
  const confThreshold = options.confThreshold ?? 0.25
  const iouThreshold = options.iouThreshold ?? 0.45

  const [, numChannels, numBoxes] = output.dims
  const numClasses = numChannels - 4
  const data = output.data

  const candidates = []

  for (let i = 0; i < numBoxes; i++) {
    let bestClass = 0
    let bestScore = 0

    for (let classIndex = 0; classIndex < numClasses; classIndex++) {
      const score = data[(4 + classIndex) * numBoxes + i]
      if (score > bestScore) {
        bestScore = score
        bestClass = classIndex
      }
    }

    if (bestScore < confThreshold) continue

    const cx = data[i]
    const cy = data[numBoxes + i]
    const width = data[2 * numBoxes + i]
    const height = data[3 * numBoxes + i]

    candidates.push({
      classIndex: bestClass,
      confidence: bestScore,
      box: {
        x: cx - width / 2,
        y: cy - height / 2,
        width,
        height,
      },
    })
  }

  return nonMaxSuppression(candidates, iouThreshold)
}

/**
 * @param {ReturnType<typeof postprocessYoloOutput>[number]} detection
 * @param {{ scaleX: number, scaleY: number }} preprocessMeta
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {number} [inputSize]
 */
export function mapDetectionToCanvas(
  detection,
  preprocessMeta,
  canvasWidth,
  canvasHeight,
  inputSize = MODEL_INPUT_SIZE,
) {
  const scaleToSourceX = preprocessMeta.scaleX
  const scaleToSourceY = preprocessMeta.scaleY
  const scaleToCanvasX = canvasWidth / preprocessMeta.sourceWidth
  const scaleToCanvasY = canvasHeight / preprocessMeta.sourceHeight

  const sourceBox = {
    x: detection.box.x * scaleToSourceX,
    y: detection.box.y * scaleToSourceY,
    width: detection.box.width * scaleToSourceX,
    height: detection.box.height * scaleToSourceY,
  }

  return {
    className: YOLO_CLASS_NAMES[detection.classIndex] ?? `class_${detection.classIndex}`,
    confidence: detection.confidence,
    box: {
      x: sourceBox.x * scaleToCanvasX,
      y: sourceBox.y * scaleToCanvasY,
      width: sourceBox.width * scaleToCanvasX,
      height: sourceBox.height * scaleToCanvasY,
    },
    modelBox: {
      x: detection.box.x,
      y: detection.box.y,
      width: detection.box.width,
      height: detection.box.height,
      inputSize,
    },
  }
}

/**
 * @param {ReturnType<typeof mapDetectionToCanvas>[]} detections
 */
export function filterAppDetections(detections) {
  return detections.filter((item) => APP_CLASS_NAMES.has(item.className))
}
