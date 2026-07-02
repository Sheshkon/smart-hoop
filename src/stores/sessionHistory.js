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

function sortSessions(sessions) {
  sessions.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
}

export async function importSessions(sessions) {
  const existingIds = new Set(sessionHistory.sessions.map((s) => s.id))
  let imported = 0
  let skipped = 0

  for (const session of sessions) {
    if (existingIds.has(session.id)) {
      skipped++
      continue
    }

    await sessionsRepo.saveSession(session)
    sessionHistory.sessions.push(session)
    existingIds.add(session.id)
    imported++
  }

  sortSessions(sessionHistory.sessions)
  return { imported, skipped }
}
