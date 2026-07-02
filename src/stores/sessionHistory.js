import { reactive } from 'vue'

export const sessionHistory = reactive({
  sessions: [],
})

export function addCompletedSession(session) {
  sessionHistory.sessions.unshift(session)
}

export function clearSessionHistory() {
  sessionHistory.sessions.length = 0
}
