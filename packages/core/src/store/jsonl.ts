import { appendFile, mkdir, readFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { DecisionRecord, DecisionStore } from "./types.js"

export class JsonlDecisionStore implements DecisionStore {
  constructor(private readonly filePath: string) {
    if (!filePath) throw new Error("JsonlDecisionStore requires a file path.")
  }

  async append(record: DecisionRecord): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8")
  }

  async recent(limit = 50): Promise<DecisionRecord[]> {
    let text = ""
    try {
      text = await readFile(this.filePath, "utf8")
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return []
      throw error
    }

    const lines = text.split("\n").filter((line) => line.length > 0)
    return lines
      .slice(-limit)
      .reverse()
      .map((line) => JSON.parse(line) as DecisionRecord)
  }
}
