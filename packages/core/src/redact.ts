import type { Failure } from "./types.js"

export const REDACT_PATTERNS = {
  email: /[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[a-z]{2,}/gi,
  phone: /(?<![\w.:-])(?!\d{4}-\d{2}-\d{2})[+-]?\(?(?=(?:\d[\s()-]{0,2}){10,15}(?!\d))(?:\d[\s()-]{0,2}){9,14}\d(?![\d.:])/g,
  longNumber: /-?\b\d{6,}\b/g,
} as const

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function applyPatterns(text: string, patterns: readonly RegExp[]): string {
  let output = text
  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
    output = output.replace(new RegExp(pattern.source, flags), "[redacted]")
  }
  return output
}

export function redactValue(value: unknown, keys: readonly string[], patterns: readonly RegExp[] = []): unknown {
  if (typeof value === "string") return patterns.length > 0 ? applyPatterns(value, patterns) : value
  if (Array.isArray(value)) return value.map((item) => redactValue(item, keys, patterns))
  if (!value || typeof value !== "object") return value

  const output: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value)) {
    output[key] = keys.includes(key) ? "[redacted]" : redactValue(nested, keys, patterns)
  }
  return output
}

export function redactText(text: string, keys: readonly string[], patterns: readonly RegExp[] = []): string {
  let output = text
  for (const key of keys) {
    const escaped = escapeRegExp(key)
    output = output.replace(
      new RegExp(`("${escaped}"\\s*:\\s*)"(?:\\\\.|[^"\\\\])*"`, "g"),
      `$1"[redacted]"`,
    )
    output = output.replace(
      new RegExp(`("${escaped}"\\s*:\\s*)-?\\d+(?:\\.\\d+)?(?=\\s*[,}\\]])`, "g"),
      `$1[redacted]`,
    )
    output = output.replace(new RegExp(`(${escaped}\\s*[:=]\\s*)-?\\d+(?:\\.\\d+)?`, "g"), `$1[redacted]`)
    output = output.replace(new RegExp(`(${escaped}\\s*[:=]\\s*)\\S+`, "g"), `$1[redacted]`)
  }
  return applyPatterns(output, patterns)
}

export function redactFailure(failure: Failure, keys: readonly string[], patterns: readonly RegExp[] = []): Failure {
  if (keys.length === 0 && patterns.length === 0) return failure
  return {
    ...failure,
    errorMessage: redactText(failure.errorMessage, keys, patterns),
    payloadSummary: failure.payloadSummary ? redactText(failure.payloadSummary, keys, patterns) : undefined,
    metadata: failure.metadata
      ? (redactValue(failure.metadata, keys, patterns) as Record<string, unknown>)
      : undefined,
  }
}
