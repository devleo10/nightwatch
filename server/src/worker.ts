import { randomUUID } from "node:crypto"
import { Worker, type Job } from "bullmq"
import { AUTO_ACT_THRESHOLD, type FailureEvent, type JobPayload } from "@queue-triage/shared"
import { publish } from "./broadcast.js"
import { classify } from "./classifier.js"
import { queue } from "./queue.js"
import { ATTENTION_KEY, DEAD_LETTER_KEY, QUEUE_NAME, redis, redisConnection } from "./redis.js"
import { getSpeed, recordFailure } from "./stats.js"

async function handleFailure(job: Job<JobPayload>, error: Error) {
  const data = job.data
  const errorMessage = data.errorMessage ?? error.message
  const errorCode = data.errorCode ?? "UNKNOWN"

  const result = await classify({
    jobName: data.jobName,
    errorMessage,
    errorCode,
    attempt: data.attemptNumber,
  })

  const auto = result.confidence >= AUTO_ACT_THRESHOLD
  const record = {
    id: randomUUID(),
    jobName: data.jobName,
    errorMessage,
    errorCode,
    attemptNumber: data.attemptNumber,
    payloadSummary: data.payloadSummary,
    decision: result.decision,
    confidence: result.confidence,
    at: new Date().toISOString(),
  }

  if (auto && (result.decision === "retry_now" || result.decision === "retry_later")) {
    const delay = result.decision === "retry_later" ? (getSpeed() === "fast" ? 1500 : 8000) : 0
    await queue.add(
      data.jobName,
      {
        ...data,
        shouldFail: false,
        attemptNumber: data.attemptNumber + 1,
      },
      delay > 0 ? { delay } : undefined,
    )
    recordFailure(result.latencyMs, "auto")
  } else if (auto && result.decision === "dead_letter") {
    await redis.lpush(DEAD_LETTER_KEY, JSON.stringify(record))
    await redis.ltrim(DEAD_LETTER_KEY, 0, 199)
    recordFailure(result.latencyMs, "dead_letter")
  } else if (auto && result.decision === "page_human") {
    await redis.lpush(ATTENTION_KEY, JSON.stringify(record))
    await redis.ltrim(ATTENTION_KEY, 0, 199)
    recordFailure(result.latencyMs, "auto")
  } else {
    recordFailure(result.latencyMs, "escalated")
  }

  const event: FailureEvent = {
    id: record.id,
    timestamp: record.at,
    jobName: data.jobName,
    errorMessage,
    errorCode,
    attemptNumber: data.attemptNumber,
    payloadSummary: data.payloadSummary,
    decision: result.decision,
    confidence: result.confidence,
    latencyMs: result.latencyMs,
    provider: result.provider,
    autoResolved: auto,
  }

  publish(event)
}

export function startWorker() {
  const worker = new Worker<JobPayload>(
    QUEUE_NAME,
    async (job) => {
      if (!job.data.shouldFail) return
      const failure = new Error(job.data.errorMessage ?? "Job failed")
      ;(failure as Error & { code?: string }).code = job.data.errorCode
      throw failure
    },
    { connection: redisConnection, concurrency: 12 },
  )

  worker.on("failed", (job, error) => {
    if (!job) return
    void handleFailure(job, error).catch((handleError: unknown) => {
      console.error("Failed to classify job", handleError)
    })
  })

  worker.on("error", (workerError) => {
    console.error("Worker error", workerError)
  })

  return worker
}
