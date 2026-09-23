import { describe, expect, it } from "vitest"
import { RulesProvider, type Failure } from "../src/index.js"

const base: Failure = {
  jobName: "send-email",
  queueName: "mail",
  errorMessage: "something broke",
  attempt: 1,
}

describe("RulesProvider", () => {
  const provider = new RulesProvider()

  it.each([
    ["HTTP 429 rate limit from a broker API", "HTTP_429", "retry_later"],
    ["ETIMEDOUT calling a payment gateway", "ETIMEDOUT", "retry_later"],
    ["Redis connection reset", "ECONNRESET", "retry_now"],
    ["HTTP 500 from an upstream service", "HTTP_500", "retry_later"],
    ["Malformed JSON in a webhook payload", "MALFORMED_JSON", "dead_letter"],
    ["Schema validation failure", "SCHEMA_INVALID", "dead_letter"],
    ["Expired auth token", "AUTH_EXPIRED", "retry_now"],
    ["Duplicate transaction id", "DUPLICATE_TXN", "page_human"],
    ["Invalid HMAC signature", "INVALID_HMAC", "page_human"],
  ] as const)("maps %s to %s", async (message, code, decision) => {
    const result = await provider.classify({
      ...base,
      errorMessage: message,
      errorCode: code,
    })
    expect(result.decision).toBe(decision)
    expect(result.provider).toBe("rules")
    expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    expect(result.reason.length).toBeGreaterThan(0)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it("returns a low confidence page when nothing matches", async () => {
    const result = await provider.classify(base)
    expect(result.decision).toBe("page_human")
    expect(result.confidence).toBe(0.5)
    expect(result.reason).toMatch(/No rule matched/)
  })

  it("lets a custom rule win over a built in rule", async () => {
    const custom = new RulesProvider({
      rules: [
        {
          match: /429/,
          decision: "page_human",
          confidence: 0.99,
          reason: "This broker needs a person.",
        },
      ],
    })
    const result = await custom.classify({
      ...base,
      errorMessage: "HTTP 429 rate limit",
      errorCode: "HTTP_429",
    })
    expect(result.decision).toBe("page_human")
    expect(result.confidence).toBe(0.99)
    expect(result.reason).toBe("This broker needs a person.")
  })

  it("accepts a function match", async () => {
    const custom = new RulesProvider({
      rules: [
        {
          match: (input) => input.jobName === "process-payment",
          decision: "dead_letter",
          delayMs: 0,
        },
      ],
    })
    const result = await custom.classify({ ...base, jobName: "process-payment" })
    expect(result.decision).toBe("dead_letter")
    expect(result.confidence).toBe(0.9)
  })

  it("rejects a confidence outside 0 to 1", () => {
    expect(() => new RulesProvider({ rules: [{ match: /x/, decision: "retry_now", confidence: 2 }] })).toThrow(
      /confidence must be between 0 and 1/,
    )
  })
})
