'use client'

import { renderFloorPlanSvg, type FloorPlan, type SvgRenderMode } from '@/lib/floor-plan'
import type { WallSide } from '@/lib/types'
import { useTranslations, type TranslationKey } from '@/lib/i18n'
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
  /** Who reads that caption: the homeowner ("what you shared — your designer
   *  confirms"), or the maker looking in, who is the designer ("what the
   *  customer shared — you confirm"). The picture itself is `mode`. */
  voice?: 'homeowner' | 'maker'
  /** Circled letters on these walls (the room step); filled for `wallLettersDone`. */
  wallLetters?: Partial<Record<WallSide, string>>
  wallLettersDone?: readonly WallSide[]
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
  voice = 'homeowner',
  wallLetters,
  wallLettersDone,
  className,
}: FloorPlanStaticProps) {
  const { t, locale } = useTranslations()
  const svg = renderFloorPlanSvg(plan, { mode, showDisclaimer, showDimensions, locale, wallLetters, wallLettersDone })
  const deferred = plan.measurementMethod === 'deferred_to_designer'
  const caption: TranslationKey =
    voice === 'maker'
      ? deferred
        ? 'floorPlan.static.deferredMaker'
        : 'floorPlan.static.roughMaker'
      : deferred
        ? 'floorPlan.static.deferred'
        : 'floorPlan.static.rough'
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
        <p className="mt-2 px-1 text-[11px] text-muted-foreground">{t(caption)}</p>
      )}
    </div>
  )
}
