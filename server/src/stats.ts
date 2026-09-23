import type { Speed, Stats } from "@queue-triage/shared"
import { classifierProvider } from "./classifier.js"

type MutableStats = {
  totalFailures: number
  autoResolved: number
  escalated: number
  deadLettered: number
  latencySum: number
  producerRunning: boolean
  speed: Speed
}

const state: MutableStats = {
  totalFailures: 0,
  autoResolved: 0,
  escalated: 0,
  deadLettered: 0,
  latencySum: 0,
  producerRunning: true,
  speed: "normal",
}

export function recordFailure(latencyMs: number, outcome: "auto" | "escalated" | "dead_letter") {
  state.totalFailures += 1
  state.latencySum += latencyMs
  if (outcome === "escalated") state.escalated += 1
  if (outcome === "auto") state.autoResolved += 1
  if (outcome === "dead_letter") {
    state.autoResolved += 1
    state.deadLettered += 1
  }
}

export function setProducerRunning(running: boolean) {
  state.producerRunning = running
}

export function setSpeed(speed: Speed) {
  state.speed = speed
}

export function getSpeed(): Speed {
  return state.speed
}

export function isProducerRunning(): boolean {
  return state.producerRunning
}

export function snapshot(): Stats {
  const average =
    state.totalFailures === 0 ? 0 : Math.round(state.latencySum / state.totalFailures)
  return {
    totalFailures: state.totalFailures,
    autoResolved: state.autoResolved,
    escalated: state.escalated,
    deadLettered: state.deadLettered,
    averageLatencyMs: average,
    provider: classifierProvider(),
    producerRunning: state.producerRunning,
    speed: state.speed,
  }
}
