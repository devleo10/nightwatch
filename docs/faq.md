# FAQ

## What happened to `@devleo10/nightwatch-core` and `@devleo10/nightwatch-server`?

They were renamed to `@devleo10/nightwatch-classifier` and `@devleo10/nightwatch-http`. The old names are removed or deprecated on npm. See [Migration](migration.md).

## Does this replace BullMQ retries?

No. `retry_now` rethrows so your existing `attempts` and `backoff` still apply. `retry_later` moves the job to delayed without spending an attempt. `dead_letter` stops the remaining attempts. If triage is skipped, the original error is rethrown and BullMQ behaves as if the wrapper was not there.

## Why did my confident decision not run?

Dry run defaults to true. Set `policy.dryRun` to false. Also check `minConfidence`, `neverAutoHandle`, and `maxAutoRetries`. The decision record's `policy.reason` says which gate held.

## Can a classifier outage take the queue down?

A timeout or a throw becomes `action: "fallback"` and `applied: false`. The original error is rethrown. Hooks (`onDecision`, `onEscalate`) are caught so a broken logger cannot change the job.

## Where are decisions stored?

Pass a `DecisionStore`. `MemoryDecisionStore` keeps a bounded list in process. `JsonlDecisionStore` appends one JSON object per line. `readRecentDecisions(store, limit)` returns the newest records.

## What is `__nightwatch` on the job?

The applied auto retry count. It is how `maxAutoRetries` survives `moveToDelayed`, which does not increment BullMQ's attempt counter. It is removed from the metadata sent to the classifier.

## Which BullMQ version?

5.0.0 or newer. The delay and dead letter paths were read from the installed 5.81.5 types and worker source. See [Quick start](quick-start.md).
