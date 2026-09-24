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

User facing changes in `packages/core` (`@devleo10/nightwatch-classifier`), `packages/bullmq` (`@devleo10/nightwatch-bullmq`), or `packages/server` (`@devleo10/nightwatch-http`) need a changeset:

```bash
npx changeset
```

The demo app is ignored by changesets.

## Checks

`npm run lint` typechecks the packages and lints the demo. `npm test` runs unit tests. `npm run test:integration` runs the Redis cases.

The Jev mapping is the published System One Choice contract. Do not replace it with a guessed body.
