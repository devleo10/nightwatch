import { z } from "zod"
import { ClassifierTimeoutError, errorMessage } from "./errors.js"
import type { Decision, Failure, Result } from "./types.js"
import { formatZodError } from "./types.js"

export type PolicyOptions = {
  minConfidence?: number
  neverAutoHandle?: Array<string | RegExp>
  maxAutoRetries?: number
  dryRun?: boolean
  timeoutMs?: number
}

export type ResolvedPolicy = {
  minConfidence: number
  neverAutoHandle: Array<string | RegExp>
  maxAutoRetries: number
  dryRun: boolean
  timeoutMs: number
}

export type PolicyAction = Decision | "fallback"

export type PolicyOutcome = {
  action: PolicyAction
  applied: boolean
  escalated: boolean
  dryRun: boolean
  reason: string
  delayMs?: number
}

export const policyConfigSchema = z
  .object({
    minConfidence: z.number().min(0).max(1).optional(),
    neverAutoHandle: z.array(z.string().min(1)).optional(),
    maxAutoRetries: z.number().int().min(0).optional(),
    dryRun: z.boolean().optional(),
    timeoutMs: z.number().int().positive().optional(),
  })
  .strict()

const DEFAULTS = {
  minConfidence: 0.8,
  maxAutoRetries: 3,
  dryRun: true,
  timeoutMs: 1500,
} as const

export function resolvePolicy(options: PolicyOptions = {}): ResolvedPolicy {
  const minConfidence = options.minConfidence ?? DEFAULTS.minConfidence
  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    throw new Error(
      `minConfidence must be between 0 and 1. Received ${String(options.minConfidence)}.`,
    )
  }

  const maxAutoRetries = options.maxAutoRetries ?? DEFAULTS.maxAutoRetries
  if (!Number.isInteger(maxAutoRetries) || maxAutoRetries < 0) {
    throw new Error(
      `maxAutoRetries must be a whole number of 0 or more. Received ${String(options.maxAutoRetries)}.`,
    )
  }

  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error(
      `timeoutMs must be a positive whole number of milliseconds. Received ${String(options.timeoutMs)}.`,
    )
  }

  if (options.dryRun !== undefined && typeof options.dryRun !== "boolean") {
    throw new Error("dryRun must be true or false.")
  }

  return {
    minConfidence,
    neverAutoHandle: options.neverAutoHandle ?? [],
    maxAutoRetries,
    dryRun: options.dryRun ?? DEFAULTS.dryRun,
    timeoutMs,
  }
}

export function parsePolicyConfig(input: unknown): PolicyOptions {
  const parsed = policyConfigSchema.safeParse(input ?? {})
  if (!parsed.success) {
    throw new Error(`Invalid triage policy. ${formatZodError(parsed.error)}`)
  }
  return parsed.data
}

function compilePattern(pattern: string): RegExp | string {
  if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
    const last = pattern.lastIndexOf("/")
    const body = pattern.slice(1, last)
    const flags = pattern.slice(last + 1)
    try {
      return new RegExp(body, flags)
    } catch (error) {
      throw new Error(
        `Invalid neverAutoHandle pattern "${pattern}". ${errorMessage(error)}`,
      )
    }
  }
  return pattern
}

export function matchesNeverAutoHandle(
  jobName: string,
  patterns: readonly (string | RegExp)[],
): boolean {
  return patterns.some((pattern) => {
    const compiled = typeof pattern === "string" ? compilePattern(pattern) : pattern
    if (compiled instanceof RegExp) return compiled.test(jobName)
    return compiled === jobName
  })
}

function laterDelay(result: Result, failure: Failure): number | undefined {
  if (result.decision !== "retry_later") return result.delayMs
  if (typeof result.delayMs === "number" && result.delayMs >= 0) return result.delayMs
  return Math.min(60_000, 2_000 * Math.max(1, failure.attempt))
}

export function applyPolicy(input: {
  failure: Failure
  result: Result | null
  options?: PolicyOptions
  autoRetries?: number
  classifierError?: unknown
  retrySafe?: boolean
}): PolicyOutcome {
  const policy = resolvePolicy(input.options)
  const autoRetries = input.autoRetries ?? 0
  const result = input.result

  if (input.retrySafe === false) {
    if (matchesNeverAutoHandle(input.failure.jobName, policy.neverAutoHandle)) {
      return {
        action: "fallback",
        applied: false,
        escalated: true,
        dryRun: policy.dryRun,
        reason: `retrySafe returned false, but job "${input.failure.jobName}" is in neverAutoHandle. Left BullMQ behavior unchanged.`,
      }
    }
    return {
      action: "dead_letter",
      applied: !policy.dryRun,
      escalated: true,
      dryRun: policy.dryRun,
      reason: policy.dryRun
        ? "Dry run. retrySafe returned false, so Nightwatch would stop BullMQ retries and escalate."
        : "retrySafe returned false. Stopped BullMQ retries so the side effect is not repeated, and escalated.",
    }
  }

  if (!result) {
    const classifierError = input.classifierError
    const timedOut = classifierError instanceof ClassifierTimeoutError
    return {
      action: "fallback",
      applied: false,
      escalated: false,
      dryRun: policy.dryRun,
      reason: timedOut
        ? classifierError.message
        : `Classifier failed (${errorMessage(classifierError)}). Left the job to BullMQ.`,
    }
  }

  if (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) {
    return {
      action: "fallback",
      applied: false,
      escalated: true,
      dryRun: policy.dryRun,
      reason: `Classifier returned confidence ${String(result.confidence)}, which is outside 0 to 1. Left the job to BullMQ.`,
    }
  }

  if (matchesNeverAutoHandle(input.failure.jobName, policy.neverAutoHandle)) {
    return {
      action: result.decision,
      applied: false,
      escalated: false,
      dryRun: policy.dryRun,
      delayMs: laterDelay(result, input.failure),
      reason: `Job "${input.failure.jobName}" is in neverAutoHandle. Logged the decision and left BullMQ behavior unchanged.`,
    }
  }

  if (result.confidence < policy.minConfidence) {
    return {
      action: "fallback",
      applied: false,
      escalated: true,
      dryRun: policy.dryRun,
      reason: `Confidence ${result.confidence} is below minConfidence ${policy.minConfidence}. Escalated and left the job to BullMQ.`,
    }
  }

  const isRetry = result.decision === "retry_now" || result.decision === "retry_later"
  if (isRetry && autoRetries >= policy.maxAutoRetries) {
    return {
      action: "fallback",
      applied: false,
      escalated: false,
      dryRun: policy.dryRun,
      reason: `Already auto retried ${autoRetries} times (maxAutoRetries is ${policy.maxAutoRetries}). Left the job to BullMQ.`,
    }
  }

  const delayMs = laterDelay(result, input.failure)
  if (policy.dryRun) {
    return {
      action: result.decision,
      applied: false,
      escalated: false,
      dryRun: true,
      delayMs,
      reason: `Dry run. Would apply ${result.decision}.`,
    }
  }

  return {
    action: result.decision,
    applied: true,
    escalated: false,
    dryRun: false,
    delayMs,
    reason: result.reason,
  }
}
