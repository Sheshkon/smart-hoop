import assert from 'node:assert/strict'
import test from 'node:test'
import { postprocessYoloOutput } from './yoloUtils.js'

test('postprocesses NMS YOLO output rows', () => {
  const detections = postprocessYoloOutput({
    dims: [1, 3, 6],
    data: new Float32Array([
      10, 20, 30, 45, 0.8, 2,
      50, 60, 40, 80, 0.9, 1,
      70, 80, 90, 95, 0.05, 0,
    ]),
  })

  assert.deepEqual(detections, [
    {
      classIndex: 2,
      confidence: Math.fround(0.8),
      box: {
        x: 10,
        y: 20,
        width: 20,
        height: 25,
      },
    },
  ])
})

test('rejects unsupported YOLO output shapes', () => {
  assert.throws(
    () =>
      postprocessYoloOutput({
        dims: [1, 7, 2],
        data: new Float32Array(14),
      }),
    /Unsupported YOLO output shape: 1x7x2/,
  )
})

test('skips disabled classes', () => {
  const detections = postprocessYoloOutput(
    {
      dims: [1, 2, 6],
      data: new Float32Array([
        10, 20, 30, 45, 0.95, 0,
        50, 60, 70, 80, 0.9, 1,
      ]),
    },
    {
      classEnabled: [false, true],
    },
  )

  assert.deepEqual(detections, [
    {
      classIndex: 1,
      confidence: Math.fround(0.9),
      box: {
        x: 50,
        y: 60,
        width: 20,
        height: 20,
      },
    },
  ])
})
