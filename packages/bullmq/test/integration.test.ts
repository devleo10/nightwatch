import net from "node:net"
import { Queue, QueueEvents, Worker, type ConnectionOptions, type Job } from "bullmq"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { MemoryDecisionStore, type Classifier, type Result } from "@devleo10/nightwatch-core"
import { withTriage } from "../src/index.js"

const redisHost = process.env.REDIS_HOST ?? "127.0.0.1"
const redisPort = Number(process.env.REDIS_PORT ?? 6379)

const connection: ConnectionOptions = {
  host: redisHost,
  port: redisPort,
  maxRetriesPerRequest: null,
}

const closers: Array<() => Promise<void>> = []

function redisIsUp(): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: redisHost, port: redisPort })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error("Redis is not accepting connections on 127.0.0.1:6379. Run: docker compose up -d"))
    }, 1000)
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

function classifier(result: Result): Classifier {
  return {
    async classify() {
      return result
    },
  }
}

function baseResult(overrides: Partial<Result>): Result {
  return {
    decision: "retry_now",
    confidence: 0.95,
    reason: "test decision",
    latencyMs: 5,
    provider: "test",
    ...overrides,
  }
}

async function waitForFailed(events: QueueEvents, jobId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${jobId} to fail`)), 8000)
    const onFailed = ({ jobId: id }: { jobId: string }) => {
      if (id !== jobId) return
      clearTimeout(timer)
      events.off("failed", onFailed)
      resolve()
    }
    events.on("failed", onFailed)
  })
}

async function waitForState(job: Job, state: string): Promise<void> {
  const started = Date.now()
  let current = ""
  while (Date.now() - started < 5000) {
    current = await job.getState()
    if (current === state) return
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  throw new Error(`Job stayed in ${current}. Expected ${state}.`)
}

describe("withTriage against Redis", () => {
  beforeAll(async () => {
    await redisIsUp()
  })

  afterEach(async () => {
    while (closers.length > 0) {
      const close = closers.pop()
      if (close) await close()
    }
  })

  async function setup(
    label: string,
    processor: (job: Job) => Promise<void>,
    result: Result,
    policy: { dryRun?: boolean; timeoutMs?: number; maxAutoRetries?: number; minConfidence?: number },
    attempts: number,
  ) {
    const queueName = `triage-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const store = new MemoryDecisionStore()
    let calls = 0
    let escalations = 0
    const queue = new Queue(queueName, { connection })
    const events = new QueueEvents(queueName, { connection })
    const worker = new Worker(
      queueName,
      withTriage(
        async (job) => {
          calls += 1
          await processor(job)
        },
        {
          classifier: classifier(result),
          policy: { dryRun: false, maxAutoRetries: 10, ...policy },
          store,
          onEscalate: () => {
            escalations += 1
          },
        },
      ),
      { connection, concurrency: 1 },
    )
    closers.push(async () => {
      await worker.close()
      await events.close()
      await queue.obliterate({ force: true })
      await queue.close()
    })
    await Promise.all([queue.waitUntilReady(), events.waitUntilReady(), worker.waitUntilReady()])
    const job = await queue.add(
      "send-email",
      { payloadSummary: "to: ops@example.com" },
      { attempts, backoff: { type: "fixed", delay: 30 } },
    )
    return { job, events, store, getCalls: () => calls, getEscalations: () => escalations }
  }

  it("delays the job for retry_later without failing it", async () => {
    const { job, store } = await setup(
      "later",
      async () => {
        throw new Error("HTTP 429 rate limit")
      },
      baseResult({ decision: "retry_later", delayMs: 60_000 }),
      {},
      3,
    )
    await waitForState(job, "delayed")
    const [record] = await store.recent(1)
    expect(record?.applied).toBe(true)
    expect(record?.policy.action).toBe("retry_later")
  })

  it("stops retries for dead_letter", async () => {
    const { job, events, store, getCalls } = await setup(
      "dead",
      async () => {
        throw new Error("Malformed JSON in a webhook payload")
      },
      baseResult({ decision: "dead_letter" }),
      {},
      5,
    )
    await waitForFailed(events, job.id!)
    const fresh = await job.getState()
    expect(fresh).toBe("failed")
    expect(getCalls()).toBe(1)
    const [record] = await store.recent(1)
    expect(record?.applied).toBe(true)
    expect(record?.policy.action).toBe("dead_letter")
  })

  it("rethrows retry_now so BullMQ attempts keep going", async () => {
    const { job, events, store, getCalls } = await setup(
      "now",
      async () => {
        throw Object.assign(new Error("ETIMEDOUT calling a payment gateway"), { code: "ETIMEDOUT" })
      },
      baseResult({ decision: "retry_now" }),
      {},
      3,
    )
    await waitForFailed(events, job.id!)
    expect(getCalls()).toBe(3)
    const records = await store.recent(10)
    expect(records).toHaveLength(3)
    expect(records.every((record) => record.applied && record.policy.action === "retry_now")).toBe(true)
  })

  it("calls onEscalate for page_human and still fails the job", async () => {
    const { job, events, getEscalations, getCalls } = await setup(
      "page",
      async () => {
        throw new Error("Invalid HMAC signature")
      },
      baseResult({ decision: "page_human" }),
      {},
      1,
    )
    await waitForFailed(events, job.id!)
    expect(getCalls()).toBe(1)
    expect(getEscalations()).toBe(1)
  })

  it("falls back to normal retries when the classifier times out", async () => {
    const hanging: Classifier = { classify: () => new Promise(() => undefined) }
    const queueName = `triage-timeout-${Date.now()}`
    const store = new MemoryDecisionStore()
    let calls = 0
    const queue = new Queue(queueName, { connection })
    const events = new QueueEvents(queueName, { connection })
    const worker = new Worker(
      queueName,
      withTriage(
        async () => {
          calls += 1
          throw new Error("upstream down")
        },
        {
          classifier: hanging,
          policy: { dryRun: false, timeoutMs: 150, maxAutoRetries: 10 },
          store,
        },
      ),
      { connection },
    )
    closers.push(async () => {
      await worker.close()
      await events.close()
      await queue.obliterate({ force: true })
      await queue.close()
    })
    await Promise.all([queue.waitUntilReady(), events.waitUntilReady(), worker.waitUntilReady()])
    const job = await queue.add("send-email", {}, { attempts: 2, backoff: { type: "fixed", delay: 20 } })
    await waitForFailed(events, job.id!)
    expect(calls).toBe(2)
    const records = await store.recent(10)
    expect(records).toHaveLength(2)
    expect(records.every((record) => record.applied === false && record.policy.action === "fallback")).toBe(true)
  })

  it("does not dead letter in dry run, so BullMQ retries", async () => {
    const { events, job, store, getCalls } = await setup(
      "dry",
      async () => {
        throw new Error("Schema validation failure")
      },
      baseResult({ decision: "dead_letter" }),
      { dryRun: true },
      2,
    )
    await waitForFailed(events, job.id!)
    expect(getCalls()).toBe(2)
    const records = await store.recent(10)
    expect(records.every((record) => record.applied === false && record.policy.action === "dead_letter")).toBe(true)
  })
})
