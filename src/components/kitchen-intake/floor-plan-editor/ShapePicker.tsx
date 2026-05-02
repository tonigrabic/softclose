'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { fromShapePreset, renderFloorPlanSvg, type LayoutShape, type FloorPlan } from '@/lib/floor-plan'
import { cn } from '@/lib/utils'

const SHAPE_OPTIONS: { value: LayoutShape; label: string; description: string }[] = [
  { value: 'galley', label: 'Galley', description: 'Two parallel runs.' },
  { value: 'l_shape', label: 'L-shape', description: 'Two adjacent walls.' },
  { value: 'u_shape', label: 'U-shape', description: 'Three walls, one end open.' },
  { value: 'island', label: 'Island', description: 'One run plus a free-standing island.' },
  { value: 'peninsula', label: 'Peninsula', description: 'L or U with an attached run.' },
  { value: 'open', label: 'Open plan', description: 'Open to dining or living.' },
]

interface ShapePickerProps {
  /** Called once the user picks a shape. Editor will hand back a FloorPlan. */
  onPick: (plan: FloorPlan) => void
  className?: string
}

/**
 * One-tap visual chooser for the layout shape. Used when the homeowner
 * skipped photos — gives us enough to bootstrap a FloorPlan they can
 * then refine in the editor.
 */
export function ShapePicker({ onPick, className }: ShapePickerProps) {
  const [hovered, setHovered] = useState<LayoutShape | null>(null)
  return (
    <div className={cn('space-y-4', className)}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Quick start
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick the closest shape — you&apos;ll fine-tune it in a sec.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {SHAPE_OPTIONS.map((opt) => {
          const preview = fromShapePreset(opt.value, { hasIsland: opt.value === 'island' })
          const svg = renderFloorPlanSvg(preview, { showDimensions: false, showDisclaimer: false })
          return (
            <motion.button
              key={opt.value}
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onPick(preview)}
              onMouseEnter={() => setHovered(opt.value)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                'flex flex-col items-stretch overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-colors',
                hovered === opt.value ? 'border-primary/60' : 'border-border'
              )}
            >
              <div className="aspect-[3/2] bg-background" dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="border-t border-border/70 px-3 py-2">
                <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                <p className="text-[11px] text-muted-foreground">{opt.description}</p>
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
