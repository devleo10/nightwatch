import { describe, expect, it } from "vitest"
import { withTriage } from "../src/index.js"

describe("withTriage", () => {
  it("rejects a missing classifier before any job runs", () => {
    expect(() =>
      withTriage(async () => undefined, {
        classifier: undefined as never,
      }),
    ).toThrow(/classifier/)
  })
})
