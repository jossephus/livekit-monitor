import { useCallback, useEffect, useState } from "react"
import { RefreshCw, Trash2, Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  THEME_CHANGE_EVENT,
  applyTheme,
  getStoredThemeMode,
  setThemeMode,
  type ThemeMode,
} from "@/lib/theme"

interface SettingsResponse {
  livekit_url: string
  api_key: string
}

type TableGroup = "sessions" | "rooms" | "egress"

const TABLE_GROUPS: { group: TableGroup; label: string; description: string }[] = [
  { group: "sessions", label: "Sessions", description: "Session history and participant join records" },
  { group: "rooms", label: "Rooms", description: "Room history, details, and participant snapshots" },
  { group: "egress", label: "Egress", description: "Egress job history and status records" },
]

const REFRESH_INTERVAL = 15000

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [status, setStatus] = useState<"checking" | "connected" | "disconnected">("checking")
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<string>("-")
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getStoredThemeMode())
  const [confirmingClear, setConfirmingClear] = useState<TableGroup | null>(null)
  const [clearingGroup, setClearingGroup] = useState<TableGroup | null>(null)
  const [clearResult, setClearResult] = useState<{ group: TableGroup; deleted: number } | null>(null)

  const checkConnection = useCallback(async () => {
    setStatus("checking")
    try {
      const [settingsRes, overviewRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/overview"),
      ])

      if (!settingsRes.ok) {
        throw new Error(`Failed to fetch settings: HTTP ${settingsRes.status}`)
      }

      const data: SettingsResponse = await settingsRes.json()
      setSettings(data)

      if (!overviewRes.ok) {
        const detail = await overviewRes.text()
        throw new Error(detail || `Connection check failed: HTTP ${overviewRes.status}`)
      }

      setStatus("connected")
      setError(null)
    } catch (err) {
      setStatus("disconnected")
      setError(err instanceof Error ? err.message : "Connection check failed")
    } finally {
      setLastChecked(new Date().toLocaleString())
    }
  }, [])

  useEffect(() => {
    checkConnection()
  }, [checkConnection])

  useEffect(() => {
    const id = setInterval(checkConnection, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [checkConnection])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => {
      if (themeMode === "system") {
        applyTheme("system")
      }
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [themeMode])

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<ThemeMode>
      setThemeModeState(customEvent.detail)
    }

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange as EventListener)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange as EventListener)
  }, [])

  const onThemeChange = (mode: ThemeMode) => {
    setThemeModeState(mode)
    setThemeMode(mode)
  }

  const clearTable = async (group: TableGroup) => {
    setClearingGroup(group)
    setClearResult(null)
    try {
      const res = await fetch(`/api/clear/${group}`, { method: "DELETE" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Request failed" }))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setClearResult({ group, deleted: data.deleted ?? 0 })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear data")
    } finally {
      setClearingGroup(null)
      setConfirmingClear(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">Settings</h1>
          <p className="text-sm text-muted-foreground">Current monitor connection configuration</p>
        </div>
        <button
          type="button"
          onClick={checkConnection}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" />
          Check connection
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium uppercase tracking-[0.14em] text-muted-foreground">Connection status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge
              variant={
                status === "connected"
                  ? "default"
                  : status === "disconnected"
                    ? "destructive"
                    : "secondary"
              }
              className="capitalize"
            >
              {status}
            </Badge>
            <span className="text-sm text-muted-foreground">Last checked: {lastChecked}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium uppercase tracking-[0.14em] text-muted-foreground">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Theme mode</p>
            <div className="mt-2 inline-flex rounded-md border border-input bg-muted/30 p-1">
              {(["light", "dark", "system"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onThemeChange(mode)}
                  className={`rounded px-3 py-1.5 text-sm capitalize transition-colors ${
                    themeMode === mode
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium uppercase tracking-[0.14em] text-muted-foreground">LiveKit connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">LiveKit URL</p>
            <p className="font-mono text-sm">{settings?.livekit_url ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">API key</p>
            <p className="font-mono text-sm">{settings?.api_key ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">API secret</p>
            <p className="font-mono text-sm">Hidden by design</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium uppercase tracking-[0.14em] text-muted-foreground">Data management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Clear stored data by category. This deletes all rows from the selected tables but keeps the schema intact.
          </p>

          {clearResult && (
            <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
              Cleared {clearResult.deleted} row{clearResult.deleted !== 1 ? "s" : ""} from {clearResult.group} tables.
            </div>
          )}

          <div className="space-y-3">
            {TABLE_GROUPS.map(({ group, label, description }) => (
              <div key={group} className="flex items-center justify-between rounded-md border border-input p-3">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                {confirmingClear === group ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-destructive">Are you sure?</span>
                    <button
                      type="button"
                      onClick={() => clearTable(group)}
                      disabled={clearingGroup === group}
                      className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
                    >
                      {clearingGroup === group ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : null}
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingClear(null)}
                      disabled={clearingGroup === group}
                      className="rounded-md border border-input px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setClearResult(null)
                      setConfirmingClear(group)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-destructive/50 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear
                  </button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
