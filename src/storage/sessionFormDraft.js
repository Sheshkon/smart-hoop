import { normalizeTags } from '../utils/sessionTags.js'

const LEGACY_STORAGE_KEY = 'smart-hoop.session-form-draft'

const STORAGE_KEYS = {
  manual: 'smart-hoop.session-form-draft.manual',
  ai: 'smart-hoop.session-form-draft.ai',
}

function getEmptyDraft(mode = 'manual') {
  return {
    title: '',
    hooperName: '',
    description: '',
    tags: mode === 'ai' ? ['ai'] : [],
  }
}

function parseDraft(raw, mode = 'manual') {
  if (!raw) return getEmptyDraft(mode)

  try {
    const data = JSON.parse(raw)
    const tags = normalizeTags(data.tags)

    return {
      title: typeof data.title === 'string' ? data.title : '',
      hooperName: typeof data.hooperName === 'string' ? data.hooperName : '',
      description: typeof data.description === 'string' ? data.description : '',
      tags: tags.length > 0 || mode !== 'ai' ? tags : ['ai'],
    }
  } catch {
    return getEmptyDraft(mode)
  }
}

export function loadSessionFormDraft(mode = 'manual') {
  const storageKey = STORAGE_KEYS[mode] || STORAGE_KEYS.manual

  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) return parseDraft(raw, mode)

    if (mode === 'manual') {
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (legacyRaw) return parseDraft(legacyRaw, mode)
    }

    return getEmptyDraft(mode)
  } catch {
    return getEmptyDraft(mode)
  }
}

export function saveSessionFormDraft(draft, mode = 'manual') {
  const storageKey = STORAGE_KEYS[mode] || STORAGE_KEYS.manual

  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        title: typeof draft.title === 'string' ? draft.title.trim() : '',
        hooperName: typeof draft.hooperName === 'string' ? draft.hooperName.trim() : '',
        description: typeof draft.description === 'string' ? draft.description.trim() : '',
        tags: normalizeTags(draft.tags),
      }),
    )
  } catch (err) {
    console.error('Failed to save session form draft:', err)
  }
}
