import { useEffect, useState, useCallback } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DoorOpen,
  Users,
  ArrowUpFromLine,
  ArrowDownToLine,
  RefreshCw,
} from "lucide-react"

interface OverviewData {
  total_rooms: number
  total_participants: number
  active_egresses: number
  active_ingresses: number
}

const REFRESH_OPTIONS = [
  { label: "5s", value: 5000 },
  { label: "10s", value: 10000 },
  { label: "30s", value: 30000 },
  { label: "Off", value: 0 },
]

const TIME_RANGES = ["Last 1h", "Last 6h", "Last 24h", "Last 7d"]

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshInterval, setRefreshInterval] = useState(10000)
  const [timeRange, setTimeRange] = useState("Last 1h")

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/overview")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOverview()
  }, [fetchOverview])

  useEffect(() => {
    if (refreshInterval === 0) return
    const id = setInterval(fetchOverview, refreshInterval)
    return () => clearInterval(id)
  }, [refreshInterval, fetchOverview])

  const stats = data
    ? [
        {
          title: "Total Rooms",
          value: data.total_rooms,
          icon: DoorOpen,
        },
        {
          title: "Total Participants",
          value: data.total_participants,
          icon: Users,
        },
        {
          title: "Active Egresses",
          value: data.active_egresses,
          icon: ArrowUpFromLine,
        },
        {
          title: "Active Ingresses",
          value: data.active_ingresses,
          icon: ArrowDownToLine,
        },
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Overview</h1>
        <div className="flex items-center gap-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            {TIME_RANGES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              {REFRESH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load overview: {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-16 animate-pulse rounded bg-muted" />
                </CardContent>
              </Card>
            ))
          : stats.map((stat) => (
              <Card key={stat.title}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {stat.title}
                    </CardTitle>
                    <stat.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            ))}
      </div>
    </div>
  )
}
