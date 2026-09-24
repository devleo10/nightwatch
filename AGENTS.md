# Nightwatch agent guide

Read this before editing a consumer app or this repo. Nightwatch classifies a failed BullMQ job, then either applies that decision or leaves BullMQ alone.

Repository: https://github.com/devleo10/nightwatch

Published packages, version 0.1.1:

- `@devleo10/nightwatch` imports from `@devleo10/nightwatch/bullmq`
- `@devleo10/nightwatch-core` is the classifier, policy, and decision log. The BullMQ package depends on it.
- `@devleo10/nightwatch-server` is optional. Command name `nightwatch-server`.

## Add it to another project

Requires Node.js 20+ and BullMQ 5+.

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

Wrap the processor that already throws on failure. Do not add a second worker. Call `attachTriage(worker, options)` only for an in-process processor, once, after `new Worker`. If the processor lives in a sandboxed file, call `withTriage` inside that file. BullMQ will not pass the lock token across the sandbox boundary, and `retry_later` needs that token.

Set `attempts` and `backoff` on the queue or the job. Nightwatch does not invent a retry schedule.

## Defaults that do nothing until you change them

These are the traps. A confident classifier result still leaves the job alone until policy says otherwise.

| Setting | Default | What an agent must not assume |
| --- | --- | --- |
| `policy.dryRun` | `true` | Decisions are logged. BullMQ retries as usual. Set `dryRun: false` only when the user wants the queue to change. |
| `policy.minConfidence` | `0.8` | Below this, the outcome is `fallback`, `escalated` is true, and the original error is rethrown. |
| `policy.maxAutoRetries` | `3` | Caps applied `retry_now` and `retry_later`. Stored on the job as `__nightwatch.autoRetries`. Do not delete that field when replacing job data. |
| `policy.timeoutMs` | `1500` | A slow or thrown classifier becomes `fallback`. The original error is rethrown. |
| `policy.neverAutoHandle` | `[]` | Job names or `/regex/` strings. These jobs are never auto-handled, even when dry run is off. |
| Unmatched rules | `page_human` at `0.5` | `RulesProvider` returns this when nothing matches. `0.5` is under `0.8`, so the job is left to BullMQ. |
| Decision log | in memory, max 500 | Pass `new JsonlDecisionStore(path)` or set `TRIAGE_DECISION_LOG` to keep decisions after restart. |
| Demo feed | last 30 events in the browser | Refresh clears it. It is one demo queue named `nightwatch`, not a history of every failed queue. |

`retry_now` rethrows the original error. If the job was queued with `attempts: 1`, BullMQ will not retry it. `retry_later` calls `job.moveToDelayed` and throws `DelayedError`, which does not spend an attempt. `dead_letter` throws `UnrecoverableError` and stops remaining attempts. `page_human` calls `onEscalate` when you passed one, then rethrows.

## Classifiers

Use `RulesProvider` unless the user asked for something else. Built-in matches cover rate limits, timeouts, connection resets, 5xx, malformed JSON, validation errors, expired auth, duplicate ids, and signature failures. Custom rules are checked first. See `docs/custom-rules.md`.

`HttpProvider` posts the failure JSON and expects `{ decision, confidence, reason, delayMs?, provider? }`. `decision` is `retry_now`, `retry_later`, `dead_letter`, or `page_human`.

`JevProvider` is the showcase path. It posts one System One Choice to `https://api.typesafe.ai/v1/systemone` (`jev-latest`) and reads `answers.action.choice` plus `answers.action.confidence`. Pass `headers.authorization` as `Bearer $TYPESAFE_API_KEY`. Do not invent a second request shape. A thrown call becomes `fallback` and BullMQ keeps the job. The demo uses Jev when `TYPESAFE_API_KEY` is set, and falls through to `RulesProvider` if that call fails.

## Secrets

Set `redact: { keys: ["token", "authorization", "email"] }` before any `HttpProvider` or `JevProvider` call. Redaction covers metadata and `payloadSummary`. It does not rewrite `errorMessage`. Do not put secrets in `Error` messages.

`GET /decisions` is open unless `TRIAGE_API_KEY` is set. Do not expose that route without the key. The demo generates fake jobs. Do not point it at a queue that holds customer data.

## This repo

```bash
npm install
docker compose up -d
npm test
npm run dev
```

Unit tests do not need Redis. `npm run test:integration` does, on `127.0.0.1:6379`. `npm run dev` builds the packages and starts the demo. The dashboard URL is the one Next prints. Dry run is on. Live mode is the switch that lets the worker delay, dead-letter, or escalate.

Further detail: `docs/quick-start.md`, `docs/policies.md`, `docs/providers.md`, `docs/server.md`, `docs/faq.md`, `SECURITY.md`.
