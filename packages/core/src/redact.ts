import type { Failure } from "./types.js"

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function redactValue(value: unknown, keys: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((item) => redactValue(item, keys))
  if (!value || typeof value !== "object") return value

  const output: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value)) {
    output[key] = keys.includes(key) ? "[redacted]" : redactValue(nested, keys)
  }
  return output
}

export function redactText(text: string, keys: readonly string[]): string {
  let output = text
  for (const key of keys) {
    const escaped = escapeRegExp(key)
    output = output.replace(
      new RegExp(`("${escaped}"\\s*:\\s*)"(?:\\\\.|[^"\\\\])*"`, "g"),
      `$1"[redacted]"`,
    )
    output = output.replace(new RegExp(`(${escaped}\\s*[:=]\\s*)\\S+`, "g"), `$1[redacted]`)
  }
  return output
}

export function redactFailure(failure: Failure, keys: readonly string[]): Failure {
  if (keys.length === 0) return failure
  return {
    ...failure,
    payloadSummary: failure.payloadSummary ? redactText(failure.payloadSummary, keys) : undefined,
    metadata: failure.metadata
      ? (redactValue(failure.metadata, keys) as Record<string, unknown>)
      : undefined,
  }
}
