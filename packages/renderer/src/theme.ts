export type ThemePreference = 'dark' | 'light' | 'system'

export function resolveTheme(pref: ThemePreference): 'dark' | 'light' {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  return pref
}

export function applyTheme(pref: ThemePreference): void {
  const resolved = resolveTheme(pref)
  const root = document.documentElement
  root.classList.toggle('theme-light', resolved === 'light')
  root.classList.toggle('dark', resolved === 'dark')
  root.dataset.theme = resolved
}
