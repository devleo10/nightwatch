import { UnrecoverableError, type Job } from "bullmq"
import { describe, expect, it } from "vitest"
import type { Classifier, DecisionRecord, Decision } from "@devleo10/nightwatch-classifier"
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

  it("stops the job without asking the classifier when retrySafe returns false", async () => {
    let record: DecisionRecord | undefined
    let classified = false
    let escalated = false
    const processor = withTriage(
      async () => {
        throw new Error("ETIMEDOUT after send")
      },
      {
        classifier: {
          async classify() {
            classified = true
            return { decision: "retry_now", confidence: 1, reason: "x", latencyMs: 0, provider: "x" }
          },
        },
        policy: { dryRun: false },
        retrySafe: () => false,
        onDecision: (next) => void (record = next),
        onEscalate: () => void (escalated = true),
      },
    )
    const error = await processor(job as Job<unknown, never>, "token").catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(UnrecoverableError)
    expect(isFinalFailure(job, error)).toBe(true)
    expect(classified).toBe(false)
    expect(escalated).toBe(true)
    expect(record?.policy).toMatchObject({ applied: true, action: "dead_letter", escalated: true })
  })

  it("hides emails and phone numbers in the error text by default", async () => {
    let record: DecisionRecord | undefined
    const processor = withTriage(
      async () => {
        throw new Error("WATI rejected +91 98765 43210 for a.user@example.com")
      },
      { classifier: fixed("page_human"), onDecision: (next) => void (record = next) },
    )
    await expect(processor(job as Job<unknown, never>, "token")).rejects.toThrow()
    expect(record?.input.errorMessage).toBe("WATI rejected [redacted] for [redacted]")
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
