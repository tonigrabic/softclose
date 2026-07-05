'use client'

import { motion } from 'framer-motion'
import { useTranslations } from '@/lib/i18n'
import type { FloorPlan } from '@/lib/floor-plan'
import { FloorPlanEditor, ShapePicker } from './floor-plan-editor'

/**
 * Post-render layout review — the home of the floor-plan editor after the
 * funnel⇄builder merge. The layout is DERIVED FROM THE AI RENDER (render
 * configuration over photo scale; see `lib/derive-layout.ts`) and seeded into
 * `floorPlan` by the parent. Here the homeowner adjusts dimensions, walls,
 * openings, the island and appliance placement against their actual space —
 * the safety net for any render mis-read — then the step's footer Continue
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
      {/* Ceiling height — drives tall-unit material in the BOM. */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{t('space.ceiling.title')}</p>
          <p className="text-[11px] text-muted-foreground">
            {floorPlan.ceilingHeightCm ? t('space.ceiling.aiEstimate') : t('space.ceiling.prompt')}
          </p>
        </div>
        <div className="flex items-center overflow-hidden rounded-lg border border-border bg-background focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/20">
          <input
            type="number"
            inputMode="numeric"
            min={220}
            max={360}
            placeholder="280"
            value={floorPlan.ceilingHeightCm ?? ''}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              onFloorPlanChange({
                ...floorPlan,
                ceilingHeightCm:
                  Number.isFinite(n) && n > 0 ? Math.max(220, Math.min(360, n)) : undefined,
              })
            }}
            className="w-20 bg-transparent px-2.5 py-1.5 text-right text-[13px] tabular-nums text-foreground placeholder:text-muted-foreground/40 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="shrink-0 pr-2.5 text-[11px] text-muted-foreground/60">cm</span>
        </div>
      </div>
    </div>
  )
}
