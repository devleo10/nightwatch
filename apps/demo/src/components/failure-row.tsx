"use client"

import type { FailureEvent, FeedDecision } from "@/types"
import { cn } from "cn"

const DECISION_STYLE: Record<FeedDecision, { badge: string; bar: string }> = {
  retry_now: {
    badge: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/40",
    bar: "bg-emerald-400",
  },
  retry_later: {
    badge: "bg-amber-300/15 text-amber-200 ring-amber-300/40",
    bar: "bg-amber-300",
  },
  dead_letter: {
    badge: "bg-rose-400/15 text-rose-300 ring-rose-400/40",
    bar: "bg-rose-400",
  },
  page_human: {
    badge: "bg-violet-400/15 text-violet-200 ring-violet-400/40",
    bar: "bg-violet-400",
  },
  fallback: {
    badge: "bg-white/10 text-foreground/80 ring-white/20",
    bar: "bg-white/40",
  },
}

export function FailureRow({ event }: { event: FailureEvent }) {
  const style = DECISION_STYLE[event.decision]
  const confidence = Math.round(event.confidence * 100)

  return (
    <article
      className={cn(
        "row-in grid grid-cols-1 items-center gap-3 border-b border-white/10 px-4 py-3.5 md:grid-cols-[168px_minmax(0,1fr)_132px_180px_76px] md:gap-4",
        !event.escalated &&
          "bg-transparent",
        event.escalated &&
          "bg-amber-300/10 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.85)]",
      )}
    >
      <div className="min-w-0">
        <p className="truncate font-mono text-sm font-medium text-foreground">{event.jobName}</p>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          attempt {event.attemptNumber} · {event.provider}
          {event.escalated ? " · escalated" : event.dryRun ? " · dry run" : event.applied ? " · applied" : ""}
        </p>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm text-foreground/90">{event.errorMessage}</p>
        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
          {event.errorCode} · {event.payloadSummary}
        </p>
        {event.reason ? (
          <p className="mt-1 truncate text-[11px] text-foreground/60" title={event.reason}>
            {event.reason}
          </p>
        ) : null}
      </div>

      <div>
        <span
          className={cn(
            "inline-flex h-6 items-center rounded-full px-2.5 font-mono text-[11px] ring-1",
            style.badge,
          )}
        >
          {event.decision}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className={cn("h-full rounded-full transition-[width] duration-500", style.bar)}
            style={{ width: `${confidence}%` }}
          />
        </div>
        <span className="w-10 text-right font-mono text-xs tabular-nums text-foreground/80">
          {confidence}%
        </span>
      </div>

      <p className="font-mono text-sm tabular-nums text-foreground/85 md:text-right">
        {event.latencyMs}
        <span className="ml-1 text-[11px] text-muted-foreground">ms</span>
      </p>
    </article>
  )
}
