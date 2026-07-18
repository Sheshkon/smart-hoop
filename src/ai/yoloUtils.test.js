import assert from 'node:assert/strict'
import test from 'node:test'
import { postprocessYoloOutput } from './yoloUtils.js'

test('postprocesses channel-first YOLO output', () => {
  const detections = postprocessYoloOutput({
    dims: [1, 7, 2],
    data: new Float32Array([
      20, 50,
      30, 50,
      10, 10,
      12, 10,
      0.1, 0.1,
      0.9, 0.1,
      0.2, 0.1,
    ]),
  })

  assert.deepEqual(detections, [
    {
      classIndex: 1,
      confidence: Math.fround(0.9),
      box: {
        x: 15,
        y: 24,
        width: 10,
        height: 12,
      },
    },
  ])
})

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
