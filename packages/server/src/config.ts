import { readFileSync } from "node:fs"
import { z } from "zod"
import {
  HttpProvider,
  JevProvider,
  JsonlDecisionStore,
  MemoryDecisionStore,
  RulesProvider,
  formatZodError,
  parsePolicyConfig,
  type Classifier,
  type DecisionStore,
  type PolicyOptions,
} from "@devleo10/nightwatch-core"

const fileSchema = z
  .object({
    port: z.number().int().positive().optional(),
    apiKey: z.string().min(1).optional(),
    classifier: z.enum(["rules", "http", "jev"]).optional(),
    httpUrl: z.string().url().optional(),
    headers: z.record(z.string()).optional(),
    timeoutMs: z.number().int().positive().optional(),
    policy: z.unknown().optional(),
    decisionLog: z.string().min(1).optional(),
  })
  .strict()

export type ServerConfig = {
  port: number
  apiKey?: string
  classifier: Classifier
  policy: PolicyOptions
  store: DecisionStore
}

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback
  if (value === "true") return true
  if (value === "false") return false
  throw new Error(`Expected true or false. Received "${value}".`)
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const filePath = env.TRIAGE_CONFIG
  let file: z.infer<typeof fileSchema> = {}
  if (filePath) {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(filePath, "utf8"))
    } catch (error) {
      const message = error instanceof Error ? error.message : "could not read the file"
      throw new Error(`Could not read TRIAGE_CONFIG at ${filePath}. ${message}`)
    }
    const parsed = fileSchema.safeParse(raw)
    if (!parsed.success) {
      throw new Error(`Invalid TRIAGE_CONFIG. ${formatZodError(parsed.error)}`)
    }
    file = parsed.data
  }

  const classifierName = env.TRIAGE_CLASSIFIER ?? file.classifier ?? "rules"
  if (!["rules", "http", "jev"].includes(classifierName)) {
    throw new Error(
      `TRIAGE_CLASSIFIER must be rules, http, or jev. Received "${classifierName}".`,
    )
  }

  const httpUrl = env.TRIAGE_HTTP_URL ?? file.httpUrl
  let headers = file.headers ?? {}
  if (env.TRIAGE_HTTP_HEADERS) {
    try {
      const parsed = JSON.parse(env.TRIAGE_HTTP_HEADERS) as unknown
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("headers must be a JSON object of strings")
      }
      headers = Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => {
          if (typeof value !== "string") throw new Error(`header ${key} must be a string`)
          return [key, value]
        }),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid JSON"
      throw new Error(`TRIAGE_HTTP_HEADERS is invalid. ${message}`)
    }
  }

  const timeoutMs = env.TRIAGE_TIMEOUT_MS ? Number(env.TRIAGE_TIMEOUT_MS) : file.timeoutMs
  let classifier: Classifier
  if (classifierName === "rules") {
    classifier = new RulesProvider()
  } else if (classifierName === "http") {
    if (!httpUrl) throw new Error("Set TRIAGE_HTTP_URL when TRIAGE_CLASSIFIER is http.")
    classifier = new HttpProvider({ url: httpUrl, headers, timeoutMs })
  } else {
    if (!httpUrl) throw new Error("Set TRIAGE_HTTP_URL when TRIAGE_CLASSIFIER is jev.")
    console.warn(
      "Jev request and response mapping is still a TODO. /classify will fail closed until you pass map functions. See docs/providers.md.",
    )
    classifier = new JevProvider({ url: httpUrl, headers, timeoutMs })
  }

  const policyInput: Record<string, unknown> = {
    ...(file.policy && typeof file.policy === "object" ? file.policy : {}),
  }
  if (env.TRIAGE_MIN_CONFIDENCE) policyInput.minConfidence = Number(env.TRIAGE_MIN_CONFIDENCE)
  if (env.TRIAGE_MAX_AUTO_RETRIES) policyInput.maxAutoRetries = Number(env.TRIAGE_MAX_AUTO_RETRIES)
  if (env.TRIAGE_TIMEOUT_MS) policyInput.timeoutMs = Number(env.TRIAGE_TIMEOUT_MS)
  if (env.TRIAGE_DRY_RUN) policyInput.dryRun = readBool(env.TRIAGE_DRY_RUN, true)
  if (env.TRIAGE_NEVER_AUTO_HANDLE) {
    policyInput.neverAutoHandle = env.TRIAGE_NEVER_AUTO_HANDLE.split(",").map((item) => item.trim()).filter(Boolean)
  }

  const policy = parsePolicyConfig(policyInput)
  const port = env.PORT ? Number(env.PORT) : file.port ?? 4000
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive whole number. Received ${String(env.PORT ?? file.port)}.`)
  }

  const decisionLog = env.TRIAGE_DECISION_LOG ?? file.decisionLog
  const store = decisionLog ? new JsonlDecisionStore(decisionLog) : new MemoryDecisionStore()

  return {
    port,
    apiKey: env.TRIAGE_API_KEY ?? file.apiKey,
    classifier,
    policy,
    store,
  }
}
