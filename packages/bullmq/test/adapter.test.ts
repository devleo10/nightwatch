import { UnrecoverableError, type Job } from "bullmq"
import { describe, expect, it } from "vitest"
import type { Classifier, DecisionRecord, Decision } from "@devleo10/nightwatch-core"
import { isFinalFailure, withTriage } from "../src/index.js"

function fixed(decision: Decision): Classifier {
  return {
    async classify() {
      return { decision, confidence: 0.95, reason: "fixed", latencyMs: 1, provider: "fixed" }
    },
  }
}

const job = {
  name: "send-email",
  queueName: "mail",
  data: {},
  attemptsMade: 0,
  opts: { attempts: 3 },
} as unknown as Job

function slowClassifier(suggestedTimeoutMs?: number): Classifier {
  return {
    suggestedTimeoutMs,
    async classify() {
      await new Promise((resolve) => setTimeout(resolve, 60))
      return { decision: "retry_later", confidence: 0.9, reason: "slow", latencyMs: 60, provider: "slow" }
    },
  }
}

async function decisionFor(classifier: Classifier, timeoutMs?: number): Promise<DecisionRecord> {
  let record: DecisionRecord | undefined
  const processor = withTriage(
    async () => {
      throw new Error("boom")
    },
    { classifier, policy: { timeoutMs }, onDecision: (next) => void (record = next) },
  )
  await expect(processor(job as Job<unknown, never>, "token")).rejects.toThrow("boom")
  return record!
}

describe("withTriage", () => {
  it("rejects a missing classifier before any job runs", () => {
    expect(() =>
      withTriage(async () => undefined, {
        classifier: undefined as never,
      }),
    ).toThrow(/classifier/)
  })

  it("uses the classifier's suggested timeout when the policy sets none", async () => {
    const record = await decisionFor(slowClassifier(500))
    expect(record.result?.provider).toBe("slow")
  })

  it("adds no retry when retrySafe returns false", async () => {
    let record: DecisionRecord | undefined
    const updates: unknown[] = []
    const liveJob = { ...job, updateData: async (data: unknown) => void updates.push(data) } as unknown as Job<unknown, never>
    const processor = withTriage(
      async () => {
        throw new Error("ETIMEDOUT after send")
      },
      {
        classifier: fixed("retry_now"),
        policy: { dryRun: false },
        retrySafe: () => false,
        onDecision: (next) => void (record = next),
      },
    )
    await expect(processor(liveJob, "token")).rejects.toThrow("ETIMEDOUT after send")
    expect(record?.policy).toMatchObject({ applied: false, action: "fallback", escalated: true })
    expect(updates).toHaveLength(0)
  })

  it("calls onDeadLetter, and the thrown error counts as a final failure", async () => {
    let deadLettered = false
    const processor = withTriage(
      async () => {
        throw new Error("Malformed JSON")
      },
      {
        classifier: fixed("dead_letter"),
        policy: { dryRun: false },
        onDeadLetter: () => void (deadLettered = true),
      },
    )
    const error = await processor(job as Job<unknown, never>, "token").catch((caught: unknown) => caught)
    expect(deadLettered).toBe(true)
    expect(error).toBeInstanceOf(UnrecoverableError)
    expect(isFinalFailure(job, error)).toBe(true)
    expect(isFinalFailure(job, new Error("boom"))).toBe(false)
  })

  it("keeps an explicit policy timeout over the suggestion", async () => {
    const record = await decisionFor(slowClassifier(500), 20)
    expect(record.result).toBeNull()
    expect(record.policy.action).toBe("fallback")
  })
})
