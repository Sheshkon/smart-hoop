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
        dims: [1, 5, 2],
        data: new Float32Array(10),
      }),
    /Unsupported YOLO output shape: 1x5x2/,
  )
})

test('postprocesses raw YOLOv8 output columns', () => {
  const detections = postprocessYoloOutput(
    {
      dims: [1, 6, 2],
      data: new Float32Array([
        20, 60,
        30, 70,
        10, 20,
        12, 24,
        0.9, 0.1,
        0.2, 0.8,
      ]),
    },
    {
      classConfThresholds: [0.15, 0.15],
    },
  )

  assert.deepEqual(detections, [
    {
      classIndex: 0,
      confidence: Math.fround(0.9),
      box: {
        x: 15,
        y: 24,
        width: 10,
        height: 12,
      },
    },
    {
      classIndex: 1,
      confidence: Math.fround(0.8),
      box: {
        x: 50,
        y: 58,
        width: 20,
        height: 24,
      },
    },
  ])
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
