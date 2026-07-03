const RESOLUTION_PRESETS = [
  { width: 1280, height: 720 },
  { width: 960, height: 540 },
  { width: 640, height: 480 },
]

export class CameraError extends Error {
  /**
   * @param {'not_supported' | 'permission_denied' | 'not_found' | 'in_use' | 'failed'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'CameraError'
    this.code = code
  }
}

/**
 * @param {DOMException | Error | null | undefined} err
 * @returns {CameraError}
 */
function toCameraError(err) {
  const name = err?.name || ''

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return new CameraError(
      'permission_denied',
      'Доступ к камере запрещён. Разрешите камеру в настройках браузера.',
    )
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return new CameraError(
      'not_found',
      'Камера не найдена на этом устройстве.',
    )
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return new CameraError(
      'in_use',
      'Камера занята другим приложением.',
    )
  }

  return new CameraError(
    'failed',
    'Не удалось открыть камеру. Проверьте разрешения и попробуйте снова.',
  )
}

/**
 * @returns {(() => Promise<MediaStream>) | null}
 */
function resolveGetUserMedia() {
  if (typeof navigator === 'undefined') {
    return null
  }

  if (!navigator.mediaDevices) {
    navigator.mediaDevices = {}
  }

  if (!navigator.mediaDevices.getUserMedia) {
    const legacyGetUserMedia =
      navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia

    if (legacyGetUserMedia) {
      navigator.mediaDevices.getUserMedia = (constraints) =>
        new Promise((resolve, reject) => {
          legacyGetUserMedia.call(navigator, constraints, resolve, reject)
        })
    }
  }

  if (navigator.mediaDevices.getUserMedia) {
    return navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
  }

  return null
}

function getLocalDevCameraUrl() {
  const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  const port = window.location?.port || '5173'
  return `http://localhost:${port}${basePath}/`
}

/**
 * @returns {CameraError | null}
 */
export function getCameraSupportError() {
  if (resolveGetUserMedia()) {
    return null
  }

  if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
    return new CameraError(
      'not_supported',
      `Камера не работает при открытии файла напрямую. Запустите npm run dev и откройте ${getLocalDevCameraUrl()}`,
    )
  }

  if (typeof window !== 'undefined' && !window.isSecureContext) {
    const host = window.location?.host || 'этот адрес'
    const isIpHost = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(host.split(':')[0])

    if (isIpHost) {
      return new CameraError(
        'not_supported',
        `Камера недоступна по IP (${host}). На этом компьютере откройте ${getLocalDevCameraUrl()} С телефона — Android-приложение: npm run cap:sync.`,
      )
    }

    return new CameraError(
      'not_supported',
      `Камера недоступна по адресу ${host}. Откройте ${getLocalDevCameraUrl()} (http://localhost, не IP и не https).`,
    )
  }

  return new CameraError(
    'not_supported',
    'Камера не поддерживается в этом браузере.',
  )
}

/**
 * Opens the rear camera with progressive resolution fallback.
 * @returns {Promise<{ stream: MediaStream, resolution: { width: number, height: number } }>}
 */
export async function openCamera() {
  const getUserMedia = resolveGetUserMedia()
  const supportError = getCameraSupportError()

  if (!getUserMedia || supportError) {
    throw supportError || new CameraError('not_supported', 'Камера не поддерживается в этом браузере.')
  }

  let lastError = null

  for (const resolution of RESOLUTION_PRESETS) {
    try {
      const stream = await getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: resolution.width },
          height: { ideal: resolution.height },
        },
        audio: false,
      })

      return { stream, resolution }
    } catch (err) {
      lastError = err
    }
  }

  throw toCameraError(lastError)
}

/**
 * @param {MediaStream | null | undefined} stream
 */
export function closeCamera(stream) {
  if (!stream) return

  for (const track of stream.getTracks()) {
    track.stop()
  }
}

/**
 * @param {HTMLVideoElement} videoEl
 * @param {MediaStream} stream
 */
export async function attachStreamToVideo(videoEl, stream) {
  videoEl.srcObject = stream

  try {
    await videoEl.play()
  } catch (err) {
    if (err?.name !== 'AbortError') {
      throw err
    }
  }
}
