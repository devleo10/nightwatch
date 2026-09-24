# Nightwatch

Nightwatch classifies a failed BullMQ job, then either acts on that decision or leaves BullMQ alone. It is safe by default: dry run is on, low confidence does nothing, and a slow or broken classifier falls back to normal retries.

## Install

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

Nothing about the job changes until you set `policy: { dryRun: false }`. Until then every decision is logged and BullMQ retries as usual.

## Packages

| Package | What it is |
| --- | --- |
| `@devleo10/nightwatch/bullmq` | `withTriage()` and `attachTriage()` |
| `@devleo10/nightwatch-core` | Types, rules, HTTP and Jev providers, policy, decision log |
| `@devleo10/nightwatch-server` | `POST /classify` and `GET /decisions` |

## Demo

The dashboard in `apps/demo` generates failing jobs and streams decisions.

```bash
docker compose up -d
npm install
npm run dev
```

Open the URL Next prints (port 3000 unless it is already taken). Dry run is on. Switch to Live when you want the worker to delay, dead letter, or escalate for real.

## Docs

- [Quick start](docs/quick-start.md)
- [Policies and safety](docs/policies.md)
- [Custom rules](docs/custom-rules.md)
- [HTTP and Jev providers](docs/providers.md)
- [HTTP server](docs/server.md)
- [FAQ](docs/faq.md)

## Safety

Failure payloads can contain secrets. Set `redact.keys` before a job is sent to an external provider or written to the decision log. See [SECURITY.md](SECURITY.md).
