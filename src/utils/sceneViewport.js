import { SCENE_HEIGHT, SCENE_WIDTH } from '../shot/testTrajectories.js'

/**
 * @param {'portrait' | 'landscape'} orientation
 */
export function getSceneDimensions(orientation) {
  if (orientation === 'landscape') {
    return { width: SCENE_HEIGHT, height: SCENE_WIDTH }
  }
  return { width: SCENE_WIDTH, height: SCENE_HEIGHT }
}

/**
 * Portrait scene (400×640) → landscape scene (640×400), 90° clockwise.
 * @param {{ x: number, y: number, width: number, height: number }} box
 */
export function portraitBoxToLandscape(box) {
  return {
    x: box.y,
    y: SCENE_WIDTH - box.x - box.width,
    width: box.height,
    height: box.width,
  }
}

/**
 * @param {{ x: number, y: number }} point
 */
export function portraitPointToLandscape(point) {
  return {
    x: point.y,
    y: SCENE_WIDTH - point.x,
  }
}

/**
 * Uniform scene-to-canvas mapping with letterboxing.
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {number} [sceneWidth]
 * @param {number} [sceneHeight]
 */
export function getSceneViewport(
  canvasWidth,
  canvasHeight,
  sceneWidth = SCENE_WIDTH,
  sceneHeight = SCENE_HEIGHT,
) {
  const scale = Math.min(canvasWidth / sceneWidth, canvasHeight / sceneHeight)
  const renderWidth = sceneWidth * scale
  const renderHeight = sceneHeight * scale
  const offsetX = (canvasWidth - renderWidth) / 2
  const offsetY = (canvasHeight - renderHeight) / 2

  return {
    sceneWidth,
    sceneHeight,
    scale,
    offsetX,
    offsetY,
    renderWidth,
    renderHeight,
  }
}

/**
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {'portrait' | 'landscape'} orientation
 */
export function getSceneViewportForOrientation(canvasWidth, canvasHeight, orientation) {
  const { width, height } = getSceneDimensions(orientation)
  return getSceneViewport(canvasWidth, canvasHeight, width, height)
}

/**
 * @param {{ x: number, y: number }} point
 * @param {ReturnType<typeof getSceneViewport>} viewport
 */
export function scenePointToCanvas(point, viewport) {
  return {
    x: viewport.offsetX + point.x * viewport.scale,
    y: viewport.offsetY + point.y * viewport.scale,
  }
}

/**
 * @param {{ x: number, y: number, width: number, height: number }} box
 * @param {ReturnType<typeof getSceneViewport>} viewport
 */
export function sceneBoxToCanvas(box, viewport) {
  return {
    x: viewport.offsetX + box.x * viewport.scale,
    y: viewport.offsetY + box.y * viewport.scale,
    width: box.width * viewport.scale,
    height: box.height * viewport.scale,
  }
}

/**
 * @param {{ x: number, y: number }} point
 * @param {ReturnType<typeof getSceneViewport>} viewport
 */
export function canvasPointToScene(point, viewport) {
  return {
    x: (point.x - viewport.offsetX) / viewport.scale,
    y: (point.y - viewport.offsetY) / viewport.scale,
  }
}

/**
 * Inverse of portraitPointToLandscape (landscape 640×400 → portrait 400×640).
 * @param {{ x: number, y: number }} point
 */
export function landscapePointToPortrait(point) {
  return {
    x: SCENE_WIDTH - point.y,
    y: point.x,
  }
}

/**
 * Inverse of portraitBoxToLandscape.
 * @param {{ x: number, y: number, width: number, height: number }} box
 */
export function landscapeBoxToPortrait(box) {
  return {
    x: SCENE_WIDTH - box.y - box.height,
    y: box.x,
    width: box.height,
    height: box.width,
  }
}

/**
 * @param {{ x: number, y: number, width: number, height: number }} box
 * @param {ReturnType<typeof getSceneViewport>} viewport
 */
export function canvasBoxToScene(box, viewport) {
  return {
    x: (box.x - viewport.offsetX) / viewport.scale,
    y: (box.y - viewport.offsetY) / viewport.scale,
    width: box.width / viewport.scale,
    height: box.height / viewport.scale,
  }
}

/**
 * Shot detection always runs in portrait scene space.
 * @param {{ x: number, y: number } | null} ballCenter
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 * @param {ReturnType<typeof getSceneViewport>} viewport
 * @param {'portrait' | 'landscape'} orientation
 */
export function toPortraitShotSpace(ballCenter, hoopBox, viewport, orientation) {
  const hoopScene = canvasBoxToScene(hoopBox, viewport)

  if (orientation === 'landscape') {
    return {
      ballCenter: ballCenter
        ? landscapePointToPortrait(canvasPointToScene(ballCenter, viewport))
        : null,
      hoopBox: landscapeBoxToPortrait(hoopScene),
    }
  }

  return {
    ballCenter: ballCenter ? canvasPointToScene(ballCenter, viewport) : null,
    hoopBox: hoopScene,
  }
}

export function fillLetterbox(ctx, canvasWidth, canvasHeight) {
  ctx.fillStyle = '#0d0d1a'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)
}
