'use client'

import { renderFloorPlanSvg, type FloorPlan, type SvgRenderMode } from '@/lib/floor-plan'
import { useTranslations } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface FloorPlanStaticProps {
  plan: FloorPlan
  /** 'homeowner' = dashed-on-low-confidence; 'maker' = solid (provenance via dashboard pills). */
  mode?: SvgRenderMode
  /** Show the corner "Schematic — not a survey" disclaimer. Default true. */
  showDisclaimer?: boolean
  /** Show the bottom dimension caption. Default true. */
  showDimensions?: boolean
  /** Hide the "your designer will measure on site" footer caption. Default false. */
  hideFooter?: boolean
  className?: string
}

/**
 * Read-only floor plan presenter. Used in the wrap-up screen and the maker
 * dashboard. The interactive editor (Konva) is a separate component.
 */
export function FloorPlanStatic({
  plan,
  mode = 'homeowner',
  showDisclaimer = true,
  showDimensions = true,
  hideFooter = false,
  className,
}: FloorPlanStaticProps) {
  const { t, locale } = useTranslations()
  const svg = renderFloorPlanSvg(plan, { mode, showDisclaimer, showDimensions, locale })
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-sm',
        className
      )}
      aria-label={t('floorPlan.svg.ariaLabel')}
    >
      <div className="w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      {!hideFooter && (
        <p className="mt-2 px-1 text-[11px] text-muted-foreground">
          {t(plan.measurementMethod === 'deferred_to_designer' ? 'floorPlan.static.deferred' : 'floorPlan.static.rough')}
        </p>
      )}
    </div>
  )
}
