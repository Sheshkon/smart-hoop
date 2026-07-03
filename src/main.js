import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './assets/main.css'
import { registerServiceWorker } from './pwa/usePwaUpdate.js'
import { loadSessionHistory } from './stores/sessionHistory.js'
import { initTheme } from './stores/theme.js'
import { initAiModelSettings } from './stores/aiModelSettings.js'

initTheme()
initAiModelSettings()

const app = createApp(App)
app.use(router)
app.mount('#app')

registerServiceWorker()
loadSessionHistory().catch((err) => {
  console.error('Failed to load session history:', err)
})
