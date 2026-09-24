import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  JsonlDecisionStore,
  MemoryDecisionStore,
  readRecentDecisions,
  REDACT_PATTERNS,
  redactFailure,
  type DecisionRecord,
  type Failure,
} from "../src/index.js"

const failure: Failure = {
  jobName: "sync-kyc-status",
  queueName: "kyc",
  errorMessage: "Null field",
  attempt: 1,
  payloadSummary: 'pan_number: ABCDE1234F token=secret',
  metadata: { pan_number: "ABCDE1234F", nested: { token: "secret" }, ok: true },
}

function record(id: string): DecisionRecord {
  return {
    id,
    timestamp: new Date().toISOString(),
    input: failure,
    result: null,
    policy: {
      action: "fallback",
      applied: false,
      escalated: false,
      dryRun: true,
      reason: "Dry run.",
    },
    applied: false,
  }
}

describe("redact", () => {
  it("strips configured keys from metadata and the payload summary", () => {
    const redacted = redactFailure(failure, ["pan_number", "token"])
    expect(redacted.metadata).toEqual({
      pan_number: "[redacted]",
      nested: { token: "[redacted]" },
      ok: true,
    })
    expect(redacted.payloadSummary).toContain("pan_number: [redacted]")
    expect(redacted.payloadSummary).toContain("token=[redacted]")
    expect(redacted.errorMessage).toBe(failure.errorMessage)
  })

  it("applies keys and patterns to the error message", () => {
    const redacted = redactFailure(
      {
        ...failure,
        errorMessage: "Telegram 400 for chat 1234567890 (a.user@example.com, +91 98765 43210) token=abc",
      },
      ["token"],
      [REDACT_PATTERNS.email, REDACT_PATTERNS.phone, REDACT_PATTERNS.longNumber],
    )
    expect(redacted.errorMessage).toBe("Telegram 400 for chat [redacted] ([redacted], [redacted]) token=[redacted]")
  })
})

describe("decision stores", () => {
  it("returns the newest memory records first", async () => {
    const store = new MemoryDecisionStore(2)
    await store.append(record("1"))
    await store.append(record("2"))
    await store.append(record("3"))
    const recent = await readRecentDecisions(store, 10)
    expect(recent.map((item) => item.id)).toEqual(["3", "2"])
  })

  it("appends json lines and reads the tail", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nightwatch-"))
    try {
      const store = new JsonlDecisionStore(join(dir, "decisions.jsonl"))
      await store.append(record("a"))
      await store.append(record("b"))
      const recent = await store.recent(1)
      expect(recent).toHaveLength(1)
      expect(recent[0]?.id).toBe("b")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
