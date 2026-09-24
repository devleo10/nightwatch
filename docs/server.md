# HTTP server

`@devleo10/nightwatch-http` exposes classification without embedding the library in a worker. Your app can `POST /classify` and apply the returned plan itself, or use it to inspect decisions.

```bash
npm install @devleo10/nightwatch-http
npx @devleo10/nightwatch-http
```

| Route | Purpose |
| --- | --- |
| `GET /health` | `{ "ok": true }`. Always open. |
| `POST /classify` | Body `{ "failure": Failure, "autoRetries"?: number }`. Returns `{ result, policy }`. |
| `GET /decisions?limit=50` | Recent decision records. |

If `TRIAGE_API_KEY` is set, `/classify` and `/decisions` require `Authorization: Bearer <key>` or `x-api-key`.

## Config

Environment variables override a JSON file at `TRIAGE_CONFIG`.

| Variable | Meaning |
| --- | --- |
| `PORT` | Listen port. Default 4000. |
| `TRIAGE_CLASSIFIER` | `rules` (default), `http`, `jev`, or `cascade` (rules, then Jev). |
| `TRIAGE_HTTP_URL` | Required for `http`. Overrides the Jev URL for `jev` and `cascade`. |
| `TRIAGE_HTTP_HEADERS` | JSON object of string headers. |
| `TRIAGE_API_KEY` | Optional key for the two data routes. |
| `TRIAGE_DECISION_LOG` | JSONL file path. Memory is used when this is unset. |
| `TRIAGE_DRY_RUN` | `true` or `false`. Default `true`. |
| `TRIAGE_MIN_CONFIDENCE` | Default 0.8. |
| `TRIAGE_MAX_AUTO_RETRIES` | Default 3. |
| `TRIAGE_TIMEOUT_MS` | Default 1500 for `rules` and `http`. With `jev` or `cascade`, the Jev call gets 8000 and the policy 10000 unless you set this. |
| `TRIAGE_NEVER_AUTO_HANDLE` | Comma separated job names or `/regex/` patterns. |

`jev` and `cascade` call `https://api.typesafe.ai/v1/systemone` unless `TRIAGE_HTTP_URL` is set. Set `TYPESAFE_API_KEY`, or pass an `authorization` header in `TRIAGE_HTTP_HEADERS`. `cascade` asks the built-in rules first and calls Jev only when they are under 0.8. A failed Jev call leaves the job to BullMQ.

## Docker

From the repo root, after `package-lock.json` exists:

```bash
docker build -f packages/server/Dockerfile -t nightwatch .
docker run --rm -p 4000:4000 -e TRIAGE_DRY_RUN=true nightwatch
```
