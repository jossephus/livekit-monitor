import { useCallback, useEffect, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { ArrowLeft, RefreshCw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

interface ParticipantTrack {
  sid?: string
  type?: string | number
  source?: string | number
  name?: string
  muted?: boolean
  width?: number
  height?: number
  layers?: Array<{ quality?: string | number; width?: number; height?: number }>
  simulcast?: boolean
  mime_type?: string
  codec?: string
}

interface Participant {
  sid?: string
  identity?: string
  name?: string
  state?: string | number
  tracks?: ParticipantTrack[]
  joined_at?: number
  is_publisher?: boolean
}

const REFRESH_INTERVAL = 5000

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return "-"
  return new Date(timestamp * 1000).toLocaleString()
}

function normalizeState(state?: string | number) {
  if (typeof state === "string") return state
  switch (state) {
    case 0:
      return "JOINING"
    case 1:
      return "JOINED"
    case 2:
      return "ACTIVE"
    case 3:
      return "DISCONNECTED"
    default:
      return "UNKNOWN"
  }
}

function normalizeTrackSource(source?: string | number) {
  if (typeof source === "string") return source.toLowerCase()
  switch (source) {
    case 1:
      return "camera"
    case 2:
      return "microphone"
    case 3:
      return "screen_share"
    case 4:
      return "screen_share_audio"
    default:
      return "unknown"
  }
}

function getTrackBadgeVariant(source: string) {
  if (source.includes("screen")) return "secondary"
  return "outline"
}

export default function RoomDetailPage() {
  const { name } = useParams<{ name: string }>()

  const [room, setRoom] = useState<Room | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRoomDetail = useCallback(async () => {
    if (!name) {
      setError("Missing room name")
      setLoading(false)
      return
    }

    try {
      const encoded = encodeURIComponent(name)
      const [roomRes, participantsRes] = await Promise.all([
        fetch(`/api/rooms/${encoded}`),
        fetch(`/api/rooms/${encoded}/participants`),
      ])

      if (!roomRes.ok) {
        throw new Error(`Failed to fetch room: HTTP ${roomRes.status}`)
      }

      if (!participantsRes.ok) {
        throw new Error(`Failed to fetch participants: HTTP ${participantsRes.status}`)
      }

      const roomData: Room = await roomRes.json()
      const participantsData: Participant[] = await participantsRes.json()

      setRoom(roomData)
      setParticipants(participantsData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load room details")
    } finally {
      setLoading(false)
    }
  }, [name])

  useEffect(() => {
    fetchRoomDetail()
  }, [fetchRoomDetail])

  useEffect(() => {
    const id = setInterval(fetchRoomDetail, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [fetchRoomDetail])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/rooms"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to rooms
        </Link>
        <button
          type="button"
          onClick={fetchRoomDetail}
          className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Room: {name}</h1>
        <p className="text-sm text-muted-foreground">Auto-refreshing every 5 seconds</p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Room Metadata</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">SID</p>
            <p className="font-mono text-xs">{room?.sid ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Participants</p>
            <p className="text-sm font-medium">{room?.num_participants ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Publishers</p>
            <p className="text-sm font-medium">{room?.num_publishers ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Created At</p>
            <p className="text-sm">{formatTimestamp(room?.creation_time)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Recording</p>
            <p className="text-sm">{room?.active_recording ? "Active" : "Inactive"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Max Participants</p>
            <p className="text-sm">{room?.max_participants ?? "-"}</p>
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <p className="text-xs text-muted-foreground">Metadata</p>
            <p className="break-all text-sm">{room?.metadata || "-"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Participants</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading participants...</p>
          ) : participants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No participants in this room.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Identity</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Tracks (A/V/Screen)</TableHead>
                  <TableHead>Joined At</TableHead>
                  <TableHead>Publisher</TableHead>
                  <TableHead>Track Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {participants.map((participant) => {
                  const tracks = participant.tracks ?? []
                  const audioCount = tracks.filter((t) => normalizeTrackSource(t.source).includes("microphone")).length
                  const videoCount = tracks.filter((t) => normalizeTrackSource(t.source).includes("camera")).length
                  const screenCount = tracks.filter((t) => normalizeTrackSource(t.source).includes("screen")).length

                  return (
                    <TableRow key={participant.sid ?? participant.identity}>
                      <TableCell className="font-medium">{participant.identity ?? "-"}</TableCell>
                      <TableCell>{participant.name || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{normalizeState(participant.state)}</Badge>
                      </TableCell>
                      <TableCell>
                        {audioCount}/{videoCount}/{screenCount}
                      </TableCell>
                      <TableCell>{formatTimestamp(participant.joined_at)}</TableCell>
                      <TableCell>
                        <Badge variant={participant.is_publisher ? "default" : "outline"}>
                          {participant.is_publisher ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          {tracks.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No tracks</p>
                          ) : (
                            tracks.map((track, index) => {
                              const source = normalizeTrackSource(track.source)
                              const dimensions =
                                track.width && track.height
                                  ? `${track.width}x${track.height}`
                                  : "-"
                              const layers = track.layers?.length ?? 0

                              return (
                                <div key={`${track.sid ?? source}-${index}`} className="rounded border p-2 text-xs">
                                  <div className="mb-1 flex items-center gap-2">
                                    <Badge variant={getTrackBadgeVariant(source)}>{source}</Badge>
                                    <span className="font-mono text-[11px] text-muted-foreground">
                                      {track.sid ?? "no-sid"}
                                    </span>
                                  </div>
                                  <div className="grid gap-0.5">
                                    <p>
                                      Codec: {track.codec || track.mime_type || "-"} | Muted: {track.muted ? "yes" : "no"}
                                    </p>
                                    <p>
                                      Simulcast layers: {layers} | Dimensions: {dimensions}
                                    </p>
                                  </div>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
