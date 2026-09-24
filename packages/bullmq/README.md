# @devleo10/nightwatch-bullmq

Wrap a BullMQ processor so a failed job can be retried, delayed, dead-lettered, or escalated. Rules answer the errors they know. TypeSafe Jev answers the rest. Install path replaces old `@devleo10/nightwatch/bullmq` snippets; see [migration.md](https://github.com/devleo10/nightwatch/blob/main/docs/migration.md).

See what it would do with the failed jobs you already have. Read only:

```bash
TYPESAFE_API_KEY=... npx @devleo10/nightwatch-bullmq scan redis://localhost:6379 --queue emails
```

Then wrap the worker:

```bash
npm install @devleo10/nightwatch-bullmq bullmq
```

```ts
import { Worker } from "bullmq"
import { CascadeProvider, JevProvider, RulesProvider, withTriage } from "@devleo10/nightwatch-bullmq"

new Worker("emails", withTriage(async (job) => {
  await sendEmail(job.data)
}, {
  classifier: new CascadeProvider([
    new RulesProvider(),
    new JevProvider({ headers: { authorization: `Bearer ${process.env.TYPESAFE_API_KEY}` } }),
  ]),
  redact: { keys: ["token", "authorization", "email"] },
}))
```

No key? Pass `new RulesProvider()` on its own. Dry run defaults to `true`. The job does not change until `policy.dryRun` is `false`.

Guide: https://github.com/devleo10/nightwatch/blob/main/AGENTS.md
