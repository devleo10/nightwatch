export {
  CascadeProvider,
  ChainProvider,
  HttpProvider,
  JevProvider,
  JsonlDecisionStore,
  MemoryDecisionStore,
  RulesProvider,
  fromJevResponse,
  readRecentDecisions,
  toJevRequest,
} from "@devleo10/nightwatch-core"
export type {
  Classifier,
  Decision,
  DecisionRecord,
  DecisionStore,
  Failure,
  PolicyOptions,
  Result,
  Rule,
} from "@devleo10/nightwatch-core"

import { DelayedError, UnrecoverableError, type Job, type Processor, type Worker } from "bullmq"
import { randomUUID } from "node:crypto"
import {
  applyPolicy,
  redactFailure,
  resolvePolicy,
  withTimeout,
  type Classifier,
  type DecisionRecord,
  type DecisionStore,
  type Failure,
  type PolicyOptions,
  type Result,
} from "@devleo10/nightwatch-core"

export const NIGHTWATCH_STATE_KEY = "__nightwatch"

export type TriageState = {
  autoRetries: number
}

export type EscalateContext<DataType = unknown> = {
  failure: Failure
  result: Result
  job: Job<DataType>
  policy: DecisionRecord["policy"]
}

export type TriageOptions<DataType = unknown, ResultType = unknown, NameType extends string = string> = {
  classifier: Classifier
  policy?: PolicyOptions
  store?: DecisionStore
  redact?: { keys: string[] }
  onDecision?: (record: DecisionRecord) => void | Promise<void>
  onEscalate?: (context: EscalateContext<DataType>) => void | Promise<void>
  payloadSummary?: (job: Job<DataType, ResultType, NameType>) => string | undefined
}

type WorkerInternal<DataType, ResultType, NameType extends string> = Worker<
  DataType,
  ResultType,
  NameType
> & {
  processFn: Processor<DataType, ResultType, NameType>
}

function asError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error(typeof error === "string" ? error : "Job failed")
}

function readState(data: unknown): TriageState {
  if (!data || typeof data !== "object") return { autoRetries: 0 }
  const state = (data as Record<string, unknown>)[NIGHTWATCH_STATE_KEY]
  if (!state || typeof state !== "object") return { autoRetries: 0 }
  const count = (state as Record<string, unknown>).autoRetries
  return { autoRetries: typeof count === "number" && Number.isFinite(count) ? count : 0 }
}

function errorCode(error: Error): string | undefined {
  if (!("code" in error)) return undefined
  const code = (error as { code?: unknown }).code
  if (typeof code === "string" && code.length > 0) return code
  if (typeof code === "number") return String(code)
  return undefined
}

function defaultSummary(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined
  const record = data as Record<string, unknown>
  if (typeof record.payloadSummary === "string") return record.payloadSummary
  const copy = { ...record }
  delete copy[NIGHTWATCH_STATE_KEY]
  const keys = Object.keys(copy)
  if (keys.length === 0) return undefined
  const text = JSON.stringify(copy)
  return text.length > 180 ? `${text.slice(0, 177)}...` : text
}

function metadataFrom(data: unknown): Record<string, unknown> | undefined {
  if (!data || typeof data !== "object") return undefined
  const copy = { ...(data as Record<string, unknown>) }
  delete copy[NIGHTWATCH_STATE_KEY]
  delete copy.payloadSummary
  return Object.keys(copy).length > 0 ? copy : undefined
}

export function failureFromJob(job: Job, error: Error, summary?: string): Failure {
  return {
    jobName: job.name,
    queueName: job.queueName,
    errorMessage: error.message || "Job failed",
    errorName: error.name,
    errorCode: errorCode(error),
    attempt: job.attemptsMade + 1,
    maxAttempts: job.opts.attempts,
    payloadSummary: summary ?? defaultSummary(job.data),
    metadata: metadataFrom(job.data),
  }
}

let dryRunNoticeShown = false

function effectivePolicy(policy: PolicyOptions | undefined, classifier: Classifier): PolicyOptions {
  if (policy?.timeoutMs !== undefined || !classifier.suggestedTimeoutMs) return policy ?? {}
  return { ...policy, timeoutMs: classifier.suggestedTimeoutMs }
}

async function runHook(label: string, hook?: () => void | Promise<void>): Promise<void> {
  if (!hook) return
  try {
    await hook()
  } catch (error) {
    console.error(`nightwatch ${label} hook failed.`, error)
  }
}

export function withTriage<DataType = unknown, ResultType = unknown, NameType extends string = string>(
  processor: Processor<DataType, ResultType, NameType>,
  options: TriageOptions<DataType, ResultType, NameType>,
): Processor<DataType, ResultType, NameType> {
  if (typeof processor !== "function") {
    throw new Error("withTriage expects a processor function. Received something else.")
  }
  if (!options?.classifier || typeof options.classifier.classify !== "function") {
    throw new Error("withTriage requires a classifier with a classify function.")
  }
  if (resolvePolicy(options.policy).dryRun && !dryRunNoticeShown) {
    dryRunNoticeShown = true
    console.info(
      "nightwatch: dry run is on. Decisions are logged and BullMQ handles every failure until policy.dryRun is false.",
    )
  }

  return async (job, token, signal) => {
    try {
      return await processor(job, token, signal)
    } catch (caught) {
      const original = asError(caught)
      const policyOptions = effectivePolicy(options.policy, options.classifier)
      const policy = resolvePolicy(policyOptions)
      const keys = options.redact?.keys ?? []
      const summary = options.payloadSummary ? options.payloadSummary(job) : undefined
      const failure = redactFailure(failureFromJob(job, original, summary), keys)
      const autoRetries = readState(job.data).autoRetries

      let result: Result | null = null
      let classifierError: unknown
      try {
        result = await withTimeout(options.classifier.classify(failure), policy.timeoutMs)
      } catch (error) {
        classifierError = error
      }

      let plan = applyPolicy({
        failure,
        result,
        options: policyOptions,
        autoRetries,
        classifierError,
      })

      if (plan.applied && plan.action === "retry_later" && !token) {
        plan = {
          ...plan,
          applied: false,
          action: "fallback",
          reason: "retry_later was not applied because the worker lock token was missing. Left the job to BullMQ.",
        }
      }

      const record: DecisionRecord = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        input: failure,
        result,
        policy: plan,
        applied: plan.applied,
      }

      if (options.store) await options.store.append(record)
      await runHook("onDecision", () => options.onDecision?.(record))

      if (!plan.applied || plan.action === "fallback") throw original

      if (plan.action === "retry_later") {
        const delayMs = plan.delayMs ?? 0
        try {
          await job.updateData({
            ...(job.data as Record<string, unknown>),
            [NIGHTWATCH_STATE_KEY]: { autoRetries: autoRetries + 1 },
          } as DataType)
          await job.moveToDelayed(Date.now() + delayMs, token)
        } catch (moveError) {
          console.error("nightwatch could not delay the job. Leaving it to BullMQ.", moveError)
          throw original
        }
        throw new DelayedError("nightwatch moved this job to delayed")
      }

      if (plan.action === "dead_letter") {
        throw new UnrecoverableError(plan.reason || "nightwatch dead lettered this job")
      }

      if (plan.action === "page_human") {
        if (result) {
          await runHook("onEscalate", () =>
            options.onEscalate?.({ failure, result, job, policy: plan }),
          )
        }
        throw original
      }

      await job.updateData({
        ...(job.data as Record<string, unknown>),
        [NIGHTWATCH_STATE_KEY]: { autoRetries: autoRetries + 1 },
      } as DataType)
      throw original
    }
  }
}

export function attachTriage<DataType = unknown, ResultType = unknown, NameType extends string = string>(
  worker: Worker<DataType, ResultType, NameType>,
  options: TriageOptions<DataType, ResultType, NameType>,
): Worker<DataType, ResultType, NameType> {
  const internal = worker as WorkerInternal<DataType, ResultType, NameType>
  if (typeof internal.processFn !== "function") {
    throw new Error(
      "attachTriage could not read the worker processor. Pass the processor to withTriage instead.",
    )
  }
  internal.processFn = withTriage(internal.processFn.bind(worker), options)
  return worker
}
