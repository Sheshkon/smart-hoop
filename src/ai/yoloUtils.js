import {
  DEFAULT_CLASS_CONF_THRESHOLDS,
  DETECTOR_CLASSES,
  normalizeClassConfThresholds,
} from './detectorModels.js'

/**
 * @param {HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap} source
 * @param {number} [inputSize]
 * @returns {{ tensorData: Float32Array, scaleX: number, scaleY: number, sourceWidth: number, sourceHeight: number }}
 */
function createInputCanvas(inputSize) {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(inputSize, inputSize)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    return { canvas, ctx }
  }

  const canvas = document.createElement('canvas')
  canvas.width = inputSize
  canvas.height = inputSize
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  return { canvas, ctx }
}

export function preprocessFrame(source, inputSize) {
  const sourceWidth = source.videoWidth || source.width
  const sourceHeight = source.videoHeight || source.height

  if (!sourceWidth || !sourceHeight) {
    throw new Error('Frame source has no dimensions')
  }

  const { canvas, ctx } = createInputCanvas(inputSize)
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable')
  }

  const letterboxScale = Math.min(inputSize / sourceWidth, inputSize / sourceHeight)
  const drawWidth = Math.round(sourceWidth * letterboxScale)
  const drawHeight = Math.round(sourceHeight * letterboxScale)
  const padX = (inputSize - drawWidth) / 2
  const padY = (inputSize - drawHeight) / 2

  ctx.fillStyle = '#727272'
  ctx.fillRect(0, 0, inputSize, inputSize)
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, padX, padY, drawWidth, drawHeight)

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
    sourceWidth,
    sourceHeight,
    inputSize,
    letterboxScale,
    padX,
    padY,
  }
}

/**
 * @param {{ x: number, y: number, width: number, height: number }} modelBox
 * @param {{ letterboxScale: number, padX: number, padY: number }} preprocessMeta
 */
export function mapModelBoxToVideo(modelBox, preprocessMeta) {
  const { letterboxScale, padX, padY } = preprocessMeta

  return {
    x: (modelBox.x - padX) / letterboxScale,
    y: (modelBox.y - padY) / letterboxScale,
    width: modelBox.width / letterboxScale,
    height: modelBox.height / letterboxScale,
  }
}

/**
 * Map a video-frame box to canvas coords (object-fit: cover within viewport).
 * @param {{ x: number, y: number, width: number, height: number }} videoBox
 * @param {number} videoWidth
 * @param {number} videoHeight
 * @param {{ offsetX: number, offsetY: number, renderWidth: number, renderHeight: number }} viewport
 */
export function mapVideoBoxToCanvas(videoBox, videoWidth, videoHeight, viewport) {
  const { offsetX, offsetY, renderWidth, renderHeight } = viewport
  const scale = Math.max(renderWidth / videoWidth, renderHeight / videoHeight)
  const scaledWidth = videoWidth * scale
  const scaledHeight = videoHeight * scale
  const cropX = (scaledWidth - renderWidth) / 2
  const cropY = (scaledHeight - renderHeight) / 2

  return {
    x: offsetX + videoBox.x * scale - cropX,
    y: offsetY + videoBox.y * scale - cropY,
    width: videoBox.width * scale,
    height: videoBox.height * scale,
  }
}

export function boxIoU(a, b) {
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
 * @param {{ confThreshold?: number, iouThreshold?: number, classConfThresholds?: number[] }} [options]
 */
export function postprocessYoloOutput(output, options = {}) {
  const confThreshold = options.confThreshold ?? 0.25
  const iouThreshold = options.iouThreshold ?? 0.45
  const classConfThresholds = normalizeClassConfThresholds(
    options.classConfThresholds ?? DEFAULT_CLASS_CONF_THRESHOLDS,
  )

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

    if (bestScore < (classConfThresholds[bestClass] ?? confThreshold)) continue

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
 * @param {{ sourceWidth: number, sourceHeight: number, inputSize?: number, letterboxScale: number, padX: number, padY: number }} preprocessMeta
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {{ offsetX: number, offsetY: number, renderWidth: number, renderHeight: number }} viewport
 * @param {number} [inputSize]
 */
export function mapDetectionToCanvas(
  detection,
  preprocessMeta,
  canvasWidth,
  canvasHeight,
  viewport,
  inputSize,
) {
  const resolvedInputSize = inputSize ?? preprocessMeta.inputSize
  const videoBox = mapModelBoxToVideo(detection.box, preprocessMeta)
  const canvasBox = mapVideoBoxToCanvas(
    videoBox,
    preprocessMeta.sourceWidth,
    preprocessMeta.sourceHeight,
    viewport ?? {
      offsetX: 0,
      offsetY: 0,
      renderWidth: canvasWidth,
      renderHeight: canvasHeight,
    },
  )

  const classMeta = DETECTOR_CLASSES[detection.classIndex]
  const className = classMeta?.className ?? `class_${detection.classIndex}`

  return {
    className,
    appClass: classMeta?.appClass ?? null,
    modelClassName: classMeta?.label ?? `class_${detection.classIndex}`,
    displayLabel: classMeta?.label ?? `class_${detection.classIndex}`,
    roleLabel: classMeta?.roleLabel ?? '',
    confidence: detection.confidence,
    box: canvasBox,
    videoBox,
    sourceWidth: preprocessMeta.sourceWidth,
    sourceHeight: preprocessMeta.sourceHeight,
    modelBox: {
      x: detection.box.x,
      y: detection.box.y,
      width: detection.box.width,
      height: detection.box.height,
      inputSize: resolvedInputSize,
    },
  }
}

/**
 * @param {ReturnType<typeof mapDetectionToCanvas>} detection
 * @param {{ offsetX: number, offsetY: number, renderWidth: number, renderHeight: number }} viewport
 */
export function remapDetectionToCanvas(detection, viewport) {
  if (!detection.videoBox || !detection.sourceWidth || !detection.sourceHeight) {
    return detection
  }

  return {
    ...detection,
    box: mapVideoBoxToCanvas(
      detection.videoBox,
      detection.sourceWidth,
      detection.sourceHeight,
      viewport,
    ),
  }
}
