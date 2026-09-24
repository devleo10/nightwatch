import { describe, expect, it } from "vitest"
import {
  CascadeProvider,
  ChainProvider,
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

  it("includes the timeout in the failure when every provider is too slow", async () => {
    const chain = new ChainProvider([new SlowProvider()], { timeoutMs: 20 })
    await expect(chain.classify(failure)).rejects.toThrow(/timed out after 20ms/)
  })
})

class FixedProvider implements Classifier {
  constructor(private readonly result: Result) {}
  async classify(): Promise<Result> {
    return this.result
  }
}

describe("CascadeProvider", () => {
  const unsure: Result = { decision: "page_human", confidence: 0.5, reason: "no rule", latencyMs: 1, provider: "rules" }
  const sure: Result = { decision: "dead_letter", confidence: 0.95, reason: "jev", latencyMs: 400, provider: "jev" }

  it("stops at the first confident result", async () => {
    const cascade = new CascadeProvider([new FixedProvider(sure), new BoomProvider()])
    await expect(cascade.classify(failure)).resolves.toMatchObject({ provider: "jev" })
  })

  it("asks the next provider when the first is unsure, and adds up latency", async () => {
    const cascade = new CascadeProvider([new FixedProvider(unsure), new FixedProvider(sure)])
    await expect(cascade.classify(failure)).resolves.toMatchObject({ provider: "jev", latencyMs: 401 })
  })

  it("returns the last answer when nobody clears the bar", async () => {
    const guess: Result = { ...sure, confidence: 0.4 }
    const cascade = new CascadeProvider([new FixedProvider(unsure), new FixedProvider(guess)])
    await expect(cascade.classify(failure)).resolves.toMatchObject({ provider: "jev", confidence: 0.4 })
  })

  it("keeps an earlier answer when a later provider fails", async () => {
    const cascade = new CascadeProvider([new FixedProvider(unsure), new BoomProvider()])
    await expect(cascade.classify(failure)).resolves.toMatchObject({ provider: "rules", confidence: 0.5 })
  })

  it("throws when every provider fails", async () => {
    const cascade = new CascadeProvider([new BoomProvider()])
    await expect(cascade.classify(failure)).rejects.toThrow(/All providers failed/)
  })
})

describe("JevProvider", () => {
  it("sends a System One Choice and maps the winning label", async () => {
    let body: unknown
    const provider = new JevProvider({
      url: "https://example.invalid/v1/systemone",
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body))
        return new Response(
          JSON.stringify({
            model: "jev-latest",
            answers: {
              action: {
                type: "choice",
                choice: "dead_letter",
                confidence: 0.96,
                probabilities: { dead_letter: 0.96, page_human: 0.04 },
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      },
    })

    await expect(provider.classify(failure)).resolves.toMatchObject({
      decision: "dead_letter",
      confidence: 0.96,
      provider: "jev",
    })
    expect(body).toMatchObject({
      model: "jev-latest",
      questions: { action: { type: "choice" } },
    })
  })
})
