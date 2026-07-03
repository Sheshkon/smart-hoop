import * as ort from 'onnxruntime-web'
import { readFileSync } from 'node:fs'

const modelPath = new URL('../public/models/smart-hoop-detector.onnx', import.meta.url)
const buffer = readFileSync(modelPath)

const session = await ort.InferenceSession.create(buffer, {
  executionProviders: ['wasm'],
})

console.log('inputs:', session.inputNames)
console.log('outputs:', session.outputNames)

const inputName = session.inputNames[0]
const outputName = session.outputNames[0]

const INPUT_SIZE = 704
const dummy = new ort.Tensor('float32', new Float32Array(1 * 3 * INPUT_SIZE * INPUT_SIZE), [1, 3, INPUT_SIZE, INPUT_SIZE])
const result = await session.run({ [inputName]: dummy })
const output = result[outputName]
console.log('output dims:', output.dims)
console.log('output length:', output.data.length)
