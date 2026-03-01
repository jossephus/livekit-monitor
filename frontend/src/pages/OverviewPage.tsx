import { useEffect, useState, useCallback } from "react"
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

interface WebhookEvent {
  event?: string
  created_at?: number
  room?: {
    name?: string
  }
  participant?: {
    identity?: string
  }
}

const REFRESH_OPTIONS = [
  { label: "5s", value: 5000 },
  { label: "10s", value: 10000 },
  { label: "30s", value: 30000 },
  { label: "off", value: 0 },
]

const TIME_RANGES = ["1h", "6h", "24h", "7d"]

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshInterval, setRefreshInterval] = useState(10000)
  const [timeRange, setTimeRange] = useState("Last 1h")

  const fetchOverview = useCallback(async () => {
    try {
      const [overviewRes, eventsRes] = await Promise.all([
        fetch("/api/overview"),
        fetch("/api/webhook/events"),
      ])

      if (!overviewRes.ok) throw new Error(`HTTP ${overviewRes.status}`)
      const overviewJson = await overviewRes.json()
      setData(overviewJson)

      if (eventsRes.ok) {
        const eventsJson: WebhookEvent[] = await eventsRes.json()
        setEvents(eventsJson)
      }

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

  function normalizeTimestamp(raw?: number): number {
    if (!raw) return 0
    return raw > 1_000_000_000_000 ? Math.floor(raw / 1000) : raw
  }

  function formatCreatedAt(raw?: number): string {
    const ts = normalizeTimestamp(raw)
    if (!ts) return "-"
    return new Date(ts * 1000).toLocaleString()
  }

  const recentEvents = [...events].reverse().slice(0, 8)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-medium">Overview</h1>
        <div className="flex flex-wrap items-center gap-5 text-sm">
          <div className="inline-flex items-center gap-1 rounded-full bg-card px-1 py-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {TIME_RANGES.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setTimeRange(range)}
                className={
                  timeRange === range
                    ? "rounded-full px-3 py-1 font-medium text-foreground"
                    : "rounded-full px-3 py-1 text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                {range}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
            <div className="inline-flex items-center gap-1 rounded-full bg-card px-1 py-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              {REFRESH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRefreshInterval(opt.value)}
                  className={
                    refreshInterval === opt.value
                      ? "rounded-full px-3 py-1 font-medium text-foreground"
                      : "rounded-full px-3 py-1 text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load overview: {error}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? ["rooms", "participants", "egresses", "ingresses"].map((placeholder) => (
              <div key={placeholder} className="rounded-xl bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                <div className="mt-6 h-12 w-20 animate-pulse rounded bg-muted" />
              </div>
            ))
          : stats.map((stat) => (
              <div key={stat.title} className="rounded-xl bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{stat.title}</p>
                  <stat.icon className="h-5 w-5 text-stone-300" />
                </div>
                <p className="pt-8 text-5xl font-bold">{stat.value}</p>
              </div>
            ))}
      </div>

      <section className="rounded-xl bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Recent events</p>
        <div className="pt-4">
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent webhook events yet.</p>
          ) : (
            <div className="space-y-2">
              {recentEvents.map((event, index) => (
                <div
                  key={`${event.event ?? "event"}-${event.created_at ?? 0}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#A8A29E]" />
                    <p className="truncate text-sm text-foreground">
                      {(event.event ?? "unknown_event").replaceAll("_", " ")}
                    </p>
                    <span className="text-xs text-muted-foreground">{event.room?.name ?? "-"}</span>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">{formatCreatedAt(event.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
