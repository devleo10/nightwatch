# Policies and safety

Policy runs after the classifier returns and before any BullMQ call. The default policy changes nothing.

| Option | Default | Effect |
| --- | --- | --- |
| `dryRun` | `true` | Log the decision. Leave BullMQ behavior unchanged. |
| `minConfidence` | `0.8` | Below this, the outcome is an escalation and the original error is rethrown. |
| `neverAutoHandle` | `[]` | Job names, or `/regex/` strings, or `RegExp` objects. These jobs are logged only. |
| `maxAutoRetries` | `3` | Caps applied `retry_now` and `retry_later` actions per job. `dead_letter` and `page_human` are not capped by this. |
| `timeoutMs` | `1500`, or the classifier's suggestion | If classification is slower than this, or throws, triage is skipped. `JevProvider`, `CascadeProvider`, and `ChainProvider` suggest a longer value, used when you leave this unset. |

The retry counter is stored on the job as `__nightwatch.autoRetries`. `moveToDelayed` does not increment BullMQ's attempt count, so this field is what stops a delay loop. Do not strip it if you replace job data yourself.

`neverAutoHandle` wins over dry run. A payment job in that list is never auto handled, even when dry run is off. A low confidence score also wins: the action becomes `fallback` and `escalated` is true.

```ts
withTriage(processor, {
  classifier,
  policy: {
    dryRun: false,
    minConfidence: 0.9,
    maxAutoRetries: 2,
    neverAutoHandle: ["process-payment", "/^billing-/"],
    timeoutMs: 800,
  },
})
```

When the plan is not applied, the original error is rethrown. That includes dry run, low confidence, the retry cap, `neverAutoHandle`, classifier errors, and timeouts. The job then follows your normal `attempts` and `backoff`.
