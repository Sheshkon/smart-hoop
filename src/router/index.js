import { createRouter, createWebHistory } from 'vue-router'
import { useActiveSession } from '../stores/activeSession.js'

const routes = [
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
  { path: '/session/manual', name: 'session-manual', component: () => import('../views/SessionView.vue') },
  { path: '/session/ai', redirect: '/ai/session' },
  {
    path: '/ai',
    component: () => import('../views/AiWorkspaceView.vue'),
    redirect: '/ai/session',
    children: [
      { path: 'session', name: 'session-ai', component: () => import('../views/AiSessionPanel.vue') },
      { path: 'test', name: 'ai-test', component: () => import('../views/AiTestPanel.vue') },
      { path: 'shot-test', name: 'ai-shot-test', component: () => import('../views/AiShotTestPanel.vue') },
    ],
  },
  { path: '/session', redirect: '/' },
  { path: '/stats', name: 'stats', component: () => import('../views/StatsView.vue') },
  { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue') },
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
