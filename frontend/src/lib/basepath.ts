/**
 * Base path for the application, without trailing slash.
 *
 * Sources (in priority order):
 * 1. Runtime: `window.__BASE_PATH__` injected by the Rust backend (from BASE_PATH env var)
 * 2. Build-time: `import.meta.env.BASE_URL` set by Vite's `base` config
 *
 * Examples:
 *   Root deployment:    basePath = ""
 *   Subpath deployment: basePath = "/livekit-monitor"
 */
function resolveBasePath(): string {
  // Runtime injection from Rust backend
  const runtime = (window as unknown as Record<string, string>).__BASE_PATH__
  if (runtime !== undefined && runtime !== "") {
    return runtime.replace(/\/+$/, "")
  }

  // Vite build-time BASE_URL (always has trailing slash, e.g. "/" or "/livekit-monitor/")
  const buildTime = import.meta.env.BASE_URL ?? "/"
  const cleaned = buildTime.replace(/\/+$/, "")
  return cleaned
}

export const basePath: string = resolveBasePath()

/**
 * Prefix an API path with the base path.
 * e.g. apiUrl("/api/rooms") → "/livekit-monitor/api/rooms"
 */
export function apiUrl(path: string): string {
  return `${basePath}${path}`
}
