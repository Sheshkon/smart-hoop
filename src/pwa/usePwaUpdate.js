import { ref } from 'vue'

export const needRefresh = ref(false)

let updateSW = undefined

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          needRefresh.value = true
        },
        onRegisterError(error) {
          console.warn('Service worker registration failed:', error)
        },
      })
    })
    .catch((err) => {
      console.warn('PWA register module unavailable:', err)
    })
}

export function applyPwaUpdate() {
  needRefresh.value = false
  updateSW?.(true)
}
