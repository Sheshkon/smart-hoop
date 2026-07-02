export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onRegisterError(error) {
          console.warn('Service worker registration failed:', error)
        },
      })
    })
    .catch((err) => {
      console.warn('PWA register module unavailable:', err)
    })
}
