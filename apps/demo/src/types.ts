export type FeedDecision = "retry_now" | "retry_later" | "dead_letter" | "page_human" | "fallback"

export type Speed = "normal" | "fast"

export type FailureEvent = {
  id: string
  timestamp: string
  jobName: string
  errorMessage: string
  errorCode: string
  attemptNumber: number
  payloadSummary: string
  decision: FeedDecision
  confidence: number
  latencyMs: number
  provider: string
  applied: boolean
  dryRun: boolean
  escalated: boolean
  reason: string
}

export type Stats = {
  totalFailures: number
  autoResolved: number
  escalated: number
  deadLettered: number
  averageLatencyMs: number
  provider: string
  producerRunning: boolean
  speed: Speed
  dryRun: boolean
}
