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

Error messages are rewritten only for `redact.keys` written as `key: value` or `key=value`, and for `redact.patterns`. Use `REDACT_PATTERNS.email`, `.phone`, and `.longNumber` for vendor errors that echo contact details or ids. Anything else in a message is sent as is, so keep secrets out of `Error` messages.

## Logs and the HTTP API

`JsonlDecisionStore` writes the stored failure to disk. `GET /decisions` returns those records. Put a key on the server with `TRIAGE_API_KEY`, and do not expose that route publicly without it.

The demo app generates fake payloads. Do not point the demo at a queue that carries real customer data.
