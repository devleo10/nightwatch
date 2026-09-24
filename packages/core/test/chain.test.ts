import { describe, expect, it } from "vitest"
import {
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
