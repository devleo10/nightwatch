import express, { type Express, type NextFunction, type Request, type Response } from "express"
import { z } from "zod"
import {
  applyPolicy,
  failureSchema,
  formatZodError,
  readRecentDecisions,
  resolvePolicy,
  withTimeout,
  type Classifier,
  type DecisionStore,
  type PolicyOptions,
  type Result,
} from "@devleo10/nightwatch-classifier"

export type TriageServerOptions = {
  classifier: Classifier
  policy?: PolicyOptions
  store?: DecisionStore
  apiKey?: string
}

const classifyBodySchema = z.object({
  failure: failureSchema,
  autoRetries: z.number().int().min(0).optional(),
})

function unauthorized(req: Request, apiKey: string | undefined): boolean {
  if (!apiKey) return false
  const header = req.header("authorization") ?? ""
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : ""
  const presented = bearer || req.header("x-api-key") || ""
  return presented !== apiKey
}

export function createTriageApp(options: TriageServerOptions): Express {
  resolvePolicy(options.policy)
  const app = express()
  app.use(express.json({ limit: "256kb" }))

  app.get("/health", (_req, res) => {
    res.json({ ok: true })
  })

  app.use((req, res, next) => {
    if (!unauthorized(req, options.apiKey)) {
      next()
      return
    }
    res.status(401).json({ error: "Missing or invalid API key. Send Authorization: Bearer <key> or x-api-key." })
  })

  app.post("/classify", async (req, res, next) => {
    try {
      const parsed = classifyBodySchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: `Invalid classify body. ${formatZodError(parsed.error)}` })
        return
      }

      const policy = resolvePolicy(options.policy)
      let result: Result | null = null
      let classifierError: unknown
      try {
        result = await withTimeout(options.classifier.classify(parsed.data.failure), policy.timeoutMs)
      } catch (error) {
        classifierError = error
      }

      const outcome = applyPolicy({
        failure: parsed.data.failure,
        result,
        options: options.policy,
        autoRetries: parsed.data.autoRetries ?? 0,
        classifierError,
      })

      if (options.store) {
        await options.store.append({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          input: parsed.data.failure,
          result,
          policy: outcome,
          applied: outcome.applied,
        })
      }

      res.json({ result, policy: outcome })
    } catch (error) {
      next(error)
    }
  })

  app.get("/decisions", async (req, res, next) => {
    try {
      const limit = req.query.limit === undefined ? 50 : Number(req.query.limit)
      if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
        res.status(400).json({ error: "limit must be a whole number from 1 to 500." })
        return
      }
      const decisions = options.store ? await readRecentDecisions(options.store, limit) : []
      res.json({ decisions })
    } catch (error) {
      next(error)
    }
  })

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected server error."
    res.status(500).json({ error: message })
  })

  return app
}

export function startTriageServer(options: TriageServerOptions & { port: number }) {
  const app = createTriageApp(options)
  return app.listen(options.port, () => {
    console.log(`nightwatch listening on http://localhost:${options.port}`)
  })
}
