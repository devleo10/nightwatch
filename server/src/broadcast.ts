import type { FailureEvent } from "@queue-triage/shared"

type Listener = (event: FailureEvent) => void

const listeners = new Set<Listener>()

export function publish(event: FailureEvent) {
  for (const listener of listeners) listener(event)
}

export function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
