import { getSettings, saveSettings } from './storage'

// Resolve the active theme: an explicit user choice wins, otherwise follow the
// OS preference. Returns 'light' | 'dark'.
export function currentTheme() {
  const { theme } = getSettings()
  if (theme === 'dark' || theme === 'light') return theme
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#020E24' : '#002D72')
}

export function setTheme(theme) {
  saveSettings({ theme })
  applyTheme(theme)
}
