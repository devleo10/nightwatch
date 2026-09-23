import { JOB_NAMES, type JobName } from "@queue-triage/shared"

export type FailureTemplate = {
  code: string
  message: string
}

export const FAILURE_TEMPLATES: FailureTemplate[] = [
  { code: "HTTP_429", message: "HTTP 429 rate limit from a broker API" },
  { code: "ETIMEDOUT", message: "ETIMEDOUT calling a payment gateway" },
  { code: "MALFORMED_JSON", message: "Malformed JSON in a webhook payload" },
  { code: "NULL_PAN", message: 'Null field "pan_number" in a KYC response' },
  { code: "HTTP_500", message: "HTTP 500 from an upstream service" },
  { code: "INVALID_HMAC", message: "Invalid HMAC signature" },
  { code: "ECONNRESET", message: "Redis connection reset" },
  { code: "DUPLICATE_TXN", message: "Duplicate transaction id" },
  { code: "AUTH_EXPIRED", message: "Expired auth token" },
  { code: "SCHEMA_INVALID", message: "Schema validation failure" },
]

const BY_JOB: Record<JobName, string[]> = {
  "send-email": ["HTTP_500", "AUTH_EXPIRED", "ETIMEDOUT", "SCHEMA_INVALID"],
  "process-payment": ["ETIMEDOUT", "DUPLICATE_TXN", "HTTP_500", "AUTH_EXPIRED"],
  "sync-kyc-status": ["NULL_PAN", "SCHEMA_INVALID", "HTTP_500", "AUTH_EXPIRED"],
  "fetch-market-data": ["HTTP_429", "ETIMEDOUT", "ECONNRESET", "HTTP_500"],
  "deliver-webhook": ["MALFORMED_JSON", "INVALID_HMAC", "HTTP_429", "SCHEMA_INVALID"],
}

const SYMBOLS = ["AAPL", "RELIANCE", "BTC-USD", "NIFTY", "EURUSD"]

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 8)
}

export function pickJobName(): JobName {
  return pick([...JOB_NAMES])
}

export function pickFailure(jobName: JobName): FailureTemplate {
  const code = pick(BY_JOB[jobName])
  const template = FAILURE_TEMPLATES.find((item) => item.code === code)
  return template ?? pick(FAILURE_TEMPLATES)
}

export function payloadSummary(jobName: JobName): string {
  const id = shortId()
  switch (jobName) {
    case "send-email":
      return `to: user_${id}@client.io template: receipt`
    case "process-payment":
      return `amount: ${(20 + Math.random() * 980).toFixed(2)} USD ref: txn_${id}`
    case "sync-kyc-status":
      return `applicant: usr_${id} field: pan_number`
    case "fetch-market-data":
      return `symbol: ${pick(SYMBOLS)} bar: 1m`
    case "deliver-webhook":
      return `event: order.paid target: hooks.${id}.partner.io`
  }
}

export function pickAttempt(): number {
  const roll = Math.random()
  if (roll < 0.7) return 1
  if (roll < 0.9) return 2
  return 3
}
