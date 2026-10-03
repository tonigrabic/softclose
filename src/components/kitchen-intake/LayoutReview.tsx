'use client'

import { motion } from 'framer-motion'
import { useTranslations } from '@/lib/i18n'
import type { FloorPlan } from '@/lib/floor-plan'
import { FloorPlanEditor, ShapePicker } from './floor-plan-editor'
import { LengthField } from './RoomStep'
import { CEILING_MAX_CM, CEILING_MIN_CM, parseCeilingCm, withCeiling } from '@/lib/floor-plan'

/**
 * Post-render layout review — the home of the floor-plan editor after the
 * funnel⇄builder merge. The layout is the plan the room step committed (the
 * measured room plus the intent; see `lib/derive-layout.ts`), seeded into
 * `floorPlan` by the parent — never read back from the render. Here the
 * homeowner adjusts dimensions, walls, openings, the island and appliance
 * placement against their actual space, then the step's footer Continue
 * freezes the plan and locks the contract the builder prices from.
 *
 * No photo upload here (that's the anchor-only step 1). When there's no plan
 * yet (render still loading, or photos+render both skipped) we fall back to the
 * shape picker so the homeowner can always start somewhere.
 */
export function LayoutReview({
  floorPlan,
  onFloorPlanChange,
  anchorPhotoUrl,
  isLoading = false,
}: {
  floorPlan: FloorPlan | null
  onFloorPlanChange: (plan: FloorPlan | null) => void
  /** The chosen render (preferred) or anchor photo, shown under the editor. */
  anchorPhotoUrl?: string
  /** True while the render vision pass is still deriving the layout. */
  isLoading?: boolean
}) {
  const { t } = useTranslations()

  if (!floorPlan && isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card/40 px-5 py-8 text-center"
        role="status"
        aria-live="polite"
      >
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="size-2 rounded-full bg-primary/60"
              animate={{ y: [0, -8, 0], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 0.65, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
            />
          ))}
        </div>
        <p className="text-sm font-medium text-foreground">{t('layoutReview.loading')}</p>
      </motion.div>
    )
  }

  if (!floorPlan) {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <ShapePicker onPick={(plan) => onFloorPlanChange(plan)} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('space.editor.title')}
      </p>
      <FloorPlanEditor
        initialPlan={floorPlan}
        anchorPhotoUrl={anchorPhotoUrl}
        onChange={(p) => onFloorPlanChange(p)}
      />
      {/* Ceiling height — drives tall-unit material in the BOM. Typed is the
          homeowner's; nothing is clamped silently (a clamped number could not
          honestly read "izmjereno"). */}
      <LengthField
        id="confirm-ceiling"
        label={t('room.ceiling.label')}
        initialCm={floorPlan.ceilingSource === 'homeowner' ? floorPlan.ceilingHeightCm : undefined}
        hintCm={floorPlan.ceilingSource !== 'homeowner' && floorPlan.ceilingHeightCm ? floorPlan.ceilingHeightCm : null}
        parse={parseCeilingCm}
        rangeError={t('room.ceiling.range').replace('{min}', String(CEILING_MIN_CM)).replace('{max}', String(CEILING_MAX_CM))}
        unmeasuredNote={t('room.ceiling.unmeasured')}
        onValue={(cm) => {
          if (cm == null && floorPlan.ceilingSource !== 'homeowner') return
          onFloorPlanChange(cm == null ? { ...floorPlan, ceilingSource: undefined } : withCeiling(floorPlan, cm))
        }}
      />
    </div>
  )
}
