'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { fromShapePreset, renderFloorPlanSvg, type LayoutShape, type FloorPlan } from '@/lib/floor-plan'
import { useTranslations } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// Labels are layout.shape.*, descriptions floorPlan.shape.*.description.
const SHAPE_OPTIONS: Exclude<LayoutShape, 'unsure'>[] = ['galley', 'l_shape', 'u_shape', 'island', 'peninsula', 'open']

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
  const { t, locale } = useTranslations()
  const [hovered, setHovered] = useState<LayoutShape | null>(null)
  return (
    <div className={cn('space-y-4', className)}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {t('floorPlan.shapePicker.eyebrow')}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{t('floorPlan.shapePicker.hint')}</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {SHAPE_OPTIONS.map((shape) => {
          const preview = fromShapePreset(shape, { hasIsland: shape === 'island' })
          const svg = renderFloorPlanSvg(preview, { showDimensions: false, showDisclaimer: false, locale })
          return (
            <motion.button
              key={shape}
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onPick(preview)}
              onMouseEnter={() => setHovered(shape)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                'flex flex-col items-stretch overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-colors',
                hovered === shape ? 'border-primary/60' : 'border-border'
              )}
            >
              <div className="aspect-[3/2] bg-background" dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="border-t border-border/70 px-3 py-2">
                <p className="text-sm font-semibold text-foreground">{t(`layout.shape.${shape}`)}</p>
                <p className="text-[11px] text-muted-foreground">{t(`floorPlan.shape.${shape}.description`)}</p>
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
