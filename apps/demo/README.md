# Nightwatch demo

A generated BullMQ queue on a dashboard. The built-in rules answer the errors they know, and TypeSafe Jev answers the rest. It does not read an existing production queue. Set `TYPESAFE_API_KEY` in the repo `.env`. Without that key the demo uses rules only.

From the repo root:

```bash
docker compose up -d
npm install
npm run dev
```

Open the URL Next prints. Dry run is on, so decisions are shown and BullMQ is left alone. Live mode applies delay, dead letter, and escalation.

The feed is the latest events for this process. Refreshing the page clears it. Counts reset when the demo server restarts.
