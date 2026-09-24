# @devleo10/nightwatch

Wrap a BullMQ processor so a failed job can be retried, delayed, dead-lettered, or escalated.

```bash
npm install @devleo10/nightwatch bullmq
```

```ts
import { Worker } from "bullmq"
import { RulesProvider, withTriage } from "@devleo10/nightwatch/bullmq"

new Worker("emails", withTriage(async (job) => {
  await sendEmail(job.data)
}, {
  classifier: new RulesProvider(),
}))
```

Dry run defaults to `true`. The job does not change until `policy.dryRun` is `false`.

Guide: https://github.com/devleo10/nightwatch/blob/main/AGENTS.md
