# Nightwatch

Nightwatch asks TypeSafe Jev what to do with a failed BullMQ job. One Choice, four answers: retry now, retry later, dead-letter, or a person. Jev returns a confidence. Your code moves the job only when that number clears the bar.

No API key yet? The same wrapper runs on built-in rules. Dry run stays on until you turn it off.

Agents: read [AGENTS.md](AGENTS.md) before wiring this into another app. It lists the defaults that look like bugs.

## Install

Node.js 20 or newer, BullMQ 5 or newer.

```bash
npm install @devleo10/nightwatch bullmq
```

```ts
import { Worker } from "bullmq"
import { JevProvider, withTriage } from "@devleo10/nightwatch/bullmq"

const worker = new Worker("emails", withTriage(async (job) => {
  await sendEmail(job.data)
}, {
  classifier: new JevProvider({
    headers: { authorization: `Bearer ${process.env.TYPESAFE_API_KEY}` },
  }),
}))
```

Get the key from the [TypeSafe dashboard](https://docs.typesafe.ai/introduction/quickstart). The call is `POST https://api.typesafe.ai/v1/systemone` with model `jev-latest`.

Nothing about the job changes until `policy.dryRun` is `false`. Until then every decision is logged and BullMQ retries with the `attempts` and `backoff` you already set. If `attempts` is 1, `retry_now` cannot retry.

```ts
withTriage(processor, {
  classifier: new JevProvider({
    headers: { authorization: `Bearer ${process.env.TYPESAFE_API_KEY}` },
  }),
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
- Without `TYPESAFE_API_KEY`, use `RulesProvider`. With the key, `JevProvider` sends one Choice. A bad response leaves the job to BullMQ.
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
