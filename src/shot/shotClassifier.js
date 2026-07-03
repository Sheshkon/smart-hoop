import { distance } from '../utils/geometry.js'

const APPROACH_DISTANCE_FACTOR = 1.8

/**
 * @param {{ x: number, y: number }} ballCenter
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 */
export function isBallAboveHoop(ballCenter, hoopBox) {
  return ballCenter.y < hoopBox.y + hoopBox.height * 0.35
}

/**
 * @param {{ x: number, y: number }} ballCenter
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 */
export function isBallBelowHoop(ballCenter, hoopBox) {
  return ballCenter.y > hoopBox.y + hoopBox.height * 0.65
}

/**
 * @param {{ x: number, y: number }} ballCenter
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 */
export function isBallInRimZone(ballCenter, hoopBox) {
  return (
    ballCenter.x >= hoopBox.x &&
    ballCenter.x <= hoopBox.x + hoopBox.width &&
    ballCenter.y >= hoopBox.y &&
    ballCenter.y <= hoopBox.y + hoopBox.height
  )
}

/**
 * @param {{ x: number, y: number }} ballCenter
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 */
export function isBallWithinHoopWidth(ballCenter, hoopBox) {
  return ballCenter.x >= hoopBox.x && ballCenter.x <= hoopBox.x + hoopBox.width
}

/**
 * @param {{ x: number, y: number }} prevCenter
 * @param {{ x: number, y: number }} currentCenter
 */
export function isMovingDown(prevCenter, currentCenter) {
  if (!prevCenter) return false
  return currentCenter.y > prevCenter.y + 0.5
}

/**
 * @param {{ x: number, y: number }} ballCenter
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 */
export function isApproachingHoop(ballCenter, hoopBox) {
  const hoopCenter = {
    x: hoopBox.x + hoopBox.width / 2,
    y: hoopBox.y + hoopBox.height / 2,
  }
  const hoopRadius = Math.min(hoopBox.width, hoopBox.height) * APPROACH_DISTANCE_FACTOR
  return distance(ballCenter, hoopCenter) <= hoopRadius
}

/**
 * @param {{ x: number, y: number }} ballCenter
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 */
export function hasPassedHoopLevel(ballCenter, hoopBox) {
  return ballCenter.y > hoopBox.y + hoopBox.height
}

/**
 * @param {{ x: number, y: number }} ballCenter
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 */
export function isWideMiss(ballCenter, hoopBox) {
  if (!hasPassedHoopLevel(ballCenter, hoopBox)) return false
  return !isBallWithinHoopWidth(ballCenter, hoopBox)
}
