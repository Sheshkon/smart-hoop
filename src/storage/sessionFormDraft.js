import { normalizeTags } from '../utils/sessionTags.js'

const STORAGE_KEY = 'smart-hoop.session-form-draft'

function getEmptyDraft() {
  return {
    title: '',
    hooperName: '',
    description: '',
    tags: [],
  }
}

export function loadSessionFormDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return getEmptyDraft()

    const data = JSON.parse(raw)
    return {
      title: typeof data.title === 'string' ? data.title : '',
      hooperName: typeof data.hooperName === 'string' ? data.hooperName : '',
      description: typeof data.description === 'string' ? data.description : '',
      tags: normalizeTags(data.tags),
    }
  } catch {
    return getEmptyDraft()
  }
}

export function saveSessionFormDraft(draft) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
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
