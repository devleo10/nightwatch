import { Queue, Worker } from "bullmq"
import cors from "cors"
import express from "express"
import net from "node:net"
import { RulesProvider, type PolicyOptions } from "@devleo10/nightwatch-core"
import { withTriage, type TriageOptions } from "@devleo10/nightwatch/bullmq"
import type { DecisionRecord } from "@devleo10/nightwatch-core"
import { createDemoJob, type DemoJob } from "./jobs.js"
import type { FailureEvent, Speed, Stats } from "../src/types.js"

const connection = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
}

const QUEUE_NAME = "nightwatch"
const policy: PolicyOptions = {
  dryRun: true,
  minConfidence: 0.8,
  maxAutoRetries: 3,
  timeoutMs: 1500,
}

const counters = {
  totalFailures: 0,
  autoResolved: 0,
  escalated: 0,
  deadLettered: 0,
  latencySum: 0,
}

let producerRunning = true
let speed: Speed = "normal"
let timer: NodeJS.Timeout | null = null

const listeners = new Set<(event: FailureEvent) => void>()

const queue = new Queue<DemoJob>(QUEUE_NAME, {
  connection,
  defaultJobOptions: { attempts: 1, removeOnComplete: 200, removeOnFail: 200 },
})

function publish(record: DecisionRecord) {
  counters.totalFailures += 1
  counters.latencySum += record.result?.latencyMs ?? 0
  if (record.policy.escalated || (record.applied && record.policy.action === "page_human")) {
    counters.escalated += 1
  }
  if (record.applied && record.policy.action === "dead_letter") counters.deadLettered += 1
  if (
    record.applied &&
    (record.policy.action === "retry_now" ||
      record.policy.action === "retry_later" ||
      record.policy.action === "dead_letter")
  ) {
    counters.autoResolved += 1
  }

  const event: FailureEvent = {
    id: record.id,
    timestamp: record.timestamp,
    jobName: record.input.jobName,
    errorMessage: record.input.errorMessage,
    errorCode: record.input.errorCode ?? "UNKNOWN",
    attemptNumber: record.input.attempt,
    payloadSummary: record.input.payloadSummary ?? "",
    decision: record.result?.decision ?? "fallback",
    confidence: record.result?.confidence ?? 0,
    latencyMs: record.result?.latencyMs ?? 0,
    provider: record.result?.provider ?? "rules",
    applied: record.applied,
    dryRun: record.policy.dryRun,
    escalated: record.policy.escalated,
    reason: record.policy.reason,
  }
  for (const listener of listeners) listener(event)
}

const triageOptions: TriageOptions<DemoJob> = {
  classifier: new RulesProvider(),
  policy,
  onDecision: publish,
}

const worker = new Worker<DemoJob>(
  QUEUE_NAME,
  withTriage(async (job) => {
    if (!job.data.shouldFail) return
    const error = new Error(job.data.errorMessage ?? "Job failed")
    ;(error as Error & { code?: string }).code = job.data.errorCode
    throw error
  }, triageOptions),
  { connection, concurrency: 8 },
)

function jobPair(): [string, DemoJob] {
  const job = createDemoJob()
  return [job.jobName, job]
}

function delayFor(next: Speed): number {
  if (next === "fast") return 80 + Math.floor(Math.random() * 81)
  return 300 + Math.floor(Math.random() * 501)
}

function schedule() {
  if (timer) clearTimeout(timer)
  if (!producerRunning) return
  timer = setTimeout(() => {
    void queue
      .add(...jobPair())
      .catch((error: unknown) => {
        console.error("Failed to enqueue demo job", error)
      })
      .finally(schedule)
  }, delayFor(speed))
}

function snapshot(): Stats {
  return {
    totalFailures: counters.totalFailures,
    autoResolved: counters.autoResolved,
    escalated: counters.escalated,
    deadLettered: counters.deadLettered,
    averageLatencyMs: counters.totalFailures === 0 ? 0 : Math.round(counters.latencySum / counters.totalFailures),
    provider: "rules",
    producerRunning,
    speed,
    dryRun: policy.dryRun !== false,
  }
}

const app = express()
app.use(cors({ origin: /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ }))
app.use(express.json())

app.get("/health", (_req, res) => {
  res.json({ ok: true })
})

app.get("/stats", (_req, res) => {
  res.json(snapshot())
})

app.post("/producer", (req, res) => {
  producerRunning = req.body?.running === true
  if (producerRunning) schedule()
  else if (timer) {
    clearTimeout(timer)
    timer = null
  }
  res.json(snapshot())
})

app.post("/producer/speed", (req, res) => {
  speed = req.body?.speed === "fast" ? "fast" : "normal"
  if (producerRunning) {
    if (timer) clearTimeout(timer)
    timer = null
    schedule()
  }
  res.json(snapshot())
})

app.post("/mode", (req, res) => {
  policy.dryRun = req.body?.dryRun !== false
  res.json(snapshot())
})

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache, no-transform")
  res.setHeader("Connection", "keep-alive")
  res.flushHeaders()
  res.write(": connected\n\n")
  const listener = (event: FailureEvent) => {
    if (!res.writableEnded) res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`)
  }
  listeners.add(listener)
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": ping\n\n")
  }, 15000)
  req.on("close", () => {
    clearInterval(heartbeat)
    listeners.delete(listener)
  })
})

const port = Number(process.env.PORT ?? 4000)

async function assertRedis(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = net.connect({ host: connection.host, port: connection.port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error("Redis did not accept a connection within 2s."))
    }, 2000)
    socket.once("connect", () => {
      clearTimeout(timer)
      socket.end()
      resolve()
    })
    socket.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function main() {
  await assertRedis()
  await queue.waitUntilReady()
  await worker.waitUntilReady()
  schedule()
  app.listen(port, () => {
    console.log(`Nightwatch demo API on http://localhost:${port}`)
  })
}

void main().catch((error: unknown) => {
  console.error("Demo server failed to start. Is Redis running? docker compose up -d")
  console.error(error)
  process.exit(1)
})
