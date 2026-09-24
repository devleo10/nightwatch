import { describe, expect, it } from "vitest"
import {
  applyPolicy,
  ClassifierTimeoutError,
  type Failure,
  type Result,
} from "../src/index.js"

const failure: Failure = {
  jobName: "send-email",
  queueName: "mail",
  errorMessage: "HTTP 429",
  attempt: 1,
}

function result(overrides: Partial<Result> = {}): Result {
  return {
    decision: "retry_later",
    confidence: 0.95,
    reason: "Rate limited.",
    latencyMs: 12,
    provider: "rules",
    delayMs: 1000,
    ...overrides,
  }
}

describe("applyPolicy", () => {
  it("escalates when confidence is below minConfidence and does not apply", () => {
    const outcome = applyPolicy({
      failure,
      result: result({ confidence: 0.79 }),
      options: { dryRun: false },
    })
    expect(outcome.applied).toBe(false)
    expect(outcome.escalated).toBe(true)
    expect(outcome.action).toBe("fallback")
    expect(outcome.reason).toMatch(/below minConfidence/)
  })

  it("does not change behavior for a job in neverAutoHandle", () => {
    const outcome = applyPolicy({
      failure: { ...failure, jobName: "process-payment" },
      result: result({ decision: "dead_letter", confidence: 0.99 }),
      options: { dryRun: false, neverAutoHandle: ["process-payment"] },
    })
    expect(outcome.applied).toBe(false)
    expect(outcome.action).toBe("dead_letter")
    expect(outcome.reason).toMatch(/neverAutoHandle/)
  })

  it("matches neverAutoHandle regex patterns", () => {
    const outcome = applyPolicy({
      failure: { ...failure, jobName: "process-payment" },
      result: result(),
      options: { dryRun: false, neverAutoHandle: [/payment$/] },
    })
    expect(outcome.applied).toBe(false)
    expect(outcome.reason).toMatch(/neverAutoHandle/)
  })

  it("adds no retry when the job says retrying is not safe", () => {
    const outcome = applyPolicy({
      failure,
      result: result({ decision: "retry_now" }),
      options: { dryRun: false },
      retrySafe: false,
    })
    expect(outcome.applied).toBe(false)
    expect(outcome.escalated).toBe(true)
    expect(outcome.reason).toMatch(/retrySafe/)
  })

  it("still dead letters when retrying is not safe", () => {
    const outcome = applyPolicy({
      failure,
      result: result({ decision: "dead_letter" }),
      options: { dryRun: false },
      retrySafe: false,
    })
    expect(outcome).toMatchObject({ applied: true, action: "dead_letter" })
  })

  it("stops auto retries after maxAutoRetries", () => {
    const outcome = applyPolicy({
      failure,
      result: result(),
      options: { dryRun: false, maxAutoRetries: 3 },
      autoRetries: 3,
    })
    expect(outcome.applied).toBe(false)
    expect(outcome.action).toBe("fallback")
    expect(outcome.reason).toMatch(/maxAutoRetries/)
  })

  it("still dead letters after the retry cap", () => {
    const outcome = applyPolicy({
      failure,
      result: result({ decision: "dead_letter" }),
      options: { dryRun: false, maxAutoRetries: 3 },
      autoRetries: 9,
    })
    expect(outcome.applied).toBe(true)
    expect(outcome.action).toBe("dead_letter")
  })

  it("falls back when the classifier times out", () => {
    const error = new ClassifierTimeoutError(1500)
    const outcome = applyPolicy({
      failure,
      result: null,
      classifierError: error,
      options: { dryRun: false },
    })
    expect(outcome.applied).toBe(false)
    expect(outcome.action).toBe("fallback")
    expect(outcome.escalated).toBe(false)
    expect(outcome.reason).toMatch(/timed out after 1500ms/)
  })

  it("falls back when the classifier throws", () => {
    const outcome = applyPolicy({
      failure,
      result: null,
      classifierError: new Error("socket hang up"),
      options: { dryRun: false },
    })
    expect(outcome.action).toBe("fallback")
    expect(outcome.applied).toBe(false)
    expect(outcome.reason).toMatch(/socket hang up/)
  })

  it("defaults to dry run and does not apply a confident decision", () => {
    const outcome = applyPolicy({ failure, result: result() })
    expect(outcome.dryRun).toBe(true)
    expect(outcome.applied).toBe(false)
    expect(outcome.action).toBe("retry_later")
    expect(outcome.reason).toMatch(/Dry run/)
    expect(outcome.delayMs).toBe(1000)
  })

  it("applies the decision when dry run is off and confidence is high enough", () => {
    const outcome = applyPolicy({
      failure,
      result: result(),
      options: { dryRun: false },
    })
    expect(outcome.applied).toBe(true)
    expect(outcome.dryRun).toBe(false)
    expect(outcome.action).toBe("retry_later")
    expect(outcome.reason).toBe("Rate limited.")
  })

  it("rejects an impossible minConfidence", () => {
    expect(() => applyPolicy({ failure, result: result(), options: { minConfidence: 2 } })).toThrow(
      /minConfidence/,
    )
  })
})
