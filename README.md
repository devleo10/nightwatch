# Nightwatch

Nightwatch classifies a failed BullMQ job, then either acts on that decision or leaves BullMQ alone. Dry run is on, low confidence does nothing, and a slow or broken classifier falls back to normal retries.

Agents: read [AGENTS.md](AGENTS.md) before wiring this into another app. It lists the defaults that look like bugs.

## Install

Node.js 20 or newer, BullMQ 5 or newer.

```bash
npm install @devleo10/nightwatch bullmq
```

```ts
import { Worker } from "bullmq"
import { RulesProvider, withTriage } from "@devleo10/nightwatch/bullmq"

const worker = new Worker("emails", withTriage(async (job) => {
  await sendEmail(job.data)
}, {
  classifier: new RulesProvider(),
}))
```

Nothing about the job changes until `policy.dryRun` is `false`. Until then every decision is logged and BullMQ retries with the `attempts` and `backoff` you already set. If `attempts` is 1, `retry_now` cannot retry.

```ts
withTriage(processor, {
  classifier: new RulesProvider(),
  policy: { dryRun: false, minConfidence: 0.8 },
})
```

## Packages

| Package | Import | What it is |
| --- | --- | --- |
| `@devleo10/nightwatch` | `@devleo10/nightwatch/bullmq` | `withTriage()` and `attachTriage()` |
| `@devleo10/nightwatch-core` | `@devleo10/nightwatch-core` | Rules, HTTP, policy, decision log |
| `@devleo10/nightwatch-server` | `npx nightwatch-server` | `POST /classify` and `GET /decisions` |

`@devleo10/nightwatch` depends on `@devleo10/nightwatch-core`, so one install is enough for the worker.

## Run the demo

```bash
git clone https://github.com/devleo10/nightwatch.git
cd nightwatch
npm install
docker compose up -d
npm run dev
```

Open the URL Next prints. The page shows the latest decisions for one generated queue. A refresh clears that list. Switch to Live when the worker should delay, dead-letter, or escalate for real.

## Setup traps

- Dry run defaults to `true`. A correct decision still leaves the job to BullMQ.
- Confidence under `0.8` escalates and rethrows. `RulesProvider` uses `0.5` when no rule matches, so unknown errors are not auto-handled.
- `retry_later` needs BullMQ's lock token. Sandboxed processors must call `withTriage` inside the processor file.
- `__nightwatch` on the job data counts auto retries. Do not strip it.
- The decision log is in memory (500 records) unless you pass `JsonlDecisionStore` or `TRIAGE_DECISION_LOG`.
- `JevProvider` throws until you pass `map`. Do not guess the TypeSafe request. The rules classifier does not need a Jev API key.
- `redact.keys` covers metadata and payload summaries, not error messages.
- `GET /decisions` is public until you set `TRIAGE_API_KEY`.

## Docs

- [Quick start](docs/quick-start.md)
- [Policies and safety](docs/policies.md)
- [Custom rules](docs/custom-rules.md)
- [HTTP and Jev providers](docs/providers.md)
- [HTTP server](docs/server.md)
- [FAQ](docs/faq.md)
- [Security](SECURITY.md)
