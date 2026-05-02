'use client'

import { renderFloorPlanSvg, hasFloorPlanInput, type FloorPlanInput } from '@/lib/floor-plan'
import { cn } from '@/lib/utils'

interface FloorPlanSchematicProps {
  input: FloorPlanInput
  className?: string
}

export function FloorPlanSchematic({ input, className }: FloorPlanSchematicProps) {
  if (!hasFloorPlanInput(input)) return null
  const svg = renderFloorPlanSvg(input)
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-sm',
        className
      )}
      aria-label="Schematic floor plan"
    >
      <div
        className="w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <p className="mt-2 px-1 text-[11px] text-muted-foreground">
        Rough schematic from what you shared — your designer will measure on site.
      </p>
    </div>
  )
}
