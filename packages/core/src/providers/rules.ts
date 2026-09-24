import type { Classifier, Decision, Failure, Result } from "../types.js"

export type Rule = {
  match: RegExp | ((input: Failure) => boolean)
  decision: Decision
  delayMs?: number
  confidence?: number
  reason?: string
}

export type RulesProviderOptions = {
  rules?: Rule[]
  providerName?: string
}

const BUILTIN_RULES: Rule[] = [
  {
    match: /throttl|sending rate exceeded|maximum send rate/i,
    decision: "retry_later",
    delayMs: 60_000,
    confidence: 0.94,
    reason: "The provider is throttling sends.",
  },
  {
    match: /429|rate limit|too many requests/i,
    decision: "retry_later",
    delayMs: 30_000,
    confidence: 0.93,
    reason: "Rate limited by an upstream service.",
  },
  {
    match: /\b401\b|\b403\b|unauthorized|forbidden|access denied/i,
    decision: "page_human",
    confidence: 0.91,
    reason: "Auth or permission was denied.",
  },
  {
    match: /\b400\b|bad request|\b422\b|unprocessable/i,
    decision: "dead_letter",
    confidence: 0.92,
    reason: "The request was rejected as invalid.",
  },
  {
    match: /messagerejected|invalid whatsapp|not a valid whatsapp|invalid phone number/i,
    decision: "dead_letter",
    confidence: 0.96,
    reason: "The provider rejected the recipient or message.",
  },
  {
    match: /missing dispatch|dispatchid.*not found|dispatch not found|unknown dispatch/i,
    decision: "dead_letter",
    confidence: 0.97,
    reason: "The dispatch record is missing or unknown.",
  },
  {
    match: /blocked the bot|bot was blocked|user has blocked|chat not found|bot not started/i,
    decision: "dead_letter",
    confidence: 0.9,
    reason: "The channel is blocked or not reachable.",
  },
  {
    match: /empty response from wati/i,
    decision: "page_human",
    confidence: 0.88,
    reason: "WATI returned an empty auth response.",
  },
  {
    match: /ETIMEDOUT|timed out|timeout/i,
    decision: "retry_later",
    delayMs: 5_000,
    confidence: 0.9,
    reason: "The call timed out.",
  },
  {
    match: /ECONNRESET|ECONNREFUSED|connection reset/i,
    decision: "retry_now",
    confidence: 0.91,
    reason: "The connection was reset.",
  },
  {
    match: /\b5\d\d\b|internal server error/i,
    decision: "retry_later",
    delayMs: 10_000,
    confidence: 0.86,
    reason: "Upstream returned a 5xx error.",
  },
  {
    match: /malformed json|unexpected token|invalid json/i,
    decision: "dead_letter",
    confidence: 0.95,
    reason: "The payload is malformed JSON.",
  },
  {
    match: /schema|validation|null field/i,
    decision: "dead_letter",
    confidence: 0.94,
    reason: "The payload failed validation.",
  },
  {
    match: /expired auth|token expired|AUTH_EXPIRED|invalid_grant/i,
    decision: "retry_now",
    confidence: 0.88,
    reason: "Auth expired and can be refreshed.",
  },
  {
    match: /duplicate transaction|duplicate id|DUPLICATE_TXN|already exists/i,
    decision: "page_human",
    confidence: 0.9,
    reason: "A duplicate id needs a person.",
  },
  {
    match: /hmac|invalid signature|signature mismatch/i,
    decision: "page_human",
    confidence: 0.92,
    reason: "The signature check failed.",
  },
]

function haystack(input: Failure): string {
  return [input.errorCode, input.errorName, input.errorMessage].filter(Boolean).join(" ")
}

function matches(rule: Rule, input: Failure): boolean {
  if (typeof rule.match === "function") return rule.match(input)
  const flags = rule.match.flags.replace("g", "")
  return new RegExp(rule.match.source, flags).test(haystack(input))
}

function assertConfidence(confidence: number): void {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`Rule confidence must be between 0 and 1. Received ${String(confidence)}.`)
  }
}

export class RulesProvider implements Classifier {
  private readonly rules: Rule[]
  private readonly providerName: string

  constructor(options: RulesProviderOptions = {}) {
    for (const rule of options.rules ?? []) {
      if (rule.confidence !== undefined) assertConfidence(rule.confidence)
      if (rule.delayMs !== undefined && (!Number.isFinite(rule.delayMs) || rule.delayMs < 0)) {
        throw new Error(`Rule delayMs must be 0 or more. Received ${String(rule.delayMs)}.`)
      }
    }
    this.rules = [...(options.rules ?? []), ...BUILTIN_RULES]
    this.providerName = options.providerName ?? "rules"
  }

  async classify(input: Failure): Promise<Result> {
    const started = performance.now()
    const rule = this.rules.find((candidate) => matches(candidate, input))
    const latencyMs = Math.max(0, Math.round(performance.now() - started))

    if (!rule) {
      return {
        decision: "page_human",
        confidence: 0.5,
        reason: "No rule matched this error.",
        latencyMs,
        provider: this.providerName,
      }
    }

    const confidence = rule.confidence ?? 0.9
    return {
      decision: rule.decision,
      confidence,
      reason: rule.reason ?? `Matched a ${rule.decision} rule.`,
      latencyMs,
      provider: this.providerName,
      delayMs: rule.delayMs,
    }
  }
}
