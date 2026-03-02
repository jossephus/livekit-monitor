/**
 * Base path for the application.
 *
 * At runtime, the Rust backend injects `window.__BASE_PATH__` via a <script> tag
 * in index.html (set by the BASE_PATH env var on the server).
 *
 * Examples:
 *   BASE_PATH=""                → basePath = ""   → app at /
 *   BASE_PATH="/livekit-monitor" → basePath = "/livekit-monitor" → app at /livekit-monitor/
 */
export const basePath: string =
  (window as unknown as Record<string, string>).__BASE_PATH__ ?? ""

/**
 * Prefix an API path with the base path.
 * e.g. apiUrl("/api/rooms") → "/livekit-monitor/api/rooms"
 */
export function apiUrl(path: string): string {
  return `${basePath}${path}`
}
