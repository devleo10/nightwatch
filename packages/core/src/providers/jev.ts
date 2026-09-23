import type { Classifier, Failure, Result } from "../types.js"
import { HttpProvider, type HttpProviderOptions } from "./http.js"

export type JevMapper = {
  toRequest: (input: Failure) => unknown
  fromResponse: (body: unknown, input: Failure, latencyMs: number) => Result
}

/**
 * TODO(jev): Map a Failure to the TypeSafe Jev request body.
 * Do not guess the API format. Replace this function once you have API access,
 * or pass `map.toRequest` to JevProvider.
 */
export function toJevRequest(_input: Failure): unknown {
  throw new Error(
    "Jev request mapping is not implemented. Pass map.toRequest to JevProvider, or replace toJevRequest. See docs/providers.md.",
  )
}

/**
 * TODO(jev): Map the TypeSafe Jev response body to a Result.
 * Do not guess the API format. Replace this function once you have API access,
 * or pass `map.fromResponse` to JevProvider.
 */
export function fromJevResponse(_body: unknown, _input: Failure, _latencyMs: number): Result {
  throw new Error(
    "Jev response mapping is not implemented. Pass map.fromResponse to JevProvider, or replace fromJevResponse. See docs/providers.md.",
  )
}

export type JevProviderOptions = {
  url: string
  headers?: Record<string, string>
  timeoutMs?: number
  fetchImpl?: typeof fetch
  map?: Partial<JevMapper>
}

export class JevProvider implements Classifier {
  private readonly http: HttpProvider

  constructor(options: JevProviderOptions) {
    const httpOptions: HttpProviderOptions = {
      url: options.url,
      headers: options.headers,
      timeoutMs: options.timeoutMs,
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
