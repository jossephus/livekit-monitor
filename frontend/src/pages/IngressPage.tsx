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

interface IngressInfo {
  ingress_id?: string
  ingressId?: string
  room_name?: string
  roomName?: string
  input_type?: string | number
  inputType?: string | number
  state?: string | number | { status?: string | number }
  stream_key?: string
  streamKey?: string
  url?: string
}

const REFRESH_INTERVAL = 10000

function normalizeState(state?: string | number): string {
  if (typeof state === "string") return state.toLowerCase()
  switch (state) {
    case 0:
      return "endpoint_inactive"
    case 1:
      return "endpoint_buffering"
    case 2:
      return "endpoint_publishing"
    case 3:
      return "endpoint_error"
    case 4:
      return "endpoint_complete"
    default:
      return "unknown"
  }
}

function extractState(ingress: IngressInfo): string {
  const raw = ingress.state
  if (typeof raw === "string" || typeof raw === "number") {
    return normalizeState(raw)
  }
  if (raw && typeof raw === "object" && "status" in raw) {
    return normalizeState(raw.status)
  }
  return "endpoint_inactive"
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status.includes("publishing") || status.includes("buffering")) return "default"
  if (status.includes("error")) return "destructive"
  if (status.includes("inactive") || status.includes("complete")) return "secondary"
  return "outline"
}

function inputTypeLabel(type?: string | number): string {
  if (typeof type === "string") return type.toLowerCase()
  switch (type) {
    case 0:
      return "rtmp_input"
    case 1:
      return "whip_input"
    case 2:
      return "url_input"
    default:
      return "unknown"
  }
}

function maskStreamKey(key: string): string {
  if (key.length <= 8) return key
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

export default function IngressPage() {
  const [ingresses, setIngresses] = useState<IngressInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [roomFilter, setRoomFilter] = useState("")

  const fetchIngresses = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (roomFilter.trim()) params.set("room_name", roomFilter.trim())
      const query = params.toString()
      const url = query.length > 0 ? `/api/ingress?${query}` : "/api/ingress"

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to fetch ingresses: HTTP ${response.status}`)
      }

      const data: IngressInfo[] = await response.json()
      setIngresses(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ingress endpoints")
    } finally {
      setLoading(false)
    }
  }, [roomFilter])

  useEffect(() => {
    fetchIngresses()
  }, [fetchIngresses])

  useEffect(() => {
    const id = setInterval(fetchIngresses, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [fetchIngresses])

  const rows = useMemo(
    () =>
      ingresses.map((ingress) => ({
        id: ingress.ingress_id ?? ingress.ingressId ?? "-",
        room: ingress.room_name ?? ingress.roomName ?? "-",
        sourceType: inputTypeLabel(ingress.input_type ?? ingress.inputType),
        status: extractState(ingress),
        streamKey: ingress.stream_key ?? ingress.streamKey ?? "-",
        url: ingress.url ?? "-",
      })),
    [ingresses]
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">Ingress</h1>
          <p className="text-sm text-muted-foreground">Inbound stream sources and publishing state</p>
        </div>
        <button
          type="button"
          onClick={fetchIngresses}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
          className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm"
        />
      </label>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading ingress sources...</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">No ingress endpoints found.</p>
      ) : (
        <div className="rounded-xl bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Source Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stream Key</TableHead>
                <TableHead>URL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.id}</TableCell>
                  <TableCell className="font-medium">{row.room}</TableCell>
                  <TableCell className="capitalize">{row.sourceType.replaceAll("_", " ")}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)} className="capitalize">
                      {row.status.replaceAll("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.streamKey === "-" ? row.streamKey : maskStreamKey(row.streamKey)}
                  </TableCell>
                  <TableCell className="max-w-[320px] truncate" title={row.url}>
                    {row.url}
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
