# Contributing

Issues and pull requests are welcome.

## Setup

```bash
npm install
docker compose up -d
npm test
npm run test:integration
npm run build
```

Unit tests do not need Redis. The BullMQ integration test does, on `127.0.0.1:6379`.

## Changesets

User facing changes in `packages/core`, `packages/bullmq`, or `packages/server` need a changeset:

```bash
npx changeset
```

The demo app is ignored by changesets.

## Checks

`npm run lint` typechecks the packages and lints the demo. `npm test` runs unit tests. `npm run test:integration` runs the Redis cases.

Please do not invent request or response shapes for external classifiers. Jev mapping stays a TODO until the API format is known.
