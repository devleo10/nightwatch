import { z } from "zod"
import { ClassifierError } from "../errors.js"
import { DECISIONS, formatZodError, type Classifier, type Failure, type Result } from "../types.js"

const responseSchema = z.object({
  decision: z.enum(DECISIONS),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  latencyMs: z.number().nonnegative().optional(),
  provider: z.string().min(1).optional(),
  delayMs: z.number().nonnegative().optional(),
})

export type HttpProviderOptions = {
  url: string
  headers?: Record<string, string>
  timeoutMs?: number
  providerName?: string
  fetchImpl?: typeof fetch
  serialize?: (input: Failure) => unknown
  parse?: (body: unknown, input: Failure, latencyMs: number) => Result
}

export class HttpProvider implements Classifier {
  private readonly options: HttpProviderOptions

  constructor(options: HttpProviderOptions) {
    if (!options.url) throw new Error("HttpProvider requires a url.")
    const timeoutMs = options.timeoutMs ?? 1500
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error(`HttpProvider timeoutMs must be a positive whole number. Received ${String(options.timeoutMs)}.`)
    }
    this.options = { ...options, timeoutMs }
  }

  async classify(input: Failure): Promise<Result> {
    const started = performance.now()
    const timeoutMs = this.options.timeoutMs ?? 1500
    const fetchImpl = this.options.fetchImpl ?? fetch
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const body = this.options.serialize ? this.options.serialize(input) : input
      const response = await fetchImpl(this.options.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...this.options.headers,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new ClassifierError(
          `Classifier HTTP ${response.status} from ${this.options.url}. Expected a Result JSON body.`,
        )
      }

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        throw new ClassifierError(`Classifier response from ${this.options.url} was not JSON.`)
      }

      const latencyMs = Math.max(0, Math.round(performance.now() - started))
      if (this.options.parse) return this.options.parse(payload, input, latencyMs)

      const parsed = responseSchema.safeParse(payload)
      if (!parsed.success) {
        throw new ClassifierError(
          `Classifier response was not a valid Result. ${formatZodError(parsed.error)}`,
        )
      }

      return {
        decision: parsed.data.decision,
        confidence: parsed.data.confidence,
        reason: parsed.data.reason,
        latencyMs: parsed.data.latencyMs ?? latencyMs,
        provider: parsed.data.provider ?? this.options.providerName ?? "http",
        delayMs: parsed.data.delayMs,
      }
    } catch (error) {
      if (error instanceof ClassifierError) throw error
      if (error instanceof Error && error.name === "AbortError") {
        throw new ClassifierError(`Classifier HTTP call timed out after ${timeoutMs}ms.`)
      }
      throw new ClassifierError(
        error instanceof Error ? error.message : "Classifier HTTP call failed.",
        { cause: error },
      )
    } finally {
      clearTimeout(timer)
    }
  }
}
