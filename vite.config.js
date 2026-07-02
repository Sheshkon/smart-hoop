import { copyFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

const base = '/smart-hoop/'

export default defineConfig({
  base,
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
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
