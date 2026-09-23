"use client"

import { useAnimatedNumber } from "@/hooks/use-animated-number"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export function StatCard({
  label,
  value,
  suffix,
  detail,
  accent,
}: {
  label: string
  value: number
  suffix?: string
  detail?: string
  accent: string
}) {
  const animated = useAnimatedNumber(value)
  const shown = Number.isFinite(animated) ? Math.round(animated) : 0

  return (
    <Card className="relative overflow-hidden bg-card/80 py-0 ring-white/10 backdrop-blur-sm">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accent}`} />
      <CardHeader className="pt-4 pb-0">
        <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          {label}
        </p>
      </CardHeader>
      <CardContent className="pt-2 pb-4">
        <p className="font-mono text-4xl font-medium tracking-tight tabular-nums">
          {shown.toLocaleString()}
          {suffix ? (
            <span className="ml-1 text-lg font-normal text-muted-foreground">{suffix}</span>
          ) : null}
        </p>
        {detail ? <p className="mt-1 font-mono text-xs text-muted-foreground">{detail}</p> : null}
      </CardContent>
    </Card>
  )
}
