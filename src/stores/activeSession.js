import { ref, computed } from 'vue'
import { generateId } from '../utils/id.js'
import { recalcSessionStats } from '../utils/sessionStats.js'
import { addCompletedSession } from './sessionHistory.js'
function createEmptySession() {
  return {
    id: generateId(),
    mode: 'manual',
    hooperName: '',
    startedAt: null,
    endedAt: null,
    durationMs: 0,
    attempts: 0,
    makes: 0,
    misses: 0,
    makePercentage: 0,
    currentStreak: 0,
    bestStreak: 0,
    shotEvents: [],
  }
}

function recalcStats(session) {
  recalcSessionStats(session)
}
const status = ref('idle')
const session = ref(createEmptySession())

let timerInterval = null
let resumeStartedAt = null
let accumulatedMs = 0

const isActive = computed(() => status.value === 'active')
const isPaused = computed(() => status.value === 'paused')
const isIdle = computed(() => status.value === 'idle')
const isEnded = computed(() => status.value === 'ended')
const isInProgress = computed(() => status.value === 'active' || status.value === 'paused')
const canRecordShots = computed(() => status.value === 'active')
const canEnd = computed(() => status.value === 'active' || status.value === 'paused')
const canLeave = computed(() => !isInProgress.value)

function tick() {
  if (status.value === 'active' && resumeStartedAt) {
    session.value.durationMs = accumulatedMs + (Date.now() - resumeStartedAt)
  }
}

function startTimer() {
  stopTimer()
  resumeStartedAt = Date.now()
  timerInterval = setInterval(tick, 100)
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
  if (status.value === 'active' && resumeStartedAt) {
    accumulatedMs += Date.now() - resumeStartedAt
    session.value.durationMs = accumulatedMs
    resumeStartedAt = null
  }
}

function startSession(hooperName = '') {
  if (status.value === 'paused') {
    status.value = 'active'
    startTimer()
    return
  }

  session.value = createEmptySession()
  session.value.hooperName = typeof hooperName === 'string' ? hooperName.trim() : ''
  session.value.startedAt = new Date().toISOString()
  accumulatedMs = 0
  resumeStartedAt = null
  status.value = 'active'
  startTimer()
}

function pauseSession() {
  if (status.value !== 'active') return
  stopTimer()
  status.value = 'paused'
}

async function endSession() {
  if (!canEnd.value) return

  stopTimer()
  session.value.endedAt = new Date().toISOString()
  session.value.durationMs = accumulatedMs
  recalcStats(session.value)
  status.value = 'ended'

  try {
    await addCompletedSession({
      ...session.value,
      shotEvents: [...session.value.shotEvents],
    })
  } catch (err) {
    console.error('Failed to save session:', err)
  }
}

function recordShot(type) {
  if (status.value !== 'active') return

  const event = {
    id: generateId(),
    type,
    timestampMs: session.value.durationMs,
    confidence: 1,
    source: 'manual',
  }

  session.value.shotEvents.push(event)
  session.value.attempts++

  if (type === 'make') {
    session.value.makes++
    session.value.currentStreak++
    if (session.value.currentStreak > session.value.bestStreak) {
      session.value.bestStreak = session.value.currentStreak
    }
  } else {
    session.value.misses++
    session.value.currentStreak = 0
  }

  recalcStats(session.value)
}

function recordMake() {
  recordShot('make')
}

function recordMiss() {
  recordShot('miss')
}

export function useActiveSession() {
  return {
    status,
    session,
    isActive,
    isPaused,
    isIdle,
    isEnded,
    isInProgress,
    canRecordShots,
    canEnd,
    canLeave,
    startSession,
    pauseSession,
    endSession,
    recordMake,
    recordMiss,
  }
}
