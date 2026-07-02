import { reactive } from 'vue'
import * as sessionsRepo from '../storage/sessionsRepo.js'

export const sessionHistory = reactive({
  sessions: [],
  loaded: false,
})

export async function loadSessionHistory() {
  const sessions = await sessionsRepo.getAllSessions()
  sessionHistory.sessions.splice(0, sessionHistory.sessions.length, ...sessions)
  sessionHistory.loaded = true
}

export async function addCompletedSession(session) {
  await sessionsRepo.saveSession(session)
  sessionHistory.sessions.unshift(session)
}

export async function clearSessionHistory() {
  await sessionsRepo.clearSessions()
  sessionHistory.sessions.length = 0
}

export async function removeSession(id) {
  await sessionsRepo.deleteSession(id)
  const index = sessionHistory.sessions.findIndex((s) => s.id === id)
  if (index !== -1) {
    sessionHistory.sessions.splice(index, 1)
  }
}
