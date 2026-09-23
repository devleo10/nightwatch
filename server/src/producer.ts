import type { JobPayload, Speed } from "@queue-triage/shared"
import { payloadSummary, pickAttempt, pickFailure, pickJobName } from "./errors.js"
import { queue } from "./queue.js"
import { getSpeed, isProducerRunning, setProducerRunning, setSpeed } from "./stats.js"

const FAIL_RATE = 0.4

let timer: NodeJS.Timeout | null = null

function nextDelay(speed: Speed): number {
  if (speed === "fast") return 80 + Math.floor(Math.random() * 81)
  return 300 + Math.floor(Math.random() * 501)
}

export async function enqueueJob() {
  const jobName = pickJobName()
  const shouldFail = Math.random() < FAIL_RATE
  const failure = shouldFail ? pickFailure(jobName) : undefined
  const data: JobPayload = {
    jobName,
    shouldFail,
    errorCode: failure?.code,
    errorMessage: failure?.message,
    attemptNumber: pickAttempt(),
    payloadSummary: payloadSummary(jobName),
  }

  await queue.add(jobName, data)
}

function schedule() {
  if (timer) clearTimeout(timer)
  if (!isProducerRunning()) return
  timer = setTimeout(() => {
    void enqueueJob()
      .catch((error: unknown) => {
        console.error("Failed to enqueue job", error)
      })
      .finally(schedule)
  }, nextDelay(getSpeed()))
}

export function startProducer() {
  setProducerRunning(true)
  if (!timer) schedule()
}

export function pauseProducer() {
  setProducerRunning(false)
  if (timer) clearTimeout(timer)
  timer = null
}

export function setProducerSpeed(speed: Speed) {
  setSpeed(speed)
  if (!isProducerRunning()) return
  if (timer) clearTimeout(timer)
  timer = null
  schedule()
}
