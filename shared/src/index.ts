export const JOB_NAMES = [
  "send-email",
  "process-payment",
  "sync-kyc-status",
  "fetch-market-data",
  "deliver-webhook",
] as const

export type JobName = (typeof JOB_NAMES)[number]

export type Decision = "retry_now" | "retry_later" | "dead_letter" | "page_human"

export type Speed = "normal" | "fast"

export type ClassifierInput = {
  jobName: string
  errorMessage: string
  errorCode?: string
  attempt: number
}

export type ClassifierResult = {
  decision: Decision
  confidence: number
  latencyMs: number
  provider: string
}

export type JobPayload = {
  jobName: JobName
  shouldFail: boolean
  errorCode?: string
  errorMessage?: string
  attemptNumber: number
  payloadSummary: string
}

export type FailureEvent = {
  id: string
  timestamp: string
  jobName: string
  errorMessage: string
  errorCode: string
  attemptNumber: number
  payloadSummary: string
  decision: Decision
  confidence: number
  latencyMs: number
  provider: string
  autoResolved: boolean
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
}

export const AUTO_ACT_THRESHOLD = 0.8
