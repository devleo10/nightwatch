# Security

A failure record can include error text, a payload summary, and job metadata. Those fields often contain emails, account ids, tokens, or card data. Treat the decision log like production logs.

## Redact before you export

`withTriage` accepts `redact.keys`. Matching keys are replaced with `"[redacted]"` in metadata, including nested objects, and in `payloadSummary` when the key appears as `key: value`, `key=value`, or a JSON string field.

The redacted failure is what gets classified and what gets stored. Do this for any `HttpProvider` or `JevProvider` call.

```ts
withTriage(processor, {
  classifier,
  redact: { keys: ["pan_number", "token", "authorization", "email"] },
})
```

Error messages are not rewritten. Rules match on them, and a message can still leak a secret if your code puts one there. Keep secrets out of `Error` messages.

## Logs and the HTTP API

`JsonlDecisionStore` writes the stored failure to disk. `GET /decisions` returns those records. Put a key on the server with `TRIAGE_API_KEY`, and do not expose that route publicly without it.

The demo app generates fake payloads. Do not point the demo at a queue that carries real customer data.
