import { z } from "zod"

export const DECISIONS = ["retry_now", "retry_later", "dead_letter", "page_human"] as const

export type Decision = (typeof DECISIONS)[number]

export type Failure = {
  jobName: string
  queueName: string
  errorMessage: string
  errorName?: string
  errorCode?: string
  attempt: number
  maxAttempts?: number
  payloadSummary?: string
  metadata?: Record<string, unknown>
}

export type Result = {
  decision: Decision
  confidence: number
  reason: string
  latencyMs: number
  provider: string
  delayMs?: number
}

export interface Classifier {
  classify(input: Failure): Promise<Result>
  /** Used as policy.timeoutMs when the policy does not set one. */
  suggestedTimeoutMs?: number
}

export const failureSchema = z.object({
  jobName: z.string().min(1, "jobName is required"),
  queueName: z.string().min(1, "queueName is required"),
  errorMessage: z.string().min(1, "errorMessage is required"),
  errorName: z.string().min(1).optional(),
  errorCode: z.string().min(1).optional(),
  attempt: z.number().int().positive("attempt must be 1 or greater"),
  maxAttempts: z.number().int().positive().optional(),
  payloadSummary: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
})

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "value"
      return `${path}: ${issue.message}`
    })
    .join("; ")
}
