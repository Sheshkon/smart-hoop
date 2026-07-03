import { reactive } from 'vue'
import { applySessionCounts } from '../utils/sessionStats.js'
import { normalizeTags } from '../utils/sessionTags.js'
import * as sessionsRepo from '../storage/sessionsRepo.js'
export const sessionHistory = reactive({
  sessions: [],
  loaded: false,
})

export async function loadSessionHistory() {
  const sessions = await sessionsRepo.getAllSessions()
  const normalized = sessions.map((session) => ({
    ...session,
    tags: normalizeTags(session.tags),
  }))
  sessionHistory.sessions.splice(0, sessionHistory.sessions.length, ...normalized)
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

export async function updateSession(id, { title, hooperName, description, tags, makes, misses }) {
  const index = sessionHistory.sessions.findIndex((s) => s.id === id)
  if (index === -1) return

  const trimmedTitle = typeof title === 'string' ? title.trim() : ''
  const trimmedName = typeof hooperName === 'string' ? hooperName.trim() : ''
  const trimmedDescription = typeof description === 'string' ? description.trim() : ''
  let session = {
    ...sessionHistory.sessions[index],
    title: trimmedTitle,
    hooperName: trimmedName,
    description: trimmedDescription,
  }

  if (tags !== undefined) {
    session.tags = normalizeTags(tags)
  }
  session = applySessionCounts(session, makes, misses)

  await sessionsRepo.saveSession(session)
  sessionHistory.sessions[index] = session
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
