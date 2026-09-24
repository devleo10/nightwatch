# Nightwatch demo

A generated BullMQ queue and a dashboard. It does not read an existing production queue.

From the repo root:

```bash
docker compose up -d
npm install
npm run dev
```

Open the URL Next prints. Dry run is on, so decisions are shown and BullMQ is left alone. Live mode applies delay, dead letter, and escalation.

The feed is the latest events for this process. Refreshing the page clears it. Counts reset when the demo server restarts.
