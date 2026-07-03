import { reactive } from 'vue'

const STORAGE_KEY = 'smart-hoop.theme'

export const THEME_OPTIONS = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
}

export const themeSettings = reactive({
  preference: THEME_OPTIONS.DARK,
})

const THEME_COLORS = {
  light: '#f4f4f8',
  dark: '#1a1a2e',
}

let systemMediaQuery = null
let systemListener = null

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? THEME_OPTIONS.DARK
    : THEME_OPTIONS.LIGHT
}

function resolveTheme(preference) {
  return preference === THEME_OPTIONS.SYSTEM ? getSystemTheme() : preference
}

function updateThemeColor(resolved) {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.content = THEME_COLORS[resolved] ?? THEME_COLORS.dark
  }
}

export function applyTheme(resolved) {
  document.documentElement.setAttribute('data-theme', resolved)
  updateThemeColor(resolved)
}

function loadPreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === THEME_OPTIONS.LIGHT || stored === THEME_OPTIONS.DARK || stored === THEME_OPTIONS.SYSTEM) {
      return stored
    }
  } catch {
    // ignore
  }
  return THEME_OPTIONS.DARK
}

function savePreference(preference) {
  try {
    localStorage.setItem(STORAGE_KEY, preference)
  } catch (err) {
    console.error('Failed to save theme preference:', err)
  }
}

function bindSystemListener() {
  if (systemListener || !systemMediaQuery) return

  systemListener = () => {
    if (themeSettings.preference === THEME_OPTIONS.SYSTEM) {
      applyTheme(getSystemTheme())
    }
  }
  systemMediaQuery.addEventListener('change', systemListener)
}

function unbindSystemListener() {
  if (!systemListener || !systemMediaQuery) return
  systemMediaQuery.removeEventListener('change', systemListener)
  systemListener = null
}

export function initTheme() {
  systemMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  themeSettings.preference = loadPreference()
  applyTheme(resolveTheme(themeSettings.preference))
  bindSystemListener()
}

export function setThemePreference(preference) {
  if (!Object.values(THEME_OPTIONS).includes(preference)) return

  themeSettings.preference = preference
  savePreference(preference)
  applyTheme(resolveTheme(preference))

  if (preference === THEME_OPTIONS.SYSTEM) {
    bindSystemListener()
  } else {
    unbindSystemListener()
  }
}
