import * as ort from 'onnxruntime-web'

import mjsJsepUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url'
import wasmJsepUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url'

let configured = false

/**
 * onnxruntime-web accepts wasmPaths as:
 * - string directory prefix, or
 * - { mjs: url, wasm: url }
 *
 * Do not put .mjs in public/ — Vite dev server transforms them (?import) and returns 500.
 * Vite ?url assets are served as static files with correct MIME types.
 */
export function configureOrtWasm() {
  if (configured) return

  ort.env.wasm.wasmPaths = {
    mjs: mjsJsepUrl,
    wasm: wasmJsepUrl,
  }
  ort.env.wasm.numThreads = 1

  configured = true
}

configureOrtWasm()
