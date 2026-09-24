# Quick start

The defaults that leave a queue unchanged are listed in [AGENTS.md](../AGENTS.md). The sample below turns dry run off. Omit `policy` to log decisions only.

Requires Node.js 20 or newer and BullMQ 5 or newer. The adapter was checked against BullMQ 5.81.5.

```bash
npm install @devleo10/nightwatch-bullmq bullmq
```

```ts
import { Worker } from "bullmq"
import { RulesProvider, withTriage } from "@devleo10/nightwatch-bullmq"

const worker = new Worker("emails", withTriage(async (job) => {
  await sendEmail(job.data)
}, {
  classifier: new RulesProvider(),
  policy: { dryRun: false },
}))
```

`withTriage` wraps your processor. If the processor returns, triage does nothing. If it throws, triage builds a failure, classifies it, applies policy, writes a decision record, then either changes the job or rethrows the original error.

You can also wrap a worker that already exists:

```ts
import { attachTriage } from "@devleo10/nightwatch-bullmq"

attachTriage(worker, { classifier: new RulesProvider() })
```

Call `attachTriage` once, after `new Worker`. It replaces the in-process processor function. For a sandboxed processor file, call `withTriage` inside that file instead.

## What each decision does

Checked in BullMQ 5.81.5:

- `retry_later` calls `job.moveToDelayed(timestamp, token)` and then throws `DelayedError`. BullMQ leaves the job delayed and does not consume an attempt (`skipAttempt` is set inside `moveToDelayed`). The worker passes its lock token as the processor's second argument. `withTriage` forwards that token. Without it, the delay is skipped and the original error is rethrown.
- `dead_letter` throws `UnrecoverableError`. `Job.shouldRetryJob` returns false even when attempts remain, so the job fails immediately.
- `retry_now` rethrows the original error. BullMQ retries while `attemptsMade + 1 < attempts`, using the job's backoff.
- `page_human` calls `onEscalate` if you passed one, then rethrows the original error.
- `dead_letter` calls `onDeadLetter` if you passed one, then throws `UnrecoverableError`. In a `failed` handler, use `isFinalFailure(job, error)` instead of comparing `attemptsMade` to `attempts`.
- `retrySafe: (job, error) => false` stops the job after a side effect, with no more BullMQ attempts (outside dry run). The classifier is not called.

`attemptsMade` is incremented when the job finishes, not when the processor starts. The failure `attempt` sent to the classifier is `attemptsMade + 1`.

Set `attempts` and `backoff` on the job or the queue. Nightwatch does not invent a retry schedule for `retry_now`.

Minimum supported version: `bullmq` 5.0.0 or newer. The methods above are the BullMQ 5 worker API.
