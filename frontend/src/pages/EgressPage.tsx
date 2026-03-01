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

interface EgressInfo {
  egress_id?: string
  egressId?: string
  room_name?: string
  roomName?: string
  request?: {
    room_name?: string
    roomName?: string
  }
  status?: string | number
  started_at?: number
  startedAt?: number | string
  ended_at?: number
  endedAt?: number | string
  updated_at?: number
  updatedAt?: number | string
  file_results?: Array<{ location?: string; filename?: string }>
  fileResults?: Array<{ location?: string; filename?: string }>
  stream_results?: Array<{ urls?: string[]; url?: string }>
  streamResults?: Array<{ urls?: string[]; url?: string }>
  segments?: {
    playlist_name?: string
    playlist_location?: string
    live_playlist_name?: string
  }
  roomComposite?: {
    roomName?: string
  }
}

const REFRESH_INTERVAL = 10000

function normalizeTimestamp(raw?: number | string): number | undefined {
  if (!raw) return undefined
  const value = typeof raw === "string" ? Number(raw) : raw
  if (!Number.isFinite(value) || value <= 0) return undefined
  if (value > 1_000_000_000_000_000) return Math.floor(value / 1_000_000_000)
  if (value > 1_000_000_000_000) return Math.floor(value / 1000)
  return value
}

function formatDate(raw?: number | string): string {
  const ts = normalizeTimestamp(raw)
  if (!ts) return "-"
  return new Date(ts * 1000).toLocaleString()
}

function durationSeconds(egress: EgressInfo): number {
  const start = normalizeTimestamp(egress.started_at ?? egress.startedAt)
  if (!start) return 0
  const end =
    normalizeTimestamp(egress.ended_at ?? egress.endedAt) ?? Math.floor(Date.now() / 1000)
  return Math.max(0, end - start)
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function normalizeStatus(
  status: string | number | undefined,
  egress?: EgressInfo
): string {
  if (typeof status === "string") return status.toLowerCase()
  switch (status) {
    case 1:
      return "starting"
    case 2:
      return "active"
    case 3:
      return "ending"
    case 4:
      return "complete"
    case 5:
      return "failed"
    case 6:
      return "aborted"
    case 7:
      return "limit_reached"
    default:
      if (egress) {
        const ended = normalizeTimestamp(egress.ended_at ?? egress.endedAt)
        const started = normalizeTimestamp(egress.started_at ?? egress.startedAt)
        if (ended) return "complete"
        if (started) return "active"
      }
      return "unknown"
  }
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active" || status === "starting" || status === "ending") return "default"
  if (status === "failed" || status === "aborted") return "destructive"
  if (status === "complete") return "secondary"
  return "outline"
}

function destinationOf(egress: EgressInfo): string {
  const file = (egress.file_results ?? egress.fileResults)?.[0]
  if (file?.location) return file.location
  if (file?.filename) return file.filename

  const stream = (egress.stream_results ?? egress.streamResults)?.[0]
  if (stream?.url) return stream.url
  if (stream?.urls?.length) return stream.urls.join(", ")

  if (egress.segments?.playlist_location) return egress.segments.playlist_location
  if (egress.segments?.playlist_name) return egress.segments.playlist_name
  if (egress.segments?.live_playlist_name) return egress.segments.live_playlist_name

  return "-"
}

function egressTypeOf(egress: EgressInfo): string {
  if ((egress.stream_results ?? egress.streamResults)?.length) return "stream"
  if (egress.segments) return "segments"
  if ((egress.file_results ?? egress.fileResults)?.length) return "file"
  return "unknown"
}

export default function EgressPage() {
  const [egresses, setEgresses] = useState<EgressInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [roomFilter, setRoomFilter] = useState("")

  const fetchEgresses = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (roomFilter.trim()) params.set("room_name", roomFilter.trim())
      params.set("limit", "500")
      const qs = params.toString()
      const url = qs.length ? `/api/egress/history?${qs}` : "/api/egress/history"

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to fetch egresses: HTTP ${response.status}`)
      }

      const data: EgressInfo[] = await response.json()
      setEgresses(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load egress jobs")
    } finally {
      setLoading(false)
    }
  }, [roomFilter])

  useEffect(() => {
    fetchEgresses()
  }, [fetchEgresses])

  useEffect(() => {
    const id = setInterval(fetchEgresses, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [fetchEgresses])

  const rows = useMemo(
    () =>
      egresses.map((egress) => {
        const status = normalizeStatus(egress.status, egress)
        return {
          id: egress.egress_id ?? egress.egressId ?? "-",
          room:
            egress.room_name ??
            egress.roomName ??
            egress.request?.room_name ??
            egress.request?.roomName ??
            egress.roomComposite?.roomName ??
            "-",
          type: egressTypeOf(egress),
          status,
          destination: destinationOf(egress),
          startedAt: formatDate(egress.started_at ?? egress.startedAt),
          duration: formatDuration(durationSeconds(egress)),
        }
      }),
    [egresses]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Egress</h1>
          <p className="text-sm text-muted-foreground">Recording and stream export jobs</p>
        </div>
        <button
          type="button"
          onClick={fetchEgresses}
          className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <label className="relative block w-full md:max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          value={roomFilter}
          onChange={(event) => setRoomFilter(event.target.value)}
          placeholder="Filter by room name"
          className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm"
        />
      </label>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading egress jobs...</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">No egress jobs found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Started At</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.id}</TableCell>
                <TableCell className="font-medium">{row.room}</TableCell>
                <TableCell className="capitalize">{row.type}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(row.status)} className="capitalize">
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[320px] truncate" title={row.destination}>
                  {row.destination}
                </TableCell>
                <TableCell>{row.startedAt}</TableCell>
                <TableCell>{row.duration}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
