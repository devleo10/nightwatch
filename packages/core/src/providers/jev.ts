import { ClassifierError } from "../errors.js"
import type { Classifier, Decision, Failure, Result } from "../types.js"
import { DECISIONS } from "../types.js"
import { HttpProvider, type HttpProviderOptions } from "./http.js"

export const JEV_SYSTEM_ONE_URL = "https://api.typesafe.ai/v1/systemone"

export type JevMapper = {
  toRequest: (input: Failure) => unknown
  fromResponse: (body: unknown, input: Failure, latencyMs: number) => Result
}

const CRITERIA = {
  retry_now:
    "Transient failure that should be retried immediately: connection reset, or an expired auth token that can be refreshed.",
  retry_later:
    "Temporary upstream failure that should wait before another try: HTTP 429, HTTP 500, provider throttling, or a timeout.",
  dead_letter:
    "Permanent problem with the job data or recipient that will not fix itself on retry: malformed JSON, validation failure, invalid phone or WhatsApp number, missing dispatch id, or provider MessageRejected.",
  page_human:
    "A person must decide: HTTP 401 or 403, invalid signature, duplicate transaction, blocked bot, or any error that is not clearly transient and not a bad payload.",
} as const

/**
 * One System One request. Jev answers a Choice over the four queue actions.
 * The contract is the published POST /v1/systemone shape.
 */
export function toJevRequest(input: Failure): unknown {
  return {
    model: "jev-latest",
    state: {
      jobName: input.jobName,
      queueName: input.queueName,
      errorCode: input.errorCode ?? "UNKNOWN",
      errorMessage: input.errorMessage,
      attempt: input.attempt,
      maxAttempts: input.maxAttempts ?? null,
      payloadSummary: input.payloadSummary ?? null,
    },
    questions: {
      action: {
        type: "choice",
        instructions:
          "Which action should the queue take for this failed background job? Pick one of the four labels. Running out of attempts does not by itself mean dead_letter. Use page_human for auth and permission failures unless the payload is clearly invalid.",
        criteria: CRITERIA,
      },
    },
  }
}

function isDecision(value: string): value is Decision {
  return (DECISIONS as readonly string[]).includes(value)
}

function readChoice(body: unknown): { choice: string; confidence: number } {
  if (!body || typeof body !== "object") {
    throw new ClassifierError("Jev response was not a JSON object.")
  }
  const answers = (body as { answers?: unknown }).answers
  if (!answers || typeof answers !== "object") {
    throw new ClassifierError("Jev response did not include answers.")
  }
  const action = (answers as { action?: unknown }).action
  if (!action || typeof action !== "object") {
    throw new ClassifierError("Jev response did not include answers.action.")
  }
  const choice = (action as { choice?: unknown }).choice
  const confidence = (action as { confidence?: unknown }).confidence
  if (typeof choice !== "string" || typeof confidence !== "number") {
    throw new ClassifierError("Jev action answer did not include choice and confidence.")
  }
  return { choice, confidence }
}

/** Maps a System One Choice answer onto a Nightwatch result. Code owns any delay. */
export function fromJevResponse(body: unknown, _input: Failure, latencyMs: number): Result {
  const answer = readChoice(body)
  if (!isDecision(answer.choice)) {
    throw new ClassifierError(`Jev returned an unknown choice "${answer.choice}".`)
  }
  if (!Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) {
    throw new ClassifierError(`Jev confidence ${String(answer.confidence)} is outside 0 to 1.`)
  }
  return {
    decision: answer.choice,
    confidence: Math.round(answer.confidence * 100) / 100,
    reason: `Jev chose ${answer.choice}.`,
    latencyMs,
    provider: "jev",
  }
}

export type JevProviderOptions = {
  url?: string
  headers?: Record<string, string>
  timeoutMs?: number
  fetchImpl?: typeof fetch
  map?: Partial<JevMapper>
}

export class JevProvider implements Classifier {
  private readonly http: HttpProvider
  readonly suggestedTimeoutMs: number

  constructor(options: JevProviderOptions = {}) {
    const timeoutMs = options.timeoutMs ?? 8000
    this.suggestedTimeoutMs = timeoutMs + 1000
    const httpOptions: HttpProviderOptions = {
      url: options.url ?? JEV_SYSTEM_ONE_URL,
      headers: options.headers,
      timeoutMs,
      fetchImpl: options.fetchImpl,
      providerName: "jev",
      serialize: options.map?.toRequest ?? toJevRequest,
      parse: (body, input, latencyMs) => {
        const map = options.map?.fromResponse ?? fromJevResponse
        const result = map(body, input, latencyMs)
        return { ...result, provider: result.provider || "jev" }
      },
    }
    this.http = new HttpProvider(httpOptions)
  }

  classify(input: Failure): Promise<Result> {
    return this.http.classify(input)
  }
}
