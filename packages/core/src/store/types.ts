import type { Failure, Result } from "../types.js"
import type { PolicyOutcome } from "../policy.js"

export type DecisionRecord = {
  id: string
  timestamp: string
  input: Failure
  result: Result | null
  policy: PolicyOutcome
  applied: boolean
}

export interface DecisionStore {
  append(record: DecisionRecord): Promise<void>
  recent(limit?: number): Promise<DecisionRecord[]>
}

export async function readRecentDecisions(
  store: DecisionStore,
  limit = 50,
): Promise<DecisionRecord[]> {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`limit must be a positive whole number. Received ${String(limit)}.`)
  }
  return store.recent(limit)
}
