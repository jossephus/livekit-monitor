import { useEffect, useRef, useState } from "react"
import { Pause, Play, Trash2 } from "lucide-react"
import { apiUrl } from "@/lib/basepath"

interface WebhookEvent {
  event?: string
  created_at?: number
  room?: { name?: string }
  participant?: { identity?: string }
  egress_info?: { egress_id?: string }
  ingress_info?: { ingress_id?: string }
  track?: { sid?: string; type?: string }
}

const EVENT_COLORS: Record<string, string> = {
  room_started: "text-emerald-500",
  room_finished: "text-emerald-400",
  participant_joined: "text-blue-500",
  participant_left: "text-blue-400",
  track_published: "text-violet-500",
  track_unpublished: "text-violet-400",
  egress_started: "text-amber-500",
  egress_updated: "text-amber-400",
  egress_ended: "text-amber-400",
  ingress_started: "text-rose-500",
  ingress_ended: "text-rose-400",
}

function normalizeTimestamp(raw?: number): number {
  if (!raw) return 0
  return raw > 1_000_000_000_000 ? Math.floor(raw / 1000) : raw
}

function formatTime(raw?: number): string {
  const ts = normalizeTimestamp(raw)
  if (!ts) return "--:--:--"
  return new Date(ts * 1000).toLocaleTimeString()
}

function eventDetail(event: WebhookEvent): string {
  const parts: string[] = []
  if (event.room?.name) parts.push(event.room.name)
  if (event.participant?.identity) parts.push(event.participant.identity)
  if (event.egress_info?.egress_id) parts.push(`egress:${event.egress_info.egress_id.slice(0, 8)}`)
  if (event.ingress_info?.ingress_id) parts.push(`ingress:${event.ingress_info.ingress_id.slice(0, 8)}`)
  return parts.join(" · ")
}

export default function LiveEventsPage() {
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [paused, setPaused] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  // Load existing events on mount
  useEffect(() => {
    fetch(apiUrl("/api/webhook/events"))
      .then((res) => res.json())
      .then((data: WebhookEvent[]) => setEvents(data))
      .catch(() => {})
  }, [])

  // Connect SSE for live events
  useEffect(() => {
    const es = new EventSource(apiUrl("/api/webhook/events/stream"))

    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)

    es.onmessage = (e) => {
      if (pausedRef.current) return
      try {
        const event: WebhookEvent = JSON.parse(e.data)
        setEvents((prev) => [...prev.slice(-499), event])
      } catch {
        // ignore malformed events
      }
    }

    return () => es.close()
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    if (!paused) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [events, paused])

  return (
    <div className="flex h-full flex-col space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-medium">Live Events</h1>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-red-400"}`}
            />
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            title={paused ? "Resume" : "Pause"}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={() => setEvents([])}
            title="Clear"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {events.length === 0 ? (
          <div className="flex h-full items-center justify-center p-12">
            <p className="text-sm text-muted-foreground">
              {connected
                ? "Listening for events… Events will appear here as they arrive."
                : "Connecting to event stream…"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border font-mono text-sm">
            {events.map((event, i) => {
              const eventName = event.event ?? "unknown"
              const colorClass = EVENT_COLORS[eventName] ?? "text-muted-foreground"
              return (
                <div
                  key={`${event.created_at ?? 0}-${eventName}-${i}`}
                  className="flex items-baseline gap-4 px-5 py-2.5 transition-colors hover:bg-accent/50"
                >
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatTime(event.created_at)}
                  </span>
                  <span className={`shrink-0 text-xs font-medium ${colorClass}`}>
                    {eventName}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {eventDetail(event)}
                  </span>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {paused && (
        <div className="text-center text-xs text-muted-foreground">
          ⏸ Paused — new events are being dropped
        </div>
      )}
    </div>
  )
}
