import { SCENE_HEIGHT, SCENE_WIDTH } from '../shot/testTrajectories.js'
import { getBoxCenter } from './geometry.js'

const GRID_STEP_SCENE = 40

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ offsetX: number, offsetY: number, renderWidth: number, renderHeight: number, scale: number }} viewport
 */
export function drawDetectionBackground(ctx, viewport) {
  const { offsetX, offsetY, renderWidth, renderHeight, scale, sceneWidth, sceneHeight } = viewport

  const gradient = ctx.createLinearGradient(0, offsetY, 0, offsetY + renderHeight)
  gradient.addColorStop(0, '#1f2a44')
  gradient.addColorStop(1, '#12182b')
  ctx.fillStyle = gradient
  ctx.fillRect(offsetX, offsetY, renderWidth, renderHeight)

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = 1

  for (let sx = 0; sx <= sceneWidth; sx += GRID_STEP_SCENE) {
    const x = offsetX + sx * scale
    ctx.beginPath()
    ctx.moveTo(x, offsetY)
    ctx.lineTo(x, offsetY + renderHeight)
    ctx.stroke()
  }

  for (let sy = 0; sy <= sceneHeight; sy += GRID_STEP_SCENE) {
    const y = offsetY + sy * scale
    ctx.beginPath()
    ctx.moveTo(offsetX, y)
    ctx.lineTo(offsetX + renderWidth, y)
    ctx.stroke()
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, width: number, height: number }} box
 * @param {{ showHandles?: boolean, handleSize?: number }} [options]
 */
export function drawHoopBox(ctx, box, options = {}) {
  const { showHandles = false, handleSize = 10 } = options
  const center = getBoxCenter(box)
  const rimRadius = box.width / 2

  ctx.strokeStyle = 'rgba(255, 140, 0, 0.9)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(center.x, center.y, rimRadius, rimRadius * 0.55, 0, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255, 140, 0, 0.35)'
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.strokeRect(box.x, box.y, box.width, box.height)
  ctx.setLineDash([])

  ctx.fillStyle = 'rgba(255, 140, 0, 0.15)'
  ctx.fillRect(box.x, box.y, box.width, box.height)

  if (!showHandles) return

  const half = handleSize / 2
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height },
  ]

  for (const corner of corners) {
    ctx.fillStyle = 'rgba(255, 140, 0, 0.9)'
    ctx.fillRect(corner.x - half, corner.y - half, handleSize, handleSize)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.strokeRect(corner.x - half, corner.y - half, handleSize, handleSize)
  }
}
