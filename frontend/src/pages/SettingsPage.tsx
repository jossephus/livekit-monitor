import { useCallback, useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface SettingsResponse {
  livekit_url: string
  api_key: string
}

const REFRESH_INTERVAL = 15000

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [status, setStatus] = useState<"checking" | "connected" | "disconnected">("checking")
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<string>("-")

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
    </div>
  )
}
