import { copyFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

const isCapacitor = process.env.CAPACITOR === 'true'
const base = isCapacitor ? './' : '/smart-hoop/'

export default defineConfig({
  base,
  server: {
    host: true,
  },
  plugins: [
    {
      name: 'camera-dev-hint',
      configureServer(server) {
        server.httpServer?.once('listening', () => {
          const address = server.httpServer?.address()
          const port = typeof address === 'object' && address ? address.port : 5173
          const basePath = base.replace(/\/$/, '')
          console.log('')
          console.log('  Camera (this PC):  http://localhost:' + port + basePath + '/')
          console.log('  Camera (phone):    npm run cap:sync → Android app')
          console.log('  (IP over HTTP has no camera — Chrome requires localhost or HTTPS)')
          console.log('')
        })
      },
    },
    vueDevTools(),
    vue(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: false,
      devOptions: {
        enabled: true,
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,mp3}'],
      },
    }),
    {
      name: 'gh-pages-spa-fallback',
      closeBundle() {
        copyFileSync('dist/index.html', 'dist/404.html')
      },
    },
  ],
})
