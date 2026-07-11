import { distance } from '../utils/geometry.js'

const APPROACH_DISTANCE_FACTOR = 1.8
const BALL_RADIUS_MAKE_OVERLAP_FACTOR = 1
const RIM_WIDTH_PADDING_FACTOR = 0.18

function getRimHorizontalRange(hoopBox) {
  return {
    left: hoopBox.x,
    right: hoopBox.x + hoopBox.width,
  }
}

function isPointInBox(point, box) {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  )
}

function ccw(a, b, c) {
  return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x)
}

function doSegmentsIntersect(a, b, c, d) {
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d)
}

/**
 * @param {{ x: number, y: number } | null} prevCenter
 * @param {{ x: number, y: number }} currentCenter
 * @param {{ x: number, y: number, width: number, height: number } | null} box
 */
export function didSegmentTouchBox(prevCenter, currentCenter, box) {
  if (!box || !prevCenter) return false
  if (isPointInBox(prevCenter, box) || isPointInBox(currentCenter, box)) return true

  const topLeft = { x: box.x, y: box.y }
  const topRight = { x: box.x + box.width, y: box.y }
  const bottomLeft = { x: box.x, y: box.y + box.height }
  const bottomRight = { x: box.x + box.width, y: box.y + box.height }

  return (
    doSegmentsIntersect(prevCenter, currentCenter, topLeft, topRight) ||
    doSegmentsIntersect(prevCenter, currentCenter, topRight, bottomRight) ||
    doSegmentsIntersect(prevCenter, currentCenter, bottomRight, bottomLeft) ||
    doSegmentsIntersect(prevCenter, currentCenter, bottomLeft, topLeft)
  )
}

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
  const { left, right } = getRimHorizontalRange(hoopBox)

  return (
    ballCenter.x >= left &&
    ballCenter.x <= right &&
    ballCenter.y >= hoopBox.y &&
    ballCenter.y <= hoopBox.y + hoopBox.height
  )
}

/**
 * @param {{ x: number, y: number } | null} prevCenter
 * @param {{ x: number, y: number }} currentCenter
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 */
export function didBallCrossRimZone(prevCenter, currentCenter, hoopBox) {
  if (!prevCenter) return isBallInRimZone(currentCenter, hoopBox)
  if (isBallInRimZone(prevCenter, hoopBox) || isBallInRimZone(currentCenter, hoopBox)) return true

  const rimTop = hoopBox.y
  const rimBottom = hoopBox.y + hoopBox.height
  const movingThroughBand =
    (prevCenter.y < rimTop && currentCenter.y > rimBottom) ||
    (prevCenter.y > rimBottom && currentCenter.y < rimTop)

  if (!movingThroughBand || currentCenter.y === prevCenter.y) return false

  const crossingY = prevCenter.y < currentCenter.y ? rimTop : rimBottom
  const progress = (crossingY - prevCenter.y) / (currentCenter.y - prevCenter.y)
  const crossingX = prevCenter.x + (currentCenter.x - prevCenter.x) * progress

  const { left, right } = getRimHorizontalRange(hoopBox)
  return crossingX >= left && crossingX <= right
}

/**
 * @param {{ x: number, y: number } | null} prevCenter
 * @param {{ x: number, y: number }} currentCenter
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 * @param {number} [ballRadius]
 * @returns {{ direction: 'down' | 'up', x: number, y: number, withinWidth: boolean, nearHoop: boolean } | null}
 */
export function getRimLineCrossing(prevCenter, currentCenter, hoopBox, ballRadius = 0) {
  if (!prevCenter || currentCenter.y === prevCenter.y) return null

  const lineY = hoopBox.y + hoopBox.height / 2
  const crossedDown = prevCenter.y < lineY && currentCenter.y >= lineY
  const crossedUp = prevCenter.y > lineY && currentCenter.y <= lineY
  if (!crossedDown && !crossedUp) return null

  const progress = (lineY - prevCenter.y) / (currentCenter.y - prevCenter.y)
  const crossingX = prevCenter.x + (currentCenter.x - prevCenter.x) * progress
  const { left, right } = getRimHorizontalRange(hoopBox)
  const makePadding = Math.min(
    hoopBox.width * 0.55,
    hoopBox.width * RIM_WIDTH_PADDING_FACTOR +
      Math.max(0, ballRadius) * BALL_RADIUS_MAKE_OVERLAP_FACTOR,
  )
  const missPadding = hoopBox.width * 0.75

  return {
    direction: crossedDown ? 'down' : 'up',
    x: crossingX,
    y: lineY,
    withinWidth: crossingX >= left - makePadding && crossingX <= right + makePadding,
    nearHoop: crossingX >= left - missPadding && crossingX <= right + missPadding,
  }
}

/**
 * @param {{ x: number, y: number }} ballCenter
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 */
export function isBallWithinHoopWidth(ballCenter, hoopBox) {
  const { left, right } = getRimHorizontalRange(hoopBox)
  return ballCenter.x >= left && ballCenter.x <= right
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
  const hoopRadius = hoopBox.width * APPROACH_DISTANCE_FACTOR
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
