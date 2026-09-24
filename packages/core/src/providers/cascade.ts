import { ClassifierError, errorMessage, withTimeout } from "../errors.js"
import type { Classifier, Failure, Result } from "../types.js"

export type CascadeProviderOptions = {
  below?: number
  timeoutMs?: number
}

export class CascadeProvider implements Classifier {
  private readonly providers: Classifier[]
  private readonly below: number
  private readonly timeoutMs: number
  readonly suggestedTimeoutMs: number

  constructor(providers: Classifier[], options: CascadeProviderOptions = {}) {
    if (providers.length === 0) {
      throw new Error("CascadeProvider needs at least one provider.")
    }
    const below = options.below ?? 0.8
    if (!Number.isFinite(below) || below < 0 || below > 1) {
      throw new Error(`CascadeProvider below must be between 0 and 1. Received ${String(options.below)}.`)
    }
    const timeoutMs = options.timeoutMs ?? 8000
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error(
        `CascadeProvider timeoutMs must be a positive whole number. Received ${String(options.timeoutMs)}.`,
      )
    }
    this.providers = [...providers]
    this.below = below
    this.timeoutMs = timeoutMs
    this.suggestedTimeoutMs = timeoutMs * providers.length + 500
  }

  async classify(input: Failure): Promise<Result> {
    const errors: string[] = []
    let last: Result | null = null
    let latencyMs = 0
    for (const provider of this.providers) {
      try {
        const result = await withTimeout(provider.classify(input), this.timeoutMs)
        latencyMs += result.latencyMs
        if (result.confidence >= this.below) return { ...result, latencyMs }
        last = result
      } catch (error) {
        errors.push(errorMessage(error))
      }
    }
    if (last) return { ...last, latencyMs }
    throw new ClassifierError(`All providers failed. ${errors.join(" | ")}`)
  }
}
