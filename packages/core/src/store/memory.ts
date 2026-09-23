import type { DecisionRecord, DecisionStore } from "./types.js"

export class MemoryDecisionStore implements DecisionStore {
  private readonly records: DecisionRecord[] = []

  constructor(private readonly max = 500) {
    if (!Number.isInteger(max) || max <= 0) {
      throw new Error(`MemoryDecisionStore max must be a positive whole number. Received ${String(max)}.`)
    }
  }

  async append(record: DecisionRecord): Promise<void> {
    this.records.unshift(record)
    if (this.records.length > this.max) this.records.length = this.max
  }

  async recent(limit = 50): Promise<DecisionRecord[]> {
    return this.records.slice(0, limit)
  }
}
