export function getOrientation(width, height) {
  return width >= height ? 'landscape' : 'portrait'
}

export function getBoxCenter(box) {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  }
}

export function boxFromCenter(center, size) {
  const half = size / 2
  return {
    x: center.x - half,
    y: center.y - half,
    width: size,
    height: size,
  }
}

export function getTopBoxBand(box, options = {}) {
  const factor = options.factor ?? 0.28
  const minHeight = options.minHeight ?? 8
  const maxHeight = options.maxHeight ?? 30
  const height = Math.min(maxHeight, Math.max(minHeight, box.height * factor))

  return {
    ...box,
    height: Math.min(box.height, height),
  }
}

export function getBackboardZone(hoopBox, options = {}) {
  const widthFactor = options.widthFactor ?? 2.4
  const heightFactor = options.heightFactor ?? 1.5
  const topOffsetFactor = options.topOffsetFactor ?? 1.2
  const centerX = hoopBox.x + hoopBox.width / 2
  const width = hoopBox.width * widthFactor
  const height = hoopBox.width * heightFactor

  return {
    x: centerX - width / 2,
    y: hoopBox.y - hoopBox.width * topOffsetFactor,
    width,
    height,
  }
}

export function scaleBox(box, fromWidth, fromHeight, toWidth, toHeight) {
  const scaleX = toWidth / fromWidth
  const scaleY = toHeight / fromHeight

  return {
    x: box.x * scaleX,
    y: box.y * scaleY,
    width: box.width * scaleX,
    height: box.height * scaleY,
  }
}

export function scalePoint(point, fromWidth, fromHeight, toWidth, toHeight) {
  return {
    x: (point.x / fromWidth) * toWidth,
    y: (point.y / fromHeight) * toHeight,
  }
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function lerp(a, b, t) {
  return a + (b - a) * t
}

export function distance(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}
