import { describe, expect, it } from "vitest"
import {
  ChainProvider,
  ClassifierTimeoutError,
  JevProvider,
  type Classifier,
  type Failure,
  type Result,
} from "../src/index.js"

const failure: Failure = {
  jobName: "send-email",
  queueName: "mail",
  errorMessage: "nope",
  attempt: 1,
}

const ok: Result = {
  decision: "retry_now",
  confidence: 0.9,
  reason: "ok",
  latencyMs: 1,
  provider: "second",
}

class OkProvider implements Classifier {
  async classify(): Promise<Result> {
    return ok
  }
}

class BoomProvider implements Classifier {
  async classify(): Promise<Result> {
    throw new Error("provider down")
  }
}

class SlowProvider implements Classifier {
  async classify(): Promise<Result> {
    await new Promise((resolve) => setTimeout(resolve, 200))
    return { ...ok, provider: "slow" }
  }
}

describe("ChainProvider", () => {
  it("returns the first successful result", async () => {
    const chain = new ChainProvider([new OkProvider(), new BoomProvider()])
    await expect(chain.classify(failure)).resolves.toMatchObject({ provider: "second" })
  })

  it("falls through when a provider throws", async () => {
    const chain = new ChainProvider([new BoomProvider(), new OkProvider()])
    await expect(chain.classify(failure)).resolves.toMatchObject({ decision: "retry_now" })
  })

  it("falls through when a provider times out", async () => {
    const chain = new ChainProvider([new SlowProvider(), new OkProvider()], { timeoutMs: 30 })
    const result = await chain.classify(failure)
    expect(result.provider).toBe("second")
  })

  it("throws when every provider fails", async () => {
    const chain = new ChainProvider([new BoomProvider(), new SlowProvider()], { timeoutMs: 20 })
    await expect(chain.classify(failure)).rejects.toThrow(/All providers failed/)
  })

  it("reports a timeout error message from withTimeout", async () => {
    const chain = new ChainProvider([new SlowProvider()], { timeoutMs: 20 })
    await expect(chain.classify(failure)).rejects.toThrow(ClassifierTimeoutError)
  })
})

describe("JevProvider", () => {
  it("does not call the network until request mapping is filled in", async () => {
    let called = false
    const provider = new JevProvider({
      url: "https://example.invalid/jev",
      fetchImpl: async () => {
        called = true
        return new Response("{}", { status: 200 })
      },
    })
    await expect(provider.classify(failure)).rejects.toThrow(/Jev request mapping is not implemented/)
    expect(called).toBe(false)
  })
})
