# Nightwatch

Nightwatch decides what to do with a failed BullMQ job: retry now, retry later, dead-letter, or hand it to a person. Rules answer the errors they already know. TypeSafe Jev answers the rest, with a confidence. Your queue moves only when that confidence clears the bar.

Every queue has a long tail of errors nobody wrote a rule for. That tail is where Jev earns its keep, and where it says so when it is unsure.

Agents: read [AGENTS.md](AGENTS.md) before wiring this into another app. It lists the defaults that look like bugs.

## Try it on your own failed jobs

No code changes. Read only.

```bash
TYPESAFE_API_KEY=... npx @devleo10/nightwatch-bullmq scan redis://localhost:6379 --queue emails
```

It reads the most recent failed jobs, hides common secret keys in payloads, and prints what Nightwatch would do with each group of errors, how confident it is, and why. Leave out the key to see what rules alone would do. On a small sample of seven failures, rules handled three and rules then Jev handled five, and Jev declined a card decline at 58% instead of guessing.

## Install

Node.js 20 or newer, BullMQ 5 or newer.

```bash
npm install @devleo10/nightwatch-bullmq bullmq
```

```ts
import { Worker } from "bullmq"
import { CascadeProvider, JevProvider, RulesProvider, withTriage } from "@devleo10/nightwatch-bullmq"

const worker = new Worker("emails", withTriage(async (job) => {
  await sendEmail(job.data)
}, {
  classifier: new CascadeProvider([
    new RulesProvider(),
    new JevProvider({ headers: { authorization: `Bearer ${process.env.TYPESAFE_API_KEY}` } }),
  ]),
  redact: { keys: ["token", "authorization", "email"] },
}))
```

Get the key from the [TypeSafe dashboard](https://docs.typesafe.ai/introduction/quickstart). The call is `POST https://api.typesafe.ai/v1/systemone` with model `jev-latest`. No key yet? Pass `new RulesProvider()` on its own.

Nothing about the job changes until `policy.dryRun` is `false`. Until then every decision is logged and BullMQ retries with the `attempts` and `backoff` you already set. If `attempts` is 1, `retry_now` cannot retry.

```ts
withTriage(processor, {
  classifier,
  policy: { dryRun: false, minConfidence: 0.8 },
})
```

## Packages

| Package | Import | What it is |
| --- | --- | --- |
| `@devleo10/nightwatch-bullmq` | `@devleo10/nightwatch-bullmq` | `withTriage()`, `attachTriage()`, and `nightwatch scan` |
| `@devleo10/nightwatch-classifier` | `@devleo10/nightwatch-classifier` | Rules, Jev, HTTP, cascade, policy, decision log |
| `@devleo10/nightwatch-http` | `npx @devleo10/nightwatch-http` | `POST /classify` and `GET /decisions` |

`@devleo10/nightwatch-bullmq` depends on `@devleo10/nightwatch-classifier`, so one install is enough for the worker.

## Run the demo

```bash
git clone https://github.com/devleo10/nightwatch.git
cd nightwatch
npm install
docker compose up -d
npm run dev
```

Open the URL Next prints. Put `TYPESAFE_API_KEY` in `.env` at the repo root to let Jev take the errors rules miss. Each row shows why the queue did or did not move. The list holds the latest 30 decisions for one generated queue, and a refresh clears it. Switch to Live when the worker should delay, dead-letter, or escalate for real.

## Setup traps

- Dry run defaults to `true`. A correct decision still leaves the job to BullMQ. The worker logs this once at startup.
- Confidence under `0.8` escalates and rethrows. `RulesProvider` uses `0.5` when no rule matches, so unknown errors are not auto-handled without Jev.
- `retry_later` needs BullMQ's lock token. Sandboxed processors must call `withTriage` inside the processor file.
- `__nightwatch` on the job data counts auto retries. Do not strip it.
- The decision log is in memory (500 records) unless you pass `JsonlDecisionStore` or `TRIAGE_DECISION_LOG`.
- Dead-lettering stops BullMQ early. A `failed` handler that waits for `attemptsMade === attempts` will never fire its last-attempt branch. Use `isFinalFailure(job, error)`.
- If a job can fail after a side effect it must not repeat, pass `retrySafe`. Nightwatch then adds no retry, but BullMQ's own `attempts` still apply.
- `redact.keys` hides named fields. Add `redact.patterns` (for example `REDACT_PATTERNS.email` and `.phone`) to scrub error text from vendors.
- `GET /decisions` is public until you set `TRIAGE_API_KEY`.

## Docs

- [Quick start](docs/quick-start.md)
- [Policies and safety](docs/policies.md)
- [Custom rules](docs/custom-rules.md)
- [Jev, HTTP, and cascade providers](docs/providers.md)
- [HTTP server](docs/server.md)
- [FAQ](docs/faq.md)
- [Security](SECURITY.md)
