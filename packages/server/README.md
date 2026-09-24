# @devleo10/nightwatch-server

HTTP classify endpoint. Your worker can stay in charge of BullMQ.

```bash
npm install @devleo10/nightwatch-server
npx nightwatch-server
```

`POST /classify` accepts `{ "failure": Failure }` and returns `{ result, policy }`. `GET /decisions` returns recent records. Set `TRIAGE_API_KEY` before exposing either route. `TRIAGE_DRY_RUN` defaults to `true`. `TRIAGE_CLASSIFIER` defaults to `rules`.

`TRIAGE_CLASSIFIER=jev` fails closed until a request map exists. Do not guess it.

Guide: https://github.com/devleo10/nightwatch/blob/main/docs/server.md
