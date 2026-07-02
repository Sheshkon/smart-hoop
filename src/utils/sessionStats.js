import { generateId } from './id.js'

function createShotEvent(type, timestampMs = 0) {
  return {
    id: generateId(),
    type,
    timestampMs,
    confidence: 1,
    source: 'manual',
  }
}

export function calcStreaks(shotEvents) {
  let currentStreak = 0
  let bestStreak = 0

  for (const event of shotEvents) {
    if (event.type === 'make') {
      currentStreak++
      if (currentStreak > bestStreak) bestStreak = currentStreak
    } else {
      currentStreak = 0
    }
  }

  return { currentStreak, bestStreak }
}

function syncShotEvents(events, makes, misses) {
  const targetAttempts = makes + misses
  const synced = [...events]

  while (synced.length > targetAttempts) synced.pop()

  let currentMakes = synced.filter((e) => e.type === 'make').length
  let currentMisses = synced.filter((e) => e.type === 'miss').length

  while (synced.length < targetAttempts) {
    const type = currentMakes < makes ? 'make' : 'miss'
    synced.push(createShotEvent(type))
    if (type === 'make') currentMakes++
    else currentMisses++
  }

  for (let i = synced.length - 1; i >= 0 && currentMakes > makes; i--) {
    if (synced[i].type === 'make') {
      synced[i] = { ...synced[i], type: 'miss' }
      currentMakes--
      currentMisses++
    }
  }

  for (let i = synced.length - 1; i >= 0 && currentMisses > misses; i--) {
    if (synced[i].type === 'miss') {
      synced[i] = { ...synced[i], type: 'make' }
      currentMisses--
      currentMakes++
    }
  }

  for (let i = synced.length - 1; i >= 0 && currentMakes < makes; i--) {
    if (synced[i].type === 'miss') {
      synced[i] = { ...synced[i], type: 'make' }
      currentMakes++
      currentMisses--
    }
  }

  for (let i = synced.length - 1; i >= 0 && currentMisses < misses; i--) {
    if (synced[i].type === 'make') {
      synced[i] = { ...synced[i], type: 'miss' }
      currentMisses++
      currentMakes--
    }
  }

  return synced
}

export function applySessionCounts(session, makes, misses) {
  const safeMakes = Math.max(0, Math.floor(Number(makes)) || 0)
  const safeMisses = Math.max(0, Math.floor(Number(misses)) || 0)
  const shotEvents = syncShotEvents(session.shotEvents || [], safeMakes, safeMisses)
  const { currentStreak, bestStreak } = calcStreaks(shotEvents)

  return {
    ...session,
    makes: safeMakes,
    misses: safeMisses,
    attempts: safeMakes + safeMisses,
    makePercentage:
      safeMakes + safeMisses > 0 ? Math.round((safeMakes / (safeMakes + safeMisses)) * 100) : 0,
    currentStreak,
    bestStreak,
    shotEvents,
  }
}

export function recalcSessionStats(session) {
  session.attempts = session.makes + session.misses
  session.makePercentage =
    session.attempts > 0 ? Math.round((session.makes / session.attempts) * 100) : 0

  const { currentStreak, bestStreak } = calcStreaks(session.shotEvents || [])
  session.currentStreak = currentStreak
  session.bestStreak = bestStreak
}
