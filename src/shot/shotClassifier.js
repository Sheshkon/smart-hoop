import { distance } from '../utils/geometry.js'

const APPROACH_DISTANCE_FACTOR = 1.8
const CONFIRMATION_PLANE_RADIUS_FACTOR = 0.45

/**
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 * @param {number} [ballRadius]
 */
export function getRimControlPlanes(hoopBox, ballRadius = 0) {
  const radius = Math.max(0, Number(ballRadius) || 0)

  return {
    entryY: hoopBox.y + hoopBox.height * 0.35,
    confirmationY:
      hoopBox.y + hoopBox.height + Math.min(hoopBox.height, radius * CONFIRMATION_PLANE_RADIUS_FACTOR),
    innerLeft: hoopBox.x + radius,
    innerRight: hoopBox.x + hoopBox.width - radius,
    exitLeft: hoopBox.x + radius,
    exitRight: hoopBox.x + hoopBox.width - radius,
    guardLeft: hoopBox.x - hoopBox.width * 0.9,
    guardRight: hoopBox.x + hoopBox.width * 1.9,
    guardTop: hoopBox.y - hoopBox.width * 1.2,
    guardBottom: hoopBox.y + hoopBox.width * 1.8,
  }
}

/**
 * @param {{ x: number, y: number }} ballCenter
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 * @param {number} [ballRadius]
 */
export function isBallCenterInsideInnerOpening(ballCenter, hoopBox, ballRadius = 0) {
  return isBallWithinHoopWidth(ballCenter, hoopBox, ballRadius)
}

/**
 * @param {{ x: number, y: number } | null} prevCenter
 * @param {{ x: number, y: number }} currentCenter
 * @param {number} planeY
 * @param {number} [ballRadius]
 * @param {'leading' | 'center' | 'trailing'} [edge]
 * @returns {{ direction: 'down' | 'up', x: number, y: number } | null}
 */
export function getBallPlaneCrossing(
  prevCenter,
  currentCenter,
  planeY,
  ballRadius = 0,
  edge = 'center',
) {
  if (!prevCenter || currentCenter.y === prevCenter.y) return null

  const radius = Math.max(0, Number(ballRadius) || 0)
  const offset = edge === 'leading' ? radius : edge === 'trailing' ? -radius : 0
  const prevEdgeY = prevCenter.y + offset
  const currentEdgeY = currentCenter.y + offset
  const crossedDown = prevEdgeY < planeY && currentEdgeY >= planeY
  const crossedUp = prevEdgeY > planeY && currentEdgeY <= planeY
  if (!crossedDown && !crossedUp) return null

  const centerYAtPlane = planeY - offset
  const progress = (centerYAtPlane - prevCenter.y) / (currentCenter.y - prevCenter.y)
  const crossingX = prevCenter.x + (currentCenter.x - prevCenter.x) * progress

  return {
    direction: crossedDown ? 'down' : 'up',
    x: crossingX,
    y: planeY,
  }
}

/**
 * @param {{ x: number, y: number }} ballCenter
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 */
export function isBallOutsideGuardZone(ballCenter, hoopBox) {
  const { guardLeft, guardRight, guardTop, guardBottom } = getRimControlPlanes(hoopBox)
  return (
    ballCenter.x < guardLeft ||
    ballCenter.x > guardRight ||
    ballCenter.y < guardTop ||
    ballCenter.y > guardBottom
  )
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
 * @param {number} [ballRadius]
 */
export function isBallInRimZone(ballCenter, hoopBox, ballRadius = 0) {
  const radius = Math.max(0, Number(ballRadius) || 0)

  return (
    ballCenter.x - radius >= hoopBox.x &&
    ballCenter.x + radius <= hoopBox.x + hoopBox.width &&
    ballCenter.y + radius >= hoopBox.y &&
    ballCenter.y - radius <= hoopBox.y + hoopBox.height
  )
}

/**
 * @param {{ x: number, y: number } | null} prevCenter
 * @param {{ x: number, y: number }} currentCenter
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 * @param {number} [ballRadius]
 */
export function didBallCrossRimZone(prevCenter, currentCenter, hoopBox, ballRadius = 0) {
  if (!prevCenter) return isBallInRimZone(currentCenter, hoopBox, ballRadius)
  if (
    isBallInRimZone(prevCenter, hoopBox, ballRadius) ||
    isBallInRimZone(currentCenter, hoopBox, ballRadius)
  ) {
    return true
  }

  const rimTop = hoopBox.y
  const rimBottom = hoopBox.y + hoopBox.height
  const movingThroughBand =
    (prevCenter.y < rimTop && currentCenter.y > rimBottom) ||
    (prevCenter.y > rimBottom && currentCenter.y < rimTop)

  if (!movingThroughBand || currentCenter.y === prevCenter.y) return false

  const crossingY = prevCenter.y < currentCenter.y ? rimTop : rimBottom
  const progress = (crossingY - prevCenter.y) / (currentCenter.y - prevCenter.y)
  const crossingX = prevCenter.x + (currentCenter.x - prevCenter.x) * progress

  return isBallWithinHoopWidth({ x: crossingX, y: crossingY }, hoopBox, ballRadius)
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
  const radius = Math.max(0, Number(ballRadius) || 0)
  const prevLeadingY = prevCenter.y + radius
  const currentLeadingY = currentCenter.y + radius
  const crossedDown = prevLeadingY < lineY && currentLeadingY >= lineY
  const crossedUp = prevCenter.y - radius > lineY && currentCenter.y - radius <= lineY
  if (!crossedDown && !crossedUp) return null

  const centerYAtLine = crossedDown ? lineY - radius : lineY + radius
  const progress = (centerYAtLine - prevCenter.y) / (currentCenter.y - prevCenter.y)
  const crossingX = prevCenter.x + (currentCenter.x - prevCenter.x) * progress

  return {
    direction: crossedDown ? 'down' : 'up',
    x: crossingX,
    y: lineY,
    withinWidth: isBallWithinHoopWidth({ x: crossingX, y: centerYAtLine }, hoopBox, radius),
    nearHoop: doesBallIntersectHoopBox({ x: crossingX, y: centerYAtLine }, hoopBox, radius),
  }
}

/**
 * @param {{ x: number, y: number }} ballCenter
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 * @param {number} [ballRadius]
 */
export function isBallWithinHoopWidth(ballCenter, hoopBox, ballRadius = 0) {
  const radius = Math.max(0, Number(ballRadius) || 0)
  return (
    ballCenter.x - radius >= hoopBox.x &&
    ballCenter.x + radius <= hoopBox.x + hoopBox.width
  )
}

/**
 * @param {{ x: number, y: number }} ballCenter
 * @param {{ x: number, y: number, width: number, height: number }} hoopBox
 * @param {number} [ballRadius]
 */
export function doesBallIntersectHoopBox(ballCenter, hoopBox, ballRadius = 0) {
  const radius = Math.max(0, Number(ballRadius) || 0)
  return (
    ballCenter.x + radius >= hoopBox.x &&
    ballCenter.x - radius <= hoopBox.x + hoopBox.width &&
    ballCenter.y + radius >= hoopBox.y &&
    ballCenter.y - radius <= hoopBox.y + hoopBox.height
  )
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
 * @param {number} [ballRadius]
 */
export function missByPassingHoopLevel(ballCenter, hoopBox, ballRadius = 0) {
  if (!hasPassedHoopLevel(ballCenter, hoopBox)) return false
  return !doesBallIntersectHoopBox(ballCenter, hoopBox, ballRadius)
}
