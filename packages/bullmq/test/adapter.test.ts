import type { Job } from "bullmq"
import { describe, expect, it } from "vitest"
import type { Classifier, DecisionRecord } from "@devleo10/nightwatch-core"
import { withTriage } from "../src/index.js"

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

  it("keeps an explicit policy timeout over the suggestion", async () => {
    const record = await decisionFor(slowClassifier(500), 20)
    expect(record.result).toBeNull()
    expect(record.policy.action).toBe("fallback")
  })
})
