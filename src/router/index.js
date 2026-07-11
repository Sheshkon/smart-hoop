import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import SessionView from '../views/SessionView.vue'
import AiWorkspaceView from '../views/AiWorkspaceView.vue'
import AiSessionPanel from '../views/AiSessionPanel.vue'
import AiTestPanel from '../views/AiTestPanel.vue'
import StatsView from '../views/StatsView.vue'
import SettingsView from '../views/SettingsView.vue'
import { useActiveSession } from '../stores/activeSession.js'

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/session/manual', name: 'session-manual', component: SessionView },
  { path: '/session/ai', redirect: '/ai/session' },
  {
    path: '/ai',
    component: AiWorkspaceView,
    redirect: '/ai/session',
    children: [
      { path: 'session', name: 'session-ai', component: AiSessionPanel },
      { path: 'test', name: 'ai-test', component: AiTestPanel },
    ],
  },
  { path: '/session', redirect: '/' },
  { path: '/stats', name: 'stats', component: StatsView },
  { path: '/settings', name: 'settings', component: SettingsView },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach((to, from) => {
  const fromAiSession = from.name === 'session-ai'
  if (!fromAiSession) return true

  const { isInProgress } = useActiveSession()
  if (!isInProgress.value) return true
  return false
})

export default router
