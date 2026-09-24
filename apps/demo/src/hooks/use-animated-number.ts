"use client"

import { useEffect, useRef, useState } from "react"

export function useAnimatedNumber(value: number, duration = 480) {
  const [display, setDisplay] = useState(value)
  const displayRef = useRef(value)

  useEffect(() => {
    const from = displayRef.current
    if (from === value) return

    const start = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - progress) ** 3
      const next = from + (value - from) * eased
      displayRef.current = next
      setDisplay(next)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return display
}
