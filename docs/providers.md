# HTTP and Jev providers

Anything that accepts a failure JSON body and returns a result can sit behind `HttpProvider`.

```ts
import { HttpProvider } from "@devleo10/nightwatch-core"

const classifier = new HttpProvider({
  url: "https://classifier.internal/v1/decide",
  headers: { authorization: `Bearer ${process.env.CLASSIFIER_TOKEN}` },
  timeoutMs: 1000,
})
```

The response must be JSON:

```json
{
  "decision": "retry_later",
  "confidence": 0.91,
  "reason": "Rate limited.",
  "delayMs": 30000,
  "provider": "internal"
}
```

`decision` is `retry_now`, `retry_later`, `dead_letter`, or `page_human`. `confidence` is a number from 0 to 1. `reason` is a non empty string. `latencyMs` and `provider` are optional.

`ChainProvider` tries classifiers in order and moves on when one throws or times out.

```ts
import { ChainProvider, HttpProvider, RulesProvider } from "@devleo10/nightwatch-core"

const classifier = new ChainProvider(
  [new HttpProvider({ url: process.env.CLASSIFIER_URL! }), new RulesProvider()],
  { timeoutMs: 800 },
)
```

## Jev

`JevProvider` posts one [System One](https://docs.typesafe.ai/introduction/quickstart) Choice to `https://api.typesafe.ai/v1/systemone`. The model is `jev-latest`. The options are `retry_now`, `retry_later`, `dead_letter`, and `page_human`. Confidence is the number Jev returns on the winning label. Nightwatch still decides whether to act.

Get a key from the TypeSafe dashboard, then:

```ts
import { JevProvider } from "@devleo10/nightwatch-core"

const classifier = new JevProvider({
  headers: { authorization: `Bearer ${process.env.TYPESAFE_API_KEY}` },
})
```

A missing key, a non-JSON body, or an unknown label throws. Policy then leaves the job to BullMQ. Put `RulesProvider` after `JevProvider` in a `ChainProvider` if you want that fallback inside the classifier instead.
