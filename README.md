# Nightwatch

A live dashboard for failed background jobs. A producer keeps adding work to a BullMQ queue. A worker fails about 40 percent of those jobs with errors you would see in production: rate limits, timeouts, bad payloads, invalid signatures. Each failure is classified, then the system retries it, parks it on a dead-letter list, or flags it for a person. The page streams every decision as it happens, so you can watch the queue handle itself.

## Setup

You need Node.js 20 or newer, and Docker.

```bash
npm install
docker compose up -d
npm run dev
```

`docker compose up -d` starts Redis in the background. `npm run dev` starts the API on http://localhost:4000 and the dashboard on http://localhost:3000.

Open http://localhost:3000. The producer is already running. Pause stops new jobs. Fast shortens the gap between jobs so the feed moves quickly for a screen recording.

## Swapping in a different classifier

All classification lives in `server/src/classifier.ts`. `classify` returns a decision, a confidence score, latency in milliseconds, and a provider name.

The default provider is `rules`. Set `CLASSIFIER_PROVIDER=jev` and `TYPESAFE_API_KEY` to classify with TypeSafe Jev (`jev-latest`) through `@typesafe-ai/sdk`. Each failure is one Choice over `retry_now`, `retry_later`, `dead_letter`, and `page_human`. The worker still auto-acts only when confidence is at least 0.8. A failed or unreadable Jev call abstains: it reports `page_human` at confidence 0, so the job is escalated. Leave the provider unset, or set it to `rules`, to keep the built-in rules.
