const DEFAULT_INFERENCE_INTERVAL_MS = 66

/**
 * @param {{ inferenceIntervalMs?: number }} [options]
 */
export function createDetectorWorkerClient(options = {}) {
  const inferenceIntervalMs = options.inferenceIntervalMs ?? DEFAULT_INFERENCE_INTERVAL_MS

  /** @type {Worker | null} */
  let worker = null
  let ready = false
  let inferInFlight = false
  let lastInferenceAt = 0
  /** @type {Array<{ className: string, confidence: number, box: object }> | null} */
  let lastDetections = null
  let initError = null
  let disposed = false
  /** @type {((value?: void) => void) | null} */
  let initResolve = null
  /** @type {((reason?: unknown) => void) | null} */
  let initReject = null
  let pendingFreshResult = false

  function handleWorkerMessage(event) {
    const msg = event.data

    switch (msg.type) {
      case 'init-ok':
        ready = true
        initResolve?.()
        initResolve = null
        initReject = null
        break
      case 'init-error': {
        initError = new Error(msg.message)
        initReject?.(initError)
        initResolve = null
        initReject = null
        break
      }
      case 'detect-result':
        lastDetections = msg.detections
        pendingFreshResult = true
        inferInFlight = false
        break
      case 'detect-error':
        console.error('Detector worker inference failed:', msg.message)
        inferInFlight = false
        break
      default:
        break
    }
  }

  function handleWorkerError(event) {
    const message = event.message || 'Detector worker crashed'
    initError = new Error(message)
    inferInFlight = false
    initReject?.(initError)
    initResolve = null
    initReject = null
  }

  /**
   * @param {string} modelUrl
   * @param {number} inputSize
   */
  async function init(modelUrl, inputSize) {
    dispose()

    disposed = false
    ready = false
    inferInFlight = false
    lastInferenceAt = 0
    lastDetections = null
    initError = null
    pendingFreshResult = false

    worker = new Worker(new URL('./detectorWorker.js', import.meta.url), { type: 'module' })
    worker.onmessage = handleWorkerMessage
    worker.onerror = handleWorkerError

    const initPromise = new Promise((resolve, reject) => {
      initResolve = resolve
      initReject = reject
    })

    worker.postMessage({ type: 'init', modelUrl, inputSize })
    await initPromise
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {number} canvasWidth
   * @param {number} canvasHeight
   * @param {object} viewport
   */
  function scheduleDetection(video, canvasWidth, canvasHeight, viewport) {
    inferInFlight = true

    createImageBitmap(video)
      .then((bitmap) => {
        if (disposed || !worker) {
          bitmap.close()
          inferInFlight = false
          return
        }

        worker.postMessage(
          {
            type: 'detect',
            bitmap,
            canvasWidth,
            canvasHeight,
            sourceWidth: video.videoWidth,
            sourceHeight: video.videoHeight,
            viewport,
          },
          [bitmap],
        )
      })
      .catch((err) => {
        console.error('createImageBitmap failed:', err)
        inferInFlight = false
      })
  }

  /**
   * @param {{
   *   width: number,
   *   height: number,
   *   timestampMs?: number,
   *   video?: HTMLVideoElement | null,
   *   viewport?: object,
   * }} input
   */
  function detect(input) {
    const {
      width,
      height,
      timestampMs = performance.now(),
      video = null,
      viewport = null,
    } = input

    if (initError) {
      return { detections: [], inferenceFresh: false, error: initError.message }
    }

    if (!ready) {
      return { detections: [], inferenceFresh: false, error: 'AI worker is not ready' }
    }

    const shouldRun =
      !inferInFlight &&
      video != null &&
      video.readyState >= 2 &&
      viewport != null &&
      timestampMs - lastInferenceAt >= inferenceIntervalMs

    if (shouldRun) {
      lastInferenceAt = timestampMs
      scheduleDetection(video, width, height, viewport)
    }

    const inferenceFresh = pendingFreshResult
    pendingFreshResult = false

    return {
      detections: lastDetections ?? [],
      inferenceFresh,
      error: null,
    }
  }

  function dispose() {
    disposed = true
    worker?.terminate()
    worker = null
    ready = false
    inferInFlight = false
    lastDetections = null
    initResolve = null
    initReject = null
  }

  return { init, detect, dispose }
}
