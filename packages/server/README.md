# @devleo10/nightwatch-server

HTTP classify endpoint. Your worker can stay in charge of BullMQ.

```bash
npm install @devleo10/nightwatch-server
npx nightwatch-server
```

`POST /classify` accepts `{ "failure": Failure }` and returns `{ result, policy }`. `GET /decisions` returns recent records. Set `TRIAGE_API_KEY` before exposing either route. `TRIAGE_DRY_RUN` defaults to `true`. `TRIAGE_CLASSIFIER` defaults to `rules`.

`TRIAGE_CLASSIFIER=cascade` asks the built-in rules first and TypeSafe Jev for the rest. Set `TYPESAFE_API_KEY`. `TRIAGE_CLASSIFIER=jev` sends every failure to Jev.

Guide: https://github.com/devleo10/nightwatch/blob/main/docs/server.md
