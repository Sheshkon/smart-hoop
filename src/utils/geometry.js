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
