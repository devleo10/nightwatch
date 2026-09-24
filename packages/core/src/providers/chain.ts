import { ClassifierError, errorMessage, withTimeout } from "../errors.js"
import type { Classifier, Failure, Result } from "../types.js"

export type ChainProviderOptions = {
  timeoutMs?: number
}

export class ChainProvider implements Classifier {
  private readonly providers: Classifier[]
  private readonly timeoutMs: number
  readonly suggestedTimeoutMs: number

  constructor(providers: Classifier[], options: ChainProviderOptions = {}) {
    if (providers.length === 0) {
      throw new Error("ChainProvider needs at least one provider.")
    }
    const timeoutMs = options.timeoutMs ?? 1500
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error(
        `ChainProvider timeoutMs must be a positive whole number. Received ${String(options.timeoutMs)}.`,
      )
    }
    this.providers = [...providers]
    this.timeoutMs = timeoutMs
    this.suggestedTimeoutMs = timeoutMs * providers.length + 500
  }

  async classify(input: Failure): Promise<Result> {
    const errors: string[] = []
    for (const provider of this.providers) {
      try {
        return await withTimeout(provider.classify(input), this.timeoutMs)
      } catch (error) {
        errors.push(errorMessage(error))
      }
    }
    throw new ClassifierError(`All providers failed. ${errors.join(" | ")}`)
  }
}
