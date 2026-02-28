import { useCallback, useEffect, useMemo, useState } from "react"
import { RefreshCw, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface SessionRow {
  session_id: string
  room_name: string
  started_at: number
  ended_at?: number
  duration_seconds: number
  participants: number
  status: string
}

const REFRESH_INTERVAL = 10000

function formatDate(epochSeconds?: number): string {
  if (!epochSeconds) return "-"
  return new Date(epochSeconds * 1000).toLocaleString()
}

function formatDuration(durationSeconds: number): string {
  const hours = Math.floor(durationSeconds / 3600)
  const minutes = Math.floor((durationSeconds % 3600) / 60)
  const seconds = durationSeconds % 60
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "ended">("all")

  const fetchSessions = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set("search", query.trim())
      if (statusFilter !== "all") params.set("status", statusFilter)
      params.set("limit", "500")

      const qs = params.toString()
      const url = qs.length > 0 ? `/api/sessions?${qs}` : "/api/sessions"
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`Failed to fetch sessions: HTTP ${res.status}`)
      }
      const data: SessionRow[] = await res.json()
      setSessions(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch sessions")
    } finally {
      setLoading(false)
    }
  }, [query, statusFilter])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  useEffect(() => {
    const id = setInterval(fetchSessions, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [fetchSessions])

  const hasFilters = useMemo(
    () => query.trim().length > 0 || statusFilter !== "all",
    [query, statusFilter]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sessions</h1>
          <p className="text-sm text-muted-foreground">Historical records from webhook ingestion</p>
        </div>
        <button
          type="button"
          onClick={fetchSessions}
          className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="relative block w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by session ID or room"
            className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </label>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "ended")}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm md:w-auto"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="ended">Ended</option>
        </select>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <p className="text-muted-foreground">
          {hasFilters
            ? "No sessions found for the current filters."
            : "No sessions yet. Configure LiveKit webhook to POST to /api/webhook and generate room activity."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session ID</TableHead>
              <TableHead>Room Name</TableHead>
              <TableHead>Started At</TableHead>
              <TableHead>Ended At</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Participants</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.session_id}>
                <TableCell className="font-mono text-xs">{session.session_id}</TableCell>
                <TableCell className="font-medium">{session.room_name}</TableCell>
                <TableCell>{formatDate(session.started_at)}</TableCell>
                <TableCell>{formatDate(session.ended_at)}</TableCell>
                <TableCell>{formatDuration(session.duration_seconds)}</TableCell>
                <TableCell>{session.participants}</TableCell>
                <TableCell>
                  <Badge variant={session.status === "active" ? "default" : "secondary"}>
                    {session.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
