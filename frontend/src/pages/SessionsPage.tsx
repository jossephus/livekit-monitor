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

interface RawWebhookEvent {
  id?: string
  event?: string | number
  created_at?: number
  room?: {
    sid?: string
    name?: string
  }
  participant?: {
    identity?: string
    sid?: string
  }
}

interface SessionRow {
  sessionId: string
  roomName: string
  startedAt: number
  endedAt?: number
  durationSec: number
  participants: number
  status: "active" | "ended"
}

const REFRESH_INTERVAL = 10000

function normalizeTimestamp(raw?: number): number {
  if (!raw) return Math.floor(Date.now() / 1000)
  return raw > 1_000_000_000_000 ? Math.floor(raw / 1000) : raw
}

function formatDate(epochSeconds?: number): string {
  if (!epochSeconds) return "-"
  return new Date(epochSeconds * 1000).toLocaleString()
}

function formatDuration(durationSec: number): string {
  const hours = Math.floor(durationSec / 3600)
  const minutes = Math.floor((durationSec % 3600) / 60)
  const seconds = durationSec % 60
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

function toEventLabel(event: string | number | undefined): string {
  return String(event ?? "").toLowerCase()
}

function isRoomStart(event: string): boolean {
  return event.includes("room_started")
}

function isRoomEnd(event: string): boolean {
  return event.includes("room_finished")
}

function isParticipantJoin(event: string): boolean {
  return event.includes("participant_joined")
}

function buildSessions(events: RawWebhookEvent[]): SessionRow[] {
  type MutableSession = {
    sessionId: string
    roomName: string
    startedAt: number
    endedAt?: number
    status: "active" | "ended"
    participantSet: Set<string>
  }

  const now = Math.floor(Date.now() / 1000)
  const openByRoom = new Map<string, MutableSession>()
  const completed: MutableSession[] = []

  events.forEach((event, index) => {
    const label = toEventLabel(event.event)
    const timestamp = normalizeTimestamp(event.created_at)
    const roomName = event.room?.name || event.room?.sid || "unknown-room"
    const participantId = event.participant?.identity || event.participant?.sid

    if (isRoomStart(label)) {
      const sessionId = event.id || `${roomName}-${timestamp}-${index}`
      const session: MutableSession = {
        sessionId,
        roomName,
        startedAt: timestamp,
        status: "active",
        participantSet: new Set(),
      }
      openByRoom.set(roomName, session)
      return
    }

    if (isParticipantJoin(label)) {
      const existing = openByRoom.get(roomName)
      if (existing) {
        if (participantId) existing.participantSet.add(participantId)
        return
      }

      const fallbackId = event.id || `${roomName}-${timestamp}-${index}`
      const session: MutableSession = {
        sessionId: fallbackId,
        roomName,
        startedAt: timestamp,
        status: "active",
        participantSet: new Set(participantId ? [participantId] : []),
      }
      openByRoom.set(roomName, session)
      return
    }

    if (isRoomEnd(label)) {
      const existing = openByRoom.get(roomName)
      if (!existing) {
        return
      }
      existing.endedAt = timestamp
      existing.status = "ended"
      openByRoom.delete(roomName)
      completed.push(existing)
    }
  })

  const active = Array.from(openByRoom.values())
  const all = [...completed, ...active]

  return all
    .map((session) => {
      const end = session.endedAt ?? now
      return {
        sessionId: session.sessionId,
        roomName: session.roomName,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        durationSec: Math.max(0, end - session.startedAt),
        participants: session.participantSet.size,
        status: session.status,
      }
    })
    .sort((a, b) => b.startedAt - a.startedAt)
}

export default function SessionsPage() {
  const [events, setEvents] = useState<RawWebhookEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "ended">("all")

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/webhook/events")
      if (!res.ok) {
        throw new Error(`Failed to fetch webhook events: HTTP ${res.status}`)
      }
      const data: RawWebhookEvent[] = await res.json()
      setEvents(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch sessions")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  useEffect(() => {
    const id = setInterval(fetchEvents, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [fetchEvents])

  const sessions = useMemo(() => buildSessions(events), [events])

  const filteredSessions = useMemo(() => {
    const term = query.trim().toLowerCase()
    return sessions.filter((session) => {
      const matchesStatus = statusFilter === "all" || session.status === statusFilter
      const matchesSearch =
        term.length === 0 ||
        session.sessionId.toLowerCase().includes(term) ||
        session.roomName.toLowerCase().includes(term)
      return matchesStatus && matchesSearch
    })
  }, [sessions, query, statusFilter])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sessions</h1>
          <p className="text-sm text-muted-foreground">Derived from recent webhook events</p>
        </div>
        <button
          type="button"
          onClick={fetchEvents}
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
      ) : filteredSessions.length === 0 ? (
        <p className="text-muted-foreground">No sessions found for the current filters.</p>
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
            {filteredSessions.map((session) => (
              <TableRow key={session.sessionId}>
                <TableCell className="font-mono text-xs">{session.sessionId}</TableCell>
                <TableCell className="font-medium">{session.roomName}</TableCell>
                <TableCell>{formatDate(session.startedAt)}</TableCell>
                <TableCell>{formatDate(session.endedAt)}</TableCell>
                <TableCell>{formatDuration(session.durationSec)}</TableCell>
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
