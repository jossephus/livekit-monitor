export const THEME_STORAGE_KEY = "livekit-monitor-theme"
export const THEME_CHANGE_EVENT = "livekit-monitor-theme-change"

export type ThemeMode = "light" | "dark" | "system"

export function isThemeMode(value: string): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system"
}

export function getStoredThemeMode(): ThemeMode {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored && isThemeMode(stored)) {
    return stored
  }

  return "system"
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }

  return mode
}

export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement
  const resolved = resolveTheme(mode)
  root.classList.toggle("dark", resolved === "dark")
}

export function setThemeMode(mode: ThemeMode): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  applyTheme(mode)
  window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_CHANGE_EVENT, { detail: mode }))
}

export function initializeTheme(): void {
  const mode = getStoredThemeMode()
  applyTheme(mode)
}
