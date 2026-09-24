# Custom rules

`RulesProvider` has built in matches for rate limits, timeouts, connection resets, 5xx responses, malformed JSON, validation errors, expired auth, duplicate ids, and signature failures. Your rules are checked first.

```ts
import { RulesProvider } from "@devleo10/nightwatch-bullmq"

const classifier = new RulesProvider({
  rules: [
    {
      match: (failure) => failure.jobName === "process-payment",
      decision: "page_human",
      confidence: 0.99,
      reason: "Payments always need a person.",
    },
    {
      match: /broker-429/,
      decision: "retry_later",
      delayMs: 15_000,
      confidence: 0.92,
      reason: "Broker asked us to wait.",
    },
  ],
})
```

`match` is a `RegExp` or a function that receives the full failure. A regex is tested against the error code, error name, and message joined together. Avoid the `g` flag. Confidence must be from 0 to 1. If you omit it, the rule uses 0.9.

If nothing matches, the provider returns `page_human` with confidence 0.5. The default policy then escalates and leaves the job to BullMQ, because 0.5 is below 0.8.
