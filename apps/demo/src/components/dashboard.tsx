"use client"

import { useCallback, useEffect, useState } from "react"
import type { FailureEvent, Speed, Stats } from "@/types"
import { Pause, Play } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FailureRow } from "@/components/failure-row"
import { StatCard } from "@/components/stat-card"
import { cn } from "cn"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

const EMPTY_STATS: Stats = {
  totalFailures: 0,
  autoResolved: 0,
  escalated: 0,
  deadLettered: 0,
  averageLatencyMs: 0,
  provider: "rules",
  producerRunning: true,
  speed: "normal",
  dryRun: true,
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)
  const [events, setEvents] = useState<FailureEvent[]>([])
  const [connection, setConnection] = useState<"live" | "reconnecting">("reconnecting")
  const [busy, setBusy] = useState<"run" | "speed" | "mode" | null>(null)

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/stats`)
      if (!response.ok) return
      setStats((await response.json()) as Stats)
    } catch {
      setConnection("reconnecting")
    }
  }, [])

  useEffect(() => {
    const kick = window.setTimeout(() => void loadStats(), 0)
    const poll = window.setInterval(() => void loadStats(), 2000)
    return () => {
      window.clearTimeout(kick)
      window.clearInterval(poll)
    }
  }, [loadStats])

  useEffect(() => {
    let source: EventSource | null = null
    let closed = false
    let retry: number | undefined

    const connect = () => {
      source = new EventSource(`${API_URL}/events`)
      source.onopen = () => setConnection("live")
      source.onmessage = (message) => {
        const event = JSON.parse(message.data) as FailureEvent
        setEvents((current) => [event, ...current].slice(0, 30))
        void loadStats()
      }
      source.onerror = () => {
        setConnection("reconnecting")
        source?.close()
        if (!closed) retry = window.setTimeout(connect, 1200)
      }
    }

    connect()
    return () => {
      closed = true
      if (retry) window.clearTimeout(retry)
      source?.close()
    }
  }, [loadStats])

  async function setRunning(running: boolean) {
    setBusy("run")
    try {
      const response = await fetch(`${API_URL}/producer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ running }),
      })
      if (response.ok) setStats((await response.json()) as Stats)
    } catch {
      setConnection("reconnecting")
    } finally {
      setBusy(null)
    }
  }

  async function setSpeed(speed: Speed) {
    setBusy("speed")
    try {
      const response = await fetch(`${API_URL}/producer/speed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speed }),
      })
      if (response.ok) setStats((await response.json()) as Stats)
    } catch {
      setConnection("reconnecting")
    } finally {
      setBusy(null)
    }
  }

  async function setDryRun(dryRun: boolean) {
    setBusy("mode")
    try {
      const response = await fetch(`${API_URL}/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      })
      if (response.ok) setStats((await response.json()) as Stats)
    } catch {
      setConnection("reconnecting")
    } finally {
      setBusy(null)
    }
  }

  const autoRate =
    stats.totalFailures === 0 ? 0 : Math.round((stats.autoResolved / stats.totalFailures) * 100)

  return (
    <main className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="relative flex size-2.5">
              <span
                className={cn(
                  "absolute inline-flex size-full rounded-full opacity-70",
                  connection === "live" && stats.producerRunning ? "animate-ping bg-emerald-400" : "bg-amber-300",
                )}
              />
              <span
                className={cn(
                  "relative inline-flex size-2.5 rounded-full",
                  connection === "live" && stats.producerRunning ? "bg-emerald-400" : "bg-amber-300",
                )}
              />
            </span>
            <h1 className="text-3xl font-semibold tracking-tight">Nightwatch</h1>
            <Badge variant="outline" className="font-mono tracking-wide uppercase">
              {stats.provider}
            </Badge>
            <span className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
              {connection === "live" ? "Live" : "Reconnecting"}
            </span>
          </div>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Failed jobs, judged by Jev. The queue moves only when the call is sure enough.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-white/5 p-1 ring-1 ring-white/10">
            {([
              ["Dry run", true],
              ["Live", false],
            ] as const).map(([label, dryRun]) => (
              <button
                key={label}
                type="button"
                disabled={busy === "mode"}
                onClick={() => void setDryRun(dryRun)}
                className={cn(
                  "h-8 rounded-md px-3 font-mono text-xs tracking-wide uppercase transition-colors",
                  stats.dryRun === dryRun
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg bg-white/5 p-1 ring-1 ring-white/10">
            {(["normal", "fast"] as const).map((speed) => (
              <button
                key={speed}
                type="button"
                disabled={busy === "speed"}
                onClick={() => void setSpeed(speed)}
                className={cn(
                  "h-8 rounded-md px-3 font-mono text-xs tracking-wide uppercase transition-colors",
                  stats.speed === speed
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {speed}
              </button>
            ))}
          </div>
          <Button
            size="lg"
            variant={stats.producerRunning ? "outline" : "default"}
            disabled={busy === "run"}
            onClick={() => void setRunning(!stats.producerRunning)}
          >
            {stats.producerRunning ? <Pause /> : <Play />}
            {stats.producerRunning ? "Pause" : "Start"}
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total failures" value={stats.totalFailures} accent="bg-foreground/50" />
        <StatCard
          label="Auto-resolved"
          value={autoRate}
          suffix="%"
          detail={`${stats.autoResolved.toLocaleString()} handled`}
          accent="bg-emerald-400"
        />
        <StatCard label="Escalated to human" value={stats.escalated} accent="bg-amber-300" />
        <StatCard
          label="Avg decision latency"
          value={stats.averageLatencyMs}
          suffix="ms"
          accent="bg-sky-400"
        />
      </section>

      <section className="overflow-hidden rounded-xl bg-card/75 ring-1 ring-white/10">
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
          <div>
            <h2 className="text-sm font-medium">Live feed</h2>
            <p className="text-xs text-muted-foreground">Newest failures appear at the top. 30 rows max.</p>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            dead-lettered {stats.deadLettered.toLocaleString()}
          </p>
        </div>

        <div className="hidden border-b border-white/6 px-4 py-2 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase md:grid md:grid-cols-[168px_minmax(0,1fr)_132px_180px_76px] md:gap-4">
          <span>Job</span>
          <span>Error</span>
          <span>Decision</span>
          <span>Confidence</span>
          <span className="text-right">Latency</span>
        </div>

        <div className="max-h-[calc(100vh-360px)] min-h-80 overflow-y-auto">
          {events.length === 0 ? (
            <div className="flex min-h-80 flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm text-foreground">
                {stats.producerRunning ? "Waiting for the next failed job." : "Producer is paused."}
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                About 40 percent of jobs fail on purpose. Each one shows up here with a decision.
              </p>
            </div>
          ) : (
            events.map((event) => <FailureRow key={event.id} event={event} />)
          )}
        </div>
      </section>
    </main>
  )
}
