const JOB_NAMES = [
  "send-email",
  "process-payment",
  "sync-kyc-status",
  "fetch-market-data",
  "deliver-webhook",
] as const

type JobName = (typeof JOB_NAMES)[number]

export type DemoJob = {
  jobName: JobName
  shouldFail: boolean
  errorCode?: string
  errorMessage?: string
  payloadSummary: string
}

const FAILURES: Array<{ code: string; message: string; jobs: JobName[] }> = [
  { code: "HTTP_429", message: "HTTP 429 rate limit from a broker API", jobs: ["fetch-market-data", "deliver-webhook"] },
  { code: "ETIMEDOUT", message: "ETIMEDOUT calling a payment gateway", jobs: ["process-payment", "fetch-market-data", "send-email"] },
  { code: "MALFORMED_JSON", message: "Malformed JSON in a webhook payload", jobs: ["deliver-webhook"] },
  { code: "NULL_PAN", message: 'Null field "pan_number" in a KYC response', jobs: ["sync-kyc-status"] },
  { code: "HTTP_500", message: "HTTP 500 from an upstream service", jobs: ["send-email", "process-payment", "sync-kyc-status"] },
  { code: "INVALID_HMAC", message: "Invalid HMAC signature", jobs: ["deliver-webhook"] },
  { code: "ECONNRESET", message: "Redis connection reset", jobs: ["fetch-market-data"] },
  { code: "DUPLICATE_TXN", message: "Duplicate transaction id", jobs: ["process-payment"] },
  { code: "AUTH_EXPIRED", message: "Expired auth token", jobs: ["send-email", "sync-kyc-status", "process-payment"] },
  { code: "SCHEMA_INVALID", message: "Schema validation failure", jobs: ["sync-kyc-status", "deliver-webhook", "send-email"] },
]

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

function summary(jobName: JobName): string {
  const id = Math.random().toString(36).slice(2, 8)
  switch (jobName) {
    case "send-email":
      return `to: user_${id}@client.io template: receipt`
    case "process-payment":
      return `amount: ${(20 + Math.random() * 980).toFixed(2)} USD ref: txn_${id}`
    case "sync-kyc-status":
      return `applicant: usr_${id} field: pan_number`
    case "fetch-market-data":
      return `symbol: ${pick(["AAPL", "RELIANCE", "BTC-USD", "NIFTY"])} bar: 1m`
    case "deliver-webhook":
      return `event: order.paid target: hooks.${id}.partner.io`
  }
}

export function createDemoJob(): DemoJob {
  const jobName = pick(JOB_NAMES)
  const shouldFail = Math.random() < 0.4
  if (!shouldFail) return { jobName, shouldFail, payloadSummary: summary(jobName) }
  const candidates = FAILURES.filter((item) => item.jobs.includes(jobName))
  const failure = pick(candidates.length > 0 ? candidates : FAILURES)
  return {
    jobName,
    shouldFail,
    errorCode: failure.code,
    errorMessage: failure.message,
    payloadSummary: summary(jobName),
  }
}
