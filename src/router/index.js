import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import SessionView from '../views/SessionView.vue'
import StatsView from '../views/StatsView.vue'
import SettingsView from '../views/SettingsView.vue'
import { useActiveSession } from '../stores/activeSession.js'

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/session/manual', name: 'session-manual', component: SessionView, props: { sessionMode: 'manual' } },
  { path: '/session/ai', name: 'session-ai', component: SessionView, props: { sessionMode: 'ai' } },
  { path: '/session', redirect: '/' },
  { path: '/stats', name: 'stats', component: StatsView },
  { path: '/settings', name: 'settings', component: SettingsView },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach((to, from) => {
  const fromSession = typeof from.name === 'string' && from.name.startsWith('session-')
  if (!fromSession) return true

  const { isInProgress } = useActiveSession()
  if (isInProgress.value) return false

  return true
})

export default router
