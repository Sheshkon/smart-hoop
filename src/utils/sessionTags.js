export const DEFAULT_SESSION_TAGS = ['трехочковые', 'штрафные', 'командные', 'контест']

export const MAX_TAGS_PER_SESSION = 10
export const MAX_TAG_LENGTH = 30

export function normalizeTag(tag) {
  if (typeof tag !== 'string') return ''

  let value = tag.trim()
  while (value.startsWith('#')) {
    value = value.slice(1).trim()
  }

  return value.toLowerCase()
}

export function formatTagLabel(tag) {
  const normalized = normalizeTag(tag)
  return normalized ? `#${normalized}` : ''
}

export function normalizeTags(tags) {
  if (!Array.isArray(tags)) return []

  const result = []
  const seen = new Set()

  for (const raw of tags) {
    const tag = normalizeTag(raw)
    if (!tag) continue

    const key = tag.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    result.push(tag.slice(0, MAX_TAG_LENGTH))

    if (result.length >= MAX_TAGS_PER_SESSION) break
  }

  return result
}

export function tagsEqual(a, b) {
  const left = normalizeTags(a).map((tag) => tag.toLowerCase()).sort()
  const right = normalizeTags(b).map((tag) => tag.toLowerCase()).sort()

  if (left.length !== right.length) return false
  return left.every((tag, index) => tag === right[index])
}

export function sessionHasAnyTag(session, filterTags) {
  const sessionTags = normalizeTags(session?.tags).map((tag) => tag.toLowerCase())
  const filters = normalizeTags(filterTags).map((tag) => tag.toLowerCase())

  return filters.some((tag) => sessionTags.includes(tag))
}

export function collectAllTags(sessions) {
  const map = new Map()

  for (const tag of DEFAULT_SESSION_TAGS) {
    map.set(tag.toLowerCase(), tag)
  }

  for (const session of sessions) {
    for (const tag of normalizeTags(session?.tags)) {
      map.set(tag.toLowerCase(), tag)
    }
  }

  return [...map.values()]
}

export function tagsToCsv(tags) {
  return normalizeTags(tags).map(formatTagLabel).join('; ')
}
