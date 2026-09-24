# Nightwatch agent guide

Read this before editing a consumer app or this repo. Nightwatch classifies a failed BullMQ job, then either applies that decision or leaves BullMQ alone.

Repository: https://github.com/devleo10/nightwatch

Packages, all at version 0.1.0:

- `@devleo10/nightwatch-bullmq` wraps a worker and ships the `nightwatch scan` command. Install this one.
- `@devleo10/nightwatch-classifier` is the classifier, policy, and decision log. The BullMQ package depends on it.
- `@devleo10/nightwatch-http` is optional. Command name `nightwatch-server`.

Older names (`@devleo10/nightwatch`, `@devleo10/nightwatch-core`, `@devleo10/nightwatch-server`) were removed from npm. Do not install them.

## Add it to another project

Requires Node.js 20+ and BullMQ 5+. Bun 1.4 also works: `withTriage`, `retry_later`, and `dead_letter` were checked against a live worker.

```bash
npm install @devleo10/nightwatch-bullmq bullmq
```

```ts
import { Worker } from "bullmq"
import { CascadeProvider, JevProvider, RulesProvider, withTriage } from "@devleo10/nightwatch-bullmq"

const worker = new Worker("emails", withTriage(async (job) => {
 await sendEmail(job.data)
}, {
 classifier: process.env.TYPESAFE_API_KEY
  ? new CascadeProvider([
     new RulesProvider(),
     new JevProvider({ headers: { authorization: `Bearer ${process.env.TYPESAFE_API_KEY}` } }),
    ])
  : new RulesProvider(),
 redact: { keys: ["token", "authorization", "email"] },
}))
```

Before wiring anything, you can show the user what Nightwatch would do with their existing failed jobs. This only reads Redis:

```bash
npx @devleo10/nightwatch-bullmq scan redis://localhost:6379 --queue emails
```

It uses rules only unless `TYPESAFE_API_KEY` is set. Add `--json` for one JSON object per job.

Wrap the processor that already throws on failure. Do not add a second worker. Call `attachTriage(worker, options)` only for an in-process processor, once, after `new Worker`. If the processor lives in a sandboxed file, call `withTriage` inside that file. BullMQ will not pass the lock token across the sandbox boundary, and `retry_later` needs that token.

Set `attempts` and `backoff` on the queue or the job. Nightwatch does not invent a retry schedule.

## Defaults that do nothing until you change them

These are the traps. A confident classifier result still leaves the job alone until policy says otherwise.

| Setting | Default | What an agent must not assume |
| --- | --- | --- |
| `policy.dryRun` | `true` | Decisions are logged. BullMQ retries as usual. Set `dryRun: false` only when the user wants the queue to change. |
| `policy.minConfidence` | `0.8` | Below this, the outcome is `fallback`, `escalated` is true, and the original error is rethrown. |
| `policy.maxAutoRetries` | `3` | Caps applied `retry_now` and `retry_later`. Stored on the job as `__nightwatch.autoRetries`. Do not delete that field when replacing job data. |
| `policy.timeoutMs` | `1500`, or the classifier's `suggestedTimeoutMs` | A slow or thrown classifier becomes `fallback`. The original error is rethrown. `JevProvider` suggests 9000 and `CascadeProvider` more. Do not set 1500 by hand when Jev is in the chain. |
| `policy.neverAutoHandle` | `[]` | Job names or `/regex/` strings. These jobs are never auto-handled, even when dry run is off. |
| Unmatched rules | `page_human` at `0.5` | `RulesProvider` returns this when nothing matches. `0.5` is under `0.8`, so the job is left to BullMQ. |
| Decision log | in memory, max 500 | Pass `new JsonlDecisionStore(path)` or set `TRIAGE_DECISION_LOG` to keep decisions after restart. |
| Demo feed | last 30 events in the browser | Refresh clears it. It is one demo queue named `nightwatch`, not a history of every failed queue. |

`retry_now` rethrows the original error. If the job was queued with `attempts: 1`, BullMQ will not retry it. `retry_later` calls `job.moveToDelayed` and throws `DelayedError`, which does not spend an attempt. `dead_letter` calls `onDeadLetter` when you passed one, then throws `UnrecoverableError` and stops remaining attempts. `page_human` calls `onEscalate` when you passed one, then rethrows.

Check existing `failed` handlers before turning dry run off. A handler that marks a row failed only when `job.attemptsMade === job.opts.attempts` will miss a dead-lettered job, because BullMQ stops early. Replace that check with `isFinalFailure(job, error)` from `@devleo10/nightwatch-bullmq`.

If a processor can fail after a side effect it must not repeat (a message sent, a charge made), pass `retrySafe: (job, error) => boolean`. When it returns false, Nightwatch never applies `retry_now` or `retry_later` and the record is marked escalated. BullMQ's own `attempts` still apply, so the processor must still be idempotent or the job must use `attempts: 1`.

## Classifiers

Use `CascadeProvider([new RulesProvider(), new JevProvider(...)])` when the user has a TypeSafe key, and `RulesProvider` alone when they do not. The cascade stops at the first answer at or above `below` (default 0.8), so Jev is only called for errors the rules miss. `ChainProvider` only falls through when a classifier throws, not on low confidence. Built-in matches cover rate limits, timeouts, connection resets, 5xx, malformed JSON, validation errors, expired auth, duplicate ids, and signature failures. Custom rules are checked first. See `docs/custom-rules.md`.

`HttpProvider` posts the failure JSON and expects `{ decision, confidence, reason, delayMs?, provider? }`. `decision` is `retry_now`, `retry_later`, `dead_letter`, or `page_human`.

`JevProvider` posts one System One Choice to `https://api.typesafe.ai/v1/systemone` (`jev-latest`) and reads `answers.action.choice` plus `answers.action.confidence`. Pass `headers.authorization` as `Bearer $TYPESAFE_API_KEY`. Do not invent a second request shape. A thrown call becomes `fallback` and BullMQ keeps the job. The demo asks rules first and Jev for the rest when `TYPESAFE_API_KEY` is set.

## Secrets

Set `redact` before any `HttpProvider` or `JevProvider` call. `keys` hides named fields in metadata and `payloadSummary`, and `key: value` or `key=value` text in `errorMessage`. `patterns` replaces regex matches in all three. Use the built-in `REDACT_PATTERNS.email`, `.phone`, and `.longNumber` (six or more digits, such as chat ids) when error text from a vendor can carry them:

```ts
redact: {
 keys: ["token", "authorization", "email", "userId"],
 patterns: [REDACT_PATTERNS.email, REDACT_PATTERNS.phone, REDACT_PATTERNS.longNumber],
}
```

Rules match on the redacted message, so do not redact words a rule needs. `nightwatch scan` always hides emails and phone numbers.

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
