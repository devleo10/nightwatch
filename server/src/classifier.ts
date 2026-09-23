import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { choice, TypeSafeClient } from "@typesafe-ai/sdk"
import type { ClassifierInput, ClassifierResult, Decision } from "@queue-triage/shared"

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env")
if (existsSync(envPath)) {
  process.loadEnvFile(envPath)
}

const PROVIDER = process.env.CLASSIFIER_PROVIDER === "jev" ? "jev" : "rules"

const DECISIONS = ["retry_now", "retry_later", "dead_letter", "page_human"] as const

const ACTION = choice(
  "Which action should the queue take for this failed background job? Pick the action a person would take. Do not invent a new label.",
  {
    retry_now:
      "Transient failure that should be retried immediately: connection reset, or an expired auth token.",
    retry_later:
      "Temporary upstream failure that should wait before another try: HTTP 429, HTTP 500, or a timeout after an earlier attempt.",
    dead_letter:
      "Permanent payload problem that will fail the same way on every retry: malformed JSON, schema validation, or a null required field.",
    page_human:
      "A person must look: invalid signature, duplicate transaction, or anything that is not clearly a retry or a dead letter.",
  },
)

let client: TypeSafeClient | undefined

function jevClient(): TypeSafeClient {
  client ??= new TypeSafeClient({ defaultModel: "jev-latest" })
  return client
}

function isDecision(value: string): value is Decision {
  return (DECISIONS as readonly string[]).includes(value)
}

function roundConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0
  const clamped = Math.min(1, Math.max(0, value))
  return Math.round(clamped * 100) / 100
}

function abstain(started: number, reason: string): ClassifierResult {
  console.error("Jev classification abstained:", reason)
  return {
    decision: "page_human",
    confidence: 0,
    latencyMs: Math.round(performance.now() - started),
    provider: "jev",
  }
}

function clampConfidence(value: number): number {
  const clamped = Math.min(0.99, Math.max(0.55, value))
  return Math.round(clamped * 100) / 100
}

function rollConfidence(attempt: number): number {
  const base = 0.74 + Math.random() * 0.25
  const penalty = Math.max(0, attempt - 1) * 0.08
  return clampConfidence(base - penalty)
}

function decide(input: ClassifierInput): Decision {
  const code = (input.errorCode ?? "").toUpperCase()
  const message = input.errorMessage.toLowerCase()

  if (code === "INVALID_HMAC" || message.includes("hmac")) return "page_human"
  if (code === "DUPLICATE_TXN" || message.includes("duplicate transaction")) return "page_human"

  if (
    code === "MALFORMED_JSON" ||
    code === "SCHEMA_INVALID" ||
    code === "NULL_PAN" ||
    message.includes("malformed") ||
    message.includes("schema validation") ||
    message.includes("null field")
  ) {
    return "dead_letter"
  }

  if (code === "HTTP_429" || message.includes("429") || message.includes("rate limit")) {
    return "retry_later"
  }

  if (code === "HTTP_500" || message.includes("http 500")) {
    return "retry_later"
  }

  if (code === "ETIMEDOUT" || message.includes("etimedout") || message.includes("timeout")) {
    return input.attempt >= 2 ? "retry_later" : "retry_now"
  }

  if (code === "ECONNRESET" || message.includes("connection reset")) {
    return "retry_now"
  }

  if (code === "AUTH_EXPIRED" || message.includes("expired auth")) {
    return "retry_now"
  }

  return "page_human"
}

async function classifyWithRules(input: ClassifierInput): Promise<ClassifierResult> {
  const started = performance.now()
  const simulatedMs = 35 + Math.floor(Math.random() * 90)
  await new Promise((resolve) => setTimeout(resolve, simulatedMs))

  return {
    decision: decide(input),
    confidence: rollConfidence(input.attempt),
    latencyMs: Math.round(performance.now() - started),
    provider: "rules",
  }
}

async function classifyWithJev(input: ClassifierInput): Promise<ClassifierResult> {
  const started = performance.now()

  try {
    const response = await jevClient().systemOne({
      model: "jev-latest",
      state: {
        jobName: input.jobName,
        errorCode: input.errorCode ?? "UNKNOWN",
        errorMessage: input.errorMessage,
        attempt: input.attempt,
      },
      questions: { action: ACTION },
    })

    const answer = response.answers.action
    if (!isDecision(answer.choice)) {
      return abstain(started, `unexpected choice ${answer.choice}`)
    }

    return {
      decision: answer.choice,
      confidence: roundConfidence(answer.confidence),
      latencyMs: Math.round(performance.now() - started),
      provider: "jev",
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed"
    return abstain(started, message)
  }
}

export async function classify(input: ClassifierInput): Promise<ClassifierResult> {
  if (PROVIDER === "jev") return classifyWithJev(input)
  return classifyWithRules(input)
}

export function classifierProvider(): string {
  return PROVIDER
}
