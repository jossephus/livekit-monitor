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

const REFRESH_OPTIONS = [
  { label: "5s", value: 5000 },
  { label: "10s", value: 10000 },
  { label: "30s", value: 30000 },
  { label: "off", value: 0 },
]

const TIME_RANGES = ["1h", "6h", "24h", "7d"]

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
        <p className="pt-4 text-sm text-muted-foreground">Event timeline placeholder. Coming in a follow-up task.</p>
      </section>
    </div>
  )
}
