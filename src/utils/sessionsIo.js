const EXPORT_VERSION = 1

function escapeCsv(value) {
  const str = String(value ?? '')
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function isValidSession(session) {
  return (
    session &&
    typeof session === 'object' &&
    typeof session.id === 'string' &&
    typeof session.startedAt === 'string'
  )
}

export function sessionsToJson(sessions) {
  return JSON.stringify(
    {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      sessions,
    },
    null,
    2,
  )
}

export function sessionsToCsv(sessions) {
  const headers = [
    'id',
    'hooperName',
    'startedAt',
    'endedAt',
    'durationMs',
    'attempts',
    'makes',
    'misses',
    'makePercentage',
    'bestStreak',
  ]

  const rows = sessions.map((session) =>
    headers.map((key) => escapeCsv(session[key])).join(','),
  )

  return [headers.join(','), ...rows].join('\n')
}

export function parseSessionsImport(text) {
  const data = JSON.parse(text)
  const sessions = Array.isArray(data) ? data : data?.sessions

  if (!Array.isArray(sessions)) {
    throw new Error('Файл не содержит список сессий')
  }

  const valid = sessions.filter(isValidSession)
  if (valid.length === 0) {
    throw new Error('Не найдено ни одной валидной сессии')
  }

  return valid.map((session) => {
    const shotEvents = Array.isArray(session.shotEvents) ? session.shotEvents : []
    return {
      hooperName: '',
      endedAt: null,
      durationMs: 0,
      attempts: 0,
      makes: 0,
      misses: 0,
      makePercentage: 0,
      currentStreak: 0,
      bestStreak: 0,
      ...session,
      shotEvents,
    }
  })
}

export function downloadTextFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function exportFilename(extension) {
  const date = new Date().toISOString().slice(0, 10)
  return `smart-hoop-sessions-${date}.${extension}`
}
