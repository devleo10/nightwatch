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

`JevProvider` is a thin wrapper on `HttpProvider` for TypeSafe's Jev model. The request and response mapping is intentionally empty. Fill in `toJevRequest` and `fromJevResponse` in `@devleo10/nightwatch-core`, or pass `map` when you construct the provider, once you have the API format. Do not guess it.

```ts
import { JevProvider } from "@devleo10/nightwatch-core"

const classifier = new JevProvider({
  url: process.env.JEV_URL ?? "",
  headers: { authorization: `Bearer ${process.env.JEV_API_KEY ?? ""}` },
  map: {
    toRequest(_failure) {
      throw new Error("TODO: return the Jev request body. Do not guess the format.")
    },
    fromResponse(_body, _input, _latencyMs) {
      throw new Error("TODO: map the Jev response onto a Result.")
    },
  },
})
```

Until that mapping exists, classification throws a clear error and policy falls back to normal BullMQ behavior.
