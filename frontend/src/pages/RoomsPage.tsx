import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { RefreshCw } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { apiUrl } from "@/lib/basepath"

interface ActiveRoom {
  sid: string
  name: string
  num_participants: number
  creation_time: number
  metadata: string
  max_participants: number
  active_recording: boolean
  num_publishers: number
}

interface RoomHistoryItem {
  sid: string
  name: string
  created_at?: number
  last_event_at: number
  status: string
}

interface RoomRow {
  sid: string
  name: string
  num_participants: number
  creation_time: number
  status: "Active" | "Inactive"
}

const REFRESH_INTERVAL = 5000

function normalizeTimestamp(raw?: number): number {
  if (!raw) return 0
  return raw > 1_000_000_000_000 ? Math.floor(raw / 1000) : raw
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRooms = useCallback(async () => {
    try {
      const [roomsRes, historyRes] = await Promise.all([
        fetch(apiUrl("/api/rooms")),
        fetch(apiUrl("/api/rooms/history")),
      ])

      if (!roomsRes.ok) {
        throw new Error(`Failed to fetch rooms: HTTP ${roomsRes.status}`)
      }

      const activeRooms: ActiveRoom[] = await roomsRes.json()

      const roomMap = new Map<string, RoomRow>()

      activeRooms.forEach((room) => {
        roomMap.set(room.name, {
          sid: room.sid,
          name: room.name,
          num_participants: room.num_participants,
          creation_time: room.creation_time,
          status: "Active",
        })
      })

      if (historyRes.ok) {
        const history: RoomHistoryItem[] = await historyRes.json()
        history.forEach((room) => {
          if (!room.name || roomMap.has(room.name)) return

          roomMap.set(room.name, {
            sid: room.sid || "-",
            name: room.name,
            num_participants: 0,
            creation_time: normalizeTimestamp(room.created_at ?? room.last_event_at),
            status: room.status === "active" ? "Active" : "Inactive",
          })
        })
      }

      const mergedRooms = Array.from(roomMap.values()).sort(
        (a, b) => b.creation_time - a.creation_time
      )

      setRooms(mergedRooms)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRooms()
    const interval = setInterval(fetchRooms, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchRooms])

  function formatCreatedAt(timestamp: number): string {
    if (!timestamp) return "—"
    return new Date(timestamp * 1000).toLocaleString()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">Rooms</h1>
          <p className="text-sm text-muted-foreground">Current and recently active LiveKit rooms</p>
        </div>
        <button
          type="button"
          onClick={fetchRooms}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading rooms…</p>
      ) : rooms.length === 0 ? (
        <p className="text-muted-foreground">No active rooms.</p>
      ) : (
        <div className="rounded-xl bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>SID</TableHead>
                <TableHead>Participants</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((room) => (
                <TableRow key={room.sid}>
                  <TableCell>
                    <Link
                      to={`/rooms/${room.name}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {room.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {room.sid}
                  </TableCell>
                  <TableCell>{room.num_participants}</TableCell>
                  <TableCell>{formatCreatedAt(room.creation_time)}</TableCell>
                  <TableCell>
                    {room.status === "Active" ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
