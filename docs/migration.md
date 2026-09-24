# Package rename

Nightwatch ships three npm packages, all at 0.1.2. The older names are gone or deprecated.

## Install these

| Package | Use for |
| --- | --- |
| `@devleo10/nightwatch-bullmq` | Workers: `withTriage`, `attachTriage`, `nightwatch scan` |
| `@devleo10/nightwatch-classifier` | Classifiers, policy, decision log (pulled in by the BullMQ package) |
| `@devleo10/nightwatch-http` | Optional `POST /classify` and `GET /decisions` (`npx` runs the `nightwatch-server` binary) |

```bash
npm install @devleo10/nightwatch-bullmq bullmq
```

## Old names

| Old | New | On npm |
| --- | --- | --- |
| `@devleo10/nightwatch` | `@devleo10/nightwatch-bullmq` | Removed |
| `@devleo10/nightwatch-core` | `@devleo10/nightwatch-classifier` | Deprecated, shows a notice on install |
| `@devleo10/nightwatch-server` | `@devleo10/nightwatch-http` | Removed |

If docs or snippets used `@devleo10/nightwatch/bullmq`, use `@devleo10/nightwatch-bullmq` instead.

## Import changes

```diff
- import { RulesProvider, withTriage } from "@devleo10/nightwatch/bullmq"
+ import { RulesProvider, withTriage } from "@devleo10/nightwatch-bullmq"

- import { JevProvider, applyPolicy } from "@devleo10/nightwatch-core"
+ import { JevProvider, applyPolicy } from "@devleo10/nightwatch-classifier"
```

Re-exports from `@devleo10/nightwatch-bullmq` (for example `CascadeProvider`, `RulesProvider`, `JevProvider`) are unchanged in spirit; only the package name changed.

## Scan and CLI

```bash
npx @devleo10/nightwatch-bullmq scan redis://localhost:6379 --queue emails
```

On Redis Cluster, add `--cluster` and the same `--prefix` your workers use, for example `--prefix "{emails}"`.

## HTTP server

```diff
- npm install @devleo10/nightwatch-server
- npx nightwatch-server
+ npm install @devleo10/nightwatch-http
+ npx @devleo10/nightwatch-http
```

Environment variables (`TRIAGE_CLASSIFIER`, `TYPESAFE_API_KEY`, and the rest) are the same. `TRIAGE_CLASSIFIER=cascade` is the rules-then-Jev default in `.env.example`.
