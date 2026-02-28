import { useEffect, useState } from "react"
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

interface Room {
  sid: string
  name: string
  num_participants: number
  creation_time: number
  metadata: string
  max_participants: number
  active_recording: boolean
  num_publishers: number
}

const REFRESH_INTERVAL = 5000

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchRooms() {
    try {
      const res = await fetch("/api/rooms")
      if (!res.ok) throw new Error(`Failed to fetch rooms: ${res.statusText}`)
      const data = await res.json()
      setRooms(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRooms()
    const interval = setInterval(fetchRooms, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  function formatCreatedAt(timestamp: number): string {
    if (!timestamp) return "—"
    return new Date(timestamp * 1000).toLocaleString()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rooms</h1>
        <button
          onClick={fetchRooms}
          className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
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
                    className="font-medium text-primary underline-offset-4 hover:underline"
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
                  {room.num_participants > 0 ? (
                    <Badge variant="default">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Empty</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
