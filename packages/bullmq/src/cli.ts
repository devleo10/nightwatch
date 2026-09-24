import { Queue, type Job } from "bullmq"
import { parseArgs } from "node:util"
import {
  applyPolicy,
  CascadeProvider,
  JevProvider,
  REDACT_PATTERNS,
  redactFailure,
  RulesProvider,
  withTimeout,
  type Classifier,
  type Failure,
  type PolicyOutcome,
  type Result,
} from "@devleo10/nightwatch-core"
import { failureFromJob, NIGHTWATCH_STATE_KEY } from "./index.js"

const USAGE = `Usage: nightwatch scan [redis-url] --queue <name> [options]

Reads failed jobs from BullMQ and prints what Nightwatch would do with each.
Read only. Nothing in Redis is changed.

Options:
  -q, --queue <name>        Queue to scan. Repeat for more than one.
  -n, --limit <number>      Most recent failed jobs per queue. Default 50.
      --prefix <prefix>     BullMQ key prefix. Default "bull".
      --min-confidence <n>  Policy bar, 0 to 1. Default 0.8.
      --redact <keys>       Comma separated payload keys to hide.
                            Default token,authorization,password,secret,email,apiKey.
                            Email addresses and phone numbers are always hidden,
                            in error messages too.
      --rules-only          Do not call Jev even when TYPESAFE_API_KEY is set.
      --json                Print one JSON object per job.
  -h, --help                Show this help.

The redis url defaults to REDIS_URL, then redis://127.0.0.1:6379.
With TYPESAFE_API_KEY set, rules answer first and Jev answers what they are unsure about.`

const DEFAULT_REDACT = ["token", "authorization", "password", "secret", "email", "apiKey"]

type Row = {
  queue: string
  jobId: string
  jobName: string
  error: string
  result: Result | null
  plan: PolicyOutcome
}

function connectionFrom(url: string) {
  const parsed = new URL(url)
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error(`Expected a redis:// or rediss:// url. Received ${parsed.protocol}`)
  }
  const db = parsed.pathname.replace("/", "")
  return {
    host: parsed.hostname || "127.0.0.1",
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: db ? Number(db) : undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  }
}

function errorFromJob(job: Job): Error {
  const error = new Error(job.failedReason || "Job failed")
  const trace = job.stacktrace?.[job.stacktrace.length - 1]
  const name = trace?.match(/^([A-Za-z_$][\w$]*):/)?.[1]
  if (name) error.name = name
  return error
}

function autoRetriesOf(data: unknown): number {
  if (!data || typeof data !== "object") return 0
  const state = (data as Record<string, unknown>)[NIGHTWATCH_STATE_KEY] as { autoRetries?: unknown } | undefined
  return typeof state?.autoRetries === "number" ? state.autoRetries : 0
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const output: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      output[index] = await fn(items[index]!)
    }
  })
  await Promise.all(workers)
  return output
}

function outcomeLabel(plan: PolicyOutcome): string {
  return plan.applied && plan.action !== "fallback" ? plan.action : "leave to BullMQ"
}

function printReport(rows: Row[], classifierLabel: string): void {
  const groups = new Map<string, { row: Row; count: number }>()
  for (const row of rows) {
    const key = `${row.queue}\u0000${row.jobName}\u0000${row.error}\u0000${outcomeLabel(row.plan)}`
    const group = groups.get(key)
    if (group) group.count += 1
    else groups.set(key, { row, count: 1 })
  }

  const sorted = [...groups.values()].sort((a, b) => b.count - a.count)
  console.log(`\nNightwatch scan, ${rows.length} failed jobs, classifier: ${classifierLabel}\n`)
  for (const { row, count } of sorted) {
    const confidence = row.result ? `${Math.round(row.result.confidence * 100)}%` : "n/a"
    const provider = row.result?.provider ?? "none"
    console.log(`${String(count).padStart(4)} x  ${row.queue} / ${row.jobName}`)
    console.log(`       error:    ${row.error.length > 110 ? `${row.error.slice(0, 107)}...` : row.error}`)
    console.log(`       would do: ${outcomeLabel(row.plan)}  (${row.result?.decision ?? "no answer"}, ${confidence}, ${provider})`)
    console.log(`       why:      ${row.plan.reason}\n`)
  }

  const handled = rows.filter((row) => row.plan.applied && row.plan.action !== "fallback").length
  console.log(`${handled} of ${rows.length} would be handled automatically. The rest stay with BullMQ or a person.`)
}

async function scan(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      queue: { type: "string", short: "q", multiple: true },
      limit: { type: "string", short: "n" },
      prefix: { type: "string" },
      "min-confidence": { type: "string" },
      redact: { type: "string" },
      "rules-only": { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  })

  if (values.help) {
    console.log(USAGE)
    return
  }

  const queues = values.queue ?? []
  if (queues.length === 0) throw new Error("Pass at least one --queue.")
  const limit = values.limit ? Number(values.limit) : 50
  if (!Number.isInteger(limit) || limit <= 0) throw new Error("--limit must be a positive whole number.")
  const minConfidence = values["min-confidence"] ? Number(values["min-confidence"]) : 0.8
  const redactKeys = values.redact
    ? values.redact.split(",").map((key) => key.trim()).filter(Boolean)
    : DEFAULT_REDACT

  const url = positionals[0] ?? process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
  const connection = connectionFrom(url)

  const jevKey = values["rules-only"] ? undefined : process.env.TYPESAFE_API_KEY
  const rules = new RulesProvider()
  const classifier: Classifier = jevKey
    ? new CascadeProvider(
        [rules, new JevProvider({ headers: { authorization: `Bearer ${jevKey}` }, timeoutMs: 8000 })],
        { below: minConfidence, timeoutMs: 9000 },
      )
    : rules
  const classifierLabel = jevKey ? "rules, then Jev" : "rules only (set TYPESAFE_API_KEY to add Jev)"

  const rows: Row[] = []
  for (const name of queues) {
    const queue = new Queue(name, { connection, prefix: values.prefix })
    try {
      const jobs = (await queue.getFailed(0, limit - 1)).filter(Boolean)
      const scanned = await mapLimit(jobs, 4, async (job): Promise<Row> => {
        const error = errorFromJob(job)
        const failure: Failure = redactFailure(failureFromJob(job, error), redactKeys, [
          REDACT_PATTERNS.email,
          REDACT_PATTERNS.phone,
        ])
        failure.attempt = Math.max(1, job.attemptsMade)
        let result: Result | null = null
        let classifierError: unknown
        try {
          result = await withTimeout(classifier.classify(failure), 10_000)
        } catch (caught) {
          classifierError = caught
        }
        const plan = applyPolicy({
          failure,
          result,
          options: { dryRun: false, minConfidence },
          autoRetries: autoRetriesOf(job.data),
          classifierError,
        })
        return { queue: name, jobId: String(job.id), jobName: job.name, error: error.message, result, plan }
      })
      rows.push(...scanned)
    } finally {
      await queue.close()
    }
  }

  if (values.json) {
    for (const row of rows) console.log(JSON.stringify(row))
    return
  }
  if (rows.length === 0) {
    console.log(`No failed jobs in ${queues.join(", ")}.`)
    return
  }
  printReport(rows, classifierLabel)
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  if (!command || command === "-h" || command === "--help") {
    console.log(USAGE)
    return
  }
  if (command !== "scan") throw new Error(`Unknown command "${command}". Try: nightwatch scan --help`)
  await scan(rest)
}

main().catch((error: unknown) => {
  console.error(`nightwatch: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
