export const AI_DETECTOR_MODELS = [
  {
    id: 'bodd-yolov8n',
    label: 'BODD YOLOv8n',
    description: 'Мяч, кольцо, игрок, судья',
    fileName: 'smart-hoop-detector.onnx',
    inputSize: 704,
    source: 'BODD_yolov8n_0001.pt',
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
