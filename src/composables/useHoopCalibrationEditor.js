import { ref } from 'vue'
import {
  DEFAULT_HOOP_BOX,
  getCalibration,
  resetCalibration,
  saveCalibration,
} from '../shot/hoopCalibration.js'
import { clamp } from '../utils/geometry.js'
import { drawHoopBox } from '../utils/hoopCanvasDrawing.js'
import {
  canvasPointToScene,
  getSceneDimensions,
  landscapeBoxToPortrait,
  portraitBoxToLandscape,
  sceneBoxToCanvas,
} from '../utils/sceneViewport.js'

const MIN_SIZE = 60
const HANDLE_HIT_SIZE = 24

export function useHoopCalibrationEditor() {
  const hoopBoxPortrait = ref({ ...getCalibration().hoopBox })

  let activePointer = null
  let dragMode = null
  let dragStartScene = null
  let boxStart = null

  function getDisplayHoopBox(orientation) {
    if (orientation === 'landscape') {
      return portraitBoxToLandscape(hoopBoxPortrait.value)
    }
    return { ...hoopBoxPortrait.value }
  }

  function commitDisplayHoopBox(displayBox, orientation) {
    if (orientation === 'landscape') {
      hoopBoxPortrait.value = landscapeBoxToPortrait(displayBox)
      return
    }
    hoopBoxPortrait.value = { ...displayBox }
  }

  function getHandlePoints(box) {
    return {
      nw: { x: box.x, y: box.y },
      ne: { x: box.x + box.width, y: box.y },
      sw: { x: box.x, y: box.y + box.height },
      se: { x: box.x + box.width, y: box.y + box.height },
    }
  }

  function hitHandle(point, box) {
    const handles = getHandlePoints(box)
    const threshold = HANDLE_HIT_SIZE / 2

    for (const [name, handle] of Object.entries(handles)) {
      if (
        Math.abs(point.x - handle.x) <= threshold &&
        Math.abs(point.y - handle.y) <= threshold
      ) {
        return name
      }
    }

    if (
      point.x >= box.x &&
      point.x <= box.x + box.width &&
      point.y >= box.y &&
      point.y <= box.y + box.height
    ) {
      return 'move'
    }

    return null
  }

  function resetDrag() {
    activePointer = null
    dragMode = null
    dragStartScene = null
    boxStart = null
  }

  function pointerDown(event, containerEl, viewport, orientation) {
    if (activePointer != null) return false

    const rect = containerEl.getBoundingClientRect()
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
    const canvasBox = sceneBoxToCanvas(getDisplayHoopBox(orientation), viewport)
    const hit = hitHandle(point, canvasBox)
    if (!hit) return false

    activePointer = event.pointerId
    dragMode = hit
    dragStartScene = canvasPointToScene(point, viewport)
    boxStart = { ...getDisplayHoopBox(orientation) }
    containerEl.setPointerCapture(event.pointerId)
    event.preventDefault()
    return true
  }

  function pointerMove(event, containerEl, viewport, orientation) {
    if (event.pointerId !== activePointer) return false

    const scene = getSceneDimensions(orientation)
    const rect = containerEl.getBoundingClientRect()
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
    const currentScene = canvasPointToScene(point, viewport)
    const dx = currentScene.x - dragStartScene.x
    const dy = currentScene.y - dragStartScene.y

    let nextBox

    if (dragMode === 'move') {
      nextBox = {
        ...boxStart,
        x: clamp(boxStart.x + dx, 0, scene.width - boxStart.width),
        y: clamp(boxStart.y + dy, 0, scene.height - boxStart.height),
      }
    } else {
      let { x, y, width, height } = boxStart

      if (dragMode.includes('n')) {
        y = clamp(boxStart.y + dy, 0, boxStart.y + boxStart.height - MIN_SIZE)
        height = boxStart.y + boxStart.height - y
      }
      if (dragMode.includes('s')) {
        height = clamp(boxStart.height + dy, MIN_SIZE, scene.height - boxStart.y)
      }
      if (dragMode.includes('w')) {
        x = clamp(boxStart.x + dx, 0, boxStart.x + boxStart.width - MIN_SIZE)
        width = boxStart.x + boxStart.width - x
      }
      if (dragMode.includes('e')) {
        width = clamp(boxStart.width + dx, MIN_SIZE, scene.width - boxStart.x)
      }

      nextBox = { x, y, width, height }
    }

    commitDisplayHoopBox(nextBox, orientation)
    return true
  }

  function pointerUp(event, containerEl) {
    if (event.pointerId !== activePointer) return false

    resetDrag()
    containerEl?.releasePointerCapture(event.pointerId)
    return true
  }

  function drawCalibrationHoop(ctx, viewport, orientation) {
    const box = sceneBoxToCanvas(getDisplayHoopBox(orientation), viewport)
    drawHoopBox(ctx, box, { showHandles: true, handleSize: 10 * viewport.scale })
  }

  function resetBox() {
    hoopBoxPortrait.value = { ...DEFAULT_HOOP_BOX }
    resetCalibration()
  }

  function confirmCalibration() {
    saveCalibration(hoopBoxPortrait.value)
  }

  function reloadFromStorage() {
    hoopBoxPortrait.value = { ...getCalibration().hoopBox }
  }

  return {
    hoopBoxPortrait,
    resetDrag,
    pointerDown,
    pointerMove,
    pointerUp,
    drawCalibrationHoop,
    resetBox,
    confirmCalibration,
    reloadFromStorage,
  }
}
